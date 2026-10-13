import { describe, expect, it } from 'vitest';
import { webcrypto } from 'node:crypto';
import { ExportTokenError, verifyExportToken } from '@/workers/algorithms/exportToken';

const subtle = webcrypto.subtle as unknown as SubtleCrypto;

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function makeKeys() {
  const pair = (await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const raw = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
  return { pair, publicKey: Buffer.from(raw).toString('base64') };
}

async function sign(privateKey: CryptoKey, payload: object): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(payload));
  const sig = new Uint8Array(await subtle.sign({ name: 'Ed25519' }, privateKey, json));
  return `${b64url(json)}.${b64url(sig)}`;
}

const now = 1_700_000_000_000;
const payload = { v: 1, sub: 1, watermark: false, batchZip: true, iat: now, exp: now + 60_000 };

describe('verifyExportToken (Ed25519)', () => {
  it('accepts a valid server signature', async () => {
    const { pair, publicKey } = await makeKeys();
    const token = await sign(pair.privateKey, payload);
    await expect(verifyExportToken(token, publicKey, now, subtle)).resolves.toMatchObject({ batchZip: true, watermark: false });
  });

  it('rejects a tampered payload', async () => {
    const { pair, publicKey } = await makeKeys();
    const token = await sign(pair.privateKey, payload);
    const forged = b64url(new TextEncoder().encode(JSON.stringify({ ...payload, exp: now + 10 ** 12 })));
    const tampered = `${forged}.${token.split('.')[1]}`;
    await expect(verifyExportToken(tampered, publicKey, now, subtle)).rejects.toMatchObject({ code: 'license_invalid' });
  });

  it('rejects a token signed by another key', async () => {
    const a = await makeKeys();
    const b = await makeKeys();
    const token = await sign(a.pair.privateKey, payload);
    await expect(verifyExportToken(token, b.publicKey, now, subtle)).rejects.toBeInstanceOf(ExportTokenError);
  });

  it('rejects an expired token', async () => {
    const { pair, publicKey } = await makeKeys();
    const token = await sign(pair.privateKey, payload);
    await expect(verifyExportToken(token, publicKey, now + 120_000, subtle)).rejects.toMatchObject({ code: 'license_expired' });
  });

  it('rejects malformed tokens', async () => {
    const { publicKey } = await makeKeys();
    await expect(verifyExportToken('garbage', publicKey, now, subtle)).rejects.toMatchObject({ code: 'license_invalid' });
  });
});
