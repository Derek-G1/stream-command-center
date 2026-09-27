# Performance budget

LiteCast is built around measurable budgets, not assumptions.

## Initial targets (1080p60 hardware encode)

- Idle control plane: < 150 MB working set target.
- Idle CPU: < 2% target on a modern desktop.
- One hardware encode for compatible multistream destinations.
- No duplicate encode solely because a second RTMP destination is enabled.
- Future decoded preview target: 5, 15, or 30 FPS, independent of the outgoing stream. The current Studio view is a static layout and does not render frames.
- No hidden browser-source engine when browser sources are unused.

These are engineering targets, not guaranteed figures; benchmark on each supported GPU/driver stack.

## Required telemetry

Runtime exposes encoder PID, state, and, once FFmpeg's `-progress` stream sends them, FPS, bitrate, encode speed, and `drop_frames`. Missing samples stay null and the UI shows N/A. Per-source audio meters come from `astats` on the running graph. Future native telemetry should add capture time, composite time, encode latency, network drops, GPU copy count, per-source CPU/GPU cost, and memory.
