# Studio DJ alpha test guide (not for live use)

Prerequisite: Mixxx 2.5.6, supported audio setup for the original NS6, known-good stock mapping, low volume. Close all Mixxx instances. Do not replace your normal settings or controller files. Confirm the runtime workflow succeeded and review its screenshot and log.

## Windows isolated profile
Extract the complete candidate bundle. Open PowerShell in that directory and run:
```powershell
powershell -NoProfile -File .\Install-StudioDJ.ps1 -Launch
```
If Mixxx is installed elsewhere pass -MixxxExe. The installer refuses to overwrite an existing candidate or the normal Mixxx profile. To test a new version use a fresh -ProfilePath. If Windows blocks unsigned scripts, inspect the source and copy folders manually instead of changing machine-wide policy.

## Manual test profile (all platforms)
Copy the bundle's skins/ and controllers/ entries into a fresh Mixxx settings directory. Launch Mixxx with --settingsPath pointing to that directory. Choose Studio DJ and the optional Studio DJ NS6 mapping in Preferences. Configure master and headphone output and import a small test collection. The normal library is not imported or edited by this process.

## Physical mapping in this candidate
VIEW: exits Browse, otherwise switches active pair/four scrolling waveforms.
CRATES/FILES: open Browse, focus tree/tracks. Shift retains original sort.
PREPARE: toggles Browse. LOAD PREPARE or SHIFT+encoder: start/stop headphone preview (temporary, not Tag List).
LOAD A/B: target physical layer. Blocked while playing, intent to play, cue held, scratch or boot. Shift eject only when stopped. Existing other load paths still depend on native Mixxx load protection: enable that preference. No auto return on load yet.
PLAY/CUE, jog, filter, loops, FX and LEDs stay original. Do not use the original mapping's Auto DJ shortcuts with the optional overlay disabled.

## Acceptance
Check both 1/2 and 3/4 layers, 2-active and 4-waveform modes, Browse, preview, four deck cards, wave markers, hot cues on hardware, keylock, quantize, filter, FX routes and meters. Load a track to every deck; try LOAD on a playing deck and verify it is rejected. Try a normal stopped load and shift eject. Compare to known-good stock skin. Check xrun counter, audio output, scratch and LEDs; no live set until tested.
The headless smoke test is not this physical test. Use normal Mixxx without --settingsPath to return to your original setup.
