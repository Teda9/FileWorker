export type ClipMode = 'text' | 'markdown' | 'json' | 'shell' | 'yaml' | 'javascript' | 'python';

export interface ClipDraft {
  content: string;
  filename: string;
  visibility: 'private' | 'public';
  mode: ClipMode;
  savedAt: number;
}

const modes: ClipMode[] = ['text', 'markdown', 'json', 'shell', 'yaml', 'javascript', 'python'];
const draftKey = (target: string) => `fileworker:clip-draft:v1:${target ? `edit:${encodeURIComponent(target)}` : 'new'}`;

export const guessClipMode = (filename: string): ClipMode => {
  const extension = filename.split('.').pop()?.toLowerCase();
  if (extension === 'md' || extension === 'markdown') return 'markdown';
  if (extension === 'json' || extension === 'jsonc') return 'json';
  if (extension === 'sh' || extension === 'bash' || extension === 'zsh') return 'shell';
  if (extension === 'yaml' || extension === 'yml') return 'yaml';
  if (extension === 'js' || extension === 'jsx' || extension === 'mjs' || extension === 'cjs' || extension === 'ts' || extension === 'tsx') return 'javascript';
  if (extension === 'py') return 'python';
  return 'text';
};

export const readClipDraft = (target: string, storage?: Storage): ClipDraft | null => {
  try {
    const raw = (storage ?? window.localStorage).getItem(draftKey(target));
    if (!raw) return null;
    const draft: unknown = JSON.parse(raw);
    if (typeof draft !== 'object' || draft === null) return null;
    const value = draft as Record<string, unknown>;
    if (typeof value.content !== 'string' || typeof value.filename !== 'string' ||
      (value.visibility !== 'private' && value.visibility !== 'public') ||
      !modes.includes(value.mode as ClipMode) ||
      typeof value.savedAt !== 'number' || !Number.isFinite(value.savedAt)) return null;
    return value as unknown as ClipDraft;
  } catch {
    return null;
  }
};

export const writeClipDraft = (target: string, draft: ClipDraft, storage?: Storage): boolean => {
  try {
    (storage ?? window.localStorage).setItem(draftKey(target), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
};

export const clearClipDraft = (target: string, storage?: Storage): void => {
  try {
    (storage ?? window.localStorage).removeItem(draftKey(target));
  } catch {
    // Private browsing or disabled storage must not interrupt editing.
  }
};
