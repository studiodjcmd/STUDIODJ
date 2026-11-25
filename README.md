# Studio DJ — v0.0.1 development

Hardware-first native Mixxx 2.5.6 experience for the original Numark NS6. This is an experimental skin, not a standalone application or a live-ready release.

## Try the native Player prototype
Close Mixxx. Copy `skin/StudioDJ` into the `skins` directory in your Mixxx settings folder (Windows: `%LOCALAPPDATA%\Mixxx\skins`; Linux: `~/.mixxx/skins`). Select Studio DJ in Preferences > Interface. Keep your known-good controller mapping and audio setup. Restore your previous skin if the prototype fails. Test at low volume, never first during a live set.

Player shows all four decks' metadata and active states; the additional waveform pair is optional. Browse hides the detailed waveforms without hiding deck status. No virtual mixer or new audio engine. Existing NS6 bridge controls are declared in the skin; behavior needs runtime and hardware validation. FX status and Tag List are subsequent work.

## Development
```sh
python tests/validate_mapping.py
node --check controller/baseline/Numark-NS6-Original.js
node --test tests/mapping.test.cjs
python tests/validate_skin.py
```
The first three checks validate the immutable supplied baseline (not hardware). The fourth checks XML structure and declared connections, not the Mixxx renderer. See docs/HARDWARE-TESTS.md.

Mapping redistribution rights must be verified before public release. Do not ship proprietary drivers or fonts.
