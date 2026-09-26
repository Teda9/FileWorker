<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { copyText, formatBytes } from '@/utils/utils';
import { CreateShareLink, DeleteFile, ListStoredItems, PatchFile, RenameFile } from '@/api';
import QRCode from 'qrcode';
import { getApiErrorCode } from '@/utils/apiErrors';
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
const sharingKey = ref('');
const shareDuration = ref(86400);
const shareUrl = ref('');
const shareQr = ref('');
const shareError = ref('');
const shareCopied = ref(false);
const publicItem = ref(false);
const isCreatingShare = ref(false);
const searchInput = ref('');
const searchTerm = ref('');
let activeRequest = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let activeController: AbortController | undefined;

const displayFilename = (key?: string) => {
    if (!key) return '';
    if (key.startsWith('files/') || key.startsWith('clips/')) {
        return key.slice(key.indexOf('/') + 1);
    }
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
    activeController?.abort();
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    activeController = controller;
    const requestId = ++activeRequest;
    const requestKind = props.kind;
    const cursor = pageCursors.value[currentPage.value];
    isLoading.value = true;
    errorMessage.value = '';
    successMessage.value = '';
    try {
        const response = await ListStoredItems(requestKind, pageSize.value, cursor, searchTerm.value, controller?.signal);
        if (requestId !== activeRequest) return;
        uploadedFiles.value = response.Contents ?? [];
        nextStartAfter.value = response.NextStartAfter;
        hasNextPage.value = response.IsTruncated;
    } catch {
        if (requestId === activeRequest && !controller?.signal.aborted) {
            errorMessage.value = $t('filemanage.load_failed');
        }
    } finally {
        if (requestId === activeRequest) {
            isLoading.value = false;
            activeController = undefined;
        }
    }
};

const clearSearchTimer = () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = undefined;
};

const applySearchNow = () => {
    clearSearchTimer();
    searchTerm.value = searchInput.value.trim();
    resetPagination();
    uploadedFiles.value = [];
    void refreshFiles();
};

onMounted(() => {
    void refreshFiles();
});

watch(() => props.kind, () => {
    clearSearchTimer();
    searchTerm.value = searchInput.value.trim();
    resetPagination();
    uploadedFiles.value = [];
    void refreshFiles();
});

watch(pageSize, (size) => {
    try {
        localStorage.setItem(pageSizeStorageKey, String(size));
    } catch {
        // Keep the selection for this page even when it cannot be persisted.
    }
    clearSearchTimer();
    searchTerm.value = searchInput.value.trim();
    resetPagination();
    uploadedFiles.value = [];
    void refreshFiles();
});

watch(searchInput, () => {
    clearSearchTimer();
    activeRequest += 1;
    activeController?.abort();
    searchTerm.value = searchInput.value.trim();
    resetPagination();
    uploadedFiles.value = [];
    errorMessage.value = '';
    successMessage.value = '';
    isLoading.value = true;
    searchTimer = setTimeout(() => {
        searchTimer = undefined;
        void refreshFiles();
    }, 250);
});

onBeforeUnmount(() => {
    clearSearchTimer();
    activeController?.abort();
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
    } catch (error) {
        const code = getApiErrorCode(error);
        errorMessage.value = $t(code ? `api_error.${code}` : 'filemanage.delete_failed');
    }
};

const onCopyLinkClick = async (key?: string) => {
    if (!key) return;
    errorMessage.value = '';
    successMessage.value = '';
    try {
        await copyText(fileUrl(key));
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
        const code = getApiErrorCode(error);
        errorMessage.value = status === 409
            ? $t('filemanage.name_exists')
            : code ? $t(`api_error.${code}`) : $t('filemanage.rename_failed');
    }
};

const openShareDialog = (key?: string) => {
    if (!key) return;
    sharingKey.value = key;
    shareDuration.value = 86400;
    shareUrl.value = '';
    shareQr.value = '';
    shareError.value = '';
    shareCopied.value = false;
    publicItem.value = false;
};

const createTemporaryShare = async () => {
    if (!sharingKey.value || isCreatingShare.value) return;
    isCreatingShare.value = true;
    shareError.value = '';
    shareUrl.value = '';
    shareQr.value = '';
    shareCopied.value = false;
    try {
        const result = await CreateShareLink(sharingKey.value, shareDuration.value);
        shareUrl.value = result.url;
        shareQr.value = await QRCode.toDataURL(result.url, { width: 240, margin: 1, errorCorrectionLevel: 'M' });
    } catch (error) {
        const code = getApiErrorCode(error);
        publicItem.value = code === 'ITEM_IS_PUBLIC';
        shareError.value = $t(code ? `api_error.${code}` : 'filemanage.share_failed');
    } finally {
        isCreatingShare.value = false;
    }
};

const makePrivateAndShare = async () => {
    if (!sharingKey.value || !publicItem.value) return;
    const name = displayFilename(sharingKey.value);
    if (!window.confirm($t('filemanage.confirm_make_private', { filename: name }))) return;
    isCreatingShare.value = true;
    shareError.value = '';
    try {
        await PatchFile(name, 'private');
        publicItem.value = false;
        isCreatingShare.value = false;
        await createTemporaryShare();
    } catch (error) {
        const code = getApiErrorCode(error);
        shareError.value = $t(code ? `api_error.${code}` : 'filemanage.share_failed');
    } finally {
        isCreatingShare.value = false;
    }
};

