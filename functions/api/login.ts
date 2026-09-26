import type Env from "../utils/Env";
import { createSessionCookie, isPasswordValid } from "../utils/utils";
import { apiError } from '../utils/api-error';

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
    let body: { password?: unknown };
    try {
        body = await request.json();
    } catch {
        return apiError('INVALID_REQUEST', 'Invalid JSON body', 400);
    }

    if (typeof body.password !== "string" || !isPasswordValid(env, body.password)) {
        return apiError('AUTH_REQUIRED', 'Password is incorrect', 401);
    }

    const headers = new Headers({
        "Cache-Control": "no-store",
        "Set-Cookie": await createSessionCookie(env, request),
    });
    headers.append("Set-Cookie", "PASSWORD=; Path=/; Max-Age=0; SameSite=Lax");
    return new Response(null, { status: 204, headers });
};
