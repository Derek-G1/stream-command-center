import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(file, 'utf8')) as T; } catch { return fallback; }
}

export async function writeJson(file: string, data: unknown) {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2) + '\n');
  try { await rename(tmp, file); }
  catch { await writeFile(file, JSON.stringify(data, null, 2) + '\n'); await rm(tmp, { force: true }); }
}
