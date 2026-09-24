<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { formatBytes } from '@/utils/utils';
import { DeleteFile, ListFiles } from '@/api';
import type { _Object } from '@aws-sdk/client-s3';
import { useI18n } from 'vue-i18n';

const { t: $t } = useI18n();
const uploadedFiles = ref<_Object[]>([]);
const isLoading = ref(false);
const errorMessage = ref('');

const refreshFiles = async () => {
    if (isLoading.value) return;
    isLoading.value = true;
    errorMessage.value = '';
    try {
        const res = await ListFiles();
        uploadedFiles.value = res.Contents ?? [];
    } catch {
        errorMessage.value = $t('filemanage.load_failed');
    } finally {
        isLoading.value = false;
    }
};

onMounted(() => {
    void refreshFiles();
});

const onDeleteFileClick = async (key?: string) => {
    if (!key || !window.confirm($t('filemanage.confirm_delete'))) return;
    errorMessage.value = '';
    try {
        await DeleteFile(key);
        await refreshFiles();
    } catch {
        errorMessage.value = $t('filemanage.delete_failed');
    }
};
</script>

<template>
    <section class="file-manage-page">
        <div class="page-heading">
            <div>
                <h1>{{ $t('filemanage.title') }}</h1>
                <p>{{ $t('filemanage.subtitle') }}</p>
            </div>
            <button class="refresh-button" type="button" :disabled="isLoading" @click="refreshFiles">
                {{ isLoading ? $t('common.loading') : $t('common.refresh') }}
            </button>
        </div>

        <p v-if="errorMessage" class="error-message" role="alert">{{ errorMessage }}</p>
        <div v-else-if="isLoading && !uploadedFiles.length" class="empty-state">
            {{ $t('common.loading') }}
        </div>
        <div v-else-if="!errorMessage && !uploadedFiles.length" class="empty-state">
            <span class="empty-icon" aria-hidden="true">□</span>
            <p>{{ $t('filemanage.empty') }}</p>
            <router-link to="/file" class="upload-link">{{ $t('nav.upload') }} ↗</router-link>
        </div>

        <div v-if="uploadedFiles.length" class="file-list">
            <article v-for="file in uploadedFiles" :key="file.Key" class="file-row">
                <span class="file-icon" aria-hidden="true">▤</span>
                <div class="file-info">
                    <a
                        class="file-name"
                        :title="file.Key!"
                        :href="`/${encodeURIComponent(file.Key!)}`"
                        target="_blank"
                        rel="noopener"
                    >
                        {{ file.Key! }}
                    </a>
                    <span>{{ formatBytes(file.Size ?? 0) }}</span>
                </div>
                <button
                    class="delete-button"
                    type="button"
                    :aria-label="`${$t('common.delete')} ${file.Key!}`"
                    @click="onDeleteFileClick(file.Key)"
                >
                    {{ $t('common.delete') }}
                </button>
            </article>
        </div>
    </section>
</template>

<style scoped>
.file-manage-page {
    max-width: 760px;
    margin: 0 auto;
}

.page-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
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

.refresh-button,
.delete-button {
    padding: 8px 11px;
    color: #475467;
    background: #fff;
    border: 1px solid #d0d5dd;
    border-radius: 8px;
    cursor: pointer;
}

.refresh-button:disabled {
    cursor: wait;
    opacity: 0.6;
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
    gap: 12px;
    padding: 12px 14px;
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

.file-info {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 4px;
}

.file-name {
    overflow: hidden;
    color: #344054;
    font-size: 14px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.file-info > span {
    color: #667085;
    font-size: 12px;
}

.delete-button {
    color: #b42318;
    border-color: #fecdca;
}

.delete-button:hover {
    background: #fef3f2;
}

@media (max-width: 520px) {
    .page-heading {
        align-items: flex-start;
    }

    .page-heading p {
        max-width: 240px;
    }

    .delete-button {
        padding: 7px 8px;
        font-size: 12px;
    }
}
</style>
