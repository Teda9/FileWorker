import { GetObjectCommand, CopyObjectCommand, DeleteObjectCommand, HeadObjectCommand, HeadObjectCommandOutput } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import mime from 'mime/lite';

import Env from './utils/Env';
import { createS3Client, auth } from './utils/utils';
import { protectDownload } from './utils/download-headers';
import { apiError, isStorageNotFound, validateFilename } from './utils/api-error';
import { candidatesForName, encodeCopySourceKey, kindFromStoredKey, newKeyForName, visibleNameFromRequest } from './utils/object-keys';

const findNativeObject = async (bucket: R2Bucket, name: string): Promise<{ key: string; object: R2Object } | undefined> => {
    for (const key of candidatesForName(name)) {
        const object = await bucket.head(key);
        if (object) return { key, object };
    }
    return undefined;
};

const findS3Object = async (s3: ReturnType<typeof createS3Client>, bucket: string, name: string): Promise<{ key: string; object: HeadObjectCommandOutput } | undefined> => {
    for (const key of candidatesForName(name)) {
        try {
            const object = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
            return { key, object };
        } catch (error) {
            if (!isStorageNotFound(error)) throw error;
        }
    }
    return undefined;
};

const objectHeaders = (response: HeadObjectCommandOutput, filename: string): Headers => {
    const headers = new Headers();
    for (const [key, value] of Object.entries(response.Metadata ?? {})) {
        if (typeof value === 'string') headers.set(key, value);
    }
    if (response.ContentType && response.ContentType !== "application/octet-stream") {
        headers.set('content-type', response.ContentType);
    } else {
        headers.set('content-type', mime.getType(filename) || "application/octet-stream");
    }
    if (response.Metadata?.['x-store-type'] === "text") {
        headers.set('content-type', 'text/plain;charset=utf-8');
    }
    if (response.ContentLength !== undefined) headers.set('content-length', response.ContentLength.toString());
    if (response.LastModified) headers.set('last-modified', response.LastModified.toUTCString());

    if (response.ETag) headers.set('etag', response.ETag);
    headers.set('accept-ranges', 'bytes');
    protectDownload(headers, filename);
    return headers;
};

const nativeObjectHeaders = (object: R2Object, filename: string): Headers => {
    const headers = new Headers();
    for (const [key, value] of Object.entries(object.customMetadata ?? {})) headers.set(key, value);
    headers.set('content-type', object.httpMetadata?.contentType ?? mime.getType(filename) ?? 'application/octet-stream');
    if (object.customMetadata?.['x-store-type'] === 'text') headers.set('content-type', 'text/plain;charset=utf-8');
    headers.set('content-length', String(object.size));
    headers.set('last-modified', object.uploaded.toUTCString());
    headers.set('etag', object.httpEtag);
    headers.set('accept-ranges', 'bytes');
    protectDownload(headers, filename);
    return headers;
};

