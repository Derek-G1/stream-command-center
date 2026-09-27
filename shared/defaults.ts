import type { BroadcastConfig, RuntimeStats } from './types';

export const DEFAULT_PORT = 8790;
const MAIN_SCENE_ID = 'scene-main';

export const DEFAULT_CONFIG: BroadcastConfig = {
  video: { width: 1920, height: 1080, fps: 60, bitrateKbps: 6000, keyframeSeconds: 2, encoder: 'nvenc', preset: 'balanced' },
  audio: { enabled: true, device: '', bitrateKbps: 160, sampleRate: 48000, volume: 1 },
  capture: { kind: 'desktop', display: 'desktop', windowTitle: '', device: '' },
  scenes: [{ id: MAIN_SCENE_ID, name: 'Main', sources: [] }],
  activeSceneId: MAIN_SCENE_ID,
  recording: { enabled: true, directory: './recordings', format: 'mkv' },
  destinations: [],
  ui: { theme: 'midnight', density: 'comfortable', previewFps: 15 },
};

export const EMPTY_RUNTIME: RuntimeStats = {
  state: 'idle', startedAt: null, fps: 0, bitrateKbps: 0, droppedFrames: 0, speed: 0, lastError: null, pid: null,
};

export const cloneConfig = (value: BroadcastConfig): BroadcastConfig => structuredClone(value);
