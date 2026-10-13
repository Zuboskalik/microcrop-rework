import type {
  BillingPlan,
  CreateSbpResponse,
  ExportConfig,
  LicenseStatus,
  PaymentStatusResponse,
  PlanId,
  TelegramAuthData,
} from './types';

/**
 * Тонкий клиент Laravel API. Изображения сюда НИКОГДА не передаются — только авторизация и лицензия.
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const TOKEN_KEY = 'microcrop.token';

export function loadToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // приватный режим — токен живет только в памяти
  }
}

async function request<T>(method: string, url: string, token: string | null, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = (await response.json().catch(() => ({}))) as { message?: string };
  if (!response.ok) {
    throw new ApiError(response.status, data.message ?? response.statusText);
  }
  return data as T;
}

interface AuthResponse {
  token: string;
  user: LicenseStatus;
}

export const api = {
  authTelegram: (data: TelegramAuthData) => request<AuthResponse>('POST', '/api/auth/telegram', null, data),
  authYandex: (code: string) => request<AuthResponse>('POST', '/api/auth/yandex', null, { code }),
  authDev: (username: string) => request<AuthResponse>('POST', '/api/auth/dev', null, { username }),
  logout: (token: string) => request<{ ok: boolean }>('POST', '/api/auth/logout', token),

  licenseStatus: (token: string) => request<LicenseStatus>('GET', '/api/license/status', token),
  exportConfig: (token: string) => request<{ token: string; config: ExportConfig }>('GET', '/api/license/export-config', token),

  plans: () => request<{ plans: BillingPlan[] }>('GET', '/api/billing/plans', null),
  createSbp: (token: string, planId: PlanId) => request<CreateSbpResponse>('POST', '/api/billing/create-sbp', token, { plan_id: planId }),
  paymentStatus: (token: string, paymentId: string) =>
    request<PaymentStatusResponse>('GET', `/api/billing/payments/${encodeURIComponent(paymentId)}`, token),
};
