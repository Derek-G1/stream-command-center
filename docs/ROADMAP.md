# Roadmap

## 0.1 — usable local broadcaster

Implemented on `feature/litecast-broadcaster`: screen/window/device capture through FFmpeg, audio device input, H.264 hardware/software encoder selection, local MKV/MP4 recording, single-encode tee multistream, Vite/Preact/Tailwind control UI, runtime stats, themes/density, persistent configuration, SSE updates, Twitch chat read adapter, YouTube chat read adapter, Rust engine wrapper, tests and CI.

## 0.2 — studio workflow

- Real program/preview compositor surface.
- Scene collection model.
- Native image/text/ticker/media sources.
- Audio mixer with meters, mute, gain and monitoring.
- Scene transitions and hotkeys.
- Source transforms/crop/opacity.
- Device enumeration instead of manual device strings.

## 0.3 — platform integration

- OAuth flows and OS credential-vault storage.
- Twitch EventSub chat/activity and send/moderation actions.
- YouTube streaming/live-chat OAuth and stream creation.
- Kick official events adapter and relay webhook option.
- Facebook adapter.
- Unified activity feed and platform health.
- Policy-aware per-platform overlays.

## 0.4 — native media core

- Windows Graphics Capture / Desktop Duplication.
- PipeWire on Linux and ScreenCaptureKit on macOS.
- wgpu scene composition.
- NVENC/QSV/AMF/VideoToolbox direct encoder paths.
- Zero-copy texture/surface handoff where supported.
- FFmpeg remains compatibility fallback.

## 0.5 — customization

- Dockable/resizable/poppable panels.
- Workspace presets (Gaming, Podcast, Coding, Production).
- Theme import/export.
- Widget SDK.
- Macro/action engine.
- Native overlay designer.
- 16:9 / 9:16 per-destination layouts.

## 1.0 release gate

No release candidate until soak streaming, reconnect behavior, recording integrity, driver failure recovery, secret handling, crash isolation and benchmark regression suites pass on supported Windows/NVIDIA/AMD/Intel combinations.
