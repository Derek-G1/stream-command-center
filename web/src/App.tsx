import { useEffect, useState } from 'preact/hooks';
import { Activity, MessageSquare, Monitor, Radio, SlidersHorizontal } from 'lucide-preact';
import type { AppState, BroadcastConfig } from '../../shared/types';
import { api } from './api';
import { StudioPanel } from './components/StudioPanel';
import { OutputsPanel } from './components/OutputsPanel';
import { ChatPanel } from './components/ChatPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { StatsPanel } from './components/StatsPanel';

const fmtTime=(ms:number|null)=>ms?new Date(Date.now()-ms).toISOString().slice(11,19):'00:00:00';
export function App(){const[state,setState]=useState<AppState|null>(null);const[draft,setDraft]=useState<BroadcastConfig|null>(null);const[tab,setTab]=useState('studio');const[error,setError]=useState('');
useEffect(()=>{api.state().then(s=>{setState(s);setDraft(structuredClone(s.config));}).catch(e=>setError(e.message));const es=new EventSource('/api/events');es.addEventListener('runtime',e=>setState(s=>s?{...s,runtime:JSON.parse((e as MessageEvent).data)}:s));es.addEventListener('config',e=>setState(s=>s?{...s,config:JSON.parse((e as MessageEvent).data)}:s));es.addEventListener('chat',e=>setState(s=>s?{...s,chat:[...s.chat.slice(-299),JSON.parse((e as MessageEvent).data)]}:s));return()=>es.close();},[]);
if(!state||!draft)return <div class="boot">{error||'Starting LiteCast…'}</div>;const live=state.runtime.state==='live'||state.runtime.state==='starting';const dirty=JSON.stringify(draft)!==JSON.stringify(state.config);
const save=async()=>{try{const c=await api.save(draft);setState(s=>s&&({...s,config:c}));setDraft(structuredClone(c));}catch(e){setError((e as Error).message)}};
return <div class={`app theme-${draft.ui.theme} density-${draft.ui.density}`}><header><div class="brand"><Radio/> <b>LiteCast</b><span>Broadcaster</span></div><div class="runtime"><span class={`dot ${state.runtime.state}`}/>{state.runtime.state.toUpperCase()} · {fmtTime(state.runtime.startedAt)} · {Math.round(state.runtime.fps)} FPS · {Math.round(state.runtime.bitrateKbps)} kbps</div><button class="secondary" disabled={!dirty} onClick={save}>Save</button><button class={live?'danger':'live'} onClick={()=>live?api.stop():api.start()}>{live?'Stop':'Go Live'}</button></header><nav>{[['studio',Monitor,'Studio'],['outputs',Radio,'Outputs'],['chat',MessageSquare,'Unified Chat'],['settings',SlidersHorizontal,'Settings'],['stats',Activity,'Performance']].map(([id,Icon,label]:any)=><button class={tab===id?'active':''} onClick={()=>setTab(id)}><Icon size={18}/>{label}</button>)}</nav><main>{live&&dirty&&<div class="notice">Source/output changes are saved now but the current FFmpeg process keeps its existing graph until you stop and start the broadcast.</div>}{tab==='studio'&&<StudioPanel config={draft} set={setDraft}/>} {tab==='outputs'&&<OutputsPanel config={draft} set={setDraft}/>} {tab==='chat'&&<ChatPanel messages={state.chat}/>} {tab==='settings'&&<SettingsPanel config={draft} set={setDraft}/>} {tab==='stats'&&<StatsPanel runtime={state.runtime}/>}</main>{error&&<div class="toast" onClick={()=>setError('')}>{error}</div>}</div>}
