import { useEffect, useState } from 'preact/hooks';
import { clampGainDb, isGainFilter } from '../../../shared/audio';
import type { AudioLevel, AudioSource, BroadcastConfig, RuntimeStats, SystemCapabilities } from '../../../shared/types';
import { audioKindAvailable } from '../../../shared/platforms';
import { api } from '../api';

const FUTURE_FILTERS = ['Noise suppression', 'Noise gate', 'Compressor', 'Limiter'];

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

function meterReadout(level: AudioLevel | undefined) {
  if (!level) return { text: 'N/A', width: null as string | null, title: 'No meter sample yet. This is missing telemetry, not a measured silence.' };
  if (level.rmsDb === null) {
    const peak = level.peakDb === null ? 'Peak is measured silence too.' : `Peak ${level.peakDb.toFixed(1)} dB.`;
    return { text: 'Silence', width: '0%', title: `Post-fader digital silence. FFmpeg reported -inf after Gain, volume, and mute. ${peak}` };
  }
  const peak = level.peakDb === null ? 'Peak is measured silence.' : `Peak ${level.peakDb.toFixed(1)} dB.`;
  return {
    text: `${level.rmsDb.toFixed(1)} dB`,
    width: `${Math.max(0, Math.min(100, ((level.rmsDb + 60) / 60) * 100))}%`,
    title: `Post-fader RMS ${level.rmsDb.toFixed(1)} dB. ${peak} Measured after Gain, volume, and mute, before the mix.`,
  };
}

