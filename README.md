# Studio DJ — 0.0.2 alpha candidate

Native Mixxx 2.5.6 skin for the original Numark NS6. Not a standalone player. Keep the baseline controller files unchanged.

## Test readiness
The GitHub Actions workflow runs static tests, then launches real Mixxx 2.5.6 using a temporary profile and virtual display. It only produces the candidate ZIP (skin, optional separate mapping, isolated-profile installer, checksums and test guide) if both jobs succeed. The runtime smoke test does not certify audio, physical hardware, render quality, or four-hour stability. Review the screenshot/log artifact before installation.

## Installation (after smoke and review)
Close Mixxx. Copy StudioDJ into the user settings skins directory (Windows: %LOCALAPPDATA%\\Mixxx\\skins; Linux: ~/.mixxx/skins). Select Studio DJ in Preferences > Interface. Back up your settings. Use a separate test profile and the optional Studio DJ mapping for the new shortcuts. See docs/TEST-GUIDE.md. Keep the original mapping untouched. Return to stock skin if needed. Do not test live.

Four deck metadata/overviews, two active-layer or four scrolling waveforms, native library, preview, compact FX routing and meters. With the optional overlay, VIEW returns from Browse or toggles waveform layout; CRATES/FILES open Browse and focus tree/tracks; LOAD PREPARE and SHIFT+encoder toggle preview, never Auto DJ; LOAD A/B blocks busy deck loads/ejects. PREPARE toggles Browse. The original mapping remains unchanged; do not use its Auto DJ shortcuts. Tag List is not implemented. Layer sync depends on baseline mapping and initialization; verify after connecting.

No performance claims without benchmarks. No public distribution of baseline mapping until licensing verified.
