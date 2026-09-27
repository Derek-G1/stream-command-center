import { useEffect, useState } from 'preact/hooks';
import type { AudioLevel, AudioSource, BroadcastConfig, SystemCapabilities } from '../../../shared/types';
import { audioKindAvailable } from '../../../shared/platforms';
import { api } from '../api';

const sourceTemplate = (kind: 'microphone' | 'desktop'): AudioSource => ({
  id: crypto.randomUUID(),
  name: kind === 'desktop' ? 'Desktop' : 'Microphone',
  kind,
  enabled: true,
  muted: false,
  volume: 1,
  device: '',
  filters: [],
});

const meterWidth = (level: AudioLevel | undefined) => {
  if (!level || level.rmsDb === null) return '0%';
  return `${Math.max(0, Math.min(100, ((level.rmsDb + 60) / 60) * 100))}%`;
};

export function AudioPanel({ config, runtimeLevels, set }: { config: BroadcastConfig; runtimeLevels: Record<string, AudioLevel>; set: (c: BroadcastConfig) => void }) {
  const [cap, setCap] = useState<SystemCapabilities | null>(null);
  useEffect(() => { void api.capabilities().then(setCap).catch(() => {}); }, []);
  const desktopReady = cap?.desktopAudioAvailable ?? false;
  const patch = (sources: AudioSource[]) => set({ ...config, audio: { ...config.audio, sources } });
  const update = (id: string, partial: Partial<AudioSource>) => patch(config.audio.sources.map(source => source.id === id ? { ...source, ...partial } : source));
  const storedFilters = config.audio.sources.some(source => source.filters.length > 0);
  return <section class="panel wide">
    <div class="row"><div><h2>Audio mixer</h2><p class="muted">Meters show measured RMS while a broadcast is running. Mute and volume change the FFmpeg graph, so use Apply live or the next start.</p></div></div>
    <div class="source-add">
      <button onClick={() => patch([...config.audio.sources, sourceTemplate('microphone')])}>+ Microphone</button>
      <button disabled={!desktopReady} title={desktopReady ? 'Capture the default playback device' : 'Not available yet'} onClick={() => patch([...config.audio.sources, sourceTemplate('desktop')])}>+ Desktop</button>
      <button disabled title="Not available yet">+ Application</button>
      <button disabled title="Not available yet">+ Media</button>
    </div>
    {cap === null && <p class="muted small">Checking which audio captures this FFmpeg build can open.</p>}
    {cap && !desktopReady && <p class="muted small">Desktop, application, and media audio are not available with this capture backend.</p>}
    {desktopReady && <p class="muted small">Application and media audio are not available yet. Desktop capture uses the system playback device.</p>}
    {config.audio.sources.length === 0 && <p class="empty">No audio sources. A broadcast can still run without audio.</p>}
    {config.audio.sources.map(source => {
      const available = audioKindAvailable(source.kind, desktopReady);
      const level = runtimeLevels[source.id];
      const devices = source.kind === 'desktop' ? cap?.desktopAudioDevices ?? [] : cap?.audioDevices ?? [];
      return <div class="audio-row" key={source.id}>
        <div><b>{source.name}</b><small class="muted">{source.kind}{available ? '' : ' · not available yet'}</small></div>
        {level ? <div class="meter" title={level.rmsDb === null ? 'Measured silence' : `${level.rmsDb.toFixed(1)} dB RMS`}><span style={{ width: meterWidth(level) }}/></div> : <span class="meter-na">N/A</span>}
        <label class="check"><input type="checkbox" checked={source.muted} disabled={!available} onChange={e => update(source.id, { muted: e.currentTarget.checked })}/> Mute</label>
        <label class="volume">Vol {source.volume.toFixed(2)}<input type="range" min="0" max="2" step="0.05" value={source.volume} disabled={!available} onInput={e => update(source.id, { volume: +e.currentTarget.value })}/></label>
        <label class="check"><input type="checkbox" checked={source.enabled} disabled={!available} onChange={e => update(source.id, { enabled: e.currentTarget.checked })}/> On</label>
        {available && (devices.length ? <select value={source.device} onChange={e => update(source.id, { device: e.currentTarget.value })}><option value="">Choose device…</option>{devices.map(device => <option value={device}>{device}</option>)}{source.device && !devices.includes(source.device) && <option value={source.device}>{source.device}</option>}</select> : <input placeholder="FFmpeg device name" value={source.device} onInput={e => update(source.id, { device: e.currentTarget.value })}/>)}
        <button class="ghost" onClick={() => patch(config.audio.sources.filter(item => item.id !== source.id))}>×</button>
      </div>;
    })}
    {storedFilters && <p class="warning-text small">Stored audio filters are kept for a later processing chain. This build does not apply them.</p>}
    <div class="inline audio-encode"><label>Bitrate kbps<input type="number" value={config.audio.bitrateKbps} onInput={e => set({ ...config, audio: { ...config.audio, bitrateKbps: +e.currentTarget.value } })}/></label><label>Sample rate<select value={config.audio.sampleRate} onChange={e => set({ ...config, audio: { ...config.audio, sampleRate: Number(e.currentTarget.value) === 44100 ? 44100 : 48000 } })}><option value="48000">48000</option><option value="44100">44100</option></select></label></div>
  </section>;
}
