<script setup lang="ts">
import { minimalSetup } from "codemirror";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, lineNumbers, highlightSpecialChars, drawSelection, dropCursor } from "@codemirror/view";
import { StreamLanguage } from '@codemirror/language';
import { computed, nextTick, onMounted, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import useClipStore from "@/store/clip";
import { GetFile, HeadFile, PutFile } from "@/api";
import { getRandomFilename } from "@/utils/utils";
import { clearClipDraft, guessClipMode, readClipDraft, writeClipDraft, type ClipDraft, type ClipMode } from '@/utils/clipDraft';
import { useRoute } from "vue-router";
import { useRouter } from "vue-router";
import { takeSharedPayload } from '@/pwa/share-target';
import { composeSharedContent } from '@/utils/clipShare';
import { getApiErrorCode } from '@/utils/apiErrors';
import { useI18n } from "vue-i18n";

const route = useRoute();
const router = useRouter();
const { t: $t } = useI18n();
const editTarget = typeof route.query.edit === 'string' ? route.query.edit : '';
const isEditingExisting = Boolean(editTarget);
const code = ref("");
const saveStatus = ref<'unsaved' | 'saving' | 'saved' | 'failed'>('unsaved');
const isLoadingExisting = ref(false);
const isLoadedExisting = ref(!isEditingExisting);
const loadError = ref('');
const saveError = ref('');
const editorElement = ref<HTMLElement>();
const filename = ref(editTarget || getRandomFilename());
const savedUrl = ref('');
const storeType = ref('text');
const mode = ref<ClipMode>(guessClipMode(filename.value));
const activeView = ref<'edit' | 'preview'>('edit');
const draftNotice = ref<'restored' | 'unavailable' | ''>('');
const jsonError = ref('');
const language = new Compartment();
const editorEditable = new Compartment();
const markdownRenderer = shallowRef<{ render: (source: string) => string }>();
const markdownPreview = computed(() => markdownRenderer.value?.render(code.value) ?? '');
let editor: EditorView | undefined;
let isLoadingContent = false;
const isSaving = ref(false);
let hasEdited = false;
let modeWasChosen = false;
let draftTimer: ReturnType<typeof setTimeout> | undefined;
const clipStore = useClipStore();
const MAX_EDIT_BYTES = 2 * 1024 * 1024;

const languageForMode = async (value: ClipMode): Promise<Extension> => {
  switch (value) {
    case 'markdown': return (await import('@codemirror/lang-markdown')).markdown();
    case 'json': return (await import('@codemirror/lang-json')).json();
    case 'shell': {
      const shellModule = await import('@codemirror/legacy-modes/mode/shell');
      return StreamLanguage.define(shellModule.shell);
    }
    case 'yaml': return (await import('@codemirror/lang-yaml')).yaml();
    case 'javascript': return (await import('@codemirror/lang-javascript')).javascript();
    case 'python': return (await import('@codemirror/lang-python')).python();
    default: return [];
  }
};

let languageLoadId = 0;
const updateLanguage = async (value: ClipMode) => {
  mode.value = value;
  const loadId = ++languageLoadId;
  const extension = await languageForMode(value);
  if (loadId === languageLoadId) editor?.dispatch({ effects: language.reconfigure(extension) });
};

watch(mode, async (value) => {
  if (value !== 'markdown' || markdownRenderer.value) return;
  const { default: MarkdownIt } = await import('markdown-it');
  const renderer = new MarkdownIt({ html: false, linkify: false, breaks: true });
  renderer.disable('image');
  markdownRenderer.value = renderer;
}, { immediate: true });

const persistDraft = () => {
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = undefined;
  if (!hasEdited || saveStatus.value === 'saved' || !isLoadedExisting.value) return;
  const draft: ClipDraft = {
    content: code.value,
    filename: filename.value,
    visibility: clipStore.visibility === 'public' ? 'public' : 'private',
    mode: mode.value,
    savedAt: Date.now(),
  };
  if (!writeClipDraft(editTarget, draft)) draftNotice.value = 'unavailable';
};

const scheduleDraft = () => {
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = setTimeout(persistDraft, 400);
};

const markUnsaved = () => {
  hasEdited = true;
  saveStatus.value = 'unsaved';
  saveError.value = '';
  savedUrl.value = '';
  scheduleDraft();
};

const setEditorContent = (content: string) => {
  isLoadingContent = true;
  editor?.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: content } });
  isLoadingContent = false;
  code.value = content;
};

