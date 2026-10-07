#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: fnox exec --profile local --no-defaults -- bash $0 <input.apk> <signed.apk>" >&2
  exit 2
fi

: "${T3CODE_ANDROID_KEYSTORE_BASE64:?Resolve Android signing credentials with fnox first.}"
: "${T3CODE_ANDROID_KEYSTORE_PASSWORD:?Resolve Android signing credentials with fnox first.}"
: "${T3CODE_ANDROID_KEY_ALIAS:?Resolve Android signing credentials with fnox first.}"

signer=${APKSIGNER:-apksigner}
command -v "$signer" >/dev/null
test -f "$1"
if [[ -e "$2" ]]; then
  echo "Output already exists; refusing to overwrite it." >&2
  exit 1
fi

umask 077
scratch=$(mktemp -d "${TMPDIR:-/tmp}/t3-android-signing-XXXXXX")
trap 'rm -f "$scratch/signing.p12"; rmdir "$scratch"' EXIT
printf '%s' "$T3CODE_ANDROID_KEYSTORE_BASE64" | base64 --decode > "$scratch/signing.p12"

"$signer" sign --ks "$scratch/signing.p12" --ks-type PKCS12 \
  --ks-key-alias "$T3CODE_ANDROID_KEY_ALIAS" \
  --ks-pass env:T3CODE_ANDROID_KEYSTORE_PASSWORD \
  --key-pass env:T3CODE_ANDROID_KEYSTORE_PASSWORD \
  --out "$2" "$1"
"$signer" verify --verbose --print-certs "$2"
