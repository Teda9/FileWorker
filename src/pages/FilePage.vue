<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import useFileStore from '@/store/file';
import { formatBytes } from '@/utils/utils';
import { HeadFile, PutFile } from '@/api';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { readSharedPayload, deleteSharedPayload, removeSharedFiles } from '@/pwa/share-target';
import { getApiErrorCode } from '@/utils/apiErrors';

const { t: $t } = useI18n();
const fileStore = useFileStore();
const route = useRoute();
onMounted(() => {
  fileStore.visibility = 'private';
});
const fileUploadInput = ref<HTMLInputElement>();
const isDragging = ref(false);
const isProcessingFiles = ref(false);
const isCheckingFiles = ref(false);
const uploadError = ref('');
const sharedTextId = ref('');
const sharedTextReady = ref(false);
const sharedFileCount = ref(0);

interface UploadedFile {
  id: number;
  name: string;
  size: number;
  visibility: string;
  status: 'queued' | 'uploading' | 'done' | 'failed';
  progress?: number;
}

const uploadedFiles = ref<UploadedFile[]>([]);
const failedFiles = new Map<number, File>();
const failedCodes = new Map<number, string>();
let nextUploadId = 0;
const UPLOAD_CONCURRENCY = 3;

const openPicker = () => fileUploadInput.value?.click();

const updateUploadError = () => {
  const failed = uploadedFiles.value.filter(({ status }) => status === 'failed');
  const names = failed.map(({ name }) => name);
  const codes = [...new Set(failed.map(file => failedCodes.get(file.id)).filter((code): code is string => Boolean(code)))];
  const details = codes.map(code => $t(`api_error.${code}`)).join(' ');
  uploadError.value = names.length
    ? `${$t('file.upload_failed_names', { filenames: [...new Set(names)].join(', ') })}${details ? ` ${details}` : ''}`
    : '';
};

const sendFile = async (item: UploadedFile, file: File) => {
  item.status = 'uploading';
  item.progress = 0;
  try {
    await PutFile(item.name, file, item.visibility, 'file', (loaded, total) => {
      if (total && total > 0) item.progress = Math.min(100, Math.round(loaded / total * 100));
    });
    item.status = 'done';
    item.progress = 100;
    failedFiles.delete(item.id);
    failedCodes.delete(item.id);
  } catch (error) {
    item.status = 'failed';
    item.progress = undefined;
    failedFiles.set(item.id, file);
    const code = getApiErrorCode(error);
    if (code) failedCodes.set(item.id, code);
  }
};

const retryUpload = async (item: UploadedFile) => {
  if (isProcessingFiles.value || item.status !== 'failed') return;
  const file = failedFiles.get(item.id);
  if (!file) return;
  isProcessingFiles.value = true;
  try {
    await sendFile(item, file);
    updateUploadError();
    if (sharedTextId.value && sharedFileCount.value) {
      const sharedRows = uploadedFiles.value.slice(0, sharedFileCount.value);
      sharedTextReady.value = sharedRows.length === sharedFileCount.value && sharedRows.every(({ status }) => status === 'done');
      if (sharedTextReady.value) await removeSharedFiles(sharedTextId.value);
    }
  } finally {
    isProcessingFiles.value = false;
  }
};

