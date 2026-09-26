import { S3Client } from "@aws-sdk/client-s3";
import type Env from './Env';
import { parse } from "cookie";

const SESSION_COOKIE = "FW_SESSION";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function createS3Client(env: Env) {
    const { REGION, ENDPOINT, ACCESS_KEY_ID, SECRET_ACCESS_KEY } = env;
    if (!ENDPOINT || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
        throw new Error('S3 environment variables are missing');
    }
    return new S3Client({
        region: REGION ?? "auto",
        endpoint: ENDPOINT,
        credentials: {
            accessKeyId: ACCESS_KEY_ID,
            secretAccessKey: SECRET_ACCESS_KEY,
        },
    });
}

const signingKey = (env: Env): string => {
    const key = env.SESSION_SECRET ?? env.SECRET_ACCESS_KEY;
    if (!key) throw new Error('SESSION_SECRET or SECRET_ACCESS_KEY is required');
    return key;
};

const hmacEncode = async (data: string, key: string) => {
    const encoder = new TextEncoder();
    const encodedKey = encoder.encode(key);
    const key_encoded = await crypto.subtle.importKey(
        "raw",
        encodedKey,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const encodedData = encoder.encode(data);
    const signature = await crypto.subtle.sign("HMAC", key_encoded, encodedData);
    const base64Mac = btoa(String.fromCharCode(...new Uint8Array(signature)));
    return base64Mac;
}

const hmacVerify = async (data: string, key: string, sign: string) => {
    const encoder = new TextEncoder();
    const encodedKey = encoder.encode(key);
    const key_encoded = await crypto.subtle.importKey(
        "raw",
        encodedKey,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"]
    );
    const encodedData = encoder.encode(data);
    const signature = new Uint8Array(Array.from(atob(sign), c => c.charCodeAt(0)));
    const result = await crypto.subtle.verify("HMAC", key_encoded, signature, encodedData);
    return result;
}

const isEqual = (a: string, b: string) => {
    if (a.length !== b.length) {
        // Minimise the possibility of a timing attack via how long encoding takes on the strings
    }
    const encoder = new TextEncoder();
    const encodedA = encoder.encode(a);
    const encodedB = encoder.encode(b);
    if (encodedA.byteLength !== encodedB.byteLength) {
        // Strings must be the same length in order to compare
        // with crypto.subtle.timingSafeEqual
        return false;
    }
    return crypto.subtle.timingSafeEqual(encodedA, encodedB);
}

const isPasswordValid = (env: Env, password: string): boolean =>
    Boolean(env.PASSWORD) && isEqual(password, env.PASSWORD!);

const sessionPayload = (env: Env, expiresAt: number): string =>
    `session:v1:${env.PASSWORD}:${expiresAt}`;

const createSessionCookie = async (env: Env, request: Request): Promise<string> => {
    const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
    const signature = await hmacEncode(sessionPayload(env, expiresAt), signingKey(env));
    const token = encodeURIComponent(`${expiresAt}.${signature}`);
    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`;
};

const createSignedShareUrl = async (env: Env, request: Request, filename: string, ttlSeconds: number): Promise<string> => {
    const url = new URL(`/${encodeURIComponent(filename)}`, request.url);
    url.searchParams.set('expire', String(Date.now() + ttlSeconds * 1000));
    const unsignedPath = `${url.pathname}?${url.searchParams.toString()}`;
    url.searchParams.set('sign', await hmacEncode(`share:v1:${unsignedPath}`, signingKey(env)));
    return url.href;
};

const hasValidSession = async (env: Env, token?: string): Promise<boolean> => {
    if (!token) return false;
    const separator = token.indexOf(".");
    if (separator < 1) return false;
    const expiresAt = Number(token.slice(0, separator));
    if (!Number.isSafeInteger(expiresAt) || Date.now() >= expiresAt) return false;
    if (expiresAt > Date.now() + SESSION_MAX_AGE_SECONDS * 1000) return false;
    try {
        return await hmacVerify(
            sessionPayload(env, expiresAt),
            signingKey(env),
            token.slice(separator + 1),
        );
    } catch {
        return false;
    }
};

const auth = async (env: Env, request: Request): Promise<boolean> => {
    const { PASSWORD } = env;
    if (!PASSWORD) {
        return false;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
        const origin = request.headers.get("Origin");
        if (origin && origin !== new URL(request.url).origin) return false;
    }

    const cookie = parse(request.headers.get('Cookie') ?? '');
    if (await hasValidSession(env, cookie[SESSION_COOKIE])) {
        return true;
    }

    // Shared links only authorize reading the exact file URL.
    if (request.method !== "GET" && request.method !== "HEAD") return false;
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return false;
    const sign = url.searchParams.get('sign');
    if (sign === null) return false;

    const expire = url.searchParams.get('expire');
    if (expire === null) return false;

    const expiresAt = Number(expire);
    if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
        return false;
    }

    const unsignedParams = new URLSearchParams(url.searchParams);
    unsignedParams.delete('sign');
    const unsignedPath = `${url.pathname}?${unsignedParams.toString()}`;
    try {
        return await hmacVerify(`share:v1:${unsignedPath}`, signingKey(env), sign);
    } catch {
        return false;
    }
};

export { createS3Client, auth, createSessionCookie, createSignedShareUrl, isPasswordValid };
