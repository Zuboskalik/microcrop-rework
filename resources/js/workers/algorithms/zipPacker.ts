import { zipSync, type Zippable } from 'fflate';

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/**
 * Сборка .zip в памяти через fflate.
 * PNG/WebP/JPG уже сжаты, поэтому файлы кладутся в режиме store (level 0) — это мгновенно.
 */
export function packZip(entries: ZipEntry[]): Uint8Array {
  const files: Zippable = {};
  const used = new Set<string>();

  for (const entry of entries) {
    const name = uniqueName(entry.name, used);
    files[name] = [entry.data, { level: 0 }];
  }

  return zipSync(files);
}

function uniqueName(name: string, used: Set<string>): string {
  let candidate = name;
  let i = 2;
  while (used.has(candidate)) {
    const dot = name.lastIndexOf('.');
    candidate = dot > 0 ? `${name.slice(0, dot)}_${i}${name.slice(dot)}` : `${name}_${i}`;
    i++;
  }
  used.add(candidate);
  return candidate;
}
