import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../server/config';
import { DEFAULT_CONFIG } from '../shared/defaults';

test('normalizer clamps dangerous numeric values',()=>{const c=normalize({video:{...DEFAULT_CONFIG.video,width:-1,height:99999,fps:0,bitrateKbps:999999,keyframeSeconds:0}});assert.equal(c.video.width,320);assert.equal(c.video.height,4320);assert.equal(c.video.fps,1);assert.equal(c.video.bitrateKbps,100000);assert.equal(c.video.keyframeSeconds,1);});

test('normalizer limits destinations',()=>{const c=normalize({destinations:Array.from({length:30},(_,i)=>({id:String(i),name:'x',platform:'custom',enabled:true,url:'rtmp://x/live',streamKey:'k'}))});assert.equal(c.destinations.length,12);});

test('normalizer only accepts RTMP and RTMPS destinations',()=>{const c=normalize({destinations:[{id:'a',name:'bad',platform:'custom',enabled:true,url:'https://example.com/upload',streamKey:'key\nwith-break'},{id:'b',name:'good',platform:'custom',enabled:true,url:'rtmps://live.example.com/app',streamKey:'abc'}]});assert.equal(c.destinations[0]!.url,'');assert.equal(c.destinations[0]!.streamKey,'keywith-break');assert.equal(c.destinations[1]!.url,'rtmps://live.example.com/app');});

test('normalizer keeps at least one scene and clamps source opacity',()=>{const c=normalize({scenes:[{id:'s',name:'S',sources:[{id:'t',name:'T',kind:'text',enabled:true,x:0,y:0,width:200,height:50,opacity:9,text:'x',fontSize:40,color:'#fff000'}]}],activeSceneId:'s'});assert.equal(c.scenes.length,1);assert.equal(c.activeSceneId,'s');assert.equal(c.scenes[0]!.sources[0]!.opacity,1);});
