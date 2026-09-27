import type { AudioSource, AudioSourceKind } from '../shared/types';

const CAPTURED = new Set<AudioSourceKind>(['microphone', 'desktop']);

export function capturableAudio(sources: AudioSource[], platform: NodeJS.Platform): AudioSource[] {
  return sources.filter(source => source.enabled && source.device && CAPTURED.has(source.kind) && (source.kind !== 'desktop' || platform === 'win32' || platform === 'linux'));
}

export function audioInputArgs(source: AudioSource, platform: NodeJS.Platform): string[] {
  if (source.kind === 'desktop') {
    if (platform === 'win32') return ['-f', 'wasapi', '-loopback', '1', '-i', source.device];
    return ['-f', 'pulse', '-i', source.device];
  }
  if (platform === 'win32') return ['-f', 'dshow', '-i', `audio=${source.device}`];
  if (platform === 'darwin') return ['-f', 'avfoundation', '-i', `none:${source.device}`];
  return ['-f', 'pulse', '-i', source.device];
}

export interface AudioGraph { args: string[]; graph: string; output: string | null; }

/** Meter branch is post-volume and pre-mute. Filters on the source are not applied. */
export function audioGraph(sources: AudioSource[], startIndex: number, sampleRate: number, platform: NodeJS.Platform): AudioGraph {
  const active = capturableAudio(sources, platform);
  const args: string[] = [];
  const filters: string[] = [];
  const mixPads: string[] = [];
  const windowSamples = Math.max(1, Math.round(sampleRate / 10));
  active.forEach((source, i) => {
    args.push(...audioInputArgs(source, platform));
    const index = startIndex + i;
    const mix = `mix${i}`;
    const meter = `meter${i}`;
    filters.push(`[${index}:a]aformat=sample_fmts=fltp:sample_rates=${sampleRate}:channel_layouts=stereo,volume=${source.volume.toFixed(3)},asplit=2[${mix}][${meter}]`);
    filters.push(`[${meter}]asetnsamples=n=${windowSamples}:p=1,astats=metadata=1:reset=1,ametadata=mode=add:key=lc.src:value=${source.id},ametadata=mode=print:key=lc.src:file=pipe\\:2:direct=1,ametadata=mode=print:key=lavfi.astats.Overall.RMS_level:file=pipe\\:2:direct=1,ametadata=mode=print:key=lavfi.astats.Overall.Peak_level:file=pipe\\:2:direct=1,anullsink`);
    const heard = source.muted ? `heard${i}` : mix;
    if (source.muted) filters.push(`[${mix}]volume=0[${heard}]`);
    mixPads.push(`[${heard}]`);
  });
  if (!mixPads.length) return { args, graph: '', output: null };
  if (mixPads.length === 1) return { args, graph: filters.join(';'), output: mixPads[0]!.slice(1, -1) };
  filters.push(`${mixPads.join('')}amix=inputs=${mixPads.length}:duration=longest:dropout_transition=0:normalize=0[aout]`);
  return { args, graph: filters.join(';'), output: 'aout' };
}
