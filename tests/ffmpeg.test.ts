import test from 'node:test';
import assert from 'node:assert/strict';
import { buildArgs } from '../server/ffmpeg';
import { cloneConfig, DEFAULT_CONFIG } from '../shared/defaults';

test('multistream uses one encoder and tee fan-out',()=>{const c=cloneConfig(DEFAULT_CONFIG);c.recording.enabled=false;c.destinations=[{id:'1',name:'A',platform:'twitch',enabled:true,url:'rtmp://a/live',streamKey:'one'},{id:'2',name:'B',platform:'youtube',enabled:true,url:'rtmp://b/live',streamKey:'two'}];const args=buildArgs(c);assert.equal(args.filter(x=>x==='h264_nvenc').length,1);assert.ok(args.includes('tee'));const tee=args.at(-1)!;assert.match(tee,/rtmp:\/\/a\/live\/one/);assert.match(tee,/rtmp:\/\/b\/live\/two/);});

test('scene text source is composed into filter graph',()=>{const c=cloneConfig(DEFAULT_CONFIG);c.scenes[0]!.sources=[{id:'txt',name:'Title',kind:'text',enabled:true,x:40,y:50,width:400,height:100,opacity:1,text:'Hello',fontSize:48,color:'#ffffff'}];const args=buildArgs(c);const graph=args[args.indexOf('-filter_complex')+1]!;assert.match(graph,/drawtext/);assert.match(graph,/Hello/);assert.ok(args.includes('[base1]'));});

test('camera overlay EOF does not stop the base program',()=>{const c=cloneConfig(DEFAULT_CONFIG);c.scenes[0]!.sources=[{id:'cam',name:'Camera',kind:'camera',enabled:true,x:10,y:10,width:640,height:360,opacity:.9,device:'Camera 1'}];const args=buildArgs(c);const graph=args[args.indexOf('-filter_complex')+1]!;assert.match(graph,/overlay=10:10:eof_action=pass:shortest=0/);});
