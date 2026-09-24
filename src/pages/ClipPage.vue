<script setup lang="ts">
import { minimalSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers, highlightSpecialChars, drawSelection, dropCursor } from "@codemirror/view";
import { onMounted, onBeforeUnmount, ref } from "vue";
import useClipStore from "@/store/clip";
import { GetFile, HeadFile, PutFile } from "@/api";
import { getRandomFilename } from "@/utils/utils";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";

const route = useRoute();
const { t: $t } = useI18n();
const editTarget = typeof route.query.edit === 'string' ? route.query.edit : '';
const isEditingExisting = Boolean(editTarget);
const code = ref("");
const saveStatus = ref<'unsaved' | 'saving' | 'saved' | 'failed'>('unsaved');
const isLoadingExisting = ref(false);
const isLoadedExisting = ref(!isEditingExisting);
const loadError = ref('');
const editorElement = ref<HTMLElement>();
const filename = ref(editTarget || getRandomFilename());
const savedUrl = ref('');
const storeType = ref('text');
let editor: EditorView | undefined;
let isLoadingContent = false;
const clipStore = useClipStore();
const MAX_EDIT_BYTES = 2 * 1024 * 1024;

const startState = EditorState.create({
  doc: "",
  extensions: [
    minimalSetup,
    lineNumbers(),
    highlightSpecialChars(),
    drawSelection(),
    dropCursor(),
    EditorView.updateListener.of((update) => {
      code.value = update.state.doc.toString();
      if (update.docChanged && !isLoadingContent) {
        saveStatus.value = 'unsaved';
        savedUrl.value = '';
      }
    }),
  ]
});

const loadExistingContent = async () => {
  if (!editTarget) return;
  isLoadingExisting.value = true;
  loadError.value = '';
  try {
    const head = await HeadFile(editTarget);
    const contentLength = Number(head.headers['content-length']);
    if (Number.isFinite(contentLength) && contentLength > MAX_EDIT_BYTES) {
      loadError.value = $t('clip.edit_too_large');
      saveStatus.value = 'failed';
      return;
    }

    const response = await GetFile(editTarget);
    const bytes = response.data as ArrayBuffer;
    if (bytes.byteLength > MAX_EDIT_BYTES) {
      loadError.value = $t('clip.edit_too_large');
      saveStatus.value = 'failed';
      return;
    }

    let content: string;
    try {
      content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch {
      loadError.value = $t('clip.edit_text_only');
      saveStatus.value = 'failed';
      return;
    }
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(content)) {
      loadError.value = $t('clip.edit_text_only');
      saveStatus.value = 'failed';
      return;
    }

    const visibility = response.headers['x-store-visibility'];
    if (visibility === 'public' || visibility === 'private') {
      clipStore.visibility = visibility;
    }
    storeType.value = response.headers['x-store-type'] || 'file';
    isLoadedExisting.value = true;
    code.value = content;
    isLoadingContent = true;
    editor?.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: content },
    });
    isLoadingContent = false;
    saveStatus.value = 'saved';
    savedUrl.value = `/${encodeURIComponent(editTarget)}`;
  } catch {
    loadError.value = $t('clip.edit_load_failed');
    saveStatus.value = 'failed';
  } finally {
    isLoadingExisting.value = false;
  }
};

onMounted(async () => {
  editor = new EditorView({
    state: startState,
    parent: editorElement.value!,
  });
  if (isEditingExisting) {
    await loadExistingContent();
  }
  editor.focus();
});

const refreshRandomFileName = () => {
  if (isEditingExisting) return;
  filename.value = getRandomFilename();
  saveStatus.value = 'unsaved';
  savedUrl.value = '';
};

const onSaveBtnClick = async () => {
  if (saveStatus.value === 'saving' || isLoadingExisting.value || !isLoadedExisting.value) return;

  saveStatus.value = 'saving';
  try {
    await PutFile(filename.value, code.value, clipStore.visibility, storeType.value);
    saveStatus.value = 'saved';
    savedUrl.value = `/${encodeURIComponent(filename.value)}`;
  } catch {
    saveStatus.value = 'failed';
  }
};

const saveContentKeydown = (event: KeyboardEvent) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    void onSaveBtnClick();
  }
};

const onPasteFile = async (event: ClipboardEvent) => {
  const file = event.clipboardData?.files[0];
  if (!file || !editor) return;

  const text = await file.text();
  const cursor = editor.state.selection.main.head;
  editor.dispatch({ changes: { from: cursor, insert: text } });
};

onMounted(() => {
  window.addEventListener("keydown", saveContentKeydown);
  document.addEventListener("paste", onPasteFile);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", saveContentKeydown);
  document.removeEventListener("paste", onPasteFile);
  editor?.destroy();
});
</script>

