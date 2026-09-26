export type ApiErrorCode = 'AUTH_REQUIRED' | 'FILE_NOT_FOUND' | 'FILE_EXISTS' | 'UPLOAD_FAILED' | 'R2_UNAVAILABLE' | 'INVALID_FILENAME' | 'FILE_TOO_LARGE' | 'INVALID_REQUEST' | 'ITEM_IS_PUBLIC';

export const apiError = (code: ApiErrorCode, message: string, status: number): Response =>
    Response.json({ error: { code, message } }, { status, headers: { 'Cache-Control': 'no-store' } });

export const isStorageNotFound = (error: unknown): boolean => {
    const value = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    return value.name === 'NotFound' || value.name === 'NoSuchKey' || value.$metadata?.httpStatusCode === 404;
};

export const validateFilename = (filename: string): boolean => {
    if (!filename || filename === '.' || filename === '..' || /[\x00-\x1f\x7f\\/]/u.test(filename)) return false;
    try {
        return new TextEncoder().encode(filename).byteLength <= 255 && decodeURIComponent(encodeURIComponent(filename)) === filename;
    } catch {
        return false;
    }
};
