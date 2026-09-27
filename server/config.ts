import { DEFAULT_CONFIG } from '../shared/defaults';
import type { AudioFilter, AudioSource, AudioSourceKind, BroadcastConfig, Destination, Scene, SceneSource } from '../shared/types';
import { readJson, writeJson } from './files';

const clamp = (v: unknown, min: number, max: number, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : fallback;
const float = (v: unknown, min: number, max: number, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
const text = (v: unknown, fallback = '', max = 2048) => typeof v === 'string' ? v.slice(0, max) : fallback;
const bool = (v: unknown, fallback: boolean) => typeof v === 'boolean' ? v : fallback;
const hex = (v: unknown, fallback: string) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback;
const id = (v: unknown, fallback: string) => typeof v === 'string' && /^[\w-]{1,64}$/.test(v) ? v : fallback;

function rtmpUrl(v: unknown): string {
  if (typeof v !== 'string') return '';
  const value = v.trim().slice(0, 2048);
  if (!value) return '';
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'rtmp:' || parsed.protocol === 'rtmps:' ? value : '';
  } catch {
    return '';
  }
}

function normalizeSource(raw: unknown, i: number): SceneSource | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (!['camera','image','text'].includes(String(value.kind))) return null;
  const kind = value.kind as SceneSource['kind'];
  const common = { id: id(value.id, `source-${i}`), name: text(value.name, `Source ${i+1}`, 80), kind, enabled: bool(value.enabled, true), x: clamp(value.x, -7680, 7680, 0), y: clamp(value.y, -4320, 4320, 0), width: clamp(value.width, 16, 7680, 640), height: clamp(value.height, 16, 4320, 360), opacity: float(value.opacity, 0, 1, 1) };
  if (kind === 'camera') return { ...common, kind: 'camera', device: text(value.device, '', 512) };
  if (kind === 'image') return { ...common, kind: 'image', path: text(value.path, '', 2048) };
  return { ...common, kind: 'text', text: text(value.text, 'Text', 500), fontSize: clamp(value.fontSize, 8, 300, 48), color: hex(value.color, '#ffffff') };
}

const AUDIO_KINDS = new Set<AudioSourceKind>(['microphone', 'desktop', 'application', 'media']);

function normalizeFilters(value: unknown): AudioFilter[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const filters: AudioFilter[] = [];
  for (const raw of value.slice(0, 8)) {
    if (!raw || typeof raw !== 'object') continue;
    const filter = raw as Record<string, unknown>;
    const type = text(filter.type, '', 32).replace(/[^\w-]/g, '');
    if (!type) continue;
    let filterId = id(filter.id, `filter-${filters.length}`);
    while (seen.has(filterId)) filterId = id(`${filterId}-${filters.length}`, `filter-${filters.length}`);
    seen.add(filterId);
    filters.push({ id: filterId, type, enabled: bool(filter.enabled, false) });
  }
  return filters;
}

function normalizeAudioSource(raw: unknown, i: number, seen: Set<string>): AudioSource | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const kind = String(value.kind);
  if (!AUDIO_KINDS.has(kind as AudioSourceKind)) return null;
  let sourceId = id(value.id, `audio-${i}`);
  while (seen.has(sourceId)) sourceId = id(`${sourceId}-${i}`, `audio-${i}`);
  seen.add(sourceId);
  return {
    id: sourceId,
    name: text(value.name, kind === 'desktop' ? 'Desktop' : 'Microphone', 80),
    kind: kind as AudioSourceKind,
    enabled: bool(value.enabled, true),
    muted: bool(value.muted, false),
    volume: float(value.volume, 0, 2, 1),
    device: text(value.device, '', 512).replace(/[\r\n\0]/g, ''),
    filters: normalizeFilters(value.filters),
  };
}

function normalizeAudioSources(audio: Record<string, unknown>, fallback: AudioSource[]): AudioSource[] {
  if (Array.isArray(audio.sources)) {
    const seen = new Set<string>();
    return audio.sources.slice(0, 8).map((source, i) => normalizeAudioSource(source, i, seen)).filter((source): source is AudioSource => source !== null);
  }
  if ('device' in audio || 'enabled' in audio || 'volume' in audio) {
    return [{
      id: 'audio-legacy',
      name: 'Microphone',
      kind: 'microphone',
      enabled: bool(audio.enabled, true),
      muted: false,
      volume: float(audio.volume, 0, 2, 1),
      device: text(audio.device, '', 512).replace(/[\r\n\0]/g, ''),
      filters: [],
    }];
  }
  return fallback;
}