const restoreDraft = (draft: ClipDraft) => {
  filename.value = isEditingExisting ? editTarget : draft.filename;
  clipStore.visibility = draft.visibility;
  mode.value = draft.mode;
  modeWasChosen = true;
  void updateLanguage(mode.value);
  setEditorContent(draft.content);
  hasEdited = true;
  saveStatus.value = 'unsaved';
  savedUrl.value = '';
  draftNotice.value = 'restored';
};

const startState = EditorState.create({
  doc: "",
  extensions: [
    minimalSetup,
    lineNumbers(),
    highlightSpecialChars(),
    drawSelection(),
    dropCursor(),
    language.of([]),
    editorEditable.of(EditorView.editable.of(!isEditingExisting)),
    EditorView.updateListener.of((update) => {
      code.value = update.state.doc.toString();
      if (update.docChanged && !isLoadingContent) {
        jsonError.value = '';
        markUnsaved();
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
    editor?.dispatch({ effects: editorEditable.reconfigure(EditorView.editable.of(true)) });
    setEditorContent(content);
    saveStatus.value = 'saved';
    savedUrl.value = `/${encodeURIComponent(editTarget)}`;
    const draft = readClipDraft(editTarget);
    if (draft) {
      if (draft.content === content && draft.visibility === clipStore.visibility) {
        clearClipDraft(editTarget);
      } else {
        restoreDraft(draft);
      }
    }
  } catch {
    loadError.value = $t('clip.edit_load_failed');
    saveStatus.value = 'failed';
  } finally {
    isLoadingExisting.value = false;
  }
};

onMounted(async () => {
  if (!isEditingExisting) clipStore.visibility = 'private';
  editor = new EditorView({
    state: startState,
    parent: editorElement.value!,
  });
  if (isEditingExisting) {
    await loadExistingContent();
  } else {
    const draft = readClipDraft('');
    if (draft) restoreDraft(draft);
    const shareId = typeof route.query.share === 'string' ? route.query.share : '';
    if (shareId) {
      try {
        const shared = await takeSharedPayload(shareId);
        if (!shared) {
          loadError.value = $t('clip.share_unavailable');
        } else {
          const content = composeSharedContent(shared);
          if (content) {
            setEditorContent(content);
            hasEdited = true;
            saveStatus.value = 'unsaved';
            draftNotice.value = '';
            modeWasChosen = false;
            updateLanguage(guessClipMode(filename.value));
          }
        }
      } catch {
        loadError.value = $t('clip.share_unavailable');
      } finally {
        const query = { ...route.query };
        delete query.share;
        await router.replace({ path: route.path, query });
      }
    }
  }
  if (activeView.value === 'edit') editor.focus();
});

const refreshRandomFileName = () => {
  if (isEditingExisting) return;
  filename.value = getRandomFilename();
  if (!modeWasChosen) updateLanguage(guessClipMode(filename.value));
  markUnsaved();
};

const onFilenameInput = () => {
  if (!modeWasChosen) updateLanguage(guessClipMode(filename.value));
  markUnsaved();
};

const onModeChange = () => {
  modeWasChosen = true;
  updateLanguage(mode.value);
  if (saveStatus.value !== 'saved') scheduleDraft();
};

const switchView = async (value: 'edit' | 'preview') => {
  activeView.value = value;
  if (value === 'edit') {
    await nextTick();
    editor?.requestMeasure();
    editor?.focus();
  }
};

const formatJson = () => {
  try {
    const formatted = JSON.stringify(JSON.parse(code.value), null, 2);
    setEditorContent(formatted);
    jsonError.value = '';
    markUnsaved();
    editor?.focus();
  } catch {
    jsonError.value = $t('clip.json_invalid');
  }
};

const onSaveBtnClick = async () => {
  if (isSaving.value || isLoadingExisting.value || !isLoadedExisting.value) return;

  const savedContent = code.value;
  const savedFilename = filename.value;
  const savedVisibility = clipStore.visibility;
  isSaving.value = true;
  saveStatus.value = 'saving';
  saveError.value = '';
  try {
    await PutFile(savedFilename, savedContent, savedVisibility, storeType.value);
    if (code.value === savedContent && filename.value === savedFilename && clipStore.visibility === savedVisibility) {
      saveStatus.value = 'saved';
      hasEdited = false;
      savedUrl.value = `/${encodeURIComponent(savedFilename)}`;
      draftNotice.value = '';
      if (draftTimer) clearTimeout(draftTimer);
      draftTimer = undefined;
      clearClipDraft(editTarget);
    } else {
      markUnsaved();
    }
  } catch (error) {
    saveStatus.value = 'failed';
    const code = getApiErrorCode(error);
    saveError.value = code ? $t(`api_error.${code}`) : $t('clip.status_failed');
    persistDraft();
  } finally {
    isSaving.value = false;
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
  if (!file || !editor || activeView.value !== 'edit') return;

  const text = await file.text();
  const cursor = editor.state.selection.main.head;
  editor.dispatch({ changes: { from: cursor, insert: text } });
};

onMounted(() => {
  window.addEventListener("keydown", saveContentKeydown);
  document.addEventListener("paste", onPasteFile);
  window.addEventListener('beforeunload', persistDraft);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", saveContentKeydown);
  document.removeEventListener("paste", onPasteFile);
  window.removeEventListener('beforeunload', persistDraft);
  if (draftTimer) clearTimeout(draftTimer);
  persistDraft();
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
      <router-link to="/clipmanage">{{ $t('clip.back_to_files') }}</router-link>
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
          @input="onFilenameInput"
        />
        <button v-if="!isEditingExisting" class="filename-refresh" type="button" :aria-label="$t('clip.new_name')" @click="refreshRandomFileName">
          ↻
        </button>
        <span class="save-status" :class="`status-${saveStatus}`" role="status">
          {{ isLoadingExisting ? $t('common.loading') : $t(`clip.status_${saveStatus}`) }}
        </span>
      </div>
      <div class="editor-tools">
        <label class="mode-label" for="clip-mode">{{ $t('clip.mode') }}</label>
        <select id="clip-mode" v-model="mode" class="mode-select" :disabled="isEditingExisting && !isLoadedExisting" @change="onModeChange">
          <option value="text">{{ $t('clip.mode_text') }}</option>
          <option value="markdown">{{ $t('clip.mode_markdown') }}</option>
          <option value="json">{{ $t('clip.mode_json') }}</option>
          <option value="shell">{{ $t('clip.mode_shell') }}</option>
          <option value="yaml">{{ $t('clip.mode_yaml') }}</option>
          <option value="javascript">{{ $t('clip.mode_javascript') }}</option>
          <option value="python">{{ $t('clip.mode_python') }}</option>
        </select>
        <button v-if="mode === 'json' && activeView === 'edit'" class="tool-button format-button" type="button" :disabled="!isLoadedExisting" @click="formatJson">
          {{ $t('clip.format_json') }}
        </button>
        <div class="view-switch" :aria-label="$t('clip.view')">
          <button class="view-button" :class="{ active: activeView === 'edit' }" type="button" :aria-pressed="activeView === 'edit'" @click="switchView('edit')">
            {{ $t('clip.edit_view') }}
          </button>
          <button class="view-button" :class="{ active: activeView === 'preview' }" type="button" :aria-pressed="activeView === 'preview'" @click="switchView('preview')">
            {{ $t('clip.preview_view') }}
          </button>
        </div>
      </div>
      <p v-if="draftNotice" class="editor-notice" :class="{ 'notice-error': draftNotice === 'unavailable' }" role="status">
        {{ $t(draftNotice === 'restored' ? 'clip.draft_restored' : 'clip.draft_unavailable') }}
      </p>
      <p v-if="jsonError" class="editor-notice notice-error" role="alert">{{ jsonError }}</p>
      <p v-if="saveError" class="editor-notice notice-error" role="alert">{{ saveError }}</p>
      <div v-show="activeView === 'edit'" ref="editorElement" class="editor-host"></div>
      <div v-if="activeView === 'preview'" class="preview-host">
        <p v-if="!code" class="preview-empty">{{ $t('clip.preview_empty') }}</p>
        <div v-else-if="mode === 'markdown'" class="markdown-preview" v-html="markdownPreview"></div>
        <pre v-else class="text-preview">{{ code }}</pre>
      </div>
      <div class="editor-footer">
        <span class="visibility-hint">{{ $t(clipStore.visibility === 'public' ? 'common.visibility_public_hint' : 'common.visibility_private_hint') }}</span>
        <select
          v-model="clipStore.visibility"
          class="public-select"
          :aria-label="$t('common.public')"
          :disabled="isEditingExisting && !isLoadedExisting"
          @change="markUnsaved"
        >
          <option value="private">{{ $t('common.private') }}</option>
          <option value="public">{{ $t('common.public') }}</option>
        </select>
        <button class="ui-button ui-button--primary save-btn" type="button" :disabled="isSaving || isLoadingExisting || !isLoadedExisting" @click="onSaveBtnClick">
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

.visibility-hint {
  flex: 1;
  color: #667085;
  font-size: 12px;
  line-height: 1.45;
}

.editor-header {
  border-bottom: 1px solid #eaecf0;
}

.editor-tools {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 9px 14px;
  border-bottom: 1px solid #eaecf0;
}

.mode-label {
  color: #667085;
  font-size: 13px;
}

.mode-select,
.tool-button {
  min-height: 34px;
  padding: 6px 10px;
  color: #344054;
  background: #fff;
  border: 1px solid #d0d5dd;
  border-radius: 8px;
}

.tool-button,
.view-button {
  cursor: pointer;
}

.tool-button:disabled {
  opacity: .5;
  cursor: not-allowed;
}

.view-switch {
  display: flex;
  margin-left: auto;
  padding: 3px;
  background: #f2f4f7;
  border-radius: 8px;
}

.view-button {
  min-height: 28px;
  padding: 4px 10px;
  color: #667085;
  background: transparent;
  border: 0;
  border-radius: 6px;
  font-size: 13px;
}

.view-button.active {
  color: #344054;
  background: #fff;
  box-shadow: 0 1px 3px #10182818;
}

.editor-notice {
  margin: 0;
  padding: 8px 14px;
  color: #175cd3;
  background: #eff8ff;
  font-size: 13px;
}

.notice-error {
  color: #b42318;
  background: #fef3f2;
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

.preview-host {
  min-height: 280px;
  height: min(58vh, 480px);
  overflow: auto;
  padding: 16px 20px;
  color: #344054;
}

.preview-empty {
  color: #98a2b3;
}

.text-preview {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: 13px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.markdown-preview {
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.markdown-preview :deep(:first-child) {
  margin-top: 0;
}

.markdown-preview :deep(pre) {
  overflow-x: auto;
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
}

.markdown-preview :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.markdown-preview :deep(blockquote) {
  margin-left: 0;
  padding-left: 14px;
  border-left: 3px solid #d0d5dd;
  color: #667085;
}

.markdown-preview :deep(a) {
  color: #175cd3;
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
  .editor-footer,
  .editor-tools {
    padding: 9px;
  }

  .view-switch {
    width: 100%;
  }

  .view-button {
    flex: 1;
  }

  .save-status {
    font-size: 12px;
  }
}
</style>
