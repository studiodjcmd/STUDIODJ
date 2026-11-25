#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/smoke-results"
mkdir -p "$out"
profile="$(mktemp -d)"
export HOME="$profile/home"
export XDG_CONFIG_HOME="$HOME/.config"
export XDG_DATA_HOME="$HOME/.local/share"
export XDG_RUNTIME_DIR="$profile/runtime"
export LIBGL_ALWAYS_SOFTWARE=1
export JACK_NO_AUDIO_RESERVATION=1
export JACK_NO_START_SERVER=1
mkdir -p "$HOME/Music" "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_RUNTIME_DIR" "$profile/settings/skins"
chmod 700 "$XDG_RUNTIME_DIR"
cp -r "$root/skin/StudioDJ" "$profile/settings/skins/"
printf '[Config]\nResizableSkin StudioDJ\n[Playlist]\nDirectory %s\n' "$HOME/Music" > "$profile/settings/mixxx.cfg"
cat > "$HOME/.asoundrc" <<'EOF'
pcm.!default {
  type null
  hint {
    show on
    description "Studio DJ virtual output"
  }
}
ctl.!default {
  type hw
  card 0
}
EOF
printf 'XDG_MUSIC_DIR="$HOME/Music"\n' > "$XDG_CONFIG_HOME/user-dirs.dirs"
pid=""
jackpid=""
cleanup() {
  local status=$?
  if [[ "$status" != 0 ]]; then
    xdotool search --onlyvisible --name ".*" getwindowname %@ > "$out/windows.txt" 2>&1 || true
    import -window root "$out/failure.png" || true
    tail -100 "$out/stdout.log" || true
    cat "$out/windows.txt" || true
    tail -40 "$out/jack.log" || true
  fi
  if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi
  cp "$profile/settings/mixxx.log" "$out/mixxx.log" 2>/dev/null || true
  if [[ -n "$jackpid" ]]; then kill "$jackpid" 2>/dev/null || true; wait "$jackpid" 2>/dev/null || true; fi
  rm -rf "$profile"
}
trap cleanup EXIT
jackd --no-realtime -d dummy -r 44100 -p 512 > "$out/jack.log" 2>&1 &
jackpid=$!
for i in $(seq 1 20); do
  if jack_lsp > "$out/jack-ports.txt" 2>/dev/null; then break; fi
  sleep 1
done
jack_lsp
mixxx --settingsPath "$profile/settings" --developer --logLevel debug --logFlushLevel debug > "$out/stdout.log" 2>&1 &
pid=$!
for i in $(seq 1 90); do
  kill -0 "$pid" || { cat "$out/stdout.log"; exit 1; }
  # A fresh Mixxx database may prompt despite the configured directory.
  # Handle only that exact, expected dialog, never dismiss an unknown error.
  dialog=$(xdotool search --onlyvisible --name '^Choose music library directory
  if [[ "$i" == 10 || "$i" == 25 ]]; then
    xdotool search --onlyvisible --name ".*" getwindowname %@ || true
  fi
  sleep 1
done
grep -Ei 'Loaded skin "Studio ?DJ" from .*[/\\]StudioDJ' "$out/stdout.log" "$profile/settings/mixxx.log"
sleep 3
kill -0 "$pid"
xdotool search --onlyvisible --name '^Mixxx' > "$out/windows.txt"
if xdotool search --onlyvisible --name '^Choose music library directory
import -window root "$out/player.png"
# Reject actual skin parser errors; keep the full log for review.
if grep -Ei 'StudioDJ/.*(unknown widget|could not parse|failed to parse|invalid control|unrecognized widget)|Failed to load skin|Error loading skin|Segmentation fault' "$out/stdout.log" "$profile/settings/mixxx.log"; then exit 1; fi
echo "PASS: candidate loaded and remained alive on a virtual display (not hardware/audio validation)"
 2>/dev/null | head -1 || true)
  if [[ -n "$dialog" ]]; then
    echo "Selecting isolated test library: $HOME/Music"
    xdotool windowfocus --sync "$dialog"
    xdotool key --window "$dialog" ctrl+l
    xdotool type --window "$dialog" --clearmodifiers "$HOME/Music"
    xdotool key --window "$dialog" Return
    sleep 1
    if xdotool search --onlyvisible --name '^Choose music library directory
  if [[ "$i" == 10 || "$i" == 25 ]]; then
    xdotool search --onlyvisible --name ".*" getwindowname %@ || true
  fi
  sleep 1
