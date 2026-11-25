# Engineering rules
- Target Mixxx 2.5.6. Verify widget syntax and control objects against pinned upstream source. Do not invent native controls.
- Keep controller/baseline byte-identical. Work on copies, retain names and provenance.
- Use native waveforms, library models and engine; no Chromium, extra decoder or ML in performance.
- Preserve original NS6 (not NS6II) scratch, transport recovery, 14-bit controls, layers, soft takeover and LEDs.
- No blocking IO, locks or allocation added to audio callbacks. Never write directly to live mixxxdb.sqlite.
- No automatic mixing or track selection. Keep playing deck states visible and test safe loading.
- Mock/static tests do not certify hardware, timing or Qt runtime. Measure performance against a stock baseline.
- Small branches, review before merge. No credentials, private databases, audio files or proprietary fonts/drivers.
