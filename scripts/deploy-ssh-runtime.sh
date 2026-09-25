#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 || ! $2 =~ ^/[a-zA-Z0-9_./-]+$ ]]; then
  echo "Usage: $0 <ssh-alias> <remote-project-directory>" >&2
  exit 2
fi

host=$1
project=$2
repo=$(cd "$(dirname "$0")/.." && pwd)
cd "$repo"
version=$(node -p "require('./apps/server/package.json').version")
scratch=$(mktemp -d "${TMPDIR:-/tmp}/t3-ssh-runtime-XXXXXX")
trap 'rm -rf "$scratch"' EXIT

ssh "$host" "test -d '$project' && test -x ~/.t3/runtime/versions/$version/t3"
ssh "$host" "tar -C ~/.t3/runtime/versions/$version -cf - resource-monitor" | tar -xf - -C "$scratch"

echo "Building web client and Linux T3 runtime..."
pnpm exec vp run --filter t3 build > "$scratch/build.log" 2>&1 || {
  tail -n 80 "$scratch/build.log" >&2
  exit 1
}
pnpm --filter t3 run build:exe --target linux-x64
COPYFILE_DISABLE=1 pnpm exec node scripts/build-cli-archive.ts --platform linux --arch x64 --version "$version" \
  --resource-monitor-dir "$scratch/resource-monitor" --output-dir "$scratch"

stage=$(ssh "$host" 'mktemp -d "$HOME/.t3/runtime/versions/.local-XXXXXX"')
archive="t3-$version-linux-x64.tar.gz"
rsync -a "$scratch/$archive" "$host:$stage/$archive"
ssh "$host" "sh -s -- '$version' '$project' '$stage'" <<'REMOTE'
set -eu
version=$1
project=$2
stage=$3
versions="$HOME/.t3/runtime/versions"
runtime="$versions/$version"
archive="t3-$version-linux-x64.tar.gz"

mkdir "$stage/install"
tar -xzf "$stage/$archive" -C "$stage/install" --strip-components=1
rm "$stage/$archive"
"$stage/install/t3" --version
printf '%s\n' "$version" > "$stage/install/.install-complete"
test "$(cat "$runtime/.install-complete")" = "$version"
old_binary=$(readlink -f "$runtime/t3")
old_runtime=$(readlink "$runtime" 2>/dev/null || printf '%s.upstream' "$version")

# node-pty's install script builds for the packaging Mac. Reuse the Linux
# binary from this host only when the installed package is byte-for-byte identical.
new_pty="$stage/install/node_modules/node-pty"
old_pty="$runtime/node_modules/node-pty"
if [ ! -f "$new_pty/build/Release/pty.node" ] && [ ! -f "$new_pty/prebuilds/linux-x64/pty.node" ]; then
  cmp -s "$old_pty/package.json" "$new_pty/package.json"
  test -f "$old_pty/build/Release/pty.node"
  mkdir -p "$new_pty/build/Release"
  cp "$old_pty/build/Release/pty.node" "$new_pty/build/Release/pty.node"
fi

# Only restart a server owned by this SSH launcher and running this exact runtime.
managed_dir=
for candidate in "$HOME/.t3/ssh-launch"/*; do
  [ "$(cat "$candidate/managed" 2>/dev/null || true)" = managed ] || continue
  pid=$(cat "$candidate/pid" 2>/dev/null || true)
  [ -n "$pid" ] && [ "$(readlink -f "/proc/$pid/exe" 2>/dev/null || true)" = "$old_binary" ] || continue
  [ -z "$managed_dir" ] || { echo 'Multiple managed T3 servers use this runtime; refusing to restart.' >&2; exit 1; }
  managed_dir=$candidate
done
test -n "$managed_dir" || { echo 'No matching SSH-managed T3 server; refusing to switch runtime.' >&2; exit 1; }
pid=$(cat "$managed_dir/pid")
port=$(cat "$managed_dir/port")
case "$port" in *[!0-9]*|'') echo 'Invalid managed T3 port.' >&2; exit 1 ;; esac

# Preserve the official runtime as a rollback, then atomically point the
# version the desktop launcher expects at this checkout's complete archive.
if [ ! -L "$runtime" ]; then
  test ! -e "$runtime.upstream"
  mv "$runtime" "$runtime.upstream"
fi
ln -s "$(basename "$stage")/install" "$versions/.local-next.$$"
mv -Tf "$versions/.local-next.$$" "$runtime"
printf '%s\n' "$project" > "$HOME/.t3/ssh-launch/default-cwd"

kill "$pid"
count=0
while kill -0 "$pid" 2>/dev/null && [ "$count" -lt 200 ]; do
  count=$((count + 1))
  sleep 0.1
done
if kill -0 "$pid" 2>/dev/null; then
  echo 'Old T3 server has not exited; reconnect from the desktop app.' >&2
  exit 1
fi

PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH" \
  nohup env T3CODE_NO_BROWSER=1 "$managed_dir/run-t3.sh" serve --host 127.0.0.1 \
  --port "$port" --base-dir "$HOME/.t3" "$project" \
  >> "$managed_dir/server.log" 2>&1 < /dev/null &
printf '%s\n' "$!" > "$managed_dir/pid"
"$runtime/t3" __ssh-helper wait-ready "$port" 60000 1500 || {
  tail -n 30 "$managed_dir/server.log" >&2
  new_pid=$(cat "$managed_dir/pid")
  kill "$new_pid" 2>/dev/null || true
  ln -s "$old_runtime" "$versions/.restore-next.$$"
  mv -Tf "$versions/.restore-next.$$" "$runtime"
  PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH" \
    nohup env T3CODE_NO_BROWSER=1 "$managed_dir/run-t3.sh" serve --host 127.0.0.1 \
    --port "$port" --base-dir "$HOME/.t3" "$project" \
    >> "$managed_dir/server.log" 2>&1 < /dev/null &
  printf '%s\n' "$!" > "$managed_dir/pid"
  "$runtime/t3" __ssh-helper wait-ready "$port" 60000 1500 || true
  exit 1
}
printf 'Remote T3 server is ready on port %s (runtime %s).\n' "$port" "$(readlink -f "$runtime/t3")"
REMOTE
