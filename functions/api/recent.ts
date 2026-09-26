import { HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import type Env from '../utils/Env';
import { createS3Client } from '../utils/utils';

type RecentItem = { Key: string; Size: number; LastModified: Date; Type: 'file' | 'text' };
const MAX_SCANNED = 10000;
const KEEP = 20;

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
    try {
        const candidates: RecentItem[] = [];
        let truncated = true;
        let scanned = 0;
        if (env.R2_BUCKET) {
            let cursor: string | undefined;
            while (truncated && scanned < MAX_SCANNED) {
                const page = await env.R2_BUCKET.list({ limit: 1000, cursor, include: ['customMetadata'] as ('customMetadata')[] });
                scanned += page.objects.length;
                candidates.push(...page.objects.map(object => ({
                    Key: object.key,
                    Size: object.size,
                    LastModified: object.uploaded,
                    Type: object.key.startsWith('clips/') || object.customMetadata?.['x-store-type'] === 'text' ? 'text' as const : 'file' as const,
                })));
                candidates.sort((a, b) => b.LastModified.getTime() - a.LastModified.getTime());
                candidates.length = Math.min(candidates.length, KEEP);
                truncated = page.truncated;
                if (page.truncated) cursor = page.cursor;
                if (!page.objects.length) break;
            }
        } else {
            const s3 = createS3Client(env);
            let continuationToken: string | undefined;
            while (truncated && scanned < MAX_SCANNED) {
                const page = await s3.send(new ListObjectsV2Command({ Bucket: env.BUCKET, MaxKeys: 1000, ContinuationToken: continuationToken }));
                const objects = page.Contents ?? [];
                scanned += objects.length;
                for (const object of objects) {
                    if (!object.Key || !object.LastModified) continue;
                    candidates.push({ Key: object.Key, Size: object.Size ?? 0, LastModified: object.LastModified, Type: object.Key.startsWith('clips/') ? 'text' : 'file' });
                }
                candidates.sort((a, b) => b.LastModified.getTime() - a.LastModified.getTime());
                candidates.length = Math.min(candidates.length, KEEP);
                continuationToken = page.NextContinuationToken;
                truncated = page.IsTruncated === true;
                if (!objects.length) break;
            }
            // A truncated key-order scan cannot promise that these are the newest
            // objects. Do not present a potentially stale list as authoritative.
            if (!(truncated && scanned >= MAX_SCANNED)) {
                const legacy = candidates.filter(item => !item.Key.startsWith('files/') && !item.Key.startsWith('clips/'));
                await Promise.all(legacy.map(async item => {
                    const head = await s3.send(new HeadObjectCommand({ Bucket: env.BUCKET, Key: item.Key }));
                    item.Type = head.Metadata?.['x-store-type'] === 'text' ? 'text' : 'file';
                }));
            }
        }
        const incomplete = truncated && scanned >= MAX_SCANNED;
        return Response.json({
            Contents: incomplete ? [] : candidates.slice(0, 5),
            Incomplete: incomplete,
        }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('Failed to list recent items:', error);
        return Response.json({ Contents: [] }, { headers: { 'Cache-Control': 'no-store' } });
    }
};
