# Architecture
Native XML/QSS first, on Mixxx 2.5.6. No fork or alternate audio engine in the MVP.
References: https://github.com/mixxxdj/mixxx/wiki/Creating-Skins ; https://github.com/mixxxdj/mixxx/blob/2.5.6/res/skins/LateNight/skin.xml ; https://manual.mixxx.org/2.5/en/chapters/appendix/mixxx_controls.html .
The first skin uses native Visual, Overview, TrackProperty, NumberBpm, NumberPos, Key, NumberRate, SearchBox, LibrarySidebar and Library. It declares existing NS6 mapping bridge keys. All four deck cards remain visible; Browse collapses the waveform area, not the metadata. Two-waveform mode shows channels 1/2 only: select four waveforms for layers 3/4 until active-layer routing is implemented. The layer indicator depends on the existing script initialization. Effects rack control is reserved but has no visible UI yet.
The baseline's PREPARE/LOAD PREPARE Auto DJ semantics remain unchanged; do not use them as a Tag List yet. Add explicit manual Tag List after validation.
Prepare: separate offline worker and database, no live DB writes or analysis on the audio path. QML is a future evaluation. No runtime test yet.
