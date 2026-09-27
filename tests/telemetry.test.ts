import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_RUNTIME } from '../shared/defaults';
import { consumeAudioMeters, consumeProgress, lineCarry } from '../server/telemetry';
import type { RuntimeStats } from '../shared/types';

const stats = (): RuntimeStats => ({ ...EMPTY_RUNTIME, audioLevels: {} });

test('progress parser records a measured drop count, including zero', () => {
  const runtime = stats();
  const carry = lineCarry();
  const first = consumeProgress(runtime, 'frame=10\nfps=60.00\nbitrate=4500.5kbits/s\nspeed=1.01x\n', carry);
  assert.equal(first.sawFrame, true);
  assert.equal(runtime.fps, 60);
  assert.equal(runtime.bitrateKbps, 4500.5);
  assert.equal(runtime.speed, 1.01);
  assert.equal(runtime.droppedFrames, null);
  consumeProgress(runtime, 'drop_frames=0\nprogress=continue\n', carry);
  assert.equal(runtime.droppedFrames, 0);
  consumeProgress(runtime, 'drop_frames=4\n', carry);
  assert.equal(runtime.droppedFrames, 4);
});

test('progress parser keeps a split drop_frames line until it is complete', () => {
  const runtime = stats();
  const carry = lineCarry();
  consumeProgress(runtime, 'drop_fra', carry);
  assert.equal(runtime.droppedFrames, null);
  consumeProgress(runtime, 'mes=7\n', carry);
  assert.equal(runtime.droppedFrames, 7);
});

test('audio meter parser attaches measurements to the printed source', () => {
  const levels = {};
  const carry = lineCarry();
  consumeAudioMeters(levels, 'lc.src=mic-1\nlavfi.astats.Overall.RMS_level=-18.5\n', carry);
  consumeAudioMeters(levels, 'lavfi.astats.Overall.Peak_level=-6.25\n', carry);
  assert.deepEqual(levels, { 'mic-1': { rmsDb: -18.5, peakDb: -6.25 } });
  consumeAudioMeters(levels, 'lc.src=mic-1\nlavfi.astats.Overall.RMS_level=-inf\n', carry);
  assert.equal(levels['mic-1'].rmsDb, null);
  assert.equal(levels['mic-1'].peakDb, -6.25);
});

test('audio meter parser keeps a real zero and tolerates log prefixes and split lines', () => {
  const levels: Record<string, { rmsDb: number | null; peakDb: number | null }> = {};
  const carry = lineCarry();
  consumeAudioMeters(levels, '[Parsed_ametadata_1 @ 0001] lc.src=mic\n[Parsed_ametadata_1 @ 0001] lavfi.astats.Overall.RMS_level=0\n', carry);
  assert.deepEqual(levels.mic, { rmsDb: 0, peakDb: null });
  consumeAudioMeters(levels, 'lc.src=mic\nlavfi.astats.Overall.RM', carry);
  consumeAudioMeters(levels, 'S_level=-12.5\nlavfi.astats.Overall.Peak_level=-3\n', carry);
  assert.deepEqual(levels.mic, { rmsDb: -12.5, peakDb: -3 });
});
