# LiteCast Broadcaster

LiteCast is the next-generation direction of Stream Command Center: a lightweight, highly customizable broadcaster that keeps the rich UI separate from the performance-critical media pipeline.

> Branch status: this is a functional **0.1 broadcaster MVP**, not yet a drop-in replacement for every OBS feature. Screen/window/device capture, recording and compatible RTMP multistreaming work through FFmpeg today. Scene composition, production OAuth flows and native GPU capture are explicitly staged in the roadmap rather than falsely marked complete.

## What works now

- Vite + Preact + Tailwind customizable control surface.
- Midnight/OLED/light themes and density setting.
- Local-only Node control plane bound to `127.0.0.1` with host/origin protections.
- Desktop, window and device capture through FFmpeg (platform-specific FFmpeg capture backends).
- NVIDIA NVENC, Intel QSV, AMD AMF and x264 encoder selection.
- 1080p60-style configurable resolution/FPS/bitrate/keyframe interval.
- Record to MKV or MP4.
- Multistream to Twitch/YouTube/Kick/Facebook/custom RTMP endpoints by **encoding once and using FFmpeg's tee muxer** for compatible outputs.
- Broadcast runtime status over Server-Sent Events.
- Unified-chat model with Twitch IRC WebSocket and YouTube live-chat adapters.
- Persistent local config with normalization and atomic-ish file writes.
- Native Rust `litecast-engine` wrapper that can validate/print/run the same style of FFmpeg broadcast config.
- Automated Node tests and cross-platform Rust CI.

## Requirements

- Node.js 22+
- FFmpeg available on PATH (or `FFMPEG_PATH` set)
- A supported capture environment. Windows is the first-class current target.
- Stream ingest URL + stream key from each destination.

## Run

```bash
npm install
npm start
```

Windows users can double-click `start-litecast.bat` after installing Node and FFmpeg.

Development:

```bash
npm run dev
npm run check
npm test
npm run build
npm run engine:check
npm run engine:build
```

The server opens at `http://127.0.0.1:8790`.

## First stream

1. Open **Settings** and choose the encoder that exists on your machine. NVIDIA users should start with NVENC.
2. In **Studio**, choose Desktop/Window/Device and enter an audio device name if you want microphone/desktop audio.
3. Open **Outputs** and add the RTMP/RTMPS ingest URL and stream key for each service.
4. Leave Recording enabled if you want a local copy.
5. Save, then press **Go Live**.
6. Watch the header/Performance panel for FPS, bitrate, speed and encoder process state.

To discover Windows FFmpeg devices, run:

```powershell
ffmpeg -list_devices true -f dshow -i dummy
```

## Multistream design

```text
capture -> scale/format -> one H.264 encode -> tee muxer
                                         |-> Twitch
                                         |-> YouTube
                                         |-> Kick
                                         |-> Facebook
                                         `-> local recording
```

A second encode is only appropriate when a destination actually needs a different codec/resolution/bitrate/layout.

## Security

- The server listens only on `127.0.0.1`.
- Cross-site state-changing requests are rejected by host/origin checks.
- `data/`, `.env`, recordings and build artifacts are gitignored.
- Stream keys and chat credentials stay local. The current MVP persists chat credentials in the local gitignored data directory; OS credential-vault integration is required before a public production release.

## Project map

- `server/` — lightweight local HTTP/SSE control plane, config, FFmpeg process, chat adapters.
- `web/` — Vite/Preact/Tailwind control UI.
- `shared/` — shared config/state types and defaults.
- `engine/` — native Rust process wrapper/migration boundary.
- `tests/` — config and single-encode/multistream regression tests.
- `docs/` — architecture, platform capabilities, performance budgets and roadmap.

See `docs/ARCHITECTURE.md`, `docs/PLATFORMS.md`, `docs/PERFORMANCE.md` and `docs/ROADMAP.md`.

## Why this is not Electron

The browser-based control panel is served locally and can be closed while the encoder keeps running. The broadcaster does not embed a permanent Chromium desktop shell just to draw its controls. Future browser sources will be isolated and loaded only when actually used.

## License

MIT.
