import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Encoder, SystemCapabilities } from '../shared/types';

const run = promisify(execFile);
const ffmpeg = () => process.env.FFMPEG_PATH || 'ffmpeg';

async function output(args: string[]): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await run(ffmpeg(), args, { windowsHide: true, maxBuffer: 4 * 1024 * 1024, timeout: 10_000 });
    return { stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    if (e.stdout !== undefined || e.stderr !== undefined) return { stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
    throw error;
  }
}

function unique(values: string[]) { return [...new Set(values.map(v => v.trim()).filter(Boolean))]; }

async function devices(): Promise<{ video: string[]; audio: string[] }> {
  if (process.platform === 'win32') {
    const { stderr } = await output(['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy']);
    const video: string[] = [];
    const audio: string[] = [];
    let section: 'video' | 'audio' | null = null;
    for (const line of stderr.split(/\r?\n/)) {
      if (/DirectShow video devices/i.test(line)) section = 'video';
      else if (/DirectShow audio devices/i.test(line)) section = 'audio';
      else {
        const name = /"([^"]+)"/.exec(line)?.[1];
        if (name && section && !/Alternative name/i.test(line)) (section === 'video' ? video : audio).push(name);
      }
    }
    return { video: unique(video), audio: unique(audio) };
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

export async function probeSystem(): Promise<SystemCapabilities> {
  try {
    const [{ stdout: versionOut }, { stdout: encodersOut }, found] = await Promise.all([
      output(['-hide_banner', '-version']),
      output(['-hide_banner', '-encoders']),
      devices().catch(() => ({ video: [], audio: [] })),
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
      platform: process.platform,
    };
  } catch {
    return {
      ffmpegInstalled: false,
      ffmpegVersion: null,
      encoders: { nvenc: false, qsv: false, amf: false, software: false },
      videoDevices: [],
      audioDevices: [],
      platform: process.platform,
    };
  }
}
