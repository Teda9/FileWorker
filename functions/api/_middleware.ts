import "../utils/xml-parser-polyfill";

import type Env from "../utils/Env";
import { auth } from "../utils/utils";
import { apiError } from "../utils/api-error";

const errorHandling: PagesFunction<Env> = async (context) => {
  try {
    return await context.next();
  } catch (err) {
    console.error(err);
    return apiError('R2_UNAVAILABLE', 'Storage service is temporarily unavailable', 503);
  }
}

const authentication: PagesFunction<Env> = async (context) => {
  const { env, request } = context;
  if (new URL(request.url).pathname === "/api/login" && request.method === "POST") {
    return await context.next();
  }
  if (!(await auth(env, request))) {
    const response = apiError('AUTH_REQUIRED', 'Please sign in', 401);
    response.headers.append('Set-Cookie', 'PASSWORD=; Path=/; Max-Age=0; SameSite=Lax');
    return response;
  }
  return await context.next();
}

export const onRequest = [errorHandling, authentication];
