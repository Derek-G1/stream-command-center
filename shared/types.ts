export type Encoder = 'nvenc' | 'qsv' | 'amf' | 'software';
export type CaptureKind = 'desktop' | 'window' | 'device';
export type Platform = 'twitch' | 'youtube' | 'kick' | 'facebook' | 'custom';
export type SourceKind = 'camera' | 'image' | 'text';

export interface Destination {
  id: string;
  name: string;
  platform: Platform;
  enabled: boolean;
  url: string;
  streamKey: string;
}

export interface SceneSourceBase {
  id: string;
  name: string;
  kind: SourceKind;
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
}
export interface CameraSource extends SceneSourceBase { kind: 'camera'; device: string; }
export interface ImageSource extends SceneSourceBase { kind: 'image'; path: string; }
export interface TextSource extends SceneSourceBase { kind: 'text'; text: string; fontSize: number; color: string; }
export type SceneSource = CameraSource | ImageSource | TextSource;
export interface Scene { id: string; name: string; sources: SceneSource[]; }

export interface BroadcastConfig {
  video: {
    width: number;
    height: number;
    fps: number;
    bitrateKbps: number;
    keyframeSeconds: number;
    encoder: Encoder;
    preset: 'performance' | 'balanced' | 'quality';
  };
  audio: {
    enabled: boolean;
    device: string;
    bitrateKbps: number;
    sampleRate: 44100 | 48000;
    volume: number;
  };
  capture: {
    kind: CaptureKind;
    display: string;
    windowTitle: string;
    device: string;
  };
  scenes: Scene[];
  activeSceneId: string;
  recording: {
    enabled: boolean;
    directory: string;
    format: 'mkv' | 'mp4';
  };
  destinations: Destination[];
  ui: {
    theme: 'midnight' | 'oled' | 'light';
    density: 'comfortable' | 'compact';
    previewFps: 5 | 15 | 30;
  };
}

export interface RuntimeStats {
  state: 'idle' | 'starting' | 'live' | 'stopping' | 'error';
  startedAt: number | null;
  fps: number;
  bitrateKbps: number;
  droppedFrames: number;
  speed: number;
  lastError: string | null;
  pid: number | null;
}

export interface ChatMessage {
  id: string;
  platform: Platform;
  username: string;
  text: string;
  timestamp: number;
  color?: string;
}

export interface ChatConfig {
  twitch?: { enabled: boolean; nick: string; channel: string; oauthToken: string };
  youtube?: { enabled: boolean; apiKey: string; liveChatId: string };
}

export interface AppState {
  config: BroadcastConfig;
  runtime: RuntimeStats;
  chat: ChatMessage[];
}
