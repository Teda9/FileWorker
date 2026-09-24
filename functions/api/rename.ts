import { CopyObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import Env from "../utils/Env";
import { createS3Client } from "../utils/utils";

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
    let body: { sourceKey?: unknown; filename?: unknown };
    try {
        body = await request.json();
    } catch {
        return new Response("Invalid request", { status: 400 });
    }

    const sourceKey = typeof body.sourceKey === "string" ? body.sourceKey : "";
    const filename = typeof body.filename === "string" ? body.filename.trim() : "";
    if (!sourceKey || !filename) {
        return new Response("A source key and filename are required", { status: 400 });
    }

    const { BUCKET } = env;
    const s3 = createS3Client(env);
    // File names are stored URL-encoded by the upload route. Keep the same
    // convention for renamed objects, while sourceKey is the exact listed key.
    const destinationKey = encodeURIComponent(filename);
    if (sourceKey === destinationKey) {
        return new Response("OK", { status: 200 });
    }

    try {
        await s3.send(new HeadObjectCommand({ Bucket: BUCKET!, Key: destinationKey }));
        return new Response("A file with this name already exists", { status: 409 });
    } catch (error) {
        const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        const name = (error as { name?: string }).name;
        if (status !== 404 && name !== "NotFound" && name !== "NoSuchKey") {
            throw error;
        }
    }

    await s3.send(new CopyObjectCommand({
        Bucket: BUCKET!,
        // CopySource is a URL path; encode the literal stored key, including
        // percent signs in names that were already URL-encoded on upload.
        CopySource: `${BUCKET}/${encodeURIComponent(sourceKey)}`,
        Key: destinationKey,
    }));
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET!, Key: sourceKey }));

    return new Response("OK", { status: 200 });
};
