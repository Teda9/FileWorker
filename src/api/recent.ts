import axios from 'axios';

export interface RecentItem {
    Key: string;
    Size: number;
    LastModified: string | Date;
    Type: 'file' | 'text';
}

export const ListRecentItems = async (): Promise<{ items: RecentItem[]; incomplete: boolean }> => {
    const response = await axios.get<{ Contents: RecentItem[]; Incomplete?: boolean }>('/api/recent');
    return {
        items: response.data.Contents ?? [],
        incomplete: response.data.Incomplete === true,
    };
};
