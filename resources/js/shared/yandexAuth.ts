import type { BootConfig } from './types';

const STATE_KEY = 'microcrop.yandex_state';
export const YANDEX_CALLBACK_PATH = '/auth/yandex/callback';

/**
 * Редирект на OAuth Яндекс ID (authorization code flow). state защищает от CSRF.
 */
export function startYandexLogin(boot: BootConfig): void {
  if (!boot.yandexClientId || !boot.yandexRedirectUri) return;

  const state = crypto.randomUUID();
  try {
    sessionStorage.setItem(STATE_KEY, JSON.stringify({ state, returnTo: window.location.pathname }));
  } catch {
    // без sessionStorage проверка state невозможна — вход все равно завершится ошибкой
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: boot.yandexClientId,
    redirect_uri: boot.yandexRedirectUri,
    state,
  });
  window.location.assign(`https://oauth.yandex.ru/authorize?${params.toString()}`);
}

/**
 * Если текущая страница — callback Яндекс ID, возвращает code (после проверки state) и очищает URL.
 */
export function consumeYandexCallback(): { code: string; returnTo: string } | null {
  if (window.location.pathname !== YANDEX_CALLBACK_PATH) return null;

  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');

  let saved: { state: string; returnTo: string } | null = null;
  try {
    saved = JSON.parse(sessionStorage.getItem(STATE_KEY) ?? 'null');
    sessionStorage.removeItem(STATE_KEY);
  } catch {
    saved = null;
  }

  const returnTo = saved?.returnTo && saved.returnTo !== YANDEX_CALLBACK_PATH ? saved.returnTo : '/';
  window.history.replaceState(null, '', returnTo);

  if (!code || !saved || saved.state !== state) return null;
  return { code, returnTo };
}