const notModified = (request: Request, headers: Headers): boolean => {
    const etag = headers.get('etag');
    const requestETags = request.headers.get('if-none-match');
    if (requestETags) {
        return Boolean(etag && requestETags.split(',').some(value => value.trim() === '*' || value.trim().replace(/^W\//, '') === etag));
    }
    const since = request.headers.get('if-modified-since');
    const modified = headers.get('last-modified');
    return Boolean(since && modified && Date.parse(modified) <= Date.parse(since));
};

const requestedRange = (request: Request, headers: Headers): string | Response | undefined => {
    const range = request.headers.get('range');
    if (!range) return undefined;
    const ifRange = request.headers.get('if-range');
    if (ifRange && ifRange !== headers.get('etag')) {
        const modified = headers.get('last-modified');
        if (!modified || Number.isNaN(Date.parse(ifRange)) || Date.parse(modified) > Date.parse(ifRange)) return undefined;
    }
    const size = Number(headers.get('content-length'));
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || !Number.isSafeInteger(size) || size <= 0 || (!match[1] && !match[2])) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${Number.isSafeInteger(size) ? size : '*'}`, 'Accept-Ranges': 'bytes', 'Cache-Control': headers.get('cache-control') ?? 'no-store' } });
    }
    const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    const end = match[2] && match[1] ? Math.min(size - 1, Number(match[2])) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes', 'Cache-Control': headers.get('cache-control') ?? 'no-store' } });
    }
    return `bytes=${start}-${end}`;
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
    const { params, env, request } = context;
    const filename = visibleNameFromRequest(request);
    if (env.R2_BUCKET) {
        const found = await findNativeObject(env.R2_BUCKET, filename);
        if (!found) return new Response('Not found', { status: 404 });
        const headers = nativeObjectHeaders(found.object, filename);
        if (headers.get('x-store-visibility') !== 'public' && !(await auth(env, request))) {
            return new Response('Not found', { status: 404 });
        }
        if (notModified(request, headers)) {
            headers.delete('content-length');
            return new Response(null, { status: 304, headers });
        }
        const range = requestedRange(request, headers);
        if (range instanceof Response) return range;
        const match = range ? /^bytes=(\d+)-(\d+)$/.exec(range) : null;
        const options = match ? { range: { offset: Number(match[1]), length: Number(match[2]) - Number(match[1]) + 1 } } : undefined;
        const object = await env.R2_BUCKET.get(found.key, options);
        if (!object) return new Response('Not found', { status: 404 });
        if (match) {
            headers.set('content-range', `bytes ${match[1]}-${match[2]}/${found.object.size}`);
            headers.set('content-length', String(Number(match[2]) - Number(match[1]) + 1));
        }
        return new Response(object.body, { status: match ? 206 : 200, headers });
    }
    const s3 = createS3Client(env);
    const found = await findS3Object(s3, env.BUCKET, filename);
    if (!found) return new Response('Not found', { status: 404 });
    const headers = objectHeaders(found.object, filename);

    if (headers.get("x-store-visibility") !== "public" && !(await auth(env, request))) {
        return new Response("Not found", { status: 404 });
    }
    if (notModified(request, headers)) {
        headers.delete('content-length');
        return new Response(null, { status: 304, headers });
    }
    const range = requestedRange(request, headers);
    if (range instanceof Response) return range;
    let response;
    try {
        response = await s3.send(new GetObjectCommand({ Bucket: env.BUCKET, Key: found.key, Range: range }));
    } catch (error) {
        if (isStorageNotFound(error)) return new Response("Not found", { status: 404 });
        throw error;
    }
    if (response.ContentLength !== undefined) headers.set('content-length', String(response.ContentLength));
    if (response.ContentRange) headers.set('content-range', response.ContentRange);
    return new Response(response.Body?.transformToWebStream() ?? null, { status: range ? 206 : 200, headers });
};

export const onRequestHead: PagesFunction<Env> = async (context) => {
    const { params, env, request } = context;
    const filename = visibleNameFromRequest(request);
    if (env.R2_BUCKET) {
        const found = await findNativeObject(env.R2_BUCKET, filename);
        if (!found) return new Response('Not found', { status: 404 });
        const headers = nativeObjectHeaders(found.object, filename);
        if (headers.get('x-store-visibility') !== 'public' && !(await auth(env, request))) {
            return new Response('Not found', { status: 404 });
        }
        if (notModified(request, headers)) {
            headers.delete('content-length');
            return new Response(null, { status: 304, headers });
        }
        return new Response(null, { headers });
    }
    const { BUCKET } = env;
    const s3 = createS3Client(env);

    const found = await findS3Object(s3, BUCKET, filename);
    if (!found) return new Response('Not found', { status: 404 });
    const response = found.object;

    if (response.Metadata?.['x-store-visibility'] !== "public" && !(await auth(env, request))) {
        return new Response("Not found", { status: 404 });
    }

    const headers = objectHeaders(response, filename);
    if (notModified(request, headers)) {
        headers.delete('content-length');
        return new Response(null, { status: 304, headers });
    }
    return new Response(null, { headers });
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
    const { params, env, request } = context;
    if (!(await auth(env, request))) {
        return apiError('AUTH_REQUIRED', 'Please sign in', 401);
    }
    const filename = visibleNameFromRequest(request);
    if (!validateFilename(filename)) {
        return apiError('INVALID_FILENAME', 'Invalid filename', 400);
    }
    const maxMB = Number(env.MAX_UPLOAD_SIZE_MB);
    const contentLength = Number(request.headers.get('content-length'));
    const maxBytes = env.MAX_UPLOAD_SIZE_MB && Number.isFinite(maxMB) && maxMB > 0 ? maxMB * 1024 * 1024 : undefined;
    if (maxBytes && Number.isFinite(contentLength) && contentLength > maxBytes) {
        return apiError('FILE_TOO_LARGE', 'File exceeds configured upload limit', 413);
    }
    const { BUCKET } = env;
    const visibility = request.headers.get('x-store-visibility');
    const type = request.headers.get('x-store-type');
    if (!['public', 'private'].includes(visibility ?? '') || !['file', 'text'].includes(type ?? '')) {
        return apiError('INVALID_REQUEST', 'Invalid item metadata', 400);
    }
    let exceededLimit = false;
    let body = request.body;
    if (maxBytes && body) {
        let bytesReceived = 0;
        body = body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
                bytesReceived += chunk.byteLength;
                if (bytesReceived > maxBytes) {
                    exceededLimit = true;
                    throw new Error('Configured upload limit exceeded');
                }
                controller.enqueue(chunk);
            },
        }));
    }
    if (env.R2_BUCKET) {
        const existing = await findNativeObject(env.R2_BUCKET, filename);
        if (existing && kindFromStoredKey(existing.key, existing.object.customMetadata?.['x-store-type']) !== type) {
            return apiError('FILE_EXISTS', 'A different content type already uses this filename', 409);
        }
        const key = existing?.key ?? newKeyForName(filename, type as 'file' | 'text');
        try {
            await env.R2_BUCKET.put(key, body, {
                customMetadata: { 'x-store-visibility': visibility!, 'x-store-type': type! },
                httpMetadata: { contentType: type === 'text' ? 'text/plain;charset=utf-8' : request.headers.get('content-type') ?? 'application/octet-stream' },
            });
        } catch (error) {
            if (exceededLimit) return apiError('FILE_TOO_LARGE', 'File exceeds configured upload limit', 413);
            throw error;
        }
        return new Response('OK');
    }
    const s3 = createS3Client(env);
    const existing = await findS3Object(s3, BUCKET, filename);
    if (existing && kindFromStoredKey(existing.key, existing.object.Metadata?.['x-store-type']) !== type) {
        return apiError('FILE_EXISTS', 'A different content type already uses this filename', 409);
    }
    const key = existing?.key ?? newKeyForName(filename, type as 'file' | 'text');
    const parallelUploads3 = new Upload({
        client: s3,
        params: { Bucket: BUCKET, Key: key, Body: body, Metadata: { 'x-store-visibility': visibility!, 'x-store-type': type! } },
        queueSize: 4, // optional concurrency configuration
        partSize: 1024 * 1024 * 5, // optional size of each part, in bytes, at least 5MB
        leavePartsOnError: false, // optional manually handle dropped parts
    });
    try {
        await parallelUploads3.done();
    } catch (error) {
        if (exceededLimit) return apiError('FILE_TOO_LARGE', 'File exceeds configured upload limit', 413);
        console.error(error);
        return apiError('UPLOAD_FAILED', 'Upload failed', 503);
    }
    return new Response("OK", { status: 200 });
}

export const onRequestPatch: PagesFunction<Env> = async (context) => {
    const { params, env, request } = context;
    if (!(await auth(env, request))) {
        return apiError('AUTH_REQUIRED', 'Please sign in', 401);
    }
    const filename = visibleNameFromRequest(request);
    if (!validateFilename(filename)) {
        return apiError('INVALID_FILENAME', 'Invalid filename', 400);
    }
    const { BUCKET } = env;
    if (env.R2_BUCKET) {
        const found = await findNativeObject(env.R2_BUCKET, filename);
        if (!found) return apiError('FILE_NOT_FOUND', 'Item not found', 404);
        const existing = await env.R2_BUCKET.get(found.key);
        if (!existing) return apiError('FILE_NOT_FOUND', 'Item not found', 404);
        const visibility = request.headers.get('x-store-visibility');
        if (visibility && !['public', 'private'].includes(visibility)) {
            return apiError('INVALID_REQUEST', 'Invalid visibility', 400);
        }
        await env.R2_BUCKET.put(found.key, existing.body, {
            customMetadata: { ...existing.customMetadata, ...(visibility ? { 'x-store-visibility': visibility } : {}) },
            httpMetadata: existing.httpMetadata,
        });
        return new Response('OK');
    }
    const s3 = createS3Client(env);
    const found = await findS3Object(s3, BUCKET, filename);
    if (!found) return apiError('FILE_NOT_FOUND', 'Item not found', 404);
    const existing = found.object;
    const visibility = request.headers.get('x-store-visibility');
    if (visibility && !['public', 'private'].includes(visibility)) {
        return apiError('INVALID_REQUEST', 'Invalid visibility', 400);
    }
    const command = new CopyObjectCommand({
        Bucket: BUCKET!,
        CopySource: `${BUCKET}/${encodeCopySourceKey(found.key)}`,
        Key: found.key,
        MetadataDirective: "REPLACE",
        Metadata: { ...existing.Metadata, ...(visibility ? { 'x-store-visibility': visibility } : {}) },
        ContentType: existing.ContentType,
        CacheControl: existing.CacheControl,
        ContentDisposition: existing.ContentDisposition,
        ContentEncoding: existing.ContentEncoding,
        ContentLanguage: existing.ContentLanguage,
        Expires: existing.Expires,
        WebsiteRedirectLocation: existing.WebsiteRedirectLocation,
    });
    await s3.send(command);
    return new Response("OK", { status: 200 });
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
    const { params, env, request } = context;
    if (!(await auth(env, request))) {
        return apiError('AUTH_REQUIRED', 'Please sign in', 401);
    }
    const filename = visibleNameFromRequest(request);
    if (!validateFilename(filename)) return apiError('INVALID_FILENAME', 'Invalid filename', 400);
    const { BUCKET } = env;
    if (env.R2_BUCKET) {
        const found = await findNativeObject(env.R2_BUCKET, filename);
        if (!found) return apiError('FILE_NOT_FOUND', 'Item not found', 404);
        await env.R2_BUCKET.delete(found.key);
        return new Response('OK');
    }
    const s3 = createS3Client(env);
    const found = await findS3Object(s3, BUCKET, filename);
    if (!found) return apiError('FILE_NOT_FOUND', 'Item not found', 404);
    const command = new DeleteObjectCommand({
        Bucket: BUCKET!,
        Key: found.key
    });
    await s3.send(command);
    return new Response("OK", { status: 200 });
}

export const onRequest: PagesFunction<Env> = async () => {
    return new Response("Method not allowed", { status: 405 });
};
