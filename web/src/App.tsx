import { useEffect, useState } from 'preact/hooks';
import { Activity, MessageSquare, Mic, Monitor, Radio, SlidersHorizontal } from 'lucide-preact';
import type { AppState, BroadcastConfig } from '../../shared/types';
import { api } from './api';
import { StudioPanel } from './components/StudioPanel';
import { OutputsPanel } from './components/OutputsPanel';
import { AudioPanel } from './components/AudioPanel';
import { ChatPanel } from './components/ChatPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { StatsPanel } from './components/StatsPanel';

const fmtTime = (ms: number | null) => ms ? new Date(Date.now() - ms).toISOString().slice(11, 19) : '00:00:00';
const metric = (value: number | null, suffix: string) => value === null ? '—' : `${Math.round(value)} ${suffix}`;

export function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [draft, setDraft] = useState<BroadcastConfig | null>(null);
  const [tab, setTab] = useState('studio');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.state().then(s => { setState(s); setDraft(structuredClone(s.config)); }).catch(e => setError(e.message));
    const es = new EventSource('/api/events');
    es.addEventListener('runtime', e => setState(s => s ? { ...s, runtime: JSON.parse((e as MessageEvent).data) } : s));
    es.addEventListener('config', e => setState(s => s ? { ...s, config: JSON.parse((e as MessageEvent).data) } : s));
    es.addEventListener('chat', e => setState(s => s ? { ...s, chat: [...s.chat.slice(-299), JSON.parse((e as MessageEvent).data)] } : s));
    return () => es.close();
  }, []);
  if (!state || !draft) return <div class="boot">{error || 'Starting LiteCast…'}</div>;
  const live = state.runtime.state === 'live' || state.runtime.state === 'starting';
  const dirty = JSON.stringify(draft) !== JSON.stringify(state.config);
  const save = async () => { const c = await api.save(draft); setState(s => s && ({ ...s, config: c })); setDraft(structuredClone(c)); return c; };
  const applyLive = async () => { setBusy(true); try { await save(); await api.restart(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const toggle = async () => { setBusy(true); try { if (live) await api.stop(); else { if (dirty) await save(); await api.start(); } } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const streams = draft.destinations.filter(d => d.enabled && d.url && d.streamKey).length;
  const tabs = [['studio', Monitor, 'Studio'], ['audio', Mic, 'Audio'], ['outputs', Radio, 'Outputs'], ['chat', MessageSquare, 'Unified Chat'], ['settings', SlidersHorizontal, 'Settings'], ['stats', Activity, 'Performance']] as const;
  return <div class={`app theme-${draft.ui.theme} density-${draft.ui.density}`}>
    <header>
      <div class="brand"><Radio/> <b>LiteCast</b><span>Broadcaster</span></div>
      <div class="runtime">
        <span class={`intent ${streams ? 'on' : ''}`}>{streams ? `Stream ${streams}` : 'Stream off'}</span>
        <span class={`intent ${draft.recording.enabled ? 'on' : ''}`}>{draft.recording.enabled ? `Record ${draft.recording.format.toUpperCase()}` : 'Record off'}</span>
        <span class="live-stats"><span class={`dot ${state.runtime.state}`}/>{state.runtime.state.toUpperCase()} · {fmtTime(state.runtime.startedAt)} · {metric(state.runtime.fps, 'FPS')} · {metric(state.runtime.bitrateKbps, 'kbps')}</span>
      </div>
      <button class="secondary" disabled={!dirty || busy} onClick={() => save().catch(e => setError(e.message))}>Save</button>
      {live && dirty && <button class="warning" disabled={busy} onClick={applyLive}>Apply live</button>}
      <button class={live ? 'danger' : 'live'} disabled={busy || state.runtime.state === 'stopping'} onClick={toggle}>{busy ? 'Working…' : live ? 'Stop' : 'Go Live'}</button>
    </header>
    <nav>{tabs.map(([id, Icon, label]) => <button class={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon size={18}/>{label}</button>)}</nav>
    <main>
      {live && dirty && <div class="notice">You changed the active media graph while live. Save keeps it for next start; <b>Apply live</b> performs a controlled encoder restart so the new scene graph takes effect now.</div>}
      {tab === 'studio' && <StudioPanel config={draft} set={setDraft}/>}
      {tab === 'audio' && <AudioPanel config={draft} runtime={state.runtime} set={setDraft}/>}
      {tab === 'outputs' && <OutputsPanel config={draft} set={setDraft}/>}
      {tab === 'chat' && <ChatPanel messages={state.chat}/>}
      {tab === 'settings' && <SettingsPanel config={draft} set={setDraft}/>}
      {tab === 'stats' && <StatsPanel runtime={state.runtime}/>}
    </main>
    {error && <div class="toast" onClick={() => setError('')}>{error}</div>}
  </div>;
}
