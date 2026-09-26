<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ListRecentItems, type RecentItem } from '@/api/recent';
import { formatBytes } from '@/utils/utils';

const recentItems = ref<RecentItem[]>([]);
const recentIncomplete = ref(false);
const displayName = (key: string) => {
  if (key.startsWith('files/') || key.startsWith('clips/')) return key.slice(key.indexOf('/') + 1);
  try { return decodeURIComponent(key); } catch { return key; }
};
const itemHref = (key: string) => `/${encodeURIComponent(displayName(key))}`;
onMounted(async () => {
  try {
    const recent = await ListRecentItems();
    recentItems.value = recent.items;
    recentIncomplete.value = recent.incomplete;
  } catch { recentItems.value = []; }
});
</script>

<template>
  <section class="home-page">
    <div class="home-heading">
      <p class="eyebrow">{{ $t("index.eyebrow") }}</p>
      <h1>{{ $t("index.title") }}</h1>
      <p class="home-description">{{ $t("index.description") }}</p>
    </div>

    <div class="quick-actions">
      <router-link to="/clip" class="action-card clipboard-card">
        <span class="action-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="5" y="4" width="14" height="17" rx="2" />
            <path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 14h7M8.5 18h4" />
          </svg>
        </span>
        <span class="action-copy">
          <strong>{{ $t("index.clip_channel_title") }}</strong>
          <span>{{ $t("index.clip_description") }}</span>
        </span>
        <span class="action-arrow" aria-hidden="true">↗</span>
      </router-link>

      <router-link to="/file" class="action-card upload-card">
        <span class="action-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 15V4m0 0L7 9m5-5 5 5M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" />
          </svg>
        </span>
        <span class="action-copy">
          <strong>{{ $t("index.file_channel_title") }}</strong>
          <span>{{ $t("index.file_description") }}</span>
        </span>
        <span class="action-arrow" aria-hidden="true">↗</span>
      </router-link>
    </div>

    <div class="home-footer">
      <router-link to="/filemanage" class="manage-link">{{ $t("index.manage_link") }}</router-link>
    </div>

    <section v-if="recentItems.length || recentIncomplete" class="recent-section">
      <h2>{{ $t('index.recent_title') }}</h2>
      <p v-if="recentIncomplete" class="recent-warning" role="status">{{ $t('index.recent_incomplete') }}</p>
      <ul class="recent-list">
        <li v-for="item in recentItems" :key="item.Key">
          <a :href="itemHref(item.Key)">{{ displayName(item.Key) }}</a>
          <span>{{ formatBytes(item.Size) }}</span>
        </li>
      </ul>
    </section>
  </section>
</template>

<style scoped>
.home-page {
  max-width: 760px;
  margin: 12px auto 0;
}

.home-heading {
  margin-bottom: 24px;
}

.eyebrow {
  margin: 0 0 8px;
  color: #667085;
  font-size: 13px;
  letter-spacing: 0.04em;
}

h1 {
  margin: 0;
  color: #172033;
  font-size: 28px;
  font-size: clamp(28px, 5vw, 38px);
  letter-spacing: -0.04em;
}

.home-description {
  max-width: 540px;
  margin: 10px 0 0;
  color: #667085;
  font-size: 15px;
  line-height: 1.7;
}

.quick-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.action-card {
  display: flex;
  min-height: 136px;
  align-items: center;
  gap: 15px;
  padding: 20px;
  color: #172033;
  text-decoration: none;
  background: #fff;
  border: 1px solid #e4e8ee;
  border-radius: 14px;
  box-shadow: 0 4px 18px #3440540a;
  transition: border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease;
}

.action-card:hover {
  transform: translateY(-2px);
  border-color: #b2ccff;
  box-shadow: 0 10px 24px #34405414;
}

.action-card:focus {
  outline: 2px solid #84adff;
  outline-offset: 3px;
}

.action-card:focus-visible {
  outline: 3px solid #84adff;
  outline-offset: 3px;
}

.clipboard-card {
  color: #fff;
  background: #175cd3;
  border-color: #175cd3;
}

.clipboard-card:hover {
  background: #1849a9;
  border-color: #1849a9;
}

.action-icon {
  display: grid;
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  place-items: center;
  color: #175cd3;
  font-size: 24px;
  background: #eff6ff;
  border-radius: 12px;
}

.action-icon svg {
  width: 23px;
  height: 23px;
}

.clipboard-card .action-icon {
  color: #fff;
  background: #ffffff24;
}

.action-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 7px;
  padding-top: 2px;
}

.action-copy strong {
  font-size: 17px;
}

.action-copy span {
  color: #667085;
  font-size: 14px;
  line-height: 1.5;
}

.clipboard-card .action-copy span {
  color: #dbeafe;
}

.action-arrow {
  color: #98a2b3;
  font-size: 19px;
}

.clipboard-card .action-arrow {
  color: #bfdbfe;
}

.home-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-top: 18px;
}

.recent-section {
  margin-top: 30px;
}

.recent-section h2 {
  margin: 0 0 10px;
  color: #344054;
  font-size: 16px;
}

.recent-list {
  margin: 0;
  padding: 0;
  overflow: hidden;
  list-style: none;
  background: #fff;
  border: 1px solid #e4e8ee;
  border-radius: 12px;
}

.recent-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 14px;
  border-bottom: 1px solid #eaecf0;
}

.recent-list li:last-child {
  border-bottom: 0;
}

.recent-list a {
  overflow: hidden;
  color: #175cd3;
  text-overflow: ellipsis;
  text-decoration: none;
  white-space: nowrap;
}

.recent-list span {
  flex: 0 0 auto;
  color: #667085;
  font-size: 12px;
}

.recent-warning {
  margin: 0 0 12px;
  color: #667085;
  font-size: 13px;
  line-height: 1.5;
}

.manage-link {
  color: #475467;
  font-size: 14px;
  text-decoration: none;
}

.manage-link:hover {
  color: #175cd3;
  text-decoration: underline;
}

@media (max-width: 560px) {
  .home-page {
    margin-top: 4px;
  }

  .quick-actions {
    grid-template-columns: 1fr;
  }

  .action-card {
    min-height: 116px;
    padding: 17px;
  }
}
</style>
