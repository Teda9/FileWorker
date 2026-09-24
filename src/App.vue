<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const showNavigation = computed(() => route.path !== '/login');
</script>

<template>
  <div class="app-shell">
    <header v-if="showNavigation" class="app-header">
      <router-link to="/" class="brand">FileWorker</router-link>
      <nav class="main-nav" :aria-label="$t('nav.label')">
        <router-link to="/clip" class="nav-link">{{ $t('nav.clip') }}</router-link>
        <router-link to="/file" class="nav-link">{{ $t('nav.upload') }}</router-link>
        <router-link to="/filemanage" class="nav-link">{{ $t('nav.files') }}</router-link>
      </nav>
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
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #202938;
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
  background: #fff;
  border-bottom: 1px solid #e4e8ee;
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

@media (max-width: 520px) {
  .app-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
    padding: 12px 16px;
  }

  .main-nav {
    width: 100%;
    justify-content: space-between;
    gap: 2px;
  }

  .nav-link {
    padding: 8px 9px;
  }

  .app-main {
    width: min(100% - 24px, 920px);
    padding-top: 20px;
  }
}
</style>
