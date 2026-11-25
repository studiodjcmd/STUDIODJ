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
mkdir -p "$HOME/Music" "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_RUNTIME_DIR" "$profile/settings/skins"
chmod 700 "$XDG_RUNTIME_DIR"
cp -r "$root/skin/StudioDJ" "$profile/settings/skins/"
printf '[Config]\nResizableSkin StudioDJ\n' > "$profile/settings/mixxx.cfg"
cat > "$HOME/.asoundrc" <<'EOF'
pcm.!default {
  type null
}
ctl.!default {
  type hw
  card 0
}
EOF
printf 'XDG_MUSIC_DIR="$HOME/Music"\n' > "$XDG_CONFIG_HOME/user-dirs.dirs"
pid=""
cleanup() {
  if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi
  cp "$profile/settings/mixxx.log" "$out/mixxx.log" 2>/dev/null || true
  rm -rf "$profile"
}
trap cleanup EXIT
mixxx --settingsPath "$profile/settings" --developer --logLevel debug --logFlushLevel debug > "$out/stdout.log" 2>&1 &
pid=$!
for i in $(seq 1 60); do
  kill -0 "$pid" || { cat "$out/stdout.log"; exit 1; }
  if grep -Eiq 'Loaded skin "?Studio ?DJ"?' "$out/stdout.log" "$profile/settings/mixxx.log" 2>/dev/null; then break; fi
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