const uploadFiles = async (files: FileList | File[]) => {
  if (isProcessingFiles.value) return;
  const selectedFiles = Array.from(files);
  if (!selectedFiles.length) return;

  isProcessingFiles.value = true;
  uploadError.value = '';
  try {
    const nameCounts = new Map<string, number>();
    selectedFiles.forEach(({ name }) => nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1));
    const duplicateNames = [...nameCounts.entries()].filter(([, count]) => count > 1).map(([name]) => name);
    if (duplicateNames.length) {
      uploadError.value = $t('file.duplicate_names', { filenames: duplicateNames.join(', ') });
      return;
    }

    isCheckingFiles.value = true;
    let existingNames: string[];
    let clipboardNameConflict = '';
    try {
      existingNames = [];
      for (let offset = 0; offset < selectedFiles.length; offset += UPLOAD_CONCURRENCY) {
        const batch = selectedFiles.slice(offset, offset + UPLOAD_CONCURRENCY);
        const checks = await Promise.all(batch.map(async ({ name }) => {
          try {
            const response = await HeadFile(name);
            return { name, failed: false, type: response.headers['x-store-type'] };
          } catch (error) {
            const status = (error as { response?: { status?: number } }).response?.status;
            return { name: status === 404 ? null : name, failed: status !== 404, code: getApiErrorCode(error), type: undefined };
          }
        }));
        const failedCheck = checks.find(({ failed }) => failed);
        if (failedCheck) {
          uploadError.value = failedCheck.code
            ? $t(`api_error.${failedCheck.code}`)
            : $t('file.overwrite_check_failed');
          return;
        }
        clipboardNameConflict ||= checks.find(({ type }) => type === 'text')?.name ?? '';
        existingNames.push(...checks.map(({ name }) => name).filter((name): name is string => name !== null));
      }
    } catch {
      uploadError.value = $t('file.overwrite_check_failed');
      return;
    } finally {
      isCheckingFiles.value = false;
    }

    if (clipboardNameConflict) {
      uploadError.value = $t('file.name_is_clip', { filename: clipboardNameConflict });
      return;
    }

    if (existingNames.length && !window.confirm($t('file.overwrite_confirm', { filenames: existingNames.join(', ') }))) {
      return;
    }

    const visibility = fileStore.visibility;
    const queue = selectedFiles.map((file) => {
      const item = reactive<UploadedFile>({
        id: nextUploadId++,
        name: file.name,
        size: file.size,
        visibility,
        status: 'queued',
      });
      return { item, file };
    });

    uploadedFiles.value = [...queue.map(({ item }) => item), ...uploadedFiles.value];

    let nextIndex = 0;
    await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, queue.length) }, async () => {
      while (nextIndex < queue.length) {
        const { item, file } = queue[nextIndex++];
        await sendFile(item, file);
      }
    }));
    updateUploadError();
  } finally {
    isCheckingFiles.value = false;
    isProcessingFiles.value = false;
  }
};

const onFilesSelected = (event: Event) => {
  const input = event.target as HTMLInputElement;
  if (input.files?.length) {
    void uploadFiles(input.files);
    input.value = '';
  }
};

const onDrop = (event: DragEvent) => {
  event.preventDefault();
  isDragging.value = false;
  if (event.dataTransfer?.files.length) {
    void uploadFiles(event.dataTransfer.files);
  }
};

onMounted(async () => {
  const id = typeof route.query.share === 'string' ? route.query.share : '';
  if (!id) return;
  const payload = await readSharedPayload(id);
  if (!payload) return;
  if (payload.files.length) await uploadFiles(payload.files);
  if (payload.text || payload.url) {
    sharedTextId.value = id;
    sharedFileCount.value = payload.files.length;
    const sharedRows = uploadedFiles.value.slice(0, payload.files.length);
    sharedTextReady.value = payload.files.length === 0 || (sharedRows.length === payload.files.length && sharedRows.every(({ status }) => status === 'done'));
    if (sharedTextReady.value) await removeSharedFiles(id);
  } else if (!uploadedFiles.value.some(file => file.status === 'failed')) {
    await deleteSharedPayload(id);
  }
});
</script>

