import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import type { ViteDevServer } from 'vite';
import { DEFAULT_PORT } from '../shared/defaults';
import type { ChatConfig } from '../shared/types';
import { ConfigStore } from './config';
import { EventHub } from './events';
import { BroadcastEngine } from './ffmpeg';
import { ChatHub } from './chat';
import { body, guard, HttpError, json, staticFile } from './http';
import { readJson, writeJson } from './files';

const args=new Set(process.argv.slice(2)); const dev=args.has('--dev'); const port=Number(process.env.PORT)||DEFAULT_PORT; const host='127.0.0.1';
const root=fileURLToPath(new URL('..',import.meta.url)); const dist=join(root,'dist'); const data=process.env.LITECAST_DATA??join(root,'data');
if(!dev&&!existsSync(join(dist,'index.html'))){console.error('Run npm run build first.');process.exit(1);} const store=await ConfigStore.load(join(data,'config.json')); let chatConfig=await readJson<ChatConfig>(join(data,'chat.json'),{});
const events=new EventHub(); const engine=new BroadcastEngine(stats=>events.send('runtime',stats)); const chat=new ChatHub(message=>events.send('chat',message)); chat.apply(chatConfig);
const secure=guard(port); const server=createServer((req,res)=>handle(req,res).catch(err=>{if(err instanceof HttpError)return json(res,err.status,{error:err.message}); console.error(err);return json(res,500,{error:'Internal server error.'});}));
let vite:ViteDevServer|undefined; if(dev){const {createServer:createVite}=await import('vite');vite=await createVite({configFile:join(root,'vite.config.ts'),appType:'spa',server:{middlewareMode:true,ws:{server}}});}
async function handle(req:any,res:any){if(!secure.host(req))throw new HttpError(403,'Use the local LiteCast address.'); const url=new URL(req.url??'/',`http://${req.headers.host}`); if(url.pathname.startsWith('/api/'))return api(req,res,url); if(vite)return vite.middlewares(req,res,()=>json(res,404,{error:'Not found.'})); return staticFile(req,res,dist,url.pathname==='/'?'/index.html':url.pathname);}
async function api(req:any,res:any,url:URL){ if(req.method!=='GET'&&!secure.origin(req))throw new HttpError(403,'Cross-site write blocked.'); const route=`${req.method} ${url.pathname}`; switch(route){
case 'GET /api/state':return json(res,200,{config:store.get(),runtime:engine.snapshot(),chat:chat.list()});
case 'GET /api/events':events.connect(res); events.send('runtime',engine.snapshot()); return;
case 'PUT /api/config':{const saved=await store.save(await body(req));events.send('config',saved);return json(res,200,saved);}
case 'POST /api/broadcast/start':return json(res,200,await engine.start(store.get()));
case 'POST /api/broadcast/stop':return json(res,200,await engine.stop());
case 'GET /api/chat/config':return json(res,200,{twitch:{enabled:!!chatConfig.twitch?.enabled,nick:chatConfig.twitch?.nick??'',channel:chatConfig.twitch?.channel??'',oauthToken:''},youtube:{enabled:!!chatConfig.youtube?.enabled,liveChatId:chatConfig.youtube?.liveChatId??'',apiKey:''}});
case 'PUT /api/chat/config':{const incoming=await body(req) as ChatConfig; chatConfig={twitch:incoming.twitch?{...incoming.twitch,oauthToken:incoming.twitch.oauthToken||chatConfig.twitch?.oauthToken||''}:undefined,youtube:incoming.youtube?{...incoming.youtube,apiKey:incoming.youtube.apiKey||chatConfig.youtube?.apiKey||''}:undefined};await writeJson(join(data,'chat.json'),chatConfig);chat.apply(chatConfig);return json(res,200,{ok:true});}
case 'GET /api/health':return json(res,200,{ok:true,ffmpeg:process.env.FFMPEG_PATH||'ffmpeg'});
default:throw new HttpError(404,'Not found.');}}
server.listen(port,host,()=>{const url=`http://${host}:${port}`;console.log(`\nLiteCast is running at ${url}\n`);if(args.has('--open'))open(url);});
function open(url:string){const [cmd,a]=process.platform==='win32'?['explorer.exe',[url]]:process.platform==='darwin'?['open',[url]]:['xdg-open',[url]];spawn(cmd,a,{detached:true,stdio:'ignore'}).unref();}
function shutdown(){chat.stop();events.close();void engine.stop();void vite?.close();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),1500).unref();} process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
