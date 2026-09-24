<script setup lang="ts">
import { reactive, ref } from 'vue';
import useFileStore from '@/store/file';
import { formatBytes } from '@/utils/utils';
import { PutFile } from '@/api';

const fileStore = useFileStore();
const fileUploadInput = ref<HTMLInputElement>();
const isDragging = ref(false);

interface UploadedFile {
  id: number;
  name: string;
  size: number;
  visibility: string;
  status: 'uploading' | 'done' | 'failed';
}

const uploadedFiles = ref<UploadedFile[]>([]);
let nextUploadId = 0;

const openPicker = () => fileUploadInput.value?.click();

const uploadFiles = async (files: FileList | File[]) => {
  const visibility = fileStore.visibility;
  const selectedFiles = Array.from(files);
  const queue = selectedFiles.map((file) => {
    const item = reactive<UploadedFile>({
      id: nextUploadId++,
      name: file.name,
      size: file.size,
      visibility,
      status: 'uploading',
    });
    return { item, file };
  });

  uploadedFiles.value = [...queue.map(({ item }) => item), ...uploadedFiles.value];

  await Promise.all(queue.map(async ({ item, file }) => {
    try {
      await PutFile(file.name, file, visibility, "file");
      item.status = 'done';
    } catch {
      item.status = 'failed';
    }
  }));
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
</script>

<template>
  <section class="file-page">
    <div class="page-heading">
      <h1>{{ $t('page_title.file') }}</h1>
      <p>{{ $t('index.file_description') }}</p>
    </div>

    <div class="file-area">
      <input ref="fileUploadInput" type="file" class="visually-hidden" multiple @change="onFilesSelected" />
      <button
        class="drop-zone"
        :class="{ 'is-dragging': isDragging }"
        type="button"
        @click="openPicker"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop="onDrop"
      >
        <span class="upload-icon" aria-hidden="true">↑</span>
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
    </div>

    <section v-if="uploadedFiles.length" class="upload-queue" aria-live="polite">
      <h2>{{ $t('file.upload_list') }}</h2>
      <article v-for="file in uploadedFiles" :key="file.id" class="upload-row">
        <div class="file-details">
          <strong :title="file.name">{{ file.name }}</strong>
          <span>{{ formatBytes(file.size) }} · {{ $t(`file.${file.status === 'done' ? 'uploaded' : file.status}`) }}</span>
        </div>
        <a
          v-if="file.status === 'done'"
          class="open-file"
          :href="`/${encodeURIComponent(file.name)}`"
          target="_blank"
          rel="noopener"
        >
          {{ $t('file.open_file') }} ↗
        </a>
        <span v-else-if="file.status === 'uploading'" class="status-spinner" aria-hidden="true"></span>
        <span v-else class="failed-mark" :aria-label="$t('file.failed')">!</span>
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
  font-size: 27px;
  font-weight: 700;
  background: #eff6ff;
  border-radius: 14px;
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
  color: #175cd3;
  font-size: 13px;
  text-decoration: none;
}

.open-file:hover {
  text-decoration: underline;
}

.status-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid #d0d5dd;
  border-top-color: #175cd3;
  border-radius: 50%;
  animation: spin 800ms linear infinite;
}

.failed-mark {
  display: grid;
  width: 21px;
  height: 21px;
  place-items: center;
  color: #b42318;
  font-weight: 700;
  background: #fef3f2;
  border-radius: 50%;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
