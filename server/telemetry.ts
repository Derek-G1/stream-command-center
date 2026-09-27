import type { AudioLevel, RuntimeStats } from '../shared/types';

export interface LineCarry { buf: string; sourceId: string | null; }

export const lineCarry = (): LineCarry => ({ buf: '', sourceId: null });

export interface ProgressUpdate { changed: boolean; sawFrame: boolean; }

const finite = (value: string) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

/** Parse FFmpeg `-progress` key=value blocks. `drop_frames` is applied only when FFmpeg sends the key. */
export function consumeProgress(stats: RuntimeStats, chunk: string, carry: LineCarry): ProgressUpdate {
  carry.buf += chunk;
  const lines = carry.buf.split(/\r?\n/);
  carry.buf = lines.pop() ?? '';
  let changed = false;
  let sawFrame = false;
  for (const line of lines) {
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (key === 'frame') {
      if (finite(value) !== undefined) sawFrame = true;
    } else if (key === 'fps') {
      const n = finite(value);
      if (n !== undefined) { stats.fps = n; changed = true; }
    } else if (key === 'bitrate') {
      const n = finite(/^([\d.]+)/.exec(value)?.[1] ?? '');
      if (n !== undefined) { stats.bitrateKbps = n; changed = true; }
    } else if (key === 'speed') {
      const n = finite(/^([\d.]+)/.exec(value)?.[1] ?? '');
      if (n !== undefined) { stats.speed = n; changed = true; }
    } else if (key === 'drop_frames') {
      const n = finite(value);
      if (n !== undefined) { stats.droppedFrames = n; changed = true; }
    }
  }
  return { changed, sawFrame };
}

const parseDb = (value: string): number | null | undefined => {
  if (/^-?inf$/i.test(value) || /nan/i.test(value)) return null;
  return finite(value);
};

/**
 * Parse `ametadata=print` lines for per-source RMS and peak.
 * A level object is created only after a measurement for that source arrives.
 */
export function consumeAudioMeters(levels: Record<string, AudioLevel>, chunk: string, carry: LineCarry): boolean {
  carry.buf += chunk;
  const lines = carry.buf.split(/\r?\n/);
  carry.buf = lines.pop() ?? '';
  let changed = false;
  for (const raw of lines) {
    const line = raw.trim();
    const src = /^lc\.src=(.+)$/.exec(line);
    if (src?.[1]) { carry.sourceId = src[1]; continue; }
    const rms = /^lavfi\.astats\.Overall\.RMS_level=(.+)$/.exec(line);
    const peak = /^lavfi\.astats\.Overall\.Peak_level=(.+)$/.exec(line);
    if (!carry.sourceId || (!rms && !peak)) continue;
    const current = levels[carry.sourceId] ?? { rmsDb: null, peakDb: null };
    let touched = false;
    if (rms) {
      const db = parseDb(rms[1] ?? '');
      if (db !== undefined) { current.rmsDb = db; touched = true; }
    }
    if (peak) {
      const db = parseDb(peak[1] ?? '');
      if (db !== undefined) { current.peakDb = db; touched = true; }
    }
    if (touched) { levels[carry.sourceId] = current; changed = true; }
  }
  return changed;
}
