import Env from "../utils/Env";
import { auth } from "../utils/utils";

const errorHandling: PagesFunction<Env> = async (context) => {
  try {
    return await context.next();
  } catch (err) {
    console.error(err);
    return new Response("Internal Server Error", { status: 500 });
  }
}

const authentication: PagesFunction<Env> = async (context) => {
  const { env, request } = context;
  if (!(await auth(env, request))) {
    return new Response("Unauthorized", { status: 401 });
  }
  return await context.next();
}

export const onRequest = [errorHandling, authentication];
