import axios from 'axios';

const PutFile = async (
    filename: string,
    file: File | string,
    visibility: string,
    type: string = "file",
    onProgress?: (loaded: number, total?: number) => void,
) => {
    const url = `/${encodeURIComponent(filename)}`;
    const headers = {
        'x-store-visibility': visibility,
        'x-store-type': type,
    };
    const response = await axios.put(url, file, {
        headers,
        onUploadProgress: onProgress
            ? (event) => onProgress(event.loaded, event.total)
            : undefined,
    });
    return response.data;
}

const PatchFile = async (filename: string, visibility?: string) => {
    const url = `/${encodeURIComponent(filename)}`;
    const headers: { [key: string]: any } = {};
    if (visibility) {
        headers['x-store-visibility'] = visibility;
    }
    const response = await axios.patch(url, {}, { headers });
    return response.data;
}

const DeleteFile = async (filename: string) => {
    const url = `/${encodeURIComponent(filename)}`;
    const response = await axios.delete(url);
    return response.data;
}

const GetFile = async (filename: string) => {
    const url = `/${encodeURIComponent(filename)}`;
    return axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer' });
}

const HeadFile = async (filename: string) => {
    const url = `/${encodeURIComponent(filename)}`;
    return axios.head(url);
}

const RenameFile = async (sourceKey: string, filename: string) => {
    const response = await axios.post('/api/rename', { sourceKey, filename });
    return response.data;
}

const CreateShareLink = async (key: string, ttlSeconds: number): Promise<{ url: string; expiresAt: number }> => {
    const response = await axios.post<{ url: string; expiresAt: number }>('/api/share', { key, ttlSeconds });
    return response.data;
}

export { PutFile, PatchFile, DeleteFile, GetFile, HeadFile, RenameFile, CreateShareLink }
