# LiteCast architecture

LiteCast deliberately separates a customizable control surface from the media pipeline.

```text
Vite + Preact + Tailwind UI
          |
       HTTP/SSE
          |
Node local control plane (127.0.0.1 only)
          |
Broadcast engine boundary
          |
FFmpeg capture -> one encode -> tee muxer -> RTMP/RTMPS destinations + recording
```

## Current engine

The TypeScript control plane launches FFmpeg directly. This is the shortest path to a genuinely usable broadcaster across existing capture devices and hardware codecs. `engine/` contains the native Rust process wrapper with the same config shape; the migration target is for the control plane to launch that release binary instead of FFmpeg directly. That transition does not require a UI rewrite.

## Resource rules

1. One video encode is shared by all destinations with compatible settings.
2. No Chromium/browser source process exists unless a future browser source is explicitly enabled.
3. The control UI may be closed after broadcast start; the local server and encoder continue.
4. UI preview is intentionally not a continuously decoded copy of the encoded stream yet.
5. Runtime dependencies are kept small; there is no Express, database server, Redux, or Electron.
6. Output adapters are capability based. A platform never has to implement unsupported chat/moderation features.

## Media roadmap

The long-term native pipeline is platform capture -> GPU texture -> wgpu compositor -> hardware encoder surface -> output muxers, avoiding CPU round trips. FFmpeg remains a fallback/compatibility backend.