<template>
  <section class="clip-page">
    <div class="page-heading clip-heading">
      <div>
        <h1>{{ isEditingExisting ? $t('clip.edit_title') : $t('page_title.clip') }}</h1>
        <p>{{ isEditingExisting ? $t('clip.edit_description') : $t('index.clip_description') }}</p>
      </div>
      <a v-if="savedUrl" class="ui-button open-saved" :href="savedUrl" target="_blank" rel="noopener">
        {{ $t('clip.open_saved') }} ↗
      </a>
    </div>

    <p v-if="loadError" class="load-error" role="alert">
      {{ loadError }}
      <router-link to="/filemanage">{{ $t('clip.back_to_files') }}</router-link>
    </p>

    <div class="text-area">
      <div class="editor-header">
        <input
          v-model="filename"
          class="filename-input monospace"
          type="text"
          :placeholder="$t('common.filename')"
          :aria-label="$t('common.filename')"
          :disabled="isEditingExisting"
          @input="saveStatus = 'unsaved'; savedUrl = ''"
        />
        <button v-if="!isEditingExisting" class="filename-refresh" type="button" :aria-label="$t('clip.new_name')" @click="refreshRandomFileName">
          ↻
        </button>
        <span class="save-status" :class="`status-${saveStatus}`" role="status">
          {{ isLoadingExisting ? $t('common.loading') : $t(`clip.status_${saveStatus}`) }}
        </span>
      </div>
      <div ref="editorElement" class="editor-host"></div>
      <div class="editor-footer">
        <select
          v-model="clipStore.visibility"
          class="public-select"
          :aria-label="$t('common.public')"
          @change="saveStatus = 'unsaved'; savedUrl = ''"
        >
          <option value="private">{{ $t('common.private') }}</option>
          <option value="public">{{ $t('common.public') }}</option>
        </select>
        <button class="ui-button ui-button--primary save-btn" type="button" :disabled="saveStatus === 'saving' || isLoadingExisting || !isLoadedExisting" @click="onSaveBtnClick">
          {{ saveStatus === 'saving' ? $t('common.saving') : $t('common.save') }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.clip-page {
  max-width: 760px;
  margin: 0 auto;
}

.clip-heading {
  margin-bottom: 20px;
}

h1 {
  margin: 0;
  color: #172033;
  font-size: 24px;
  letter-spacing: -0.03em;
}

.clip-heading p {
  margin: 6px 0 0;
  color: #667085;
  font-size: 14px;
}

.open-saved {
  flex: 0 0 auto;
}

.text-area {
  overflow: hidden;
  background: #fff;
  border: 1px solid #e4e8ee;
  border-radius: 13px;
  box-shadow: 0 4px 18px #3440540a;
}

.editor-header,
.editor-footer {
  display: flex;
  min-height: 58px;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: #fbfcfd;
}

.editor-header {
  border-bottom: 1px solid #eaecf0;
}

.filename-input {
  width: min(60%, 320px);
  min-width: 0;
  padding: 8px 10px;
  color: #344054;
  background: #fff;
  border: 1px solid #d0d5dd;
  border-radius: 8px;
  outline: none;
}

.filename-input:focus,
.public-select:focus {
  border-color: #84adff;
  box-shadow: 0 0 0 3px #2e90fa1f;
}

.filename-input:disabled {
  color: #667085;
  background: #f9fafb;
}

.filename-refresh {
  width: 34px;
  height: 34px;
  color: #475467;
  font-size: 21px;
  background: #fff;
  border: 1px solid #d0d5dd;
  border-radius: 8px;
  cursor: pointer;
}

.save-status {
  margin-left: auto;
  color: #667085;
  font-size: 13px;
  white-space: nowrap;
}

.status-saved {
  color: #067647;
}

.status-failed {
  color: #b42318;
}

.status-unsaved {
  color: #b54708;
}

.load-error {
  padding: 12px 14px;
  color: #b42318;
  background: #fef3f2;
  border-radius: 9px;
}

.editor-host :deep(.cm-editor) {
  min-height: 280px;
  height: min(58vh, 480px);
  border: 0;
}

.editor-host :deep(.cm-editor.cm-focused) {
  outline: none;
}

.editor-host :deep(.cm-gutters) {
  border: 0;
  background: #fff;
}

.editor-footer {
  border-top: 1px solid #eaecf0;
}

.public-select {
  padding: 8px 10px;
  color: #344054;
  background: #fff;
  border: 1px solid #d0d5dd;
  border-radius: 8px;
}

.save-btn {
  margin-left: auto;
}

@media (max-width: 520px) {
  .clip-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .editor-header,
  .editor-footer {
    padding: 9px;
  }

  .save-status {
    font-size: 12px;
  }
}
</style>
