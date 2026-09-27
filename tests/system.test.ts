import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDshowDevices } from '../server/system';

test('FFmpeg 9 DirectShow lines identify audio and video without alternative names', () => {
  const stderr = [
    '[in#0 @ 0001] "Camera (NVIDIA Broadcast)" (video)',
    '[in#0 @ 0001]   Alternative name "@device_sw_{860BB310-5D01-11D0-BD3B-00A0C911CE86}\\{7BBFF097-B3FB-4B26-B685-7A998DE7CEAC}"',
    '[in#0 @ 0001] "Chat Mic (2- TC-HELICON GoXLR)" (audio)',
    '[in#0 @ 0001]   Alternative name "@device_cm_{33D9A762-90C8-11D0-BD43-00A0C911CE86}\\wave_{935E5394-BF56-4F05-84B1-69ABD4210F23}"',
    '[in#0 @ 0001] "Sample (2- TC-HELICON GoXLR)" (audio)',
  ].join('\n');
  assert.deepEqual(parseDshowDevices(stderr), {
    video: ['Camera (NVIDIA Broadcast)'],
    audio: ['Chat Mic (2- TC-HELICON GoXLR)', 'Sample (2- TC-HELICON GoXLR)'],
  });
});

test('older DirectShow section headers still parse', () => {
  const stderr = [
    '[dshow @ 1] DirectShow video devices (some may be both video and audio devices)',
    '[dshow @ 1]  "Integrated Camera"',
    '[dshow @ 1]     Alternative name "@device_pnp_camera"',
    '[dshow @ 1] DirectShow audio devices',
    '[dshow @ 1]  "Microphone (Realtek)"',
    '[dshow @ 1]     Alternative name "@device_cm_mic"',
  ].join('\n');
  assert.deepEqual(parseDshowDevices(stderr), {
    video: ['Integrated Camera'],
    audio: ['Microphone (Realtek)'],
  });
});
