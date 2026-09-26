import { HeadObjectCommand } from '@aws-sdk/client-s3';
import type Env from '../utils/Env';
import { apiError, isStorageNotFound } from '../utils/api-error';
import { createS3Client, createSignedShareUrl } from '../utils/utils';
import { nameFromStoredKey } from '../utils/object-keys';

const allowedDurations = new Set([3600, 86400, 604800]);

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
    let body: { key?: unknown; ttlSeconds?: unknown };
    try {
        body = await request.json();
    } catch {
        return apiError('INVALID_REQUEST', 'Invalid JSON body', 400);
    }
    const key = typeof body.key === 'string' ? body.key : '';
    const ttlSeconds = Number(body.ttlSeconds);
    if (!key || !allowedDurations.has(ttlSeconds)) {
        return apiError('INVALID_REQUEST', 'A key and valid duration are required', 400);
    }
    if (env.R2_BUCKET) {
        const item = await env.R2_BUCKET.head(key);
        if (!item) return apiError('FILE_NOT_FOUND', 'Item not found', 404);
        if (item.customMetadata?.['x-store-visibility'] === 'public') {
            return apiError('ITEM_IS_PUBLIC', 'Set this item to private before creating an expiring share link', 409);
        }
    } else {
        try {
            const item = await createS3Client(env).send(new HeadObjectCommand({ Bucket: env.BUCKET, Key: key }));
            if (item.Metadata?.['x-store-visibility'] === 'public') {
                return apiError('ITEM_IS_PUBLIC', 'Set this item to private before creating an expiring share link', 409);
            }
        } catch (error) {
            if (isStorageNotFound(error)) return apiError('FILE_NOT_FOUND', 'Item not found', 404);
            throw error;
        }
    }
    const filename = nameFromStoredKey(key);
    const url = await createSignedShareUrl(env, request, filename, ttlSeconds);
    return Response.json({ url, expiresAt: Date.now() + ttlSeconds * 1000 }, { headers: { 'Cache-Control': 'no-store' } });
};
