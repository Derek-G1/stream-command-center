# Roadmap

## 0.1 — functional local broadcaster — implemented

The feature branch now includes:

- Screen/window/device capture through FFmpeg.
- Audio-device input with gain/volume control.
- H.264 NVENC/QSV/AMF/x264 encoder profiles.
- Local MKV/MP4 recording.
- Single-encode tee multistream to compatible RTMP/RTMPS destinations.
- Scene collection + active scene.
- Camera, image and text overlay sources with transforms and opacity.
- Lightweight scene-layout preview.
- Controlled live media-graph restart.
- Vite/Preact/Tailwind control UI with themes/density.
- FFmpeg encoder/device capability probing.
- Config presets and import/export.
- Persistent validated configuration + SSE runtime updates.
- Twitch chat with reconnect.
- YouTube chat with page-token/message-ID deduplication.
- Per-platform/framework-free viewer chat overlay.
- Rust engine wrapper, Node regression tests and cross-platform CI.

## 0.2 — deeper studio workflow

- True decoded **Preview** and **Program** surfaces with preview-to-program switching.
- Media/video-file source with pause/seek/loop controls.
- Native ticker source using the OBS Ticker v3 design principles.
- Source crop, rotation, blend mode and corner/border effects.
- Scene transitions.
- Configurable hotkeys.
- Full multi-source audio mixer with per-source meters, mute, gain, sync offset and monitoring.
- Replay buffer.
- Virtual camera output.
- Better Linux device discovery through PipeWire/Pulse/V4L2 enumeration.

## 0.3 — production platform integration

- OAuth flows and operating-system credential-vault storage.
- Twitch EventSub activity plus send/moderation actions.
- YouTube OAuth, stream creation/broadcast selection and send/moderation actions.
- Kick official events adapter and optional public relay/webhook receiver.
- Facebook Graph/live adapter where account/API access permits it.
- Unified subscriptions/donations/raids/follows activity feed.
- Per-destination stream health and reconnect reporting.
- Policy-aware overlay routing so platform-specific outputs can automatically exclude disallowed cross-platform activity.

## 0.4 — native media core

- Windows Graphics Capture / Desktop Duplication.
- PipeWire on Linux and ScreenCaptureKit on macOS.
- `wgpu` scene composition.
- NVENC/QSV/AMF/VideoToolbox direct encoder paths.
- Zero-copy texture/surface handoff where supported.
- Dirty-source rendering and per-source frame throttling.
- Independent low-FPS control preview while program output remains full-rate.
- FFmpeg retained as the compatibility/fallback backend.

## 0.5 — customization / creator platform

- Dockable/resizable/poppable panels.
- Workspace presets: Gaming, Podcast, Coding, Music, Production.
- Full theme import/export beyond the current built-in themes.
- Widget SDK.
- Macro/action engine.
- Native overlay designer.
- 16:9 / 9:16 / 1:1 per-destination layouts.
- Plugin capability model for Sources, Panels, Widgets, Filters, Actions and Events.

## 1.0 release gate

A public 1.0 should not ship until all of the following are exercised on real hardware rather than inferred from CI:

- Long-duration streaming soak tests.
- Twitch/YouTube/Kick/Facebook destination reconnect behavior.
- Recording integrity after clean stop, crash and disk interruption.
- NVIDIA/AMD/Intel encoder-driver failure recovery.
- Credential-vault migration and secret-redaction review.
- Capture-device hot-plug behavior.
- Browser/plugin crash isolation if those subsystems are enabled.
- Benchmark regression suite for CPU, RAM, GPU render, GPU encode, frame pacing and dropped frames.
- Supported Windows hardware matrix, followed by explicit macOS/Linux support matrices.
