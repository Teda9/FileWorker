import { HeadObjectCommand, ListObjectsV2Command, type _Object } from "@aws-sdk/client-s3";

import Env from "../utils/Env";
import { createS3Client } from "../utils/utils";

const PAGE_SIZES = new Set([20, 50, 100, 200, 500]);
const LIST_BATCH_SIZE = 100;
const HEAD_CONCURRENCY = 20;
const MAX_SCANNED_PER_REQUEST = 500;

const getStoreTypes = async (
    objects: _Object[],
    s3: ReturnType<typeof createS3Client>,
    bucket: string,
): Promise<Array<string | null>> => {
    const types: Array<string | null> = new Array(objects.length).fill(null);

    for (let offset = 0; offset < objects.length; offset += HEAD_CONCURRENCY) {
        const batch = objects.slice(offset, offset + HEAD_CONCURRENCY);
        await Promise.all(batch.map(async (object, batchIndex) => {
            if (!object.Key) return;
            try {
                const response = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: object.Key }));
                types[offset + batchIndex] = response.Metadata?.["x-store-type"] ?? "file";
            } catch (error) {
                const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
                const name = (error as { name?: string }).name;
                if (status !== 404 && name !== "NotFound" && name !== "NoSuchKey") {
                    throw error;
                }
            }
        }));
    }

    return types;
};

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
    const { BUCKET } = env;
    const query = new URL(request.url).searchParams;
    const requestedPageSize = Number(query.get("MaxKeys"));
    const pageSize = PAGE_SIZES.has(requestedPageSize) ? requestedPageSize : 20;
    const type = query.get("Type") === "text" ? "text" : "file";
    let startAfter = query.get("StartAfter") || undefined;
    let nextStartAfter: string | undefined;
    let isTruncated = false;
    let scanned = 0;
    const contents: _Object[] = [];
    const s3 = createS3Client(env);

    try {
        while (contents.length < pageSize && scanned < MAX_SCANNED_PER_REQUEST) {
            const response = await s3.send(new ListObjectsV2Command({
                Bucket: BUCKET,
                MaxKeys: LIST_BATCH_SIZE,
                StartAfter: startAfter,
            }));
            const objects = response.Contents ?? [];
            if (!objects.length) {
                isTruncated = false;
                nextStartAfter = undefined;
                break;
            }
            scanned += objects.length;

            const storeTypes = await getStoreTypes(objects, s3, BUCKET);
            let reachedPageSize = false;

            for (let index = 0; index < objects.length; index += 1) {
                const object = objects[index];
                if (!object.Key) continue;

                nextStartAfter = object.Key;
                if (storeTypes[index] === null) continue;
                const isText = storeTypes[index] === "text";
                if ((type === "text") === isText) {
                    contents.push(object);
                }

                if (contents.length === pageSize) {
                    isTruncated = index < objects.length - 1 || response.IsTruncated === true;
                    reachedPageSize = true;
                    break;
                }
            }

            if (reachedPageSize) break;
            if (!response.IsTruncated) {
                isTruncated = false;
                nextStartAfter = undefined;
                break;
            }

            startAfter = objects[objects.length - 1]?.Key ?? nextStartAfter;
            nextStartAfter = startAfter;
            isTruncated = Boolean(response.IsTruncated);
        }
    } catch (error) {
        console.error("Failed to list stored items:", error);
        return new Response("Could not load stored items", { status: 502 });
    }

    return Response.json({
        Contents: contents,
        IsTruncated: isTruncated,
        NextStartAfter: isTruncated ? nextStartAfter : undefined,
    });
};
