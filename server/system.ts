import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Encoder, SystemCapabilities } from '../shared/types';

const run = promisify(execFile);
const ffmpeg = () => process.env.FFMPEG_PATH || 'ffmpeg';

/** A missing FFmpeg binary still sets empty stdout/stderr on the spawn error. That is not a successful probe. */
export function capturedOutput(error: { code?: string; stdout?: string; stderr?: string }): { stdout: string; stderr: string } | undefined {
  const stdout = error.stdout ?? '';
  const stderr = error.stderr ?? '';
  if ((error.code === 'ENOENT' || error.code === 'ENOTDIR') && !stdout.trim() && !stderr.trim()) return undefined;
  if (error.stdout !== undefined || error.stderr !== undefined) return { stdout, stderr };
  return undefined;
}

async function output(args: string[]): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await run(ffmpeg(), args, { windowsHide: true, maxBuffer: 4 * 1024 * 1024, timeout: 10_000 });
    return { stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const captured = capturedOutput(error as { code?: string; stdout?: string; stderr?: string });
    if (captured) return captured;
    throw error;
  }
}

function unique(values: string[]) { return [...new Set(values.map(v => v.trim()).filter(Boolean))]; }

/** DirectShow listings differ by FFmpeg version: section headers, or `"Name" (audio|video)` on FFmpeg 7/9. */
export function parseDshowDevices(stderr: string): { video: string[]; audio: string[] } {
  const video: string[] = [];
  const audio: string[] = [];
  let section: 'video' | 'audio' | null = null;
  for (const raw of stderr.split(/\r?\n/)) {
    const line = raw.trim();
    if (/Alternative name/i.test(line)) continue;
    const tagged = /"([^"]+)"\s+\((video|audio)\)$/.exec(line);
    if (tagged?.[1] && tagged[2]) {
      (tagged[2] === 'video' ? video : audio).push(tagged[1]);
      continue;
    }
    if (/DirectShow video devices/i.test(line)) { section = 'video'; continue; }
    if (/DirectShow audio devices/i.test(line)) { section = 'audio'; continue; }
    const name = /"([^"]+)"/.exec(line)?.[1];
    if (name && section) (section === 'video' ? video : audio).push(name);
  }
  return { video: unique(video), audio: unique(audio) };
}

async function devices(): Promise<{ video: string[]; audio: string[] }> {
  if (process.platform === 'win32') {
    const { stderr } = await output(['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy']);
    return parseDshowDevices(stderr);
  }
  if (process.platform === 'darwin') {
    const { stderr } = await output(['-hide_banner', '-f', 'avfoundation', '-list_devices', 'true', '-i', '']);
    const video: string[] = [];
    const audio: string[] = [];
    let section: 'video' | 'audio' | null = null;
    for (const line of stderr.split(/\r?\n/)) {
      if (/AVFoundation video devices/i.test(line)) section = 'video';
      else if (/AVFoundation audio devices/i.test(line)) section = 'audio';
      else {
        const match = /\[(\d+)\]\s+(.+)$/.exec(line);
        if (match && section) (section === 'video' ? video : audio).push(`${match[1]}:${match[2]}`);
      }
    }
    return { video: unique(video), audio: unique(audio) };
  }
  // Linux capture setups vary (PipeWire/Pulse/V4L2). Keep discovery conservative;
  // manual device strings remain supported and the native backend will own richer discovery.
  return { video: [], audio: [] };
}

async function desktopAudio(): Promise<{ available: boolean; devices: string[] }> {
  if (process.platform === 'linux') return { available: true, devices: [] };
  if (process.platform !== 'win32') return { available: false, devices: [] };
  try {
    const { stderr } = await output(['-hide_banner', '-list_devices', 'true', '-f', 'wasapi', '-i', 'dummy']);
    if (/Unknown input format|Unrecognized option|Error opening input/i.test(stderr) && !/output devices/i.test(stderr)) return { available: false, devices: [] };
    const devices: string[] = [];
    let outputSection = false;
    for (const line of stderr.split(/\r?\n/)) {
      if (/output devices/i.test(line)) { outputSection = true; continue; }
      if (/input devices/i.test(line)) { outputSection = false; continue; }
      const name = /"([^"]+)"/.exec(line)?.[1];
      if (outputSection && name) devices.push(name);
    }
    return { available: /wasapi/i.test(stderr) || devices.length > 0, devices: unique(devices) };
  } catch {
    return { available: false, devices: [] };
  }
}

export async function probeSystem(): Promise<SystemCapabilities> {
  try {
    const [{ stdout: versionOut }, { stdout: encodersOut }, found, desktop] = await Promise.all([
      output(['-hide_banner', '-version']),
      output(['-hide_banner', '-encoders']),
      devices().catch(() => ({ video: [], audio: [] })),
      desktopAudio(),
    ]);
    const encoders: Record<Encoder, boolean> = {
      nvenc: /\bh264_nvenc\b/.test(encodersOut),
      qsv: /\bh264_qsv\b/.test(encodersOut),
      amf: /\bh264_amf\b/.test(encodersOut),
      software: /\blibx264\b/.test(encodersOut),
    };
    return {
      ffmpegInstalled: true,
      ffmpegVersion: versionOut.split(/\r?\n/)[0] ?? 'ffmpeg',
      encoders,
      videoDevices: found.video,
      audioDevices: found.audio,
      desktopAudioAvailable: desktop.available,
      desktopAudioDevices: desktop.devices,
      platform: process.platform,
    };
  } catch {
    return {
      ffmpegInstalled: false,
      ffmpegVersion: null,
      encoders: { nvenc: false, qsv: false, amf: false, software: false },
      videoDevices: [],
      audioDevices: [],
      desktopAudioAvailable: false,
      desktopAudioDevices: [],
      platform: process.platform,
    };
  }
}
