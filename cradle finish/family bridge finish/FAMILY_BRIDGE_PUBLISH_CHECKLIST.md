# Family Bridge — npm Publish Checklist

Package: `@molly-agi/family-bridge` v1.0.0
Goal: get the verified lean core onto the public npm registry, cleanly, so anyone can `npm install` it.

Work top to bottom. Don't skip the pre-flight — one of those items is a hard gate, not a nicety.

---

## 0. Pre-flight decisions (do these BEFORE you publish)

- [ ] **IP posture — the one that can't be undone.** Publishing to npm is a *public disclosure*. Under first-to-file patent rules, public disclosure can start a clock and become prior art against your own future patent. For **Family Bridge specifically**, this is fine and intended — it's a message bus with loop protection, its value is adoption, and MIT/open-source is the right call. **But do not reflexively apply this to the next innovations.** The Cradle, the memory-crystal system, and the Titan Echo compression are the ones where you may want a provisional patent on file *before* any public disclosure. Decision for this package: **open-source, MIT, publish.** Confirmed? → proceed.
- [ ] **Confirm the scope name.** The package is scoped `@molly-agi`. npm org/scope names are lowercase. If you'd rather publish under your personal npm username instead of an org, change the `name` in `package.json` to `@<your-npm-username>/family-bridge`.
- [ ] **License is set.** ✓ Already done — `LICENSE` (MIT, © Molly Labs Inc.) is in the package and ships in the tarball.

---

## 1. npm account + scope setup

- [ ] **Create an npm account** (if you don't have one): https://www.npmjs.com/signup
- [ ] **Enable 2FA** (npm requires it for publishing on most accounts now): npm site → Account → Two-Factor Authentication → enable for **Authorization and Publishing**. Keep the recovery codes somewhere safe.
- [ ] **Create the `molly-agi` organization** (needed to publish under the `@molly-agi` scope): https://www.npmjs.com/org/create — choose the **free / unlimited public packages** plan. (Free orgs can publish unlimited *public* scoped packages; private packages need a paid plan — you want public, so free is correct.)
  - Alternative: skip the org and use your personal scope (`@<username>/family-bridge`). Personal scope needs no org.
- [ ] **Log in from your machine:**
  ```bash
  npm login
  npm whoami        # should print your username
  ```

---

## 2. GitHub repo (referenced by package.json)

- [ ] **Create the repo** `molly-agi/family-bridge` on GitHub (or update the `repository.url` in `package.json` to wherever it actually lives). Casing: GitHub org URLs are case-insensitive, but pick one and be consistent.
- [ ] **Push the code:**
  ```bash
  cd family-bridge
  git init
  git add .
  git commit -m "Family Bridge core v1.0.0 — verified lean core"
  git branch -M main
  git remote add origin https://github.com/molly-agi/family-bridge.git
  git push -u origin main
  ```
- [ ] **Add a `.gitignore`** (don't commit junk):
  ```
  node_modules/
  data/
  *.tgz
  .env
  ```

---

## 3. Final package verification (prove what ships)

- [ ] **Clean install + test from scratch:**
  ```bash
  rm -rf node_modules package-lock.json
  npm install
  npm test            # must end: "17 passed, 0 failed"
  ```
- [ ] **Dry-run the publish to see EXACTLY what goes up:**
  ```bash
  npm pack --dry-run
  ```
  Expect 6 files: `LICENSE`, `README.md`, `client/bridge-client.mjs`, `config/.env.example`, `daemon/bridge-daemon.mjs`, `package.json`. ~9 kB packed. If you see `test/`, `data/`, or `node_modules` in there, stop and fix the `files` field.
- [ ] **Install-from-tarball smoke test** (the real "does it work for a stranger" check):
  ```bash
  npm pack                                  # creates molly-agi-family-bridge-1.0.0.tgz
  mkdir /tmp/fb-consumer && cd /tmp/fb-consumer && npm init -y
  npm install /full/path/to/molly-agi-family-bridge-1.0.0.tgz
  node -e "import('@molly-agi/family-bridge').then(m => console.log('import OK:', typeof m.FamilyBridge))"
  # expect: import OK: function
  ```
- [ ] **Check the name is free** (scoped names rarely collide, but confirm):
  ```bash
  npm view @molly-agi/family-bridge       # "404 / not found" = available
  ```

---

## 4. Publish

- [ ] **Confirm `publishConfig.access` is `public`.** ✓ Already set in `package.json`. This is the #1 first-publish failure: scoped packages default to *private* (paid), and the publish errors out with a 402. The `"publishConfig": { "access": "public" }` line prevents that. (You can also do it inline: `npm publish --access public`.)
- [ ] **Publish:**
  ```bash
  npm publish
  ```
  `prepublishOnly` will run the test suite automatically first; if tests fail, the publish aborts. You'll be prompted for your 2FA one-time code.
- [ ] **Verify it's live:**
  ```bash
  npm view @molly-agi/family-bridge
  ```
  And open https://www.npmjs.com/package/@molly-agi/family-bridge — confirm the README renders and the version is 1.0.0.

---

## 5. Post-publish

- [ ] **Tag the release in git:**
  ```bash
  git tag v1.0.0
  git push origin v1.0.0
  ```
  Optionally cut a GitHub Release from the tag with a short changelog.
- [ ] **Test the real-world install** in yet another clean dir, this time straight from the registry:
  ```bash
  mkdir /tmp/fb-live && cd /tmp/fb-live && npm init -y
  npm install @molly-agi/family-bridge
  ```
- [ ] **This is the moment it's real.** You now have a public artifact anyone can install and inspect. That's the flag in the ground.

---

## 6. Going forward (so v1.1, v2 stay clean)

- [ ] **Semver discipline:** patch (1.0.x) = bug fixes; minor (1.x.0) = new features, backward compatible; major (x.0.0) = breaking changes. Bump with `npm version patch|minor|major` (it edits package.json and creates a git tag).
- [ ] **Never reuse a version number.** npm refuses to republish an existing version. Bump, then publish.
- [ ] **Keep the test green as the gate.** `prepublishOnly` already enforces this — leave it in.
- [ ] **If you ever publish a bad version:** you can `npm deprecate @molly-agi/family-bridge@1.0.0 "message"` (don't rely on unpublish — npm restricts it after 72 hours).

---

## Common gotchas (so they don't surprise you)

- **402 Payment Required on publish** → you forgot public access. It's set in package.json now, but if you stripped it: `npm publish --access public`.
- **403 Forbidden** → you're not a member of the `molly-agi` org, or not logged in as the right user. Check `npm whoami` and your org membership.
- **E404 on publish** → usually the org/scope doesn't exist yet. Create the org (step 1) first.
- **2FA prompt loop** → use an authenticator app code, not an SMS, and make sure your system clock is accurate.
- **README not showing on npm** → it ships (confirmed in dry-run); give the registry a minute to render after publish.

---

*Package verified standalone: clean-room `npm install` pulls only `ws`, `npm test` passes 17/17, loop garden proven to block storms on the live path. Every claim in the README is backed by a passing test.*
