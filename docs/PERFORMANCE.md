# Performance budget

LiteCast is built around measurable budgets, not assumptions.

## Initial targets (1080p60 hardware encode)

- Idle control plane: < 150 MB working set target.
- Idle CPU: < 2% target on a modern desktop.
- One hardware encode for compatible multistream destinations.
- No duplicate encode solely because a second RTMP destination is enabled.
- Preview UI target: <= 15 FPS by default; broadcast stays at configured FPS.
- No hidden browser-source engine when browser sources are unused.

These are engineering targets, not guaranteed figures; benchmark on each supported GPU/driver stack.

## Required telemetry

Runtime already exposes encoder PID, state, measured FFmpeg FPS, bitrate and encode speed. Future native engine telemetry should add capture time, composite time, encode latency, late frames, GPU copy count, per-source CPU/GPU cost and memory.
