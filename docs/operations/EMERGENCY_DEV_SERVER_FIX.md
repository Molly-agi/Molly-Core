# Molly-Core: Emergency Dev Server Fix

## Problem

After recent changes, the dev server fails to start due to a missing Node.js core module ('stream') from @google-cloud/firestore. This happens because Firestore code is being bundled into the client, which is not supported in Next.js or browser environments.

## Solution

**Force local storage in dev/Codespace by default.**

Add this to your `.env.local` (or set in Codespace environment):

```
MOLLY_STORAGE_PROVIDER=local
```

This will ensure the StorageRouter always uses the local JSON backend, never Firestore, in dev. All Firestore code will be ignored, and the dev server will start.

## How to revert to Firestore

If you want to use Firestore again, remove or comment out the `MOLLY_STORAGE_PROVIDER` line in your `.env.local`.

---

**This preserves all migration work and lets Molly run anywhere, with no loss of code or features.**
