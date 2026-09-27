import type { BroadcastConfig, RuntimeStats } from './types';

export const DEFAULT_PORT = 8790;
const MAIN_SCENE_ID = 'scene-main';

export const DEFAULT_CONFIG: BroadcastConfig = {
  video: { width: 1920, height: 1080, fps: 60, bitrateKbps: 6000, keyframeSeconds: 2, encoder: 'nvenc', preset: 'balanced' },
  audio: { bitrateKbps: 160, sampleRate: 48000, sources: [] },
  capture: { kind: 'desktop', display: 'desktop', windowTitle: '', device: '' },
  scenes: [{ id: MAIN_SCENE_ID, name: 'Main', sources: [] }],
  activeSceneId: MAIN_SCENE_ID,
  recording: { enabled: false, directory: './recordings', format: 'mkv' },
  destinations: [],
  ui: { theme: 'midnight', density: 'comfortable' },
};

export const EMPTY_RUNTIME: RuntimeStats = {
  state: 'idle', startedAt: null, fps: null, bitrateKbps: null, droppedFrames: null, speed: null, lastError: null, pid: null, audioLevels: {},
};

export const cloneConfig = (value: BroadcastConfig): BroadcastConfig => structuredClone(value);