done
grep -Ei 'Loaded skin "?Studio ?DJ"?' "$out/stdout.log" "$profile/settings/mixxx.log"
sleep 3
kill -0 "$pid"
xdotool search --onlyvisible --name 'Mixxx' > "$out/windows.txt"
import -window root "$out/player.png"
# Reject actual skin parser errors; keep the full log for review.
if grep -Ei 'StudioDJ/.*(unknown widget|could not parse|failed to parse|invalid control|unrecognized widget)|Failed to load skin|Error loading skin|Segmentation fault' "$out/stdout.log" "$profile/settings/mixxx.log"; then exit 1; fi
echo "PASS: candidate loaded and remained alive on a virtual display (not hardware/audio validation)"
 >/dev/null 2>&1; then
      xdotool key --window "$dialog" Return
    fi
  fi
  if grep -Ei 'Loaded skin "Studio ?DJ" from .*[/\\]StudioDJ' "$out/stdout.log" "$profile/settings/mixxx.log" 2>/dev/null; then break; fi
  if [[ "$i" == 10 || "$i" == 25 ]]; then
    xdotool search --onlyvisible --name ".*" getwindowname %@ || true
  fi
  sleep 1
done
grep -Ei 'Loaded skin "?Studio ?DJ"?' "$out/stdout.log" "$profile/settings/mixxx.log"
sleep 3
kill -0 "$pid"
xdotool search --onlyvisible --name 'Mixxx' > "$out/windows.txt"
import -window root "$out/player.png"
# Reject actual skin parser errors; keep the full log for review.
if grep -Ei 'StudioDJ/.*(unknown widget|could not parse|failed to parse|invalid control|unrecognized widget)|Failed to load skin|Error loading skin|Segmentation fault' "$out/stdout.log" "$profile/settings/mixxx.log"; then exit 1; fi
echo "PASS: candidate loaded and remained alive on a virtual display (not hardware/audio validation)"
 >/dev/null 2>&1; then exit 1; fi
import -window root "$out/player.png"
# Reject actual skin parser errors; keep the full log for review.
if grep -Ei 'StudioDJ/.*(unknown widget|could not parse|failed to parse|invalid control|unrecognized widget)|Failed to load skin|Error loading skin|Segmentation fault' "$out/stdout.log" "$profile/settings/mixxx.log"; then exit 1; fi
echo "PASS: candidate loaded and remained alive on a virtual display (not hardware/audio validation)"
 2>/dev/null | head -1 || true)
  if [[ -n "$dialog" ]]; then
    echo "Selecting isolated test library: $HOME/Music"
    xdotool windowfocus --sync "$dialog"
    xdotool key --window "$dialog" ctrl+l
    xdotool type --window "$dialog" --clearmodifiers "$HOME/Music"
    xdotool key --window "$dialog" Return
    sleep 1
    if xdotool search --onlyvisible --name '^Choose music library directory
  if [[ "$i" == 10 || "$i" == 25 ]]; then
    xdotool search --onlyvisible --name ".*" getwindowname %@ || true
  fi
  sleep 1
done
grep -Ei 'Loaded skin "?Studio ?DJ"?' "$out/stdout.log" "$profile/settings/mixxx.log"
sleep 3
kill -0 "$pid"
xdotool search --onlyvisible --name 'Mixxx' > "$out/windows.txt"
import -window root "$out/player.png"
# Reject actual skin parser errors; keep the full log for review.
if grep -Ei 'StudioDJ/.*(unknown widget|could not parse|failed to parse|invalid control|unrecognized widget)|Failed to load skin|Error loading skin|Segmentation fault' "$out/stdout.log" "$profile/settings/mixxx.log"; then exit 1; fi
echo "PASS: candidate loaded and remained alive on a virtual display (not hardware/audio validation)"
 >/dev/null 2>&1; then
      xdotool key --window "$dialog" Return
    fi
  fi
  if grep -Ei 'Loaded skin "Studio ?DJ" from .*[/\\]StudioDJ' "$out/stdout.log" "$profile/settings/mixxx.log" 2>/dev/null; then break; fi
  if [[ "$i" == 10 || "$i" == 25 ]]; then
    xdotool search --onlyvisible --name ".*" getwindowname %@ || true
  fi
  sleep 1
done
grep -Ei 'Loaded skin "?Studio ?DJ"?' "$out/stdout.log" "$profile/settings/mixxx.log"
sleep 3
kill -0 "$pid"
xdotool search --onlyvisible --name 'Mixxx' > "$out/windows.txt"
import -window root "$out/player.png"
# Reject actual skin parser errors; keep the full log for review.
if grep -Ei 'StudioDJ/.*(unknown widget|could not parse|failed to parse|invalid control|unrecognized widget)|Failed to load skin|Error loading skin|Segmentation fault' "$out/stdout.log" "$profile/settings/mixxx.log"; then exit 1; fi
echo "PASS: candidate loaded and remained alive on a virtual display (not hardware/audio validation)"
