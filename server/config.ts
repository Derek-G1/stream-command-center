import { DEFAULT_CONFIG } from '../shared/defaults';
import type { BroadcastConfig, Destination, Scene, SceneSource } from '../shared/types';
import { readJson, writeJson } from './files';

const clamp = (v: unknown, min: number, max: number, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : fallback;
const float = (v: unknown, min: number, max: number, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
const text = (v: unknown, fallback = '', max = 2048) => typeof v === 'string' ? v.slice(0, max) : fallback;
const bool = (v: unknown, fallback: boolean) => typeof v === 'boolean' ? v : fallback;
const hex = (v: unknown, fallback: string) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback;
const id = (v: unknown, fallback: string) => typeof v === 'string' && /^[\w-]{1,64}$/.test(v) ? v : fallback;

function normalizeSource(raw: any, i: number): SceneSource | null {
  if (!raw || typeof raw !== 'object' || !['camera','image','text'].includes(raw.kind)) return null;
  const common = { id: id(raw.id, `source-${i}`), name: text(raw.name, `Source ${i+1}`, 80), kind: raw.kind, enabled: bool(raw.enabled, true), x: clamp(raw.x, -7680, 7680, 0), y: clamp(raw.y, -4320, 4320, 0), width: clamp(raw.width, 16, 7680, 640), height: clamp(raw.height, 16, 4320, 360), opacity: float(raw.opacity, 0, 1, 1) };
  if (raw.kind === 'camera') return { ...common, kind: 'camera', device: text(raw.device, '', 512) };
  if (raw.kind === 'image') return { ...common, kind: 'image', path: text(raw.path, '', 2048) };
  return { ...common, kind: 'text', text: text(raw.text, 'Text', 500), fontSize: clamp(raw.fontSize, 8, 300, 48), color: hex(raw.color, '#ffffff') };
}
function normalizeScenes(value: unknown, fallback: Scene[]): Scene[] {
  if (!Array.isArray(value)) return fallback;
  const scenes = value.slice(0, 24).map((s:any, i): Scene => ({ id: id(s?.id, `scene-${i}`), name: text(s?.name, `Scene ${i+1}`, 80), sources: Array.isArray(s?.sources) ? s.sources.slice(0, 32).map(normalizeSource).filter((x): x is SceneSource => !!x) : [] }));
  return scenes.length ? scenes : fallback;
}

export function normalize(input: unknown, base = DEFAULT_CONFIG): BroadcastConfig {
  const x = (input && typeof input === 'object' ? input : {}) as Partial<BroadcastConfig>;
  const video = x.video ?? base.video; const audio = x.audio ?? base.audio; const capture = x.capture ?? base.capture; const recording = x.recording ?? base.recording; const ui = x.ui ?? base.ui;
  const scenes = normalizeScenes(x.scenes, base.scenes);
  const activeSceneId = scenes.some(s => s.id === x.activeSceneId) ? x.activeSceneId! : scenes[0]!.id;
  const destinations: Destination[] = Array.isArray(x.destinations) ? x.destinations.slice(0, 12).map((d:any, i) => ({ id: id(d?.id, `dest-${i}`), name: text(d?.name, `Destination ${i + 1}`, 64), platform: ['twitch','youtube','kick','facebook','custom'].includes(d?.platform) ? d.platform : 'custom', enabled: bool(d?.enabled, true), url: text(d?.url, '', 2048), streamKey: text(d?.streamKey, '', 2048) })) : base.destinations;
  return {
    video: { width: clamp(video.width, 320, 7680, base.video.width), height: clamp(video.height, 240, 4320, base.video.height), fps: clamp(video.fps, 1, 240, base.video.fps), bitrateKbps: clamp(video.bitrateKbps, 250, 100000, base.video.bitrateKbps), keyframeSeconds: clamp(video.keyframeSeconds, 1, 10, base.video.keyframeSeconds), encoder: ['nvenc','qsv','amf','software'].includes(video.encoder) ? video.encoder : base.video.encoder, preset: ['performance','balanced','quality'].includes(video.preset) ? video.preset : base.video.preset },
    audio: { enabled: bool(audio.enabled, base.audio.enabled), device: text(audio.device, base.audio.device, 512), bitrateKbps: clamp(audio.bitrateKbps, 64, 512, base.audio.bitrateKbps), sampleRate: audio.sampleRate === 44100 ? 44100 : 48000, volume: float(audio.volume, 0, 2, base.audio.volume) },
    capture: { kind: ['desktop','window','device'].includes(capture.kind) ? capture.kind : base.capture.kind, display: text(capture.display, base.capture.display, 512), windowTitle: text(capture.windowTitle, base.capture.windowTitle, 512), device: text(capture.device, base.capture.device, 512) },
    scenes, activeSceneId,
    recording: { enabled: bool(recording.enabled, base.recording.enabled), directory: text(recording.directory, base.recording.directory, 1024), format: recording.format === 'mp4' ? 'mp4' : 'mkv' }, destinations,
    ui: { theme: ['midnight','oled','light'].includes(ui.theme) ? ui.theme : base.ui.theme, density: ui.density === 'compact' ? 'compact' : 'comfortable', previewFps: ui.previewFps === 5 || ui.previewFps === 30 ? ui.previewFps : 15 },
  };
}
export class ConfigStore { constructor(private file:string, private current:BroadcastConfig){} static async load(file:string){return new ConfigStore(file, normalize(await readJson(file, DEFAULT_CONFIG)));} get(){return this.current;} async save(input:unknown){this.current=normalize(input,this.current);await writeJson(this.file,this.current);return this.current;} }
