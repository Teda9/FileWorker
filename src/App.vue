<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import useI18nStore from './store/i18n';

const route = useRoute();
const showNavigation = computed(() => route.path !== '/login');
const { locale, availableLocales } = useI18n();
const i18nStore = useI18nStore();
const browserLocale = navigator.language.slice(0, 2);
const initialLocale = availableLocales.includes(i18nStore.locale)
  ? i18nStore.locale
  : availableLocales.includes(browserLocale)
    ? browserLocale
    : 'en';
locale.value = initialLocale;
i18nStore.setLocale(initialLocale);

const selectedLocale = computed({
  get: () => locale.value,
  set: (value: string) => {
    if (!availableLocales.includes(value)) return;
    locale.value = value;
    i18nStore.setLocale(value);
  },
});
</script>

<template>
  <div class="app-shell">
    <header v-if="showNavigation" class="app-header">
      <router-link to="/" class="brand">FileWorker</router-link>
      <div class="header-tools">
        <nav class="main-nav" :aria-label="$t('nav.label')">
          <router-link to="/clip" class="nav-link">{{ $t('nav.clip') }}</router-link>
          <router-link to="/file" class="nav-link">{{ $t('nav.upload') }}</router-link>
          <router-link to="/filemanage" class="nav-link">{{ $t('nav.files') }}</router-link>
          <router-link to="/clipmanage" class="nav-link">{{ $t('nav.clipmanage') }}</router-link>
        </nav>
        <label class="locale-control">
          <span class="visually-hidden">{{ $t('index.language') }}</span>
          <select v-model="selectedLocale" :aria-label="$t('index.language')">
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </label>
      </div>
    </header>
    <main class="app-main" :class="{ 'login-main': !showNavigation }">
      <router-view v-slot="{ Component }">
        <component :is="Component" />
      </router-view>
    </main>
  </div>
</template>

<style>
:root {
  --ui-primary: #175cd3;
  --ui-primary-hover: #1849a9;
  --ui-text: #202938;
  --ui-muted: #667085;
  --ui-border: #d0d5dd;
  --ui-surface: #fff;
  --ui-danger: #b42318;
  --ui-danger-border: #fecdca;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--ui-text);
  background: #f4f6f8;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
}

* {
  box-sizing: border-box;
}

html,
body,
#app {
  min-width: 320px;
  min-height: 100%;
  margin: 0;
  background: #f4f6f8;
}

button,
input,
select {
  font: inherit;
}

.app-shell {
  min-height: 100vh;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  min-height: 64px;
  padding: 10px max(20px, calc((100vw - 960px) / 2));
  background: var(--ui-surface);
  border-bottom: 1px solid #e4e8ee;
}

.header-tools {
  display: flex;
  align-items: center;
  gap: 14px;
}

.brand {
  color: #172033;
  font-size: 18px;
  font-weight: 750;
  letter-spacing: -0.03em;
  text-decoration: none;
}

.main-nav {
  display: flex;
  align-items: center;
  gap: 6px;
}

.nav-link {
  padding: 8px 12px;
  color: #667085;
  font-size: 14px;
  text-decoration: none;
  border-radius: 8px;
  white-space: nowrap;
}

.nav-link:hover,
.nav-link.router-link-active {
  color: #175cd3;
  background: #eff6ff;
}

.locale-control select {
  min-height: 36px;
  padding: 6px 9px;
  color: var(--ui-muted);
  background: #fff;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  font-size: 13px;
}

.app-main {
  width: min(100% - 32px, 920px);
  margin: 0 auto;
  padding: 28px 0 48px;
}

.app-main.login-main {
  width: 100%;
  min-height: 100vh;
  padding: 0;
}

.page-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.ui-button {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 11px;
  color: var(--ui-muted);
  font-size: 13px;
  font-weight: 550;
  line-height: 1.2;
  text-decoration: none;
  white-space: nowrap;
  background: #fff;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
}

.ui-button:hover:not(:disabled) {
  background: #f9fafb;
  border-color: #bfc6d1;
}

.ui-button--primary {
  color: #fff;
  background: var(--ui-primary);
  border-color: var(--ui-primary);
}

.ui-button--primary:hover:not(:disabled) {
  color: #fff;
  background: var(--ui-primary-hover);
  border-color: var(--ui-primary-hover);
}

.ui-button--danger {
  color: var(--ui-danger);
  border-color: var(--ui-danger-border);
}

.ui-button--danger:hover:not(:disabled) {
  color: var(--ui-danger);
  background: #fef3f2;
  border-color: var(--ui-danger-border);
}

.ui-button:disabled {
  cursor: wait;
  opacity: 0.6;
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

:where(a, button, input, select):focus-visible {
  outline: 3px solid #84adff;
  outline-offset: 2px;
}

@media (max-width: 520px) {
  .app-header {
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    padding: 12px 16px;
  }

  .header-tools {
    width: 100%;
    gap: 8px;
  }

  .main-nav {
    flex: 1;
    justify-content: flex-start;
    flex-wrap: wrap;
    gap: 2px;
  }

  .nav-link {
    padding: 8px 7px;
    font-size: 13px;
  }

  .locale-control select {
    min-height: 34px;
    padding: 5px 7px;
  }

  .app-main {
    width: min(100% - 24px, 920px);
    padding-top: 20px;
  }

  .page-heading {
    flex-wrap: wrap;
  }
}
</style>
