import type { AudioFilter, GainAudioFilter } from './types';

/** Unity is 0 dB. Values outside this range are clamped before they reach FFmpeg. */
export const GAIN_DB_MIN = -30;
export const GAIN_DB_MAX = 30;

export function isGainFilter(filter: AudioFilter): filter is GainAudioFilter {
  return filter.type === 'gain' && 'gainDb' in filter;
}

/** One decimal place, then clamped again so rounding cannot leave the safe range. */
export function clampGainDb(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  const bounded = Math.min(GAIN_DB_MAX, Math.max(GAIN_DB_MIN, value));
  const rounded = Math.sign(bounded) * Math.round(Math.abs(bounded) * 10) / 10;
  return Math.min(GAIN_DB_MAX, Math.max(GAIN_DB_MIN, rounded));
}
