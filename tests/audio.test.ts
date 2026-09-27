import test from 'node:test';
import assert from 'node:assert/strict';
import { audioGraph, planAudioCapture } from '../server/audio';
import { buildArgs } from '../server/ffmpeg';
import { cloneConfig, DEFAULT_CONFIG } from '../shared/defaults';
import type { AudioSource } from '../shared/types';

const mic = (patch: Partial<AudioSource> = {}): AudioSource => ({
  id: 'mic', name: 'Mic', kind: 'microphone', enabled: true, muted: false, volume: 1, device: 'Chat Mic', filters: [], ...patch,
});

test('disabled gain is left out and each source keeps its own enabled gain', () => {
  const graph = audioGraph([
    mic({ filters: [{ id: 'off', type: 'gain', enabled: false, gainDb: 12 }, { id: 'gate', type: 'gate', enabled: true }] }),
    mic({ id: 'desk', kind: 'desktop', device: 'Speakers', volume: 0.5, muted: true, filters: [{ id: 'hot', type: 'gain', enabled: true, gainDb: 6.04 }] }),
  ], 1, 48000, 'win32').graph;
  const first = graph.split(';').find(part => part.startsWith('[1:a]'))!;
  const second = graph.split(';').find(part => part.startsWith('[2:a]'))!;
  assert.equal(first.includes('dB'), false);
  assert.equal(first.includes('gate'), false);
  assert.ok(second.indexOf('volume=6.0dB') < second.indexOf('volume=0.500') && second.indexOf('volume=0.500') < second.indexOf('volume=0,asplit'));
  assert.equal(second.includes('volume=12'), false);
});

test('the first gain is the one that reaches the graph', () => {
  const graph = audioGraph([mic({ filters: [{ id: 'a', type: 'gain', enabled: true, gainDb: 3 }, { id: 'b', type: 'gain', enabled: true, gainDb: 9 }] })], 1, 48000, 'win32').graph;
  assert.match(graph, /volume=3\.0dB,volume=1\.000,asplit/);
  assert.equal(graph.includes('volume=9.0dB'), false);
});

test('unity gain stays in the chain when it is enabled', () => {
  const graph = audioGraph([mic({ filters: [{ id: 'g', type: 'gain', enabled: true, gainDb: 0 }] })], 1, 48000, 'win32').graph;
  assert.match(graph, /volume=0\.0dB,volume=1\.000,asplit/);
});

test('a missing enumerated device is skipped and the saved name is kept', () => {
  const sources = [mic({ device: 'Gone Mic' }), mic({ id: 'live', device: 'Chat Mic', filters: [{ id: 'g', type: 'gain', enabled: true, gainDb: -3 }] })];
  const plan = planAudioCapture(sources, 'win32', { audioDevices: ['Chat Mic'], desktopAudioAvailable: false, desktopAudioDevices: [] });
  assert.equal(sources[0]!.enabled, true);
  assert.equal(plan.sources[0]!.enabled, false);
  assert.equal(plan.sources[0]!.device, 'Gone Mic');
  assert.match(plan.notices.join('\n'), /Gone Mic/);
  const config = cloneConfig(DEFAULT_CONFIG);
  config.recording.enabled = true;
  config.audio.sources = plan.sources;
  const args = buildArgs(config, 'win32');
  assert.equal(args.includes('Gone Mic'), false);
  assert.ok(args.includes('audio=Chat Mic'));
  assert.equal(args.includes('wasapi'), false);
  const graph = args[args.indexOf('-filter_complex') + 1]!;
  assert.match(graph, /volume=-3\.0dB/);
  assert.equal(graph.includes('amix'), false);
});

test('an empty device list does not discard a typed microphone', () => {
  const plan = planAudioCapture([mic({ device: 'Manual' })], 'win32', { audioDevices: [], desktopAudioAvailable: false, desktopAudioDevices: [] });
  assert.equal(plan.sources[0]!.enabled, true);
  assert.equal(plan.notices.length, 0);
});

test('desktop audio without WASAPI does not enter the Windows graph', () => {
  const plan = planAudioCapture([
    mic(),
    mic({ id: 'desk', name: 'Desktop', kind: 'desktop', device: 'Speakers' }),
  ], 'win32', { audioDevices: [], desktopAudioAvailable: false, desktopAudioDevices: [] });
  assert.equal(plan.sources[1]!.enabled, false);
  assert.equal(plan.sources[1]!.device, 'Speakers');
  assert.match(plan.notices.join('\n'), /WASAPI/);
  const config = cloneConfig(DEFAULT_CONFIG);
  config.destinations = [{ id: '1', name: 'A', platform: 'custom', enabled: true, url: 'rtmp://a/live', streamKey: 'k' }];
  config.audio.sources = plan.sources;
  const args = buildArgs(config, 'win32');
  assert.equal(args.includes('wasapi'), false);
  assert.ok(args.includes('audio=Chat Mic'));
});

test('graph clamps a gain value that bypassed normalization', () => {
  const graph = audioGraph([mic({ filters: [{ id: 'g', type: 'gain', enabled: true, gainDb: 80 }] })], 1, 48000, 'win32').graph;
  assert.match(graph, /volume=30\.0dB,volume=1\.000,asplit/);
  assert.equal(graph.includes('volume=80'), false);
});

test('application audio is reported and stays out of the capture graph', () => {
  const plan = planAudioCapture([mic({ id: 'app', name: 'Discord', kind: 'application', device: 'Discord' })], 'win32', { audioDevices: ['Chat Mic'], desktopAudioAvailable: false, desktopAudioDevices: [] });
  assert.equal(plan.sources[0]!.enabled, true);
  assert.equal(plan.sources[0]!.device, 'Discord');
  assert.match(plan.notices[0] ?? '', /application/);
  const config = cloneConfig(DEFAULT_CONFIG);
  config.destinations = [{ id: '1', name: 'A', platform: 'custom', enabled: true, url: 'rtmp://a/live', streamKey: 'k' }];
  config.audio.sources = plan.sources;
  assert.equal(buildArgs(config, 'win32').includes('Discord'), false);
});

test('linux desktop audio stays available when the device list is empty', () => {
  const plan = planAudioCapture([mic({ kind: 'desktop', device: 'alsa_output.monitor' })], 'linux', { audioDevices: [], desktopAudioAvailable: true, desktopAudioDevices: [] });
  assert.equal(plan.sources[0]!.enabled, true);
  assert.equal(plan.notices.length, 0);
});
