# Acceptance gate (not yet run)
Record OS, Mixxx version, driver/API, CPU, RAM, GPU, resolution, audio sample rate and buffer.
- Confirm master and independent headphone output using stock skin, then candidate.
- Verify four decks/layers, active-layer indicator and visible playing decks; confirm title, BPM, key, time and waveforms match native deck state.
- Verify loading, lockout, pickup, PLAY/CUE, scratch/backspin, loops, hot cues, PFL, FX routing, LEDs and controlled USB reconnect.
- Test Browse and VIEW from the NS6; check skin logs for unknown controls/widgets.
- Run four decks for 4 hours with zero audible dropouts/xruns; compare stock and candidate.
- Target 60 fps at 60 Hz, frame p95 <= 16.7 ms; Browse p95 < 100 ms; pre-analyzed local SSD track load p95 < 500 ms. Targets only, not measured. Test at 1366x768 and 1920x1080. Keep a known-good fallback skin. No live certification until passed.
