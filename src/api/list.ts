import type { _Object } from '@aws-sdk/client-s3';
import axios from 'axios';

export type StoredContentType = 'file' | 'text';

export interface StoredItemsPage {
    Contents: _Object[];
    IsTruncated: boolean;
    NextStartAfter?: string;
}

export const ListStoredItems = async (
    type: StoredContentType,
    maxKeys: number,
    startAfter?: string,
    search?: string,
    signal?: AbortSignal,
): Promise<StoredItemsPage> => {
    const contents: _Object[] = [];
    let cursor = startAfter;
    let isTruncated = false;

    while (contents.length < maxKeys) {
        const params = new URLSearchParams({
            Type: type,
            MaxKeys: String(maxKeys - contents.length),
        });
        if (cursor) params.set('StartAfter', cursor);
        if (search?.trim()) params.set('Search', search.trim());

        const response = await axios.get<StoredItemsPage>('/api/list', { params, signal });
        const page = response.data;
        contents.push(...(page.Contents ?? []));
        isTruncated = page.IsTruncated;

        if (!isTruncated) break;
        if (!page.NextStartAfter || page.NextStartAfter === cursor) {
            isTruncated = false;
            break;
        }
        cursor = page.NextStartAfter;
    }

    return {
        Contents: contents.slice(0, maxKeys),
        IsTruncated: isTruncated,
        NextStartAfter: isTruncated ? cursor : undefined,
    };
};
