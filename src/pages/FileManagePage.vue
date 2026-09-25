<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { formatBytes } from '@/utils/utils';
import { DeleteFile, ListStoredItems, RenameFile } from '@/api';
import type { StoredContentType } from '@/api/list';
import type { _Object } from '@aws-sdk/client-s3';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

const props = defineProps<{ kind: StoredContentType }>();
const { t: $t } = useI18n();
const router = useRouter();
const isClipboard = computed(() => props.kind === 'text');
const titleKey = computed(() => isClipboard.value ? 'clipmanage' : 'filemanage');
const pageSizeOptions = [20, 50, 100, 200, 500] as const;
const pageSizeStorageKey = 'fileworker.manage-page-size';

const readPageSize = () => {
    try {
        const saved = Number(localStorage.getItem(pageSizeStorageKey));
        if (pageSizeOptions.includes(saved as typeof pageSizeOptions[number])) return saved;
    } catch {
        // Use the default when browser storage is unavailable.
    }
    return 20;
};

const pageSize = ref(readPageSize());
const uploadedFiles = ref<_Object[]>([]);
const isLoading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const currentPage = ref(0);
const pageCursors = ref<Array<string | undefined>>([undefined]);
const nextStartAfter = ref<string>();
const hasNextPage = ref(false);
let activeRequest = 0;

const displayFilename = (key?: string) => {
    if (!key) return '';
    try {
        return decodeURIComponent(key);
    } catch {
        return key;
    }
};

const fileHref = (key?: string) => `/${encodeURIComponent(displayFilename(key))}`;
const fileUrl = (key?: string) => new URL(fileHref(key), window.location.origin).href;
const readableFileUrl = (key?: string) => `${window.location.host}/${displayFilename(key)}`;

const resetPagination = () => {
    currentPage.value = 0;
    pageCursors.value = [undefined];
    nextStartAfter.value = undefined;
    hasNextPage.value = false;
};

const refreshFiles = async () => {
    const requestId = ++activeRequest;
    const requestKind = props.kind;
    const cursor = pageCursors.value[currentPage.value];
    isLoading.value = true;
    errorMessage.value = '';
    successMessage.value = '';
    try {
        const response = await ListStoredItems(requestKind, pageSize.value, cursor);
        if (requestId !== activeRequest) return;
        uploadedFiles.value = response.Contents ?? [];
        nextStartAfter.value = response.NextStartAfter;
        hasNextPage.value = response.IsTruncated;
    } catch {
        if (requestId === activeRequest) {
            errorMessage.value = $t('filemanage.load_failed');
        }
    } finally {
        if (requestId === activeRequest) isLoading.value = false;
    }
};

onMounted(() => {
    void refreshFiles();
});

watch(() => props.kind, () => {
    resetPagination();
    void refreshFiles();
});

watch(pageSize, (size) => {
    try {
        localStorage.setItem(pageSizeStorageKey, String(size));
    } catch {
        // Keep the selection for this page even when it cannot be persisted.
    }
    resetPagination();
    void refreshFiles();
});

const onPreviousPageClick = async () => {
    if (currentPage.value === 0 || isLoading.value) return;
    currentPage.value -= 1;
    await refreshFiles();
};

const onNextPageClick = async () => {
    if (!hasNextPage.value || !nextStartAfter.value || isLoading.value) return;
    currentPage.value += 1;
    pageCursors.value[currentPage.value] = nextStartAfter.value;
    await refreshFiles();
};

const onDeleteFileClick = async (key?: string) => {
    if (!key || !window.confirm($t('filemanage.confirm_delete', { filename: displayFilename(key) }))) return;
    errorMessage.value = '';
    successMessage.value = '';
    try {
        await DeleteFile(displayFilename(key));
        await refreshFiles();
        if (!uploadedFiles.value.length && currentPage.value > 0) {
            currentPage.value -= 1;
            await refreshFiles();
        }
    } catch {
        errorMessage.value = $t('filemanage.delete_failed');
    }
};

const onCopyLinkClick = async (key?: string) => {
    if (!key) return;
    errorMessage.value = '';
    successMessage.value = '';
    try {
        await navigator.clipboard.writeText(fileUrl(key));
        successMessage.value = $t('filemanage.link_copied');
    } catch {
        errorMessage.value = $t('filemanage.copy_failed');
    }
};

const onEditFileClick = async (key?: string) => {
    if (!key || !isClipboard.value) return;
    errorMessage.value = '';
    successMessage.value = '';
    await router.push({ path: '/clip', query: { edit: displayFilename(key) } });
};

