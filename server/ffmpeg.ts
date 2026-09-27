import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { BroadcastConfig, RuntimeStats, SceneSource } from '../shared/types';
import { EMPTY_RUNTIME } from '../shared/defaults';

type Update = (stats: RuntimeStats) => void;
export class BroadcastEngine {
  private child: ChildProcessWithoutNullStreams | null = null;
  private stats: RuntimeStats = { ...EMPTY_RUNTIME };
  private exitWaiters = new Set<() => void>();
  constructor(private update: Update) {}
  snapshot(){return this.stats;}
  async start(config:BroadcastConfig){
    if(this.child)throw new Error('Broadcast is already running.');
    const enabled=config.destinations.filter(d=>d.enabled&&d.url&&d.streamKey);
    if(enabled.length===0&&!config.recording.enabled)throw new Error('Enable at least one stream destination or recording.');
    if(config.recording.enabled)await mkdir(resolve(config.recording.directory),{recursive:true});
    const args=buildArgs(config);this.set({...EMPTY_RUNTIME,state:'starting',startedAt:Date.now()});
    const child=spawn(process.env.FFMPEG_PATH||'ffmpeg',args,{windowsHide:true});this.child=child;this.stats.pid=child.pid??null;this.emit();let stderr='';
    child.stderr.setEncoding('utf8');child.stderr.on('data',(chunk:string)=>{stderr=(stderr+chunk).slice(-12000);parseProgress(chunk,this.stats);if(this.stats.state==='starting'&&/frame=\s*\d+/.test(chunk))this.stats.state='live';this.emit();});
    child.on('error',err=>{if(this.child===child)this.child=null;this.set({...this.stats,state:'error',lastError:err.message,pid:null});this.resolveExited();});
    child.on('exit',(code,signal)=>{const wasStopping=this.stats.state==='stopping';if(this.child===child)this.child=null;if(wasStopping||code===0)this.set({...EMPTY_RUNTIME});else this.set({...this.stats,state:'error',pid:null,lastError:`FFmpeg exited with code ${code??'null'}${signal?` (${signal})`:''}. ${tailError(stderr)}`});this.resolveExited();});
    return this.snapshot();
  }
  async stop(){
    const child=this.child;if(!child)return this.snapshot();this.stats.state='stopping';this.emit();
    const exited=this.waitForExit(7000);child.stdin.write('q\n');setTimeout(()=>{if(this.child===child)child.kill('SIGTERM');},4500).unref();await exited;return this.snapshot();
  }
  async restart(config:BroadcastConfig){if(this.child)await this.stop();return this.start(config);}
  private waitForExit(timeout:number){return new Promise<void>(resolve=>{let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);this.exitWaiters.delete(finish);resolve();};const timer=setTimeout(finish,timeout);timer.unref();this.exitWaiters.add(finish);});}
  private resolveExited(){for(const done of [...this.exitWaiters])done();}
  private set(next:RuntimeStats){this.stats=next;this.emit();} private emit(){this.update({...this.stats});}
}

