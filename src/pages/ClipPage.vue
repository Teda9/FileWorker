<script setup lang="ts">
import { minimalSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers, highlightSpecialChars, drawSelection, dropCursor } from "@codemirror/view";
import { onMounted, onBeforeUnmount, ref } from "vue";
import useClipStore from "@/store/clip";
import { PutFile } from "@/api";
import { getRandomFilename } from "@/utils/utils";

const code = ref("");
const saveStatus = ref<'unsaved' | 'saving' | 'saved' | 'failed'>('unsaved');
const editorElement = ref<HTMLElement>();
const filename = ref(getRandomFilename());
const savedUrl = ref('');
let editor: EditorView | undefined;

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
      if (update.docChanged) {
        saveStatus.value = 'unsaved';
        savedUrl.value = '';
      }
    }),
  ]
});

onMounted(() => {
  editor = new EditorView({
    state: startState,
    parent: editorElement.value!,
  });
  editor.focus();
});

const clipStore = useClipStore();

const refreshRandomFileName = () => {
  filename.value = getRandomFilename();
  saveStatus.value = 'unsaved';
  savedUrl.value = '';
};

const onSaveBtnClick = async () => {
  if (saveStatus.value === 'saving') return;

  saveStatus.value = 'saving';
  try {
    await PutFile(filename.value, code.value, clipStore.visibility, "text");
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
    <div class="clip-heading">
      <div>
        <h1>{{ $t('page_title.clip') }}</h1>
        <p>{{ $t('index.clip_description') }}</p>
      </div>
      <a v-if="savedUrl" class="open-saved" :href="savedUrl" target="_blank" rel="noopener">
        {{ $t('clip.open_saved') }} ↗
      </a>
    </div>

    <div class="text-area">
      <div class="editor-header">
        <input
          v-model="filename"
          class="filename-input monospace"
          type="text"
          :placeholder="$t('common.filename')"
          :aria-label="$t('common.filename')"
          @input="saveStatus = 'unsaved'; savedUrl = ''"
        />
        <button class="filename-refresh" type="button" :aria-label="$t('clip.new_name')" @click="refreshRandomFileName">
          ↻
        </button>
        <span class="save-status" :class="`status-${saveStatus}`" role="status">
          {{ $t(`clip.status_${saveStatus}`) }}
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
        <button class="save-btn" type="button" :disabled="saveStatus === 'saving'" @click="onSaveBtnClick">
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
  display: flex;
  align-items: flex-end;
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

.clip-heading p {
  margin: 6px 0 0;
  color: #667085;
  font-size: 14px;
}

.open-saved {
  flex: 0 0 auto;
  color: #175cd3;
  font-size: 13px;
  text-decoration: none;
}

.open-saved:hover {
  text-decoration: underline;
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
  padding: 9px 17px;
  color: #fff;
  font-weight: 650;
  background: #175cd3;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
}

.save-btn:hover:not(:disabled) {
  background: #1849a9;
}

.save-btn:disabled {
  cursor: wait;
  opacity: 0.65;
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