export function AudioPanel({ config, runtime, set }: { config: BroadcastConfig; runtime: RuntimeStats; set: (c: BroadcastConfig) => void }) {
  const [cap, setCap] = useState<SystemCapabilities | null>(null);
  const [capError, setCapError] = useState('');
  const [gainDraft, setGainDraft] = useState<Record<string, string>>({});
  const loadCaps = () => {
    setCapError('');
    void api.capabilities().then(setCap).catch(error => setCapError((error as Error).message));
  };
  useEffect(() => { loadCaps(); }, []);
  const desktopReady = cap?.desktopAudioAvailable ?? false;
  const patch = (sources: AudioSource[]) => set({ ...config, audio: { ...config.audio, sources } });
  const update = (id: string, partial: Partial<AudioSource>) => patch(config.audio.sources.map(source => source.id === id ? { ...source, ...partial } : source));
  return <section class="panel wide">
    <div class="audio-head"><div><h2>Audio mixer</h2><p class="muted">The meter is post-fader RMS from the running encode: after Gain, volume, and mute, before the mix. N/A means no sample has arrived. Silence means FFmpeg measured -inf. Mute, volume, and Gain apply on the next start or Apply live.</p></div><button class="secondary" onClick={loadCaps}>Refresh devices</button></div>
    <div class="source-add">
      <button onClick={() => patch([...config.audio.sources, sourceTemplate('microphone')])}>+ Microphone</button>
      <button disabled={!desktopReady} title={desktopReady ? 'Capture a playback device' : 'This FFmpeg build has no WASAPI loopback'} onClick={() => patch([...config.audio.sources, sourceTemplate('desktop')])}>+ Desktop</button>
      <button disabled title="Not available yet">+ Application</button>
      <button disabled title="Not available yet">+ Media</button>
    </div>
    {cap === null && !capError && <p class="muted small">Checking which audio captures this FFmpeg build can open.</p>}
    {capError && <p class="warning-text small">Could not read FFmpeg devices. {capError}</p>}
    {cap && !cap.ffmpegInstalled && <p class="warning-text small">FFmpeg is not installed or not on PATH. Install FFmpeg or set FFMPEG_PATH, then refresh devices.</p>}
    {cap?.ffmpegInstalled && !desktopReady && <p class="muted small">Desktop loopback needs WASAPI, and this FFmpeg build does not provide it. Microphones use the DirectShow devices below. Application and media audio are not available yet.</p>}
    {desktopReady && <p class="muted small">Application and media audio are not available yet. Choose a detected playback device for desktop audio.</p>}
    {runtime.audioNotices.map((notice, index) => <p class="warning-text small" key={`${index}-${notice}`}>{notice}</p>)}
    {config.audio.sources.length === 0 && <p class="empty">No audio sources. A broadcast can still run without audio.</p>}
    {config.audio.sources.map(source => {
      const available = audioKindAvailable(source.kind, desktopReady);
      const devices = source.kind === 'desktop' ? cap?.desktopAudioDevices ?? [] : cap?.audioDevices ?? [];
      const missing = available && devices.length > 0 && !!source.device && !devices.includes(source.device);
      const readout = meterReadout(runtime.audioLevels[source.id]);
      const gain = source.filters.find(isGainFilter);
      const stored = source.filters.filter(filter => !isGainFilter(filter));
      const setFilters = (filters: AudioSource['filters']) => update(source.id, { filters });
      return <div class="audio-source" key={source.id}>
        <div class="audio-row">
          <div><b>{source.name}</b><small class={missing || !available ? 'warning-text' : 'muted'}>{source.kind}{!available ? ' · not available yet' : missing ? ' · device unavailable' : ''}</small></div>
          {readout.width === null ? <span class="meter-na" title={readout.title}>{readout.text}</span> : <div class="meter-cell" title={readout.title}><div class="meter"><span style={{ width: readout.width }}/></div><span class="meter-readout">{readout.text}</span></div>}
          <label class="check"><input type="checkbox" checked={source.muted} disabled={!available} onChange={e => update(source.id, { muted: e.currentTarget.checked })}/> Mute</label>
          <label class="volume">Vol {source.volume.toFixed(2)}<input type="range" min="0" max="2" step="0.05" value={source.volume} disabled={!available} onInput={e => update(source.id, { volume: +e.currentTarget.value })}/></label>
          <label class="check"><input type="checkbox" checked={source.enabled} disabled={!available} onChange={e => update(source.id, { enabled: e.currentTarget.checked })}/> On</label>
          {available && cap === null && <span class="muted small">Checking devices…</span>}
          {available && cap && (devices.length ? <select value={source.device} onChange={e => update(source.id, { device: e.currentTarget.value })}><option value="">Choose device…</option>{devices.map(device => <option value={device} key={device}>{device}</option>)}{missing && <option value={source.device}>{source.device} (unavailable)</option>}</select> : <input placeholder="FFmpeg device name" value={source.device} onInput={e => update(source.id, { device: e.currentTarget.value })}/>)}
          <button class="ghost" onClick={() => patch(config.audio.sources.filter(item => item.id !== source.id))}>×</button>
        </div>
        {missing && <p class="warning-text small">Saved device "{source.device}" is not connected. Choose a detected device or reconnect this one. The saved name stays until you change it.</p>}
        {cap?.ffmpegInstalled && available && devices.length === 0 && <p class="muted small">No devices were listed for this source. Type the FFmpeg device name, or refresh after connecting it. Nothing is selected automatically.</p>}
        {!available && <p class="muted small">This source is not captured in this build. Its settings are kept.</p>}
        <div class="filters">
          <b>Filters</b>
          {gain ? <div class="filter-row">
            <span>Gain</span>
            <label><input type="checkbox" checked={gain.enabled} onChange={e => setFilters(source.filters.map(filter => isGainFilter(filter) ? { ...filter, enabled: e.currentTarget.checked } : filter))}/> Enabled</label>
            <label><input type="number" min="-30" max="30" step="0.1" value={gainDraft[gain.id] ?? gain.gainDb.toFixed(1)} onInput={e => {
              const value = e.currentTarget.value;
              const n = Number(value);
              if (!Number.isFinite(n)) { setGainDraft(draft => ({ ...draft, [gain.id]: value })); return; }
              const clamped = clampGainDb(n);
              setGainDraft(draft => ({ ...draft, [gain.id]: n < -30 || n > 30 ? clamped.toFixed(1) : value }));
              setFilters(source.filters.map(filter => isGainFilter(filter) ? { ...filter, gainDb: clamped } : filter));
            }} onBlur={() => setGainDraft(draft => { const next = { ...draft }; delete next[gain.id]; return next; })}/> dB</label>
            <button class="ghost" onClick={() => { setGainDraft(draft => { const next = { ...draft }; delete next[gain.id]; return next; }); setFilters(source.filters.filter(filter => !isGainFilter(filter))); }}>Remove</button>
          </div> : <button onClick={() => { if (source.filters.some(isGainFilter)) return; setFilters([...source.filters, { id: crypto.randomUUID(), type: 'gain', enabled: true, gainDb: 0 }]); }}>+ Gain</button>}
          <div class="source-add">{FUTURE_FILTERS.map(name => <button disabled title="Not available yet" key={name}>{name}</button>)}</div>
          {stored.length > 0 && <p class="warning-text small">Stored {stored.map(filter => filter.type).join(', ')} {stored.length === 1 ? 'is' : 'are'} kept and not applied. Only Gain runs in this build.</p>}
        </div>
      </div>;
    })}
    <div class="inline audio-encode"><label>Bitrate kbps<input type="number" value={config.audio.bitrateKbps} onInput={e => set({ ...config, audio: { ...config.audio, bitrateKbps: +e.currentTarget.value } })}/></label><label>Sample rate<select value={config.audio.sampleRate} onChange={e => set({ ...config, audio: { ...config.audio, sampleRate: Number(e.currentTarget.value) === 44100 ? 44100 : 48000 } })}><option value="48000">48000</option><option value="44100">44100</option></select></label></div>
  </section>;
}
