# Architecture and alpha limits
Native Mixxx 2.5.6 widgets; no extra process, browser or audio engine for Performance.
Verified against upstream 2.5.6 LateNight skin and Creating Skins documentation:
https://github.com/mixxxdj/mixxx/blob/2.5.6/res/skins/LateNight/skin.xml
https://github.com/mixxxdj/mixxx/wiki/Creating-Skins
Four permanent metadata/overview cards. Four Visual instances defined as singletons; active pair mode reparents the two matching physical layers via nested WidgetStacks. Four mode shows all four. Browse hides scrolling lanes but keeps metadata and overviews. Runtime reparent and switch testing remains necessary.
Compact FX routes + effect 1 enabled; not a full FX editor. Preview uses native PreviewDeck1. No changes to audio routing or controller baseline.
Tag List and safe derived NS6 mapping are next. Existing mapping can toggle Auto DJ; keep it disabled and avoid those buttons. Prepare stays offline in separate process/database.
CI smoke uses exact 2.5.6 package from official PPA, isolated profile, Xvfb, log and screenshot. It cannot certify real device or performance; do not equate static/smoke success with release readiness.
