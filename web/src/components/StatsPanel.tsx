import type { RuntimeStats } from '../../../shared/types';

const text = (value: number | null, format: (n: number) => string) => value === null ? 'N/A' : format(value);

export function StatsPanel({ runtime }: { runtime: RuntimeStats }) {
  const cards: [string, string][] = [
    ['State', runtime.state],
    ['FPS', text(runtime.fps, n => n.toFixed(1))],
    ['Bitrate', text(runtime.bitrateKbps, n => `${n.toFixed(0)} kbps`)],
    ['Speed', text(runtime.speed, n => `${n.toFixed(2)}×`)],
    ['PID', runtime.pid === null ? 'N/A' : String(runtime.pid)],
    ['Dropped', text(runtime.droppedFrames, n => String(n))],
  ];
  return <>
    <div class="cards">{cards.map(([k, v]) => <section class="stat"><span>{k}</span><b>{v}</b></section>)}</div>
    <p class="muted small">Dropped counts frames FFmpeg reported in its progress stream. It stays N/A until a measurement arrives, and it is not a network-drop count. CPU, GPU, and render latency are not measured yet.</p>
    {runtime.audioNotices.length > 0 && <section class="panel"><h2>Audio</h2>{runtime.audioNotices.map((notice, index) => <p class="warning-text" key={`${index}-${notice}`}>{notice}</p>)}</section>}
    {runtime.lastError && <section class="panel error-panel"><h2>Last encoder error</h2><pre>{runtime.lastError}</pre></section>}
  </>;
}
