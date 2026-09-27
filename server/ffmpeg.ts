import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { BroadcastConfig, RuntimeStats, SceneSource } from '../shared/types';
import { EMPTY_RUNTIME } from '../shared/defaults';
import { audioGraph, capturableAudio, planAudioCapture } from './audio';
import { probeSystem } from './system';
import { consumeAudioMeters, consumeProgress, lineCarry, type LineCarry } from './telemetry';

type Update = (stats: RuntimeStats) => void;

const freshRuntime = (patch: Partial<RuntimeStats> = {}): RuntimeStats => ({ ...EMPTY_RUNTIME, audioLevels: {}, audioNotices: [], ...patch });

export class BroadcastEngine {
  private child: ChildProcessWithoutNullStreams | null = null;
  private stats: RuntimeStats = freshRuntime();
  private exitWaiters = new Set<() => void>();
  private progress: LineCarry = lineCarry();
  private meters: LineCarry = lineCarry();
  constructor(private update: Update) {}
  snapshot() { return this.stats; }
  async start(config: BroadcastConfig) {
    if (this.child) throw new Error('Broadcast is already running.');
    const enabled = config.destinations.filter(d => d.enabled && d.url && d.streamKey);
    if (enabled.length === 0 && !config.recording.enabled) throw new Error('Enable at least one stream destination or recording.');
    const probe = await probeSystem();
    if (!probe.ffmpegInstalled) throw new Error('FFmpeg is not installed or not on PATH. Install FFmpeg or set FFMPEG_PATH, then try again.');
    const plan = planAudioCapture(config.audio.sources, process.platform, probe);
    const graphConfig = { ...config, audio: { ...config.audio, sources: plan.sources } };
    if (config.recording.enabled) await mkdir(resolve(config.recording.directory), { recursive: true });
    const args = buildArgs(graphConfig);
    this.progress = lineCarry();
    this.meters = lineCarry();
    this.stats = freshRuntime({ state: 'starting', startedAt: Date.now(), audioNotices: plan.notices });
    this.emit();
    const child = spawn(process.env.FFMPEG_PATH || 'ffmpeg', args, { windowsHide: true });
    this.child = child;
    this.stats.pid = child.pid ?? null;
    this.emit();
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      const update = consumeProgress(this.stats, chunk, this.progress);
      if (update.sawFrame && this.stats.state === 'starting') this.stats.state = 'live';
      if (update.changed || update.sawFrame) this.emit();
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-12000);
      if (consumeAudioMeters(this.stats.audioLevels, chunk, this.meters)) this.emit();
    });
    child.on('error', err => {
      if (this.child === child) this.child = null;
      this.set({ ...this.stats, state: 'error', lastError: err.message, pid: null });
      this.resolveExited();
    });
    child.on('exit', (code, signal) => {
      const wasStopping = this.stats.state === 'stopping';
      if (this.child === child) this.child = null;
      if (wasStopping || code === 0) this.set(freshRuntime());
      else this.set({ ...this.stats, state: 'error', pid: null, lastError: `FFmpeg exited with code ${code ?? 'null'}${signal ? ` (${signal})` : ''}. ${tailError(stderr)}` });
      this.resolveExited();
    });
    return this.snapshot();
  }
  async stop() {
    const child = this.child;
    if (!child) return this.snapshot();
    this.stats.state = 'stopping';
    this.emit();
    const exited = this.waitForExit(7000);
    child.stdin.write('q\n');
    setTimeout(() => { if (this.child === child) child.kill('SIGTERM'); }, 4500).unref();
    await exited;
    return this.snapshot();
  }
  async restart(config: BroadcastConfig) { if (this.child) await this.stop(); return this.start(config); }
  private waitForExit(timeout: number) {
    return new Promise<void>(resolve => {
      let done = false;
      const finish = () => { if (done) return; done = true; clearTimeout(timer); this.exitWaiters.delete(finish); resolve(); };
      const timer = setTimeout(finish, timeout);
      timer.unref();
      this.exitWaiters.add(finish);
    });
  }
  private resolveExited() { for (const done of [...this.exitWaiters]) done(); }
  private set(next: RuntimeStats) { this.stats = next; this.emit(); }
  private emit() { this.update({ ...this.stats, audioLevels: { ...this.stats.audioLevels }, audioNotices: [...this.stats.audioNotices] }); }
}

function encoderArgs(c: BroadcastConfig): string[] {
  const { encoder, preset, bitrateKbps } = c.video;
  if (encoder === 'nvenc') return ['-c:v', 'h264_nvenc', '-preset', preset === 'performance' ? 'p1' : preset === 'quality' ? 'p6' : 'p4', '-b:v', `${bitrateKbps}k`, '-maxrate', `${bitrateKbps}k`, '-bufsize', `${bitrateKbps * 2}k`];
  if (encoder === 'qsv') return ['-c:v', 'h264_qsv', '-preset', preset === 'performance' ? 'veryfast' : preset === 'quality' ? 'slow' : 'medium', '-b:v', `${bitrateKbps}k`];
  if (encoder === 'amf') return ['-c:v', 'h264_amf', '-quality', preset === 'performance' ? 'speed' : preset === 'quality' ? 'quality' : 'balanced', '-b:v', `${bitrateKbps}k`];
  return ['-c:v', 'libx264', '-preset', preset === 'performance' ? 'veryfast' : preset === 'quality' ? 'slow' : 'medium', '-b:v', `${bitrateKbps}k`, '-maxrate', `${bitrateKbps}k`, '-bufsize', `${bitrateKbps * 2}k`];
}

