import Env from "../utils/Env";

// The API middleware validates the configured password before this response.
export const onRequestGet: PagesFunction<Env> = async () => {
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
};
