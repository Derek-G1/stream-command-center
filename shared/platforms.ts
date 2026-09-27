import type { AudioSourceKind, Platform } from './types';

export interface PlatformCapabilities {
  rtmpOutput: boolean;
  readChat: boolean;
  sendChat: boolean;
  moderation: boolean;
  oauth: boolean;
}

/** What the current build actually does. Future adapters must update this table and the docs together. */
export const PLATFORM_CAPABILITIES: Record<Platform, PlatformCapabilities> = {
  twitch: { rtmpOutput: true, readChat: true, sendChat: false, moderation: false, oauth: false },
  youtube: { rtmpOutput: true, readChat: true, sendChat: false, moderation: false, oauth: false },
  kick: { rtmpOutput: true, readChat: false, sendChat: false, moderation: false, oauth: false },
  facebook: { rtmpOutput: true, readChat: false, sendChat: false, moderation: false, oauth: false },
  custom: { rtmpOutput: true, readChat: false, sendChat: false, moderation: false, oauth: false },
};

const PLATFORM_LABELS: Record<Platform, string> = {
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick',
  facebook: 'Facebook',
  custom: 'Custom',
};

export const platformLabel = (platform: Platform): string => PLATFORM_LABELS[platform];

export const platformsWith = (capability: keyof PlatformCapabilities): Platform[] =>
  (Object.entries(PLATFORM_CAPABILITIES) as [Platform, PlatformCapabilities][])
    .filter(([, caps]) => caps[capability])
    .map(([platform]) => platform);

/** Application and media audio are model values only. Desktop depends on the probed capture backend. */
export function audioKindAvailable(kind: AudioSourceKind, desktopAudioAvailable: boolean): boolean {
  if (kind === 'microphone') return true;
  if (kind === 'desktop') return desktopAudioAvailable;
  return false;
}
