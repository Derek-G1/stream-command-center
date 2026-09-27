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

The production media path is:

```text
Node control plane
        |
        v
server/ffmpeg.ts
        |
        v
FFmpeg
```

`server/ffmpeg.ts` builds the capture, scene overlay, audio mix, single H.264 encode, and tee outputs. `engine/` is the native migration boundary. Its current binary can launch one FFmpeg process for a simple config, and it refuses to mix more than one audio source. It does not compose scenes. Do not grow that wrapper until it matches the production graph; later Rust work should replace this path with native capture, a scene graph, a wgpu compositor, and a hardware encoder. FFmpeg stays as the fallback backend.

## Audio

The config stores a list of audio sources. Each source has an id, name, kind, enabled flag, mute, volume, device, and a `filters` array. The current FFmpeg graph applies mute and volume for microphone inputs and, where the platform capture supports it, desktop loopback. It prints `astats` RMS and peak for those sources. It does not apply the stored filters. Application audio and media-source audio are accepted in config and skipped by the graph. Gain, monitoring, and sync offset are not config fields yet; add them when the graph can honor them.

## Resource rules

1. One video encode is shared by all destinations with compatible settings.
2. No Chromium/browser source process exists unless a future browser source is explicitly enabled.
3. The control UI may be closed after broadcast start; the local server and encoder continue.
4. Studio shows a static layout preview. A separate preview frame rate belongs to the future decoded Preview/Program surfaces. There is no `previewFps` setting until that renderer exists.
5. Runtime dependencies are kept small; there is no Express, database server, Redux, or Electron.
6. Output adapters are capability based. A platform never has to implement unsupported chat/moderation features.

## Media roadmap

The long-term native pipeline is platform capture -> GPU texture -> wgpu compositor -> hardware encoder surface -> output muxers, avoiding CPU round trips. FFmpeg remains a fallback/compatibility backend.
