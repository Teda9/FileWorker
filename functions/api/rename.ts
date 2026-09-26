import { CopyObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import type Env from "../utils/Env";
import { createS3Client } from "../utils/utils";
import { apiError, isStorageNotFound, validateFilename } from "../utils/api-error";
import { candidatesForName, encodeCopySourceKey, newKeyForName } from '../utils/object-keys';

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
    let body: { sourceKey?: unknown; filename?: unknown };
    try {
        body = await request.json();
    } catch {
        return apiError('INVALID_REQUEST', 'Invalid JSON body', 400);
    }

    const sourceKey = typeof body.sourceKey === "string" ? body.sourceKey : "";
    const filename = typeof body.filename === "string" ? body.filename.trim() : "";
    if (!sourceKey || !validateFilename(filename)) {
        return apiError('INVALID_FILENAME', 'A valid source key and filename are required', 400);
    }

    const { BUCKET } = env;
    if (env.R2_BUCKET) {
        const source = await env.R2_BUCKET.get(sourceKey);
        if (!source) return apiError('FILE_NOT_FOUND', 'Item not found', 404);
        const destinationKey = newKeyForName(filename, source.customMetadata?.['x-store-type'] === 'text' ? 'text' : 'file');
        if (sourceKey === destinationKey) return new Response('OK');
        for (const candidate of candidatesForName(filename)) {
            if (candidate !== sourceKey && await env.R2_BUCKET.head(candidate)) {
                return apiError('FILE_EXISTS', 'A file with this name already exists', 409);
            }
        }
        await env.R2_BUCKET.put(destinationKey, source.body, {
            customMetadata: source.customMetadata,
            httpMetadata: source.httpMetadata,
        });
        await env.R2_BUCKET.delete(sourceKey);
        return new Response('OK');
    }

    const s3 = createS3Client(env);
    let source;
    try {
        source = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: sourceKey }));
    } catch (error) {
        if (isStorageNotFound(error)) return apiError('FILE_NOT_FOUND', 'Item not found', 404);
        throw error;
    }
    const destinationKey = newKeyForName(filename, source.Metadata?.['x-store-type'] === 'text' ? 'text' : 'file');
    if (sourceKey === destinationKey) return new Response('OK');
    for (const candidate of candidatesForName(filename)) {
        if (candidate === sourceKey) continue;
        try {
            await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: candidate }));
            return apiError('FILE_EXISTS', 'A file with this name already exists', 409);
        } catch (error) {
            if (!isStorageNotFound(error)) throw error;
        }
    }

    await s3.send(new CopyObjectCommand({
        Bucket: BUCKET!,
        CopySource: `${BUCKET}/${encodeCopySourceKey(sourceKey)}`,
        Key: destinationKey,
    }));
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET!, Key: sourceKey }));

    return new Response("OK", { status: 200 });
};
