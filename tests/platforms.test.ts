import test from 'node:test';
import assert from 'node:assert/strict';
import { audioKindAvailable, PLATFORM_CAPABILITIES, platformsWith } from '../shared/platforms';
import { capturedOutput } from '../server/system';

test('platform capabilities match the implemented adapters', () => {
  assert.deepEqual(platformsWith('readChat'), ['twitch', 'youtube']);
  assert.deepEqual(platformsWith('sendChat'), []);
  assert.deepEqual(platformsWith('moderation'), []);
  assert.deepEqual(platformsWith('oauth'), []);
  for (const caps of Object.values(PLATFORM_CAPABILITIES)) assert.equal(caps.rtmpOutput, true);
  assert.equal(PLATFORM_CAPABILITIES.kick.readChat, false);
  assert.equal(PLATFORM_CAPABILITIES.facebook.readChat, false);
});

test('a missing FFmpeg binary is not treated as an empty successful probe', () => {
  assert.equal(capturedOutput({ code: 'ENOENT', stdout: '', stderr: '' }), undefined);
  assert.deepEqual(capturedOutput({ code: '1', stdout: '', stderr: 'DirectShow audio devices' }), { stdout: '', stderr: 'DirectShow audio devices' });
});

test('only microphone and probed desktop audio can be captured', () => {
  assert.equal(audioKindAvailable('microphone', false), true);
  assert.equal(audioKindAvailable('desktop', false), false);
  assert.equal(audioKindAvailable('desktop', true), true);
  assert.equal(audioKindAvailable('application', true), false);
  assert.equal(audioKindAvailable('media', true), false);
});
