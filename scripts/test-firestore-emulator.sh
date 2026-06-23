#!/usr/bin/env bash
# scripts/test-firestore-emulator.sh
#
# Runs the Firestore-emulator round-trip test pack for the engram persistence
# layer (brain-roadmap item 6b).
#
# This script:
#   1. Generates a throwaway RSA key + service-account JSON in a temp dir
#      (firebase-admin's credential.cert() validates the PEM is parseable;
#      the emulator itself ignores credentials, so the key is never trusted).
#   2. Exports the credentials path and forces firestore storage mode.
#   3. Uses `firebase emulators:exec` to spin up the Firestore emulator
#      (port 8980, project: demo-molly-test) for the lifetime of the jest run.
#   4. Cleans up the temp credentials on exit.
#
# Requirements (already in devDependencies):
#   - firebase-tools (provides the emulator)
#   - openssl (system; used to mint the throwaway key)
#   - java (the Firestore emulator runtime)
#
# Usage:
#   bash scripts/test-firestore-emulator.sh
#   npm run test:firestore-emulator

set -euo pipefail

# Verify openssl + java are present before we start.
if ! command -v openssl >/dev/null 2>&1; then
  echo "[firestore-emulator] openssl not found on PATH — required for throwaway key generation." >&2
  exit 1
fi
if ! command -v java >/dev/null 2>&1; then
  echo "[firestore-emulator] java not found on PATH — Firestore emulator requires JRE." >&2
  exit 1
fi

PROJECT_ID="${FIREBASE_EMULATOR_PROJECT:-demo-molly-test}"
EMULATOR_PORT="${FIREBASE_EMULATOR_FIRESTORE_PORT:-8980}"
TEST_PATH="${1:-src/ai/memory/__tests__/engram-persistence.firestore-emulator.test.ts}"

WORK_DIR="$(mktemp -d -t molly-firestore-emulator-XXXXXX)"
trap 'rm -rf "$WORK_DIR"' EXIT

KEY_PEM="$WORK_DIR/key.pem"
SA_JSON="$WORK_DIR/service-account.json"

# Mint a throwaway 2048-bit RSA key. `openssl genpkey` writes PKCS#8 by
# default, which is the format firebase-admin's credential.cert() expects.
openssl genpkey -algorithm RSA -out "$KEY_PEM" -pkeyopt rsa_keygen_bits:2048 2>/dev/null

# Build the service account JSON. Embed the PEM with literal \n escapes so it
# stays a single JSON string value.
KEY_ESCAPED="$(awk 'BEGIN{ORS="\\n"} {print}' "$KEY_PEM")"
cat > "$SA_JSON" <<EOF
{
  "type": "service_account",
  "project_id": "$PROJECT_ID",
  "private_key_id": "throwaway",
  "private_key": "$KEY_ESCAPED",
  "client_email": "emulator-test@$PROJECT_ID.iam.gserviceaccount.com",
  "client_id": "0",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/emulator-test%40$PROJECT_ID.iam.gserviceaccount.com"
}
EOF

export GOOGLE_APPLICATION_CREDENTIALS="$SA_JSON"
export FIREBASE_PROJECT_ID="$PROJECT_ID"
export MOLLY_STORAGE_PROVIDER="firestore"
# Tell the firebase-admin SDK to route Firestore traffic at the local emulator.
# `firebase emulators:exec` also sets FIRESTORE_EMULATOR_HOST automatically;
# we set it explicitly so the test file can also detect emulator mode without
# relying on emulators:exec's injection.
export FIRESTORE_EMULATOR_HOST="127.0.0.1:$EMULATOR_PORT"
# Mark this as the live-emulator path so the test file knows to actually run
# (it defaults to a clear skip when this flag is absent).
export MOLLY_FIRESTORE_EMULATOR_TEST="1"

echo "[firestore-emulator] project=$PROJECT_ID port=$EMULATOR_PORT"
echo "[firestore-emulator] credentials: $SA_JSON"
echo "[firestore-emulator] test target: $TEST_PATH"
echo

# firebase-admin's init in this repo uses `Function('m','return import(m)')` to
# dodge bundler analysis — that pattern requires Node's VM module flag to be
# enabled or the import callback throws ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG.
# The same flag is used by `test:bridge` for the same reason.
export NODE_OPTIONS="${NODE_OPTIONS:-} --experimental-vm-modules"

npx --no-install firebase emulators:exec \
  --only firestore \
  --project "$PROJECT_ID" \
  "npx jest --runInBand $TEST_PATH"
