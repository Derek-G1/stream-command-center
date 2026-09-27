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

The config stores a list of audio sources. Each source has an id, name, kind, enabled flag, mute, volume, device, and a `filters` array. Microphone capture uses the platform audio input (DirectShow on Windows). Desktop loopback is captured only when that backend exists: WASAPI on Windows, Pulse on Linux. Application audio and media-source audio are accepted in config and skipped by the graph.

The only filter the graph applies is Gain, in decibels, from -30 dB to +30 dB. 0 dB is unity. Other stored filter types are kept and ignored. Each source has at most one Gain filter. The chain for every captured source is:

```text
input -> format -> enabled Gain -> future pre-fader filters -> volume -> mute -> split
                                                                              |-> post-fader astats meter
                                                                              |-> mixer
```

The displayed RMS meter is post-fader. It is measured after Gain, the volume fader, and mute, on the signal that enters the mixer. A muted source therefore measures as digital silence once a sample arrives. `N/A` means no `astats` sample has arrived. A numeric value, including `0.0 dB`, is a real measurement. FFmpeg's `-inf` is stored as null and shown as Silence, which is not the same as `N/A`.

If device enumeration succeeds and a saved device is absent, that source is left out of the graph, the saved name is kept, and the broadcast continues. The same happens for Windows desktop audio when FFmpeg has no WASAPI demuxer. A device that disappears after FFmpeg has already opened it still ends that process; DirectShow does not keep the other outputs alive through an input failure. An empty device list means enumeration did not answer, so a typed device string is still passed through.

## Resource rules

1. One video encode is shared by all destinations with compatible settings.
2. No Chromium/browser source process exists unless a future browser source is explicitly enabled.
3. The control UI may be closed after broadcast start; the local server and encoder continue.
4. Studio shows a static layout preview. A separate preview frame rate belongs to the future decoded Preview/Program surfaces. There is no `previewFps` setting until that renderer exists.
5. Runtime dependencies are kept small; there is no Express, database server, Redux, or Electron.
6. Output adapters are capability based. A platform never has to implement unsupported chat/moderation features.

## Media roadmap

The long-term native pipeline is platform capture -> GPU texture -> wgpu compositor -> hardware encoder surface -> output muxers, avoiding CPU round trips. FFmpeg remains a fallback/compatibility backend.
