import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { packZip } from '@/workers/algorithms/zipPacker';

describe('packZip (fflate)', () => {
  it('packs files that can be unpacked back byte-for-byte', () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([9, 8, 7]);
    const zip = packZip([
      { name: 'yandex_icon_512x512.png', data: a },
      { name: 'tg_bot_promo_640x360.jpg', data: b },
    ]);
    const files = unzipSync(zip);
    expect(Object.keys(files).sort()).toEqual(['tg_bot_promo_640x360.jpg', 'yandex_icon_512x512.png']);
    expect(Array.from(files['yandex_icon_512x512.png']!)).toEqual([1, 2, 3, 4]);
    expect(Array.from(files['tg_bot_promo_640x360.jpg']!)).toEqual([9, 8, 7]);
  });

  it('deduplicates file names', () => {
    const zip = packZip([
      { name: 'a.png', data: new Uint8Array([1]) },
      { name: 'a.png', data: new Uint8Array([2]) },
    ]);
    expect(Object.keys(unzipSync(zip)).sort()).toEqual(['a.png', 'a_2.png']);
  });
});
