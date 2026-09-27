# LiteCast Broadcaster

LiteCast is the next-generation direction of Stream Command Center: a lightweight, highly customizable broadcaster that keeps the rich control UI separate from the performance-critical media pipeline.

> **Current status:** functional **0.1 broadcaster MVP**. It can capture, compose scenes, record, multistream one compatible encode to multiple RTMP/RTMPS services, and aggregate Twitch/YouTube chat. It is **not yet a complete OBS replacement**: the long-term native GPU compositor, production OAuth/credential-vault flows, advanced audio mixer, transitions, and Kick/Facebook chat event integrations remain release-roadmap work.

## What works now

### Broadcasting

- Desktop, window and capture-device input through FFmpeg.
- Scene collection with an active scene.
- Camera, image and text overlay sources with position, size and opacity controls.
- Static scene-layout preview in the Studio UI. It is not a decoded Preview/Program output, and it does not have a separate preview frame rate yet.
- Controlled **Apply live** restart when the active FFmpeg media graph changes.
- NVIDIA NVENC, Intel QSV, AMD AMF and software x264 encoder profiles.
- Configurable resolution, FPS, bitrate and keyframe interval.
- Optional local MKV or MP4 recording. Recording is off until you enable it.
- Multistream to Twitch, YouTube, Kick, Facebook or any custom RTMP/RTMPS target by **encoding once and using FFmpeg's tee muxer** for compatible destinations.
- A failed tee destination uses `onfail=ignore`, so one output does not intentionally take down every other output.

### Control UI

- Vite + Preact + Tailwind control surface; no Electron shell.
- Midnight, OLED and Light themes plus compact/comfortable density.
- 1080p/720p quality presets.
- FFmpeg capability probe for NVENC/QSV/AMF/x264 availability.
- Best-effort FFmpeg video/audio device discovery on Windows and macOS, with manual device strings still supported.
- Import/export of broadcaster configuration.
- Runtime status over Server-Sent Events: process state, PID, FPS, bitrate, encode speed, and FFmpeg `drop_frames` once a progress sample arrives. Unmeasured stats stay blank instead of showing a fake zero.
- Multiple microphone inputs, plus desktop loopback where the capture backend supports it, with mute, volume, and levels measured from the running encode. Application audio, media-source audio, and audio filters are not applied yet.
- Performance/error panel.

### Multiplatform chat

- Unified private streamer chat model.
- Twitch IRC-over-WebSocket adapter with automatic reconnect.
- YouTube live-chat adapter with page-token/message-ID deduplication.
- Framework-free viewer chat overlay with `?platform=twitch`, `?platform=youtube`, or `?platform=all` filtering.
- Separate chat connection settings so credentials never have to be embedded in scene files.

### Reliability / engineering

- Local-only control plane bound to `127.0.0.1`.
- Host/origin protections against cross-site writes and basic DNS-rebinding paths.
- Persistent normalized configuration with limits on scenes, sources and outputs.
- RTMP destinations restricted to `rtmp://` or `rtmps://`.
- Atomic-style JSON writes using temp files + rename.
- Rust `litecast-engine` migration boundary. The control plane still launches FFmpeg itself; the Rust binary is not the production mixer or compositor.
- Automated Node tests and cross-platform Rust CI.
- CI currently checks TypeScript, tests, production Vite build, and Rust on Windows/macOS/Linux.

## Requirements

- Node.js 22+
- FFmpeg available on `PATH` (or set `FFMPEG_PATH`)
- A supported capture environment; Windows is the first-class current target
- Stream ingest URL + stream key for each streaming destination
- Platform credentials only when you enable that platform's chat adapter

## Run

```bash
npm ci
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

The control surface opens at `http://127.0.0.1:8790`.

## First stream

1. Open **Settings**. LiteCast probes FFmpeg and marks hardware encoders it can see.
2. Choose a video preset or set resolution/FPS/bitrate manually.
3. Select Desktop, Window, or Device for the base capture.
4. Open **Audio** and add a microphone or, where available, desktop audio. Leave this empty for a silent broadcast.
5. Open **Studio**. Add scenes plus optional Camera, Image, and Text overlays.
6. Open **Outputs**. Add the RTMP/RTMPS ingest URL and stream key for each service. The platform name labels the ingest; it does not connect an account.
7. Enable **Recording** only if you want a local file. The header shows Stream and Record before you start.
8. **Save**, then press **Go Live**.
9. If you alter the media graph while live, use **Apply live** for a controlled restart with the new graph.
10. Watch **Performance** for FPS, bitrate, speed, measured dropped frames, and encoder errors.

## Multistream design

```text
base capture + scene overlays + audio
                 |
                 v
          FFmpeg composition
                 |
          one H.264/AAC encode
                 |
              tee muxer
        /        |        \
   Twitch     YouTube     Kick ...
                 |
           local recording
```

A second encode should only be introduced when a destination genuinely requires a different codec, bitrate, resolution, orientation or composition.

## Chat overlay

Examples:

```text
http://127.0.0.1:8790/chat-overlay/?platform=twitch
http://127.0.0.1:8790/chat-overlay/?platform=youtube
http://127.0.0.1:8790/chat-overlay/?platform=all
```

The combined chat is intended primarily for the private streamer dashboard. When a platform's simulcast policy restricts showing other platforms' activity on its output, use the per-platform overlay instead.

## Security

- The HTTP server listens only on `127.0.0.1`.
- Cross-site state-changing requests are rejected by host/origin checks.
- `data/`, `.env`, recordings and build artifacts are gitignored.
- Stream URLs are validated as RTMP/RTMPS before they reach FFmpeg.
- Chat tokens and stream keys stay local.
- **Before a public production release**, sensitive tokens should move from gitignored local JSON to the operating-system credential vault. Gitignore is useful, but it is not a secret-storage system.

## Project map

- `server/` — local HTTP/SSE control plane, config validation, FFmpeg process, capability probe and chat adapters.
- `web/` — Vite/Preact/Tailwind studio UI plus framework-free chat overlay.
- `shared/` — config/state/source types and defaults.
- `engine/` — native Rust process wrapper/migration boundary.
- `tests/` — config and media-graph/multistream regression tests.
- `docs/` — architecture, platform capabilities, performance budgets and roadmap.

See `docs/ARCHITECTURE.md`, `docs/PLATFORMS.md`, `docs/PERFORMANCE.md` and `docs/ROADMAP.md`.

## Why this is not Electron

The browser-based control panel is served locally and can be closed while the encoder keeps running. LiteCast does not embed a permanent Chromium desktop shell merely to draw controls. A future browser-source subsystem should be isolated and launched only when a scene actually needs one.

## 1.0 direction

The current FFmpeg backend is intentionally useful now. The performance target is still a native pipeline:

```text
platform capture -> GPU texture -> wgpu compositor -> hardware encoder surface -> mux/output
```

with zero/low-copy handoff where the platform permits it and FFmpeg retained as a compatibility/fallback backend.

## License

MIT.
