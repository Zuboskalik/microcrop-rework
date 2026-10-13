import type { ExportConfig } from '../../shared/types';

/**
 * Проверка подписанной сервером конфигурации экспорта (Ed25519, WebCrypto).
 * Формат: base64url(json) + "." + base64url(signature)
 */

export class ExportTokenError extends Error {
  constructor(
    public readonly code: 'license_invalid' | 'license_expired',
    message: string,
  ) {
    super(message);
  }
}

export async function verifyExportToken(
  token: string,
  publicKeyBase64: string,
  nowMs: number = Date.now(),
  subtle: SubtleCrypto = globalThis.crypto.subtle,
): Promise<ExportConfig> {
  const [payloadPart, signaturePart, ...rest] = token.split('.');
  if (!payloadPart || !signaturePart || rest.length > 0) {
    throw new ExportTokenError('license_invalid', 'Malformed export token');
  }

  let payloadBytes: Uint8Array;
  let signature: Uint8Array;
  let publicKey: Uint8Array;
  try {
    payloadBytes = base64ToBytes(payloadPart);
    signature = base64ToBytes(signaturePart);
    publicKey = base64ToBytes(publicKeyBase64);
  } catch {
    throw new ExportTokenError('license_invalid', 'Malformed export token encoding');
  }

  const key = await subtle.importKey('raw', publicKey, { name: 'Ed25519' }, false, ['verify']);
  const valid = await subtle.verify({ name: 'Ed25519' }, key, signature, payloadBytes);
  if (!valid) {
    throw new ExportTokenError('license_invalid', 'Export token signature mismatch');
  }

  let config: ExportConfig;
  try {
    config = JSON.parse(new TextDecoder().decode(payloadBytes)) as ExportConfig;
  } catch {
    throw new ExportTokenError('license_invalid', 'Export token payload is not JSON');
  }

  if (typeof config.exp !== 'number' || config.exp <= nowMs) {
    throw new ExportTokenError('license_expired', 'Export token expired');
  }

  return config;
}

/** Декодирует base64 и base64url (с паддингом или без). */
export function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
