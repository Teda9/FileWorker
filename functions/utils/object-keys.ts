export type StoredKind = 'file' | 'text';

export const visibleNameFromRequest = (request: Request): string => {
    const path = new URL(request.url).pathname.slice(1);
    try { return decodeURIComponent(path); } catch { return path; }
};

export const candidatesForName = (name: string): string[] =>
    [...new Set([encodeURIComponent(name), name, `files/${name}`, `clips/${name}`])];

export const newKeyForName = (name: string, kind: StoredKind): string =>
    `${kind === 'text' ? 'clips' : 'files'}/${name}`;

export const kindFromStoredKey = (key: string, metadataType?: string): StoredKind => {
    if (key.startsWith('clips/')) return 'text';
    if (key.startsWith('files/')) return 'file';
    return metadataType === 'text' ? 'text' : 'file';
};

export const encodeCopySourceKey = (key: string): string =>
    key.split('/').map(part => encodeURIComponent(part)).join('/');

export const nameFromStoredKey = (key: string): string => {
    if (key.startsWith('files/') || key.startsWith('clips/')) return key.slice(key.indexOf('/') + 1);
    try { return decodeURIComponent(key); } catch { return key; }
};