function encoderArgs(c:BroadcastConfig):string[]{const {encoder,preset,bitrateKbps}=c.video;if(encoder==='nvenc')return['-c:v','h264_nvenc','-preset',preset==='performance'?'p1':preset==='quality'?'p6':'p4','-b:v',`${bitrateKbps}k`,'-maxrate',`${bitrateKbps}k`,'-bufsize',`${bitrateKbps*2}k`];if(encoder==='qsv')return['-c:v','h264_qsv','-preset',preset==='performance'?'veryfast':preset==='quality'?'slow':'medium','-b:v',`${bitrateKbps}k`];if(encoder==='amf')return['-c:v','h264_amf','-quality',preset==='performance'?'speed':preset==='quality'?'quality':'balanced','-b:v',`${bitrateKbps}k`];return['-c:v','libx264','-preset',preset==='performance'?'veryfast':preset==='quality'?'slow':'medium','-b:v',`${bitrateKbps}k`,'-maxrate',`${bitrateKbps}k`,'-bufsize',`${bitrateKbps*2}k`];}
function baseCapture(c:BroadcastConfig):string[]{const fps=String(c.video.fps);if(process.platform==='win32'){if(c.capture.kind==='window'&&c.capture.windowTitle)return['-f','gdigrab','-framerate',fps,'-i',`title=${c.capture.windowTitle}`];if(c.capture.kind==='device'&&c.capture.device)return['-f','dshow','-framerate',fps,'-i',`video=${c.capture.device}`];return['-f','gdigrab','-framerate',fps,'-i','desktop'];}if(process.platform==='darwin')return['-f','avfoundation','-framerate',fps,'-i',c.capture.device||'1:none'];return['-f','x11grab','-framerate',fps,'-video_size',`${c.video.width}x${c.video.height}`,'-i',c.capture.display||':0.0'];}
function cameraInput(device:string,fps:number):string[]{if(process.platform==='win32')return['-f','dshow','-framerate',String(fps),'-i',`video=${device}`];if(process.platform==='darwin')return['-f','avfoundation','-framerate',String(fps),'-i',`${device}:none`];return['-f','v4l2','-framerate',String(fps),'-i',device];}
function audioInput(c:BroadcastConfig):string[]{if(!c.audio.enabled||!c.audio.device)return[];if(process.platform==='win32')return['-f','dshow','-i',`audio=${c.audio.device}`];if(process.platform==='darwin')return['-f','avfoundation','-i',`none:${c.audio.device}`];return['-f','pulse','-i',c.audio.device];}
const esc=(s:string)=>s.replace(/\\/g,'\\\\').replace(/:/g,'\\:').replace(/'/g,"\\'").replace(/%/g,'\\%');
function activeSources(c:BroadcastConfig){return c.scenes.find(s=>s.id===c.activeSceneId)?.sources.filter(s=>s.enabled)??[];}
function sourceInputs(c:BroadcastConfig,sources:SceneSource[],startIndex:number){const args:string[]=[];const indexes=new Map<string,number>();let index=startIndex;for(const s of sources){if(s.kind==='camera'&&s.device){args.push(...cameraInput(s.device,c.video.fps));indexes.set(s.id,index++);}else if(s.kind==='image'&&s.path){args.push('-loop','1','-framerate',String(c.video.fps),'-i',s.path);indexes.set(s.id,index++);}}return{args,indexes};}
function filterGraph(c:BroadcastConfig,sources:SceneSource[],indexes:Map<string,number>){const f:string[]=[];let current='base0';f.push(`[0:v]scale=${c.video.width}:${c.video.height}:force_original_aspect_ratio=decrease,pad=${c.video.width}:${c.video.height}:(ow-iw)/2:(oh-ih)/2[${current}]`);let n=0;for(const s of sources){const next=`base${++n}`;if((s.kind==='camera'||s.kind==='image')&&indexes.has(s.id)){const i=indexes.get(s.id)!;const ov=`ov${n}`;f.push(`[${i}:v]scale=${s.width}:${s.height},format=rgba,colorchannelmixer=aa=${s.opacity}[${ov}]`);f.push(`[${current}][${ov}]overlay=${s.x}:${s.y}:shortest=1[${next}]`);current=next;}else if(s.kind==='text'&&s.text){f.push(`[${current}]drawtext=text='${esc(s.text)}':x=${s.x}:y=${s.y}:fontsize=${s.fontSize}:fontcolor=${s.color}@${s.opacity}[${next}]`);current=next;}}return{graph:f.join(';'),output:current};}
export function buildArgs(c:BroadcastConfig):string[]{const out:string[]=['-hide_banner','-loglevel','info','-stats',...baseCapture(c)];let inputIndex=1;let audioIndex:number|null=null;if(c.audio.enabled&&c.audio.device){out.push(...audioInput(c));audioIndex=inputIndex++;}const sources=activeSources(c);const extra=sourceInputs(c,sources,inputIndex);out.push(...extra.args);const fg=filterGraph(c,sources,extra.indexes);out.push('-filter_complex',fg.graph,'-map',`[${fg.output}]`);if(audioIndex!==null)out.push('-map',`${audioIndex}:a`);out.push('-r',String(c.video.fps),...encoderArgs(c),'-g',String(c.video.fps*c.video.keyframeSeconds),'-pix_fmt','yuv420p');if(audioIndex!==null)out.push('-af',`volume=${c.audio.volume}`,'-c:a','aac','-b:a',`${c.audio.bitrateKbps}k`,'-ar',String(c.audio.sampleRate));else out.push('-an');const sinks:string[]=[];for(const d of c.destinations.filter(d=>d.enabled&&d.url&&d.streamKey))sinks.push(`[f=flv:onfail=ignore]${escapeTee(d.url.replace(/\/$/,'')+'/'+d.streamKey)}`);if(c.recording.enabled){const stamp=new Date().toISOString().replace(/[:.]/g,'-');const file=join(resolve(c.recording.directory),`litecast-${stamp}.${c.recording.format}`);sinks.push(`[f=${c.recording.format==='mkv'?'matroska':'mp4'}:onfail=ignore]${escapeTee(file)}`);}out.push('-f','tee',sinks.join('|'));return out;}
const escapeTee=(s:string)=>s.replace(/\\/g,'/').replace(/\|/g,'\\|');
function parseProgress(text:string,stats:RuntimeStats){const frame=/frame=\s*(\d+)/.exec(text);const fps=/fps=\s*([\d.]+)/.exec(text);const bitrate=/bitrate=\s*([\d.]+)kbits/.exec(text);const speed=/speed=\s*([\d.]+)x/.exec(text);if(fps)stats.fps=Number(fps[1]);else if(frame&&stats.startedAt)stats.fps=Number(frame[1])/Math.max(1,(Date.now()-stats.startedAt)/1000);if(bitrate)stats.bitrateKbps=Number(bitrate[1]);if(speed)stats.speed=Number(speed[1]);} function tailError(stderr:string){return stderr.split(/\r?\n/).filter(Boolean).slice(-3).join(' ').slice(0,1000);}