function baseCapture(c: BroadcastConfig, platform: NodeJS.Platform): string[] {
  const fps = String(c.video.fps);
  if (platform === 'win32') {
    if (c.capture.kind === 'window' && c.capture.windowTitle) return ['-f', 'gdigrab', '-framerate', fps, '-i', `title=${c.capture.windowTitle}`];
    if (c.capture.kind === 'device' && c.capture.device) return ['-f', 'dshow', '-framerate', fps, '-i', `video=${c.capture.device}`];
    return ['-f', 'gdigrab', '-framerate', fps, '-i', 'desktop'];
  }
  if (platform === 'darwin') return ['-f', 'avfoundation', '-framerate', fps, '-i', c.capture.device || '1:none'];
  return ['-f', 'x11grab', '-framerate', fps, '-video_size', `${c.video.width}x${c.video.height}`, '-i', c.capture.display || ':0.0'];
}

function cameraInput(device: string, fps: number, platform: NodeJS.Platform): string[] {
  if (platform === 'win32') return ['-f', 'dshow', '-framerate', String(fps), '-i', `video=${device}`];
  if (platform === 'darwin') return ['-f', 'avfoundation', '-framerate', String(fps), '-i', `${device}:none`];
  return ['-f', 'v4l2', '-framerate', String(fps), '-i', device];
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/%/g, '\\%');

function activeSources(c: BroadcastConfig) { return c.scenes.find(s => s.id === c.activeSceneId)?.sources.filter(s => s.enabled) ?? []; }

function sourceInputs(c: BroadcastConfig, sources: SceneSource[], startIndex: number, platform: NodeJS.Platform) {
  const args: string[] = [];
  const indexes = new Map<string, number>();
  let index = startIndex;
  for (const s of sources) {
    if (s.kind === 'camera' && s.device) { args.push(...cameraInput(s.device, c.video.fps, platform)); indexes.set(s.id, index++); }
    else if (s.kind === 'image' && s.path) { args.push('-loop', '1', '-framerate', String(c.video.fps), '-i', s.path); indexes.set(s.id, index++); }
  }
  return { args, indexes };
}

function filterGraph(c: BroadcastConfig, sources: SceneSource[], indexes: Map<string, number>) {
  const f: string[] = [];
  let current = 'base0';
  f.push(`[0:v]scale=${c.video.width}:${c.video.height}:force_original_aspect_ratio=decrease,pad=${c.video.width}:${c.video.height}:(ow-iw)/2:(oh-ih)/2[${current}]`);
  let n = 0;
  for (const s of sources) {
    const next = `base${++n}`;
    if ((s.kind === 'camera' || s.kind === 'image') && indexes.has(s.id)) {
      const i = indexes.get(s.id)!;
      const ov = `ov${n}`;
      f.push(`[${i}:v]scale=${s.width}:${s.height},format=rgba,colorchannelmixer=aa=${s.opacity}[${ov}]`);
      f.push(`[${current}][${ov}]overlay=${s.x}:${s.y}:eof_action=pass:shortest=0[${next}]`);
      current = next;
    } else if (s.kind === 'text' && s.text) {
      f.push(`[${current}]drawtext=text='${esc(s.text)}':x=${s.x}:y=${s.y}:fontsize=${s.fontSize}:fontcolor=${s.color}@${s.opacity}[${next}]`);
      current = next;
    }
  }
  return { graph: f.join(';'), output: current };
}

export function buildArgs(c: BroadcastConfig, platform: NodeJS.Platform = process.platform): string[] {
  const out: string[] = ['-hide_banner', '-loglevel', 'info', '-nostats', '-progress', 'pipe:1', ...baseCapture(c, platform)];
  const activeAudio = capturableAudio(c.audio.sources, platform);
  const audio = audioGraph(c.audio.sources, 1, c.audio.sampleRate, platform);
  out.push(...audio.args);
  const sources = activeSources(c);
  const extra = sourceInputs(c, sources, 1 + activeAudio.length, platform);
  out.push(...extra.args);
  const fg = filterGraph(c, sources, extra.indexes);
  const graphs = [fg.graph, audio.graph].filter(Boolean);
  out.push('-filter_complex', graphs.join(';'), '-map', `[${fg.output}]`);
  if (audio.output) out.push('-map', `[${audio.output}]`);
  out.push('-r', String(c.video.fps), ...encoderArgs(c), '-g', String(c.video.fps * c.video.keyframeSeconds), '-pix_fmt', 'yuv420p');
  if (audio.output) out.push('-c:a', 'aac', '-b:a', `${c.audio.bitrateKbps}k`, '-ar', String(c.audio.sampleRate));
  else out.push('-an');
  const sinks: string[] = [];
  for (const d of c.destinations.filter(d => d.enabled && d.url && d.streamKey)) sinks.push(`[f=flv:onfail=ignore]${escapeTee(d.url.replace(/\/$/, '') + '/' + d.streamKey)}`);
  if (c.recording.enabled) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = join(resolve(c.recording.directory), `litecast-${stamp}.${c.recording.format}`);
    sinks.push(`[f=${c.recording.format === 'mkv' ? 'matroska' : 'mp4'}:onfail=ignore]${escapeTee(file)}`);
  }
  // Tee writes the Matroska/FLV header before NVENC emits in-band extradata. The global header has to exist or the output is empty.
  out.push('-flags', '+global_header', '-f', 'tee', sinks.join('|'));
  return out;
}

const escapeTee = (s: string) => s.replace(/\\/g, '/').replace(/\|/g, '\\|');

function tailError(stderr: string) { return stderr.split(/\r?\n/).filter(Boolean).slice(-3).join(' ').slice(0, 1000); }