const onRenameFileClick = async (key?: string) => {
    if (!key) return;
    const currentName = displayFilename(key);
    const promptedName = window.prompt($t('filemanage.rename_prompt'), currentName);
    if (promptedName === null) return;
    const filename = promptedName.trim();
    if (!filename) {
        errorMessage.value = $t('filemanage.invalid_name');
        return;
    }
    if (filename === currentName) return;

    errorMessage.value = '';
    successMessage.value = '';
    try {
        await RenameFile(key, filename);
        await refreshFiles();
        successMessage.value = $t('filemanage.renamed');
    } catch (error) {
        const status = (error as { response?: { status?: number } }).response?.status;
        errorMessage.value = status === 409
            ? $t('filemanage.name_exists')
            : $t('filemanage.rename_failed');
    }
};

const closeMenuAnd = (event: MouseEvent, action: () => unknown) => {
    (event.currentTarget as HTMLElement).closest('details')?.removeAttribute('open');
    void action();
};
</script>

<template>
    <section class="file-manage-page">
        <div class="page-heading">
            <div>
                <h1>{{ $t(`${titleKey}.title`) }}</h1>
                <p>{{ $t(`${titleKey}.subtitle`) }}</p>
            </div>
            <div class="page-controls">
                <label class="page-size-control">
                    <span>{{ $t('filemanage.page_size') }}</span>
                    <select v-model.number="pageSize" :disabled="isLoading">
                        <option v-for="size in pageSizeOptions" :key="size" :value="size">{{ size }}</option>
                    </select>
                </label>
                <button class="ui-button refresh-button" type="button" :disabled="isLoading" @click="refreshFiles">
                    {{ isLoading ? $t('common.loading') : $t('common.refresh') }}
                </button>
            </div>
        </div>

        <p v-if="errorMessage" class="error-message" role="alert">{{ errorMessage }}</p>
        <p v-else-if="successMessage" class="success-message" role="status">{{ successMessage }}</p>
        <div v-else-if="isLoading && !uploadedFiles.length" class="empty-state">
            {{ $t('common.loading') }}
        </div>
        <div v-else-if="!errorMessage && !uploadedFiles.length" class="empty-state">
            <span class="empty-icon" aria-hidden="true">□</span>
            <p>{{ $t(`${titleKey}.empty`) }}</p>
            <router-link :to="isClipboard ? '/clip' : '/file'" class="upload-link">
                {{ isClipboard ? $t('nav.clip') : $t('nav.upload') }} ↗
            </router-link>
        </div>

        <div v-if="uploadedFiles.length" class="file-list">
            <article v-for="file in uploadedFiles" :key="file.Key" class="file-row">
                <span class="file-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M6 3.5h8l4 4V20H6z" />
                        <path d="M14 4v4h4M9 12h6M9 15.5h6" />
                    </svg>
                </span>
                <div class="file-info">
                    <strong class="file-name" :title="displayFilename(file.Key)">
                        {{ displayFilename(file.Key) }}
                    </strong>
                    <div class="file-url-row">
                        <span class="file-url-label">{{ $t('filemanage.link_label') }}</span>
                        <a
                            class="file-url"
                            :href="fileHref(file.Key)"
                            :title="fileUrl(file.Key)"
                            target="_blank"
                            rel="noopener"
                        >
                            {{ readableFileUrl(file.Key) }}
                        </a>
                    </div>
                    <span class="file-size">{{ formatBytes(file.Size ?? 0) }}</span>
                </div>
                <div class="file-actions">
                    <a class="ui-button" :href="fileHref(file.Key)" target="_blank" rel="noopener">
                        {{ $t('common.open') }}
                    </a>
                    <button class="ui-button" type="button" @click="onCopyLinkClick(file.Key)">
                        {{ $t('common.copy_link') }}
                    </button>
                    <details class="file-more">
                        <summary class="ui-button" :aria-label="$t('common.more_actions')">
                            {{ $t('common.more') }} <span aria-hidden="true">⌄</span>
                        </summary>
                        <div class="more-menu">
                            <button v-if="isClipboard" class="more-item" type="button" @click="closeMenuAnd($event, () => onEditFileClick(file.Key))">
                                {{ $t('common.edit') }}
                            </button>
                            <button class="more-item" type="button" @click="closeMenuAnd($event, () => onRenameFileClick(file.Key))">
                                {{ $t('common.rename') }}
                            </button>
                            <button
                                class="more-item more-item--danger"
                                type="button"
                                @click="closeMenuAnd($event, () => onDeleteFileClick(file.Key))"
                            >
                                {{ $t('common.delete') }}
                            </button>
                        </div>
                    </details>
                </div>
            </article>
        </div>

        <nav v-if="currentPage > 0 || hasNextPage" class="pagination" :aria-label="$t('filemanage.pagination')">
            <button class="ui-button" type="button" :disabled="currentPage === 0 || isLoading" @click="onPreviousPageClick">
                {{ $t('filemanage.previous') }}
            </button>
            <span>{{ $t('filemanage.page_number', { page: currentPage + 1, count: uploadedFiles.length }) }}</span>
            <button class="ui-button" type="button" :disabled="!hasNextPage || isLoading" @click="onNextPageClick">
                {{ $t('filemanage.next') }}
            </button>
        </nav>
    </section>
