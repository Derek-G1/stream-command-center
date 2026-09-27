import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { BroadcastConfig, RuntimeStats } from '../shared/types';
import { EMPTY_RUNTIME } from '../shared/defaults';

type Update = (stats: RuntimeStats) => void;

export class BroadcastEngine {
  private child: ChildProcessWithoutNullStreams | null = null;
  private stats: RuntimeStats = { ...EMPTY_RUNTIME };
  constructor(private update: Update) {}
  snapshot() { return this.stats; }
  async start(config: BroadcastConfig) {
    if (this.child) throw new Error('Broadcast is already running.');
    const enabled = config.destinations.filter(d => d.enabled && d.url && d.streamKey);
    if (enabled.length === 0 && !config.recording.enabled) throw new Error('Enable at least one stream destination or recording.');
    if (config.recording.enabled) await mkdir(resolve(config.recording.directory), { recursive: true });
    const args = buildArgs(config);
    this.set({ ...EMPTY_RUNTIME, state: 'starting', startedAt: Date.now() });
    const child = spawn(process.env.FFMPEG_PATH || 'ffmpeg', args, { windowsHide: true });
    this.child = child;
    this.stats.pid = child.pid ?? null;
    this.emit();
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-12000);
      parseProgress(chunk, this.stats);
      if (this.stats.state === 'starting' && /frame=\s*\d+/.test(chunk)) this.stats.state = 'live';
      this.emit();
    });
    child.on('error', (err) => {
      this.child = null;
      this.set({ ...this.stats, state: 'error', lastError: err.message, pid: null });
    });
    child.on('exit', (code, signal) => {
      const wasStopping = this.stats.state === 'stopping';
      this.child = null;
      if (wasStopping || code === 0) this.set({ ...EMPTY_RUNTIME });
      else this.set({ ...this.stats, state: 'error', pid: null, lastError: `FFmpeg exited with code ${code ?? 'null'}${signal ? ` (${signal})` : ''}. ${tailError(stderr)}` });
    });
    return this.snapshot();
  }
  async stop() {
    if (!this.child) return this.snapshot();
    this.stats.state = 'stopping'; this.emit();
    this.child.stdin.write('q\n');
    const child = this.child;
    setTimeout(() => { if (this.child === child) child.kill('SIGTERM'); }, 5000).unref();
    return this.snapshot();
  }
  private set(next: RuntimeStats) { this.stats = next; this.emit(); }
  private emit() { this.update({ ...this.stats }); }
}

function encoderArgs(config: BroadcastConfig): string[] {
  const { encoder, preset, bitrateKbps } = config.video;
  if (encoder === 'nvenc') return ['-c:v','h264_nvenc','-preset',preset === 'performance' ? 'p1' : preset === 'quality' ? 'p6' : 'p4','-b:v',`${bitrateKbps}k`,'-maxrate',`${bitrateKbps}k`,'-bufsize',`${bitrateKbps * 2}k`];
  if (encoder === 'qsv') return ['-c:v','h264_qsv','-preset',preset === 'performance' ? 'veryfast' : preset === 'quality' ? 'slow' : 'medium','-b:v',`${bitrateKbps}k`];
  if (encoder === 'amf') return ['-c:v','h264_amf','-quality',preset === 'performance' ? 'speed' : preset === 'quality' ? 'quality' : 'balanced','-b:v',`${bitrateKbps}k`];
  return ['-c:v','libx264','-preset',preset === 'performance' ? 'veryfast' : preset === 'quality' ? 'slow' : 'medium','-b:v',`${bitrateKbps}k`,'-maxrate',`${bitrateKbps}k`,'-bufsize',`${bitrateKbps * 2}k`];
}

function captureArgs(c: BroadcastConfig): string[] {
  const fps = String(c.video.fps);
  if (process.platform === 'win32') {
    if (c.capture.kind === 'window' && c.capture.windowTitle) return ['-f','gdigrab','-framerate',fps,'-i',`title=${c.capture.windowTitle}`];
    if (c.capture.kind === 'device' && c.capture.device) return ['-f','dshow','-framerate',fps,'-i',`video=${c.capture.device}`];
    return ['-f','gdigrab','-framerate',fps,'-i','desktop'];
  }
  if (process.platform === 'darwin') return ['-f','avfoundation','-framerate',fps,'-i',c.capture.device || '1:none'];
  return ['-f','x11grab','-framerate',fps,'-video_size',`${c.video.width}x${c.video.height}`,'-i',c.capture.display || ':0.0'];
}

function audioArgs(c: BroadcastConfig): string[] {
  if (!c.audio.enabled || !c.audio.device) return [];
  if (process.platform === 'win32') return ['-f','dshow','-i',`audio=${c.audio.device}`];
  if (process.platform === 'darwin') return ['-f','avfoundation','-i',`none:${c.audio.device}`];
  return ['-f','pulse','-i',c.audio.device];
}

export function buildArgs(c: BroadcastConfig): string[] {
  const out: string[] = ['-hide_banner','-loglevel','info','-stats',...captureArgs(c),...audioArgs(c),'-vf',`scale=${c.video.width}:${c.video.height}:force_original_aspect_ratio=decrease,pad=${c.video.width}:${c.video.height}:(ow-iw)/2:(oh-ih)/2`,'-r',String(c.video.fps),...encoderArgs(c),'-g',String(c.video.fps * c.video.keyframeSeconds),'-pix_fmt','yuv420p'];
  if (c.audio.enabled && c.audio.device) out.push('-c:a','aac','-b:a',`${c.audio.bitrateKbps}k`,'-ar',String(c.audio.sampleRate));
  else out.push('-an');
  const sinks: string[] = [];
  for (const d of c.destinations.filter(d => d.enabled && d.url && d.streamKey)) sinks.push(`[f=flv:onfail=ignore]${escapeTee(d.url.replace(/\/$/, '') + '/' + d.streamKey)}`);
  if (c.recording.enabled) {
    const stamp = new Date().toISOString().replace(/[:.]/g,'-');
    const file = join(resolve(c.recording.directory), `litecast-${stamp}.${c.recording.format}`);
    sinks.push(`[f=${c.recording.format === 'mkv' ? 'matroska' : 'mp4'}:onfail=ignore]${escapeTee(file)}`);
  }
  out.push('-f','tee', sinks.join('|'));
  return out;
}

const escapeTee = (s: string) => s.replace(/\\/g,'/').replace(/\|/g,'\\|');

function parseProgress(text: string, stats: RuntimeStats) {
  const frame = /frame=\s*(\d+)/.exec(text); const fps = /fps=\s*([\d.]+)/.exec(text); const bitrate = /bitrate=\s*([\d.]+)kbits/.exec(text); const speed = /speed=\s*([\d.]+)x/.exec(text);
  if (fps) stats.fps = Number(fps[1]); else if (frame && stats.startedAt) stats.fps = Number(frame[1]) / Math.max(1,(Date.now()-stats.startedAt)/1000);
  if (bitrate) stats.bitrateKbps = Number(bitrate[1]); if (speed) stats.speed = Number(speed[1]);
}
function tailError(stderr: string) { return stderr.split(/\r?\n/).filter(Boolean).slice(-3).join(' ').slice(0,1000); }
