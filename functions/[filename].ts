import { GetObjectCommand, CopyObjectCommand, DeleteObjectCommand, GetObjectCommandOutput, HeadObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import mime from 'mime/lite';

import Env from './utils/Env';
import { createS3Client, auth } from './utils/utils';

export const onRequestGet: PagesFunction<Env> = async (context) => {
    const { params, env } = context;
    const { filename } = params;
    const { BUCKET } = env;
    const s3 = createS3Client(env);
    const command = new GetObjectCommand({
        Bucket: BUCKET!,
        Key: filename as string
    });
    let response: GetObjectCommandOutput;
    try {
        response = await s3.send(command);
    } catch (e) {
        return new Response("Not found", { status: 404 });
    }
    const headers = new Headers();
    for (const [key, value] of Object.entries(response.Metadata)) {
        headers.set(key, value);
    }
    if (response.ContentType !== "application/octet-stream") {
        headers.set('content-type', response.ContentType);
    } else {
        headers.set('content-type', mime.getType(filename as string) || "application/octet-stream");
    }
    if (response.Metadata['x-store-type'] === "text") {
        headers.set('content-type', 'text/plain;charset=utf-8');
    }
    headers.set('content-length', response.ContentLength.toString());
    headers.set('last-modified', response.LastModified.toUTCString());

    headers.set('etag', response.ETag);

    if (headers.get("x-store-visibility") !== "public" && !(await auth(env, context.request))) {
        return new Response("Not found", { status: 404 });
    }
    return new Response(
        response.Body.transformToWebStream(),
        {
            headers,
        }
    );
};

export const onRequestHead: PagesFunction<Env> = async (context) => {
    const { params, env, request } = context;
    const filename = params.filename as string;
    const { BUCKET } = env;
    const s3 = createS3Client(env);

    let response;
    try {
        response = await s3.send(new HeadObjectCommand({ Bucket: BUCKET!, Key: filename }));
    } catch {
        return new Response("Not found", { status: 404 });
    }

    if (response.Metadata?.['x-store-visibility'] !== "public" && !(await auth(env, request))) {
        return new Response("Not found", { status: 404 });
    }

    const headers = new Headers();
    for (const [key, value] of Object.entries(response.Metadata ?? {})) {
        headers.set(key, value);
    }
    if (response.ContentType) headers.set('content-type', response.ContentType);
    if (response.ContentLength !== undefined) headers.set('content-length', response.ContentLength.toString());
    if (response.LastModified) headers.set('last-modified', response.LastModified.toUTCString());
    if (response.ETag) headers.set('etag', response.ETag);

    return new Response(null, { headers });
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
    const { params, env, request } = context;
    if (!(await auth(env, request))) {
        return new Response("Unauthorized", { status: 401 });
    }
    const { filename } = params;
    const { BUCKET } = env;
    const s3 = createS3Client(env);
    const headers = new Headers(request.headers);
    const x_store_headers = [];
    for (const [key, value] of headers.entries()) {
        if (key.startsWith('x-store-')) {
            x_store_headers.push([key, value]);
        }
    }
    const parallelUploads3 = new Upload({
        client: s3,
        params: { Bucket: BUCKET, Key: filename as string, Body: request.body, Metadata: Object.fromEntries(x_store_headers) },
        queueSize: 4, // optional concurrency configuration
        partSize: 1024 * 1024 * 5, // optional size of each part, in bytes, at least 5MB
        leavePartsOnError: false, // optional manually handle dropped parts
    });
    await parallelUploads3.done();
    return new Response("OK", { status: 200 });
}

export const onRequestPatch: PagesFunction<Env> = async (context) => {
    const { params, env, request } = context;
    if (!(await auth(env, request))) {
        return new Response("Unauthorized", { status: 401 });
    }
    const { filename } = params;
    const { BUCKET } = env;
    const s3 = createS3Client(env);
    const headers = new Headers(request.headers);
    const x_store_headers = [];
    for (const [key, value] of headers.entries()) {
        if (key.startsWith('x-store-')) {
            x_store_headers.push([key, value]);
        }
    }
    const command = new CopyObjectCommand({
        Bucket: BUCKET!,
        CopySource: `${BUCKET}/${filename}`,
        Key: filename as string,
        MetadataDirective: "REPLACE",
        Metadata: Object.fromEntries(x_store_headers),
    });
    await s3.send(command);
    return new Response("OK", { status: 200 });
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
    const { params, env, request } = context;
    if (!(await auth(env, request))) {
        return new Response("Unauthorized", { status: 401 });
    }
    const { filename } = params;
    const { BUCKET } = env;
    const s3 = createS3Client(env);
    const command = new DeleteObjectCommand({
        Bucket: BUCKET!,
        Key: filename as string
    });
    await s3.send(command);
    return new Response("OK", { status: 200 });
}

export const onRequest: PagesFunction<Env> = async () => {
    return new Response("Method not allowed", { status: 405 });
};
