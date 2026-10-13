import '../css/app.css';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import App from './App.vue';
import ru from './locales/ru.json';
import en from './locales/en.json';
import type { BootConfig } from './shared/types';
import { usePromoWorkspaceStore } from './stores/usePromoWorkspaceStore';

const root = document.getElementById('app');

if (root) {
  const boot = JSON.parse(root.dataset.boot ?? '{}') as BootConfig;

  // На домене .ru по умолчанию зафиксирована локаль ru; выбор пользователя запоминается.
  let locale: 'ru' | 'en' = boot.locale === 'en' ? 'en' : 'ru';
  try {
    const saved = localStorage.getItem('microcrop.locale');
    if (saved === 'ru' || saved === 'en') locale = saved;
  } catch {
    // ignore
  }
  document.documentElement.lang = locale;

  const i18n = createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'ru',
    messages: { ru, en },
  });

  const pinia = createPinia();
  const app = createApp(App);
  app.use(pinia);
  app.use(i18n);

  usePromoWorkspaceStore(pinia).init(boot);

  app.mount(root);
}