function normalizeScenes(value: unknown, fallback: Scene[]): Scene[] {
  if (!Array.isArray(value)) return fallback;
  const scenes = value.slice(0, 24).map((raw: unknown, i): Scene => {
    const s = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const rawSources: unknown[] = Array.isArray(s.sources) ? s.sources : [];
    const sources = rawSources.slice(0, 32).map((source, sourceIndex) => normalizeSource(source, sourceIndex)).filter((source): source is SceneSource => source !== null);
    return { id: id(s.id, `scene-${i}`), name: text(s.name, `Scene ${i+1}`, 80), sources };
  });
  return scenes.length ? scenes : fallback;
}

export function normalize(input: unknown, base = DEFAULT_CONFIG): BroadcastConfig {
  const x = (input && typeof input === 'object' ? input : {}) as Partial<BroadcastConfig>;
  const video = x.video ?? base.video;
  const audio = x.audio ?? base.audio;
  const capture = x.capture ?? base.capture;
  const recording = x.recording ?? base.recording;
  const ui = x.ui ?? base.ui;
  const scenes = normalizeScenes(x.scenes, base.scenes);
  const activeSceneId = scenes.some(s => s.id === x.activeSceneId) ? x.activeSceneId! : scenes[0]!.id;
  const destinations: Destination[] = Array.isArray(x.destinations) ? x.destinations.slice(0, 12).map((d: Destination, i) => ({
    id: id(d?.id, `dest-${i}`),
    name: text(d?.name, `Destination ${i + 1}`, 64),
    platform: ['twitch','youtube','kick','facebook','custom'].includes(d?.platform) ? d.platform : 'custom',
    enabled: bool(d?.enabled, true),
    url: rtmpUrl(d?.url),
    streamKey: text(d?.streamKey, '', 2048).replace(/[\r\n\0]/g, ''),
  })) : base.destinations;
  return {
    video: {
      width: clamp(video.width, 320, 7680, base.video.width),
      height: clamp(video.height, 240, 4320, base.video.height),
      fps: clamp(video.fps, 1, 240, base.video.fps),
      bitrateKbps: clamp(video.bitrateKbps, 250, 100000, base.video.bitrateKbps),
      keyframeSeconds: clamp(video.keyframeSeconds, 1, 10, base.video.keyframeSeconds),
      encoder: ['nvenc','qsv','amf','software'].includes(video.encoder) ? video.encoder : base.video.encoder,
      preset: ['performance','balanced','quality'].includes(video.preset) ? video.preset : base.video.preset,
    },
    audio: {
      bitrateKbps: clamp(audio.bitrateKbps, 64, 512, base.audio.bitrateKbps),
      sampleRate: audio.sampleRate === 44100 ? 44100 : 48000,
      sources: normalizeAudioSources(audio as unknown as Record<string, unknown>, base.audio.sources),
    },
    capture: {
      kind: ['desktop','window','device'].includes(capture.kind) ? capture.kind : base.capture.kind,
      display: text(capture.display, base.capture.display, 512).replace(/[\r\n\0]/g, ''),
      windowTitle: text(capture.windowTitle, base.capture.windowTitle, 512).replace(/[\r\n\0]/g, ''),
      device: text(capture.device, base.capture.device, 512).replace(/[\r\n\0]/g, ''),
    },
    scenes,
    activeSceneId,
    recording: {
      enabled: bool(recording.enabled, base.recording.enabled),
      directory: text(recording.directory, base.recording.directory, 1024).replace(/[\r\n\0]/g, ''),
      format: recording.format === 'mp4' ? 'mp4' : 'mkv',
    },
    destinations,
    ui: {
      theme: ['midnight','oled','light'].includes(ui.theme) ? ui.theme : base.ui.theme,
      density: ui.density === 'compact' ? 'compact' : 'comfortable',
    },
  };
}

export class ConfigStore {
  constructor(private file:string, private current:BroadcastConfig) {}
  static async load(file:string) { return new ConfigStore(file, normalize(await readJson(file, DEFAULT_CONFIG))); }
  get() { return this.current; }
  async save(input:unknown) { this.current = normalize(input, this.current); await writeJson(this.file, this.current); return this.current; }
}
