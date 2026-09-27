export type Encoder = 'nvenc' | 'qsv' | 'amf' | 'software';
export type CaptureKind = 'desktop' | 'window' | 'device';
export type Platform = 'twitch' | 'youtube' | 'kick' | 'facebook' | 'custom';
export type SourceKind = 'camera' | 'image' | 'text';
export type AudioSourceKind = 'microphone' | 'desktop' | 'application' | 'media';

export interface Destination { id: string; name: string; platform: Platform; enabled: boolean; url: string; streamKey: string; }
export interface SceneSourceBase { id: string; name: string; kind: SourceKind; enabled: boolean; x: number; y: number; width: number; height: number; opacity: number; }
export interface CameraSource extends SceneSourceBase { kind: 'camera'; device: string; }
export interface ImageSource extends SceneSourceBase { kind: 'image'; path: string; }
export interface TextSource extends SceneSourceBase { kind: 'text'; text: string; fontSize: number; color: string; }
export type SceneSource = CameraSource | ImageSource | TextSource;
export interface Scene { id: string; name: string; sources: SceneSource[]; }

/** Stored so later processing stages can be added without a config break. The current graph does not apply filters. */
export interface AudioFilter { id: string; type: string; enabled: boolean; }

export interface AudioSource {
  id: string;
  name: string;
  kind: AudioSourceKind;
  enabled: boolean;
  muted: boolean;
  /** Linear fader, 0 through 2. */
  volume: number;
  device: string;
  filters: AudioFilter[];
}

export interface BroadcastConfig {
  video: { width: number; height: number; fps: number; bitrateKbps: number; keyframeSeconds: number; encoder: Encoder; preset: 'performance' | 'balanced' | 'quality'; };
  audio: { bitrateKbps: number; sampleRate: 44100 | 48000; sources: AudioSource[]; };
  capture: { kind: CaptureKind; display: string; windowTitle: string; device: string; };
  scenes: Scene[];
  activeSceneId: string;
  recording: { enabled: boolean; directory: string; format: 'mkv' | 'mp4'; };
  destinations: Destination[];
  ui: { theme: 'midnight' | 'oled' | 'light'; density: 'comfortable' | 'compact'; };
}

/** dBFS. null is a measured digital silence, not a missing sample. */
export interface AudioLevel { rmsDb: number | null; peakDb: number | null; }

export interface RuntimeStats {
  state: 'idle' | 'starting' | 'live' | 'stopping' | 'error';
  startedAt: number | null;
  fps: number | null;
  bitrateKbps: number | null;
  droppedFrames: number | null;
  speed: number | null;
  lastError: string | null;
  pid: number | null;
  audioLevels: Record<string, AudioLevel>;
}

export interface ChatMessage { id: string; platform: Platform; username: string; text: string; timestamp: number; color?: string; }
export interface ChatConfig { twitch?: { enabled: boolean; nick: string; channel: string; oauthToken: string }; youtube?: { enabled: boolean; apiKey: string; liveChatId: string }; }
export interface SystemCapabilities {
  ffmpegInstalled: boolean;
  ffmpegVersion: string | null;
  encoders: Record<Encoder, boolean>;
  videoDevices: string[];
  audioDevices: string[];
  desktopAudioAvailable: boolean;
  desktopAudioDevices: string[];
  platform: NodeJS.Platform;
}
export interface AppState { config: BroadcastConfig; runtime: RuntimeStats; chat: ChatMessage[]; }