</template>

<style scoped>
.file-manage-page {
    max-width: 760px;
    margin: 0 auto;
}

h1 {
    margin: 0;
    color: #172033;
    font-size: 24px;
    letter-spacing: -0.03em;
}

.page-heading p {
    margin: 6px 0 0;
    color: #667085;
    font-size: 14px;
}

.refresh-button {
    flex: 0 0 auto;
}

.page-controls {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 8px;
}

.page-size-control {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: #667085;
    font-size: 12px;
    white-space: nowrap;
}

.page-size-control select {
    min-height: 36px;
    padding: 6px 9px;
    color: #344054;
    background: #fff;
    border: 1px solid #d0d5dd;
    border-radius: 8px;
}

.empty-state {
    display: flex;
    min-height: 220px;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 8px;
    padding: 24px;
    color: #667085;
    text-align: center;
    background: #fff;
    border: 1px solid #e4e8ee;
    border-radius: 13px;
}

.empty-state p {
    max-width: 440px;
    margin: 0;
    font-size: 14px;
    line-height: 1.6;
}

.empty-icon {
    color: #98a2b3;
    font-size: 38px;
}

.upload-link {
    margin-top: 7px;
    color: #175cd3;
    font-size: 14px;
    text-decoration: none;
}

.upload-link:hover {
    text-decoration: underline;
}

.error-message {
    padding: 12px 14px;
    color: #b42318;
    background: #fef3f2;
    border-radius: 9px;
}

.success-message {
    padding: 12px 14px;
    color: #067647;
    background: #ecfdf3;
    border-radius: 9px;
}

.file-list {
    overflow: hidden;
    background: #fff;
    border: 1px solid #e4e8ee;
    border-radius: 12px;
}

.file-row {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 14px;
    padding: 14px;
    border-bottom: 1px solid #eaecf0;
}

.file-row:last-child {
    border-bottom: 0;
}

.file-icon {
    display: grid;
    width: 36px;
    height: 36px;
    flex: 0 0 36px;
    place-items: center;
    color: #175cd3;
    background: #eff6ff;
    border-radius: 10px;
}

.file-icon svg {
    width: 20px;
    height: 20px;
}

.file-info {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 5px;
}

.file-name {
    overflow: hidden;
    color: #344054;
    font-size: 15px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.file-url-row {
    display: flex;
    min-width: 0;
    align-items: baseline;
    gap: 6px;
}

.file-url-label {
    flex: 0 0 auto;
    color: #667085;
    font-size: 12px;
}

.file-url {
    min-width: 0;
    overflow: hidden;
    color: #175cd3;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.file-url:hover {
    text-decoration: underline;
}

.file-size {
    color: #667085;
    font-size: 12px;
}

.file-actions {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 7px;
}

.pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    margin-top: 14px;
    color: #667085;
    font-size: 13px;
}

.file-actions .ui-button {
    min-height: 34px;
    padding: 7px 10px;
    font-size: 12px;
}

.file-more {
    position: relative;
}

.file-more > summary {
    list-style: none;
    cursor: pointer;
}

.file-more > summary::-webkit-details-marker {
    display: none;
}

.more-menu {
    position: absolute;
    z-index: 4;
    top: calc(100% + 6px);
    right: 0;
    min-width: 140px;
    padding: 5px;
    background: #fff;
    border: 1px solid #e4e8ee;
    border-radius: 9px;
    box-shadow: 0 8px 22px #3440541c;
}

.file-row:last-child .more-menu {
    top: auto;
    bottom: calc(100% + 6px);
}

.more-item {
    display: block;
    width: 100%;
    padding: 8px 9px;
    color: #344054;
    text-align: left;
    background: transparent;
    border: 0;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
}

.more-item:hover {
    background: #f2f4f7;
}

.more-item--danger {
    color: #b42318;
}

.more-item--danger:hover {
    background: #fef3f2;
}

@media (max-width: 520px) {
    .page-controls {
        width: 100%;
        justify-content: space-between;
    }

    .page-heading p {
        max-width: 240px;
    }

    .file-row {
        align-items: flex-start;
        flex-wrap: wrap;
    }

    .file-info {
        flex: 1 1 calc(100% - 54px);
    }

    .file-actions {
        width: 100%;
        justify-content: flex-end;
        margin-left: 48px;
        flex-wrap: wrap;
    }
}
</style>
