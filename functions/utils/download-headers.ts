const activeContentTypes = new Set([
    "text/html",
    "image/svg+xml",
    "application/xhtml+xml",
    "application/xml",
    "text/xml",
    "text/javascript",
    "application/javascript",
]);

export const protectDownload = (headers: Headers, filename: string): void => {
    headers.set("x-content-type-options", "nosniff");
    headers.set(
        "cache-control",
        headers.get("x-store-visibility") === "public" ? "public, max-age=3600" : "private, no-store",
    );
    const contentType = headers.get("content-type")?.split(";")[0].toLowerCase();
    const plainClipboardText = headers.get("x-store-type") === "text" && contentType === "text/plain";
    if (!plainClipboardText &&
        (/\.(?:html?|svg|xhtml|xml|m?js)$/i.test(filename) || (contentType && activeContentTypes.has(contentType)))) {
        headers.set("content-disposition", "attachment");
        headers.set("content-security-policy", "sandbox");
    }
};
