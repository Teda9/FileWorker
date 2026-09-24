<script setup lang="ts">
import { useI18n } from "vue-i18n";
import useI18nStore from "../store/i18n";

const i18nStore = useI18nStore();
const { locale } = useI18n();

if (i18nStore.locale !== "") {
  locale.value = i18nStore.locale;
}

const updateLocale = (newLocale: string) => {
  i18nStore.setLocale(newLocale);
};
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
        <span class="action-icon" aria-hidden="true">✎</span>
        <span class="action-copy">
          <strong>{{ $t("index.clip_channel_title") }}</strong>
          <span>{{ $t("index.clip_description") }}</span>
        </span>
        <span class="action-arrow" aria-hidden="true">↗</span>
      </router-link>

      <router-link to="/file" class="action-card upload-card">
        <span class="action-icon" aria-hidden="true">↑</span>
        <span class="action-copy">
          <strong>{{ $t("index.file_channel_title") }}</strong>
          <span>{{ $t("index.file_description") }}</span>
        </span>
        <span class="action-arrow" aria-hidden="true">↗</span>
      </router-link>
    </div>

    <div class="home-footer">
      <router-link to="/filemanage" class="manage-link">{{ $t("index.manage_link") }}</router-link>
      <label class="locale-control">
        <span>{{ $t("index.language") }}</span>
        <select v-model="$i18n.locale" @change="updateLocale($i18n.locale)">
          <option v-for="availableLocale in $i18n.availableLocales" :key="availableLocale" :value="availableLocale">
            {{ availableLocale }}
          </option>
        </select>
      </label>
    </div>
  </section>
</template>

<style scoped>
.home-page {
  max-width: 700px;
  margin: 42px auto 0;
}

.home-heading {
  margin-bottom: 28px;
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
  gap: 14px;
}

.action-card {
  display: flex;
  min-height: 150px;
  align-items: flex-start;
  gap: 14px;
  padding: 22px;
  color: #172033;
  text-decoration: none;
  background: #fff;
  border: 1px solid #e4e8ee;
  border-radius: 16px;
  box-shadow: 0 4px 18px #3440540a;
  transition: border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease;
}

.action-card:hover {
  transform: translateY(-2px);
  border-color: #b2ccff;
  box-shadow: 0 10px 24px #34405414;
}

.action-icon {
  display: grid;
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  place-items: center;
  color: #175cd3;
  font-size: 24px;
  font-weight: 700;
  background: #eff6ff;
  border-radius: 12px;
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

.action-arrow {
  color: #98a2b3;
  font-size: 19px;
}

.home-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 22px;
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

.locale-control {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #667085;
  font-size: 13px;
}

.locale-control select {
  padding: 5px 8px;
  color: #344054;
  background: #fff;
  border: 1px solid #d0d5dd;
  border-radius: 7px;
}

@media (max-width: 560px) {
  .home-page {
    margin-top: 18px;
  }

  .quick-actions {
    grid-template-columns: 1fr;
  }

  .action-card {
    min-height: 128px;
    padding: 18px;
  }
}
</style>
