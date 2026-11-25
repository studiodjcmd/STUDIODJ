# Studio DJ — 0.0.2 alpha candidate

Native Mixxx 2.5.6 skin for the original Numark NS6. Not a standalone player. Keep the baseline controller files unchanged.

## Test readiness
The GitHub Actions workflow runs static tests, then launches real Mixxx 2.5.6 using a temporary profile and virtual display. It only produces the skin-only candidate ZIP if both jobs succeed. The runtime smoke test does not certify audio, physical hardware, render quality, or four-hour stability. Review the screenshot/log artifact before installation.

## Installation (after smoke and review)
Close Mixxx. Copy StudioDJ into the user settings skins directory (Windows: %LOCALAPPDATA%\\Mixxx\\skins; Linux: ~/.mixxx/skins). Select Studio DJ in Preferences > Interface. Back up your settings. Keep stock mapping or your known-good original NS6 mapping. Return to stock skin if needed. Do not test live.

Four deck metadata/overviews, two active-layer or four scrolling waveforms, native library, preview, compact FX routing and meters. VIEW toggles waveform layout, PREPARE toggles Browse on the supplied baseline. CRATES/FILES focus library; the baseline retains LOAD PREPARE -> Auto DJ queue and SHIFT+encoder -> Auto DJ toggle, so DO NOT use either during tests. Tag List is not implemented. Layer sync depends on baseline mapping and initialization; verify after connecting.

No performance claims without benchmarks. No public distribution of baseline mapping until licensing verified.
