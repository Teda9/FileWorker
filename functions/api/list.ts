import { HeadObjectCommand, ListObjectsV2Command, type _Object } from "@aws-sdk/client-s3";

import type Env from "../utils/Env";
import { createS3Client } from "../utils/utils";
import { apiError } from '../utils/api-error';

const MAX_PAGE_SIZE = 500;
const LIST_BATCH_SIZE = 100;
const HEAD_CONCURRENCY = 20;
const MAX_NATIVE_SCANNED_PER_REQUEST = 500;
const MAX_S3_SCANNED_PER_REQUEST = 32;

const decodeKey = (value: string): string => {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
};

const searchTermsFromQuery = (value: string): string[] => {
    const term = value.trim();
    if (!term) return [];

    // A pasted short link searches its path, which is the stored object's key.
    let name = term;
    if (/^https?:\/\//i.test(term) || term.startsWith("/") || /^[\w.-]+\.[a-z]{2,}(?::\d+)?\//i.test(term)) {
        try {
            const url = new URL(/^https?:\/\//i.test(term)
                ? term
                : term.startsWith('/') ? `https://fileworker.invalid${term}` : `https://${term}`);
            name = url.pathname.replace(/^\//, "");
        } catch {
            // A malformed URL can still be a valid part of a filename.
        }
    }

    return [...new Set([name.toLowerCase(), decodeKey(name).toLowerCase()].filter(Boolean))];
};

const matchesSearch = (key: string, searchTerms: string[]): boolean => {
    if (!searchTerms.length) return true;
    const rawKey = key.toLowerCase();
    const visibleKey = (key.startsWith("files/") || key.startsWith("clips/") ? key : decodeKey(key)).toLowerCase();
    return searchTerms.some((term) => rawKey.includes(term) || visibleKey.includes(term));
};

const typeFromPrefix = (key: string): "file" | "text" | undefined => {
    if (key.startsWith("files/")) return "file";
    if (key.startsWith("clips/")) return "text";
    return undefined;
};

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
    const pageSize = Number.isInteger(requestedPageSize) &&
        requestedPageSize >= 1 && requestedPageSize <= MAX_PAGE_SIZE
        ? requestedPageSize
        : 20;
    const type = query.get("Type") === "text" ? "text" : "file";
    const searchTerms = searchTermsFromQuery(query.get("Search") ?? "");
    let startAfter = query.get("StartAfter") || undefined;
    let nextStartAfter: string | undefined;
    let isTruncated = false;
    let scanned = 0;
    const contents: _Object[] = [];
    const nativeBucket = (env as Env & { R2_BUCKET?: R2Bucket }).R2_BUCKET;
    const s3 = nativeBucket ? undefined : createS3Client(env);
    const scanLimit = nativeBucket ? MAX_NATIVE_SCANNED_PER_REQUEST : MAX_S3_SCANNED_PER_REQUEST;
    const listBatchSize = nativeBucket ? LIST_BATCH_SIZE : MAX_S3_SCANNED_PER_REQUEST;

    try {
        while (contents.length < pageSize && scanned < scanLimit) {
            let objects: _Object[];
            let batchTruncated: boolean;
            const typesByKey = new Map<string, string | null>();

            if (nativeBucket) {
                // Newer R2 runtimes include metadata in the list response.
                const options = { limit: LIST_BATCH_SIZE, startAfter, include: ["customMetadata" as const] };
                const response = await nativeBucket.list(options);
                objects = response.objects.map((object) => ({
                    Key: object.key,
                    Size: object.size,
                    LastModified: object.uploaded,
                    ETag: object.etag,
                }));
                batchTruncated = response.truncated;
                for (const object of response.objects) {
                    if (matchesSearch(object.key, searchTerms)) {
                        typesByKey.set(object.key, typeFromPrefix(object.key) ?? object.customMetadata?.["x-store-type"] ?? "file");
                    }
                }
            } else {
                const response = await s3!.send(new ListObjectsV2Command({
                    Bucket: BUCKET,
                    MaxKeys: listBatchSize,
                    StartAfter: startAfter,
                }));
                objects = response.Contents ?? [];
                batchTruncated = response.IsTruncated === true;
                const candidates = objects.filter((object) => object.Key && matchesSearch(object.Key, searchTerms));
                const legacyCandidates = candidates.filter((object) => object.Key && !typeFromPrefix(object.Key));
                for (const object of candidates) {
                    if (object.Key) {
                        const prefixType = typeFromPrefix(object.Key);
                        if (prefixType) typesByKey.set(object.Key, prefixType);
                    }
                }
                const storeTypes = await getStoreTypes(legacyCandidates, s3!, BUCKET);
                legacyCandidates.forEach((object, index) => {
                    if (object.Key) typesByKey.set(object.Key, storeTypes[index]);
                });
            }

            if (!objects.length) {
                isTruncated = false;
                nextStartAfter = undefined;
                break;
            }
            scanned += objects.length;

            let reachedPageSize = false;

            for (let index = 0; index < objects.length; index += 1) {
                const object = objects[index];
                if (!object.Key) continue;

                nextStartAfter = object.Key;
                const storeType = typesByKey.get(object.Key);
                if (storeType == null) continue;
                const isText = storeType === "text";
                if ((type === "text") === isText) {
                    contents.push(object);
                }

                if (contents.length === pageSize) {
                    isTruncated = index < objects.length - 1 || batchTruncated;
                    reachedPageSize = true;
                    break;
                }
            }

            if (reachedPageSize) break;
            if (!batchTruncated) {
                isTruncated = false;
                nextStartAfter = undefined;
                break;
            }

            startAfter = objects[objects.length - 1]?.Key ?? nextStartAfter;
            nextStartAfter = startAfter;
            isTruncated = batchTruncated;
        }
    } catch (error) {
        console.error("Failed to list stored items:", error);
        return apiError('R2_UNAVAILABLE', 'Could not load stored items', 503);
    }

    return Response.json({
        Contents: contents,
        IsTruncated: isTruncated,
        NextStartAfter: isTruncated ? nextStartAfter : undefined,
    }, { headers: { 'Cache-Control': 'no-store' } });
};
