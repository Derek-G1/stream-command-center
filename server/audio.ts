import { clampGainDb, isGainFilter } from '../shared/audio';
import type { AudioSource, AudioSourceKind } from '../shared/types';

const CAPTURED = new Set<AudioSourceKind>(['microphone', 'desktop']);

export interface AudioDeviceProbe {
  audioDevices: string[];
  desktopAudioAvailable: boolean;
  desktopAudioDevices: string[];
}

export interface AudioCapturePlan { sources: AudioSource[]; notices: string[]; }

export function capturableAudio(sources: AudioSource[], platform: NodeJS.Platform): AudioSource[] {
  return sources.filter(source => source.enabled && source.device && CAPTURED.has(source.kind) && (source.kind !== 'desktop' || platform === 'win32' || platform === 'linux'));
}

/**
 * Drop optional sources the running backend cannot open, without forgetting the saved device.
 * An empty device list means enumeration did not answer, so typed device strings are left for FFmpeg.
 */
export function planAudioCapture(sources: AudioSource[], platform: NodeJS.Platform, probe: AudioDeviceProbe): AudioCapturePlan {
  const notices: string[] = [];
  const planned = sources.map(source => {
    if (!source.enabled) return source;
    if (source.kind === 'application' || source.kind === 'media') {
      notices.push(`${source.name} is ${source.kind} audio, which this build does not capture. The rest of the broadcast continues without it.`);
      return source;
    }
    if (source.kind === 'desktop' && platform !== 'win32' && platform !== 'linux') {
      notices.push(`${source.name} desktop audio is not available on this platform. The saved device is unchanged.`);
      return { ...source, enabled: false };
    }
    if (source.kind === 'desktop' && platform === 'win32' && !probe.desktopAudioAvailable) {
      notices.push(`Desktop audio for "${source.name}" is unavailable because this FFmpeg build has no WASAPI loopback. The saved device is unchanged, and the rest of the broadcast continues without it.`);
      return { ...source, enabled: false };
    }
    if (!CAPTURED.has(source.kind)) return source;
    if (!source.device) {
      notices.push(`${source.name} has no device selected, so it was not captured.`);
      return source;
    }
    const known = source.kind === 'desktop' ? probe.desktopAudioDevices : probe.audioDevices;
    if (known.length > 0 && !known.includes(source.device)) {
      notices.push(`Saved ${source.kind} "${source.device}" is not connected. Reconnect it or choose another device. The saved name is kept, and the rest of the broadcast continues without this source.`);
      return { ...source, enabled: false };
    }
    return source;
  });
  return { sources: planned, notices };
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

/**
 * Per source: format, enabled Gain, future pre-fader filters, volume, mute, then a post-fader meter.
 * The meter branch is what the mixer receives, including mute. N/A in the UI means this branch has not reported yet.
 * FFmpeg 9 accepts `file=pipe:2` only when the colon is escaped twice in the filtergraph text.
 */
export function audioGraph(sources: AudioSource[], startIndex: number, sampleRate: number, platform: NodeJS.Platform): AudioGraph {
  const active = capturableAudio(sources, platform);
  const args: string[] = [];
  const filters: string[] = [];
  const mixPads: string[] = [];
  const windowSamples = Math.max(1, Math.round(sampleRate / 10));
  const meterFile = 'pipe\\\\:2';
  active.forEach((source, i) => {
    args.push(...audioInputArgs(source, platform));
    const index = startIndex + i;
    const mix = `mix${i}`;
    const meter = `meter${i}`;
    const steps = [`aformat=sample_fmts=fltp:sample_rates=${sampleRate}:channel_layouts=stereo`];
    const gain = source.filters.find(isGainFilter);
    if (gain?.enabled) steps.push(`volume=${clampGainDb(gain.gainDb).toFixed(1)}dB`);
    // Noise suppression, gate, compressor, and limiter belong here, still before the fader.
    steps.push(`volume=${source.volume.toFixed(3)}`);
    if (source.muted) steps.push('volume=0');
    filters.push(`[${index}:a]${steps.join(',')},asplit=2[${mix}][${meter}]`);
    filters.push(`[${meter}]asetnsamples=n=${windowSamples}:p=1,astats=metadata=1:reset=1,ametadata=mode=add:key=lc.src:value=${source.id},ametadata=mode=print:key=lc.src:file=${meterFile}:direct=1,ametadata=mode=print:key=lavfi.astats.Overall.RMS_level:file=${meterFile}:direct=1,ametadata=mode=print:key=lavfi.astats.Overall.Peak_level:file=${meterFile}:direct=1,anullsink`);
    mixPads.push(`[${mix}]`);
  });
  if (!mixPads.length) return { args, graph: '', output: null };
  if (mixPads.length === 1) return { args, graph: filters.join(';'), output: mixPads[0]!.slice(1, -1) };
  filters.push(`${mixPads.join('')}amix=inputs=${mixPads.length}:duration=longest:dropout_transition=0:normalize=0[aout]`);
  return { args, graph: filters.join(';'), output: 'aout' };
}