const copyShareLink = async () => {
    if (!shareUrl.value) return;
    try {
        await copyText(shareUrl.value);
        shareCopied.value = true;
    } catch {
        shareError.value = $t('filemanage.copy_failed');
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

        <div class="search-control" role="search">
            <input
                v-model="searchInput"
                type="search"
                :aria-label="$t('filemanage.search_label')"
                :placeholder="$t('filemanage.search_placeholder')"
                @keydown.enter.prevent="applySearchNow"
            />
        </div>

        <p v-if="errorMessage" class="error-message" role="alert">{{ errorMessage }}</p>
        <p v-else-if="successMessage" class="success-message" role="status">{{ successMessage }}</p>
        <div v-else-if="isLoading && !uploadedFiles.length" class="empty-state">
            {{ $t('common.loading') }}
        </div>
        <div v-else-if="!errorMessage && !uploadedFiles.length" class="empty-state">
            <span class="empty-icon" aria-hidden="true">□</span>
            <p>{{ searchTerm ? $t('filemanage.search_empty') : $t(`${titleKey}.empty`) }}</p>
            <router-link v-if="!searchTerm" :to="isClipboard ? '/clip' : '/file'" class="upload-link">
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
                    <button class="ui-button" type="button" @click="openShareDialog(file.Key)">
                        {{ $t('filemanage.share_qr') }}
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

        <div v-if="sharingKey" class="share-overlay" role="presentation" @click.self="sharingKey = ''">
            <section class="share-dialog" role="dialog" aria-modal="true" :aria-label="$t('filemanage.share_title')">
                <div class="share-heading">
                    <h2>{{ $t('filemanage.share_title') }}</h2>
                    <button class="share-close" type="button" :aria-label="$t('common.close')" @click="sharingKey = ''">×</button>
                </div>
                <label class="share-duration">
                    <span>{{ $t('filemanage.share_duration') }}</span>
                    <select v-model.number="shareDuration" @change="shareUrl = ''; shareQr = ''; shareCopied = false">
                        <option :value="3600">{{ $t('filemanage.one_hour') }}</option>
                        <option :value="86400">{{ $t('filemanage.one_day') }}</option>
                        <option :value="604800">{{ $t('filemanage.seven_days') }}</option>
                    </select>
                </label>
                <button class="ui-button ui-button--primary" type="button" :disabled="isCreatingShare" @click="createTemporaryShare">
                    {{ isCreatingShare ? $t('common.loading') : $t('filemanage.create_share') }}
                </button>
                <p v-if="shareError" class="error-message" role="alert">{{ shareError }}</p>
                <button v-if="publicItem" class="ui-button" type="button" :disabled="isCreatingShare" @click="makePrivateAndShare">
                    {{ $t('filemanage.make_private_and_share') }}
                </button>
                <div v-if="shareUrl" class="share-result">
                    <img :src="shareQr" :alt="$t('filemanage.qr_alt')" />
                    <input :value="shareUrl" readonly :aria-label="$t('filemanage.share_link')" />
                    <button class="ui-button" type="button" @click="copyShareLink">{{ $t('common.copy_link') }}</button>
                    <p v-if="shareCopied" class="success-message" role="status">{{ $t('filemanage.link_copied') }}</p>
                </div>
            </section>
        </div>
    </section>
</template>

<style scoped>
.file-manage-page {
    max-width: 760px;
    margin: 0 auto;
}

.share-overlay {
    position: fixed;
    z-index: 20;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 20px;
    background: #10182880;
}

.share-dialog {
    display: flex;
    width: 100%;
    max-width: 420px;
    width: min(100%, 420px);
    flex-direction: column;
    gap: 14px;
    padding: 20px;
    background: #fff;
    border: 1px solid #e4e8ee;
    border-radius: 14px;
    box-shadow: 0 24px 48px #10182833;
}

.share-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.share-heading h2 {
    margin: 0;
    color: #172033;
    font-size: 18px;
}

.share-close {
    width: 34px;
    height: 34px;
    color: #667085;
    background: transparent;
    border: 0;
    font-size: 24px;
    cursor: pointer;
}

.share-duration {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    color: #475467;
    font-size: 14px;
}

.share-duration select,
.share-result input {
    min-width: 0;
    padding: 9px;
    color: #344054;
    background: #fff;
    border: 1px solid #d0d5dd;
    border-radius: 8px;
}

.share-result {
    display: flex;
    align-items: center;
    flex-direction: column;
    gap: 10px;
}

.share-result img {
    width: 240px;
    height: 240px;
    image-rendering: pixelated;
}

.share-result input {
    box-sizing: border-box;
    width: 100%;
    font-size: 12px;
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

.search-control {
    margin-bottom: 16px;
}

.search-control input {
    box-sizing: border-box;
    width: 100%;
    min-height: 40px;
    padding: 9px 12px;
    color: #344054;
    background: #fff;
    border: 1px solid #d0d5dd;
    border-radius: 9px;
    font: inherit;
    font-size: 14px;
}

.search-control input:focus {
    border-color: #175cd3;
    outline: 3px solid #d1e9ff;
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