<template>
  <section class="file-page">
    <div class="page-heading">
      <div>
        <h1>{{ $t('page_title.file') }}</h1>
        <p>{{ $t('index.file_description') }}</p>
      </div>
    </div>

    <div class="file-area">
      <input ref="fileUploadInput" type="file" class="visually-hidden" multiple :disabled="isProcessingFiles" @change="onFilesSelected" />
      <button
        class="drop-zone"
        :class="{ 'is-dragging': isDragging }"
        type="button"
        :disabled="isProcessingFiles"
        @click="openPicker"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop="onDrop"
      >
        <span class="upload-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 15V4m0 0L7 9m5-5 5 5M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" />
          </svg>
        </span>
        <strong>{{ $t('file.drop_title') }}</strong>
        <span>{{ $t('file.drop_hint') }}</span>
      </button>

      <div class="upload-footer">
        <label for="visibility-select">{{ $t('file.visibility') }}</label>
        <select id="visibility-select" v-model="fileStore.visibility" class="public-select">
          <option value="private">{{ $t('common.private') }}</option>
          <option value="public">{{ $t('common.public') }}</option>
        </select>
      </div>
      <p class="visibility-hint">{{ $t(fileStore.visibility === 'public' ? 'common.visibility_public_hint' : 'common.visibility_private_hint') }}</p>
    </div>

    <p v-if="isCheckingFiles" class="upload-feedback" role="status">{{ $t('file.checking') }}</p>
    <p v-if="sharedTextId && sharedTextReady" class="upload-feedback" role="status">
      {{ $t('file.shared_text_prompt') }}
      <router-link :to="{ path: '/clip', query: { share: sharedTextId } }">{{ $t('file.save_shared_text') }}</router-link>
    </p>
    <p v-if="uploadError" class="upload-error" role="alert">{{ uploadError }}</p>

    <section v-if="uploadedFiles.length" class="upload-queue" aria-live="polite">
      <h2>{{ $t('file.upload_list') }}</h2>
      <article v-for="file in uploadedFiles" :key="file.id" class="upload-row">
        <div class="file-details">
          <strong :title="file.name">{{ file.name }}</strong>
          <span>
            {{ formatBytes(file.size) }} · {{ $t(`file.${file.status === 'done' ? 'uploaded' : file.status}`) }}
            <template v-if="file.status === 'uploading' && file.progress !== undefined"> · {{ file.progress }}%</template>
          </span>
        </div>
        <a
          v-if="file.status === 'done'"
          class="ui-button open-file"
          :href="`/${encodeURIComponent(file.name)}`"
          target="_blank"
          rel="noopener"
        >
          {{ $t('file.open_file') }} ↗
        </a>
        <span v-else-if="file.status === 'uploading'" class="status-spinner" aria-hidden="true"></span>
        <button v-else-if="file.status === 'failed'" class="ui-button" type="button" :disabled="isProcessingFiles" @click="retryUpload(file)">
          {{ $t('file.retry') }}
        </button>
      </article>
    </section>
  </section>
</template>

<style scoped>
.file-page {
  max-width: 760px;
  margin: 0 auto;
}

.page-heading {
  margin-bottom: 20px;
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

.file-area {
  overflow: hidden;
  background: #fff;
  border: 1px solid #e4e8ee;
  border-radius: 13px;
  box-shadow: 0 4px 18px #3440540a;
}

.drop-zone {
  display: flex;
  width: 100%;
  min-height: 230px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 9px;
  padding: 28px 18px;
  color: #344054;
  background: #fff;
  border: 0;
  cursor: pointer;
}

.drop-zone:hover,
.drop-zone.is-dragging {
  background: #f5f9ff;
}

.drop-zone.is-dragging {
  outline: 2px dashed #528bff;
  outline-offset: -10px;
}

.upload-icon {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  color: #175cd3;
  background: #eff6ff;
  border-radius: 14px;
}

.upload-icon svg {
  width: 24px;
  height: 24px;
}

.drop-zone strong {
  margin-top: 4px;
  font-size: 16px;
}

.drop-zone > span:last-child {
  color: #667085;
  font-size: 13px;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.upload-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  color: #667085;
  background: #fbfcfd;
  border-top: 1px solid #eaecf0;
  font-size: 13px;
}

.visibility-hint {
  margin: 7px 0 0;
  color: #667085;
  font-size: 12px;
  line-height: 1.45;
}

.public-select {
  padding: 7px 9px;
  color: #344054;
  background: #fff;
  border: 1px solid #d0d5dd;
  border-radius: 8px;
}

.upload-queue {
  margin-top: 24px;
}

.upload-feedback,
.upload-error {
  margin: 14px 0 0;
  padding: 11px 13px;
  border-radius: 9px;
  font-size: 13px;
}

.upload-feedback {
  color: #475467;
  background: #f2f4f7;
}

.upload-error {
  color: #b42318;
  background: #fef3f2;
}

.upload-queue h2 {
  margin: 0 0 10px;
  color: #344054;
  font-size: 15px;
}

.upload-row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  background: #fff;
  border: 1px solid #eaecf0;
  border-bottom: 0;
}

.upload-row:first-of-type {
  border-radius: 10px 10px 0 0;
}

.upload-row:last-child {
  border-bottom: 1px solid #eaecf0;
  border-radius: 0 0 10px 10px;
}

.file-details {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 4px;
}

.file-details strong {
  overflow: hidden;
  color: #344054;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-details span {
  color: #667085;
  font-size: 12px;
}

.open-file {
  flex: 0 0 auto;
}

.status-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid #d0d5dd;
  border-top-color: #175cd3;
  border-radius: 50%;
  animation: spin 800ms linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
