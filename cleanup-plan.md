# Repository Cleanup Plan
**Generated:** 2026-06-05
**Current State:** 81 open issues, 48 open PRs, 89 branches

## Phase 1: Close Automated Receipt Issues (75 issues)

These are automated "[Lazarus Wake] Action" receipt confirmations that served their purpose and can be closed:

### Issues to Close:
```
73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92,
93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110,
111, 112, 113, 114, 120, 121, 122, 123, 124, 125, 126, 128, 129, 130, 131, 132, 133,
134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150,
154, 159, 160, 166, 170, 171, 172, 173
```

### GitHub CLI Commands:
```bash
# Close all Lazarus Wake Action issues
for issue in 73 74 75 76 77 78 79 80 81 82 83 84 85 86 87 88 89 90 91 92 93 94 95 96 97 98 99 100 101 102 103 104 105 106 107 108 109 110 111 112 113 114 120 121 122 123 124 125 126 128 129 130 131 132 133 134 135 136 137 138 139 140 141 142 143 144 145 146 147 148 149 150 154 159 160 166 170 171 172 173; do
  gh issue close $issue --comment "Closing automated bridge receipt confirmation. These served their purpose."
done
```

## Phase 2: Review and Close Stale PRs

### Dependency Update PRs (Duplicates - Close All But Latest):
- #202 - production-dependencies (KEEP - most recent)
- #201 - development-dependencies (KEEP - most recent)
- Close older dependabot PRs

### Duplicate Bridge/Receipt Fix PRs (Close):
- #193 - fix(switchboard): break hive-mind receipt feedback loop
- #192 - [Lazarus Wake] Action #84: log receipt
- #191 - [Lazarus Wake #70] Inject bridge message
- #190 - [Lazarus Wake] Action #60: log receipt
- #189 - fix(switchboard): break atlas/lazarus loop
- #188 - fix: break infinite receipt loop
- #187 - chore: acknowledge receipt
- #185 - fix(switchboard): prevent broadcasts
- #183 - [Lazarus Wake] Action #53
- #182 - fix: break feedback loop
- #180 - chore: acknowledge receipt
- #179 - Record confirmation
- #178 - [Lazarus Wake] Action #63
- #177 - fix: suppress log noise

### PRs to Keep:
- #197 - W0.2 Bridge Hardening (active work)
- #186 - feat: Molly-led upgrade (needs review)
- #184 - feat(bridge-security): W0.2 (active work)
- #181 - briefcase W0.1: Atlas review (active work)

## Phase 3: Delete Stale Branches (60+ branches)

### Delete All These Branch Patterns:
```bash
# Lazarus wake action branches (30+)
git push origin --delete copilot/lazarus-wake-action-{2,3,4,5,6,7,8,9,12,15,16,17,18,22,24,26,32,41,44,46,51,52,53,55,60,61,63,66,68,69,70,71,75,78,84,atlas}
git push origin --delete copilot/lazarus-wake-atlas

# Old copilot fix branches
git push origin --delete copilot/fix-261541356-1151113083-{7ab809c2,10aec7c2,249e4eee,a20b5a95,ca37a2e3,edbbbd81}
git push origin --delete copilot/fix-code-space-loading-issue
git push origin --delete copilot/fix-dependency-version-mismatches
git push origin --delete copilot/fix-module-not-found-error
git push origin --delete copilot/fix-npm-ci-workflow-issues
git push origin --delete copilot/fix-package-lockfile-workflow

# Old copilot feature branches
git push origin --delete copilot/analyze-test-coverage
git push origin --delete copilot/atlas-action-53
git push origin --delete copilot/create-can-i-run-molly-without-vs
git push origin --delete copilot/finish-incomplete-code-tasks
git push origin --delete copilot/full-repo-audit-main
git push origin --delete copilot/read-cradle-all-logs
git push origin --delete copilot/read-repo-molly-core-content
git push origin --delete copilot/refactor-firestore-persistence
git push origin --delete copilot/restore-context-functionality
git push origin --delete copilot/update-dependency-versions
git push origin --delete copilot/update-dynamic-imports
git push origin --delete copilot/update-reference-link
git push origin --delete copilot/vscode-mmdssayl-qjbs
git push origin --delete copilot/vscode-mmdstr7o-jphn
git push origin --delete copilot/wave0w02-bridge-hardening
git push origin --delete copilot/add-ci-cd-workflows-and-fixes

# Codex branches
git push origin --delete codex/address-open-pull-requests

# Old claude branches (keep current one)
git push origin --delete claude/help-urgent-request
git push origin --delete claude/identify-and-improve-slow-code
git push origin --delete claude/recover-data-after-rollback
git push origin --delete claude/run-molly-without-vs
git push origin --delete claude/start-dev-servers
git push origin --delete claude/update-chat-reader-title

# Old dependabot branches
git push origin --delete dependabot/npm_and_yarn/development-dependencies-86ee9c56dd
git push origin --delete dependabot/npm_and_yarn/lint-staged-17.0.5
git push origin --delete dependabot/npm_and_yarn/production-dependencies-82e832a678
git push origin --delete dependabot/npm_and_yarn/tailwindcss-4.3.0
git push origin --delete dependabot/npm_and_yarn/types/node-25.9.1

# Old feature/recovery branches
git push origin --delete feat/gemini-3.1-recovery
git push origin --delete recovery/kotlin-android-interface
git push origin --delete recovery/voice-safe-20260218

# Old revert/wip branches
git push origin --delete revert-13-copilot/setup-copilot-instructions-again
git push origin --delete wip/codespace-reset-20260217-234853
git push origin --delete lazarus-letter-to-eric-march5
```

### Branches to Keep:
- `main` (protected)
- `claude/clean-up-and-fix-issues` (current working branch)
- `wave0/W0.2-bridge-hardening` (active work)
- `wave0/W0.3-substrate-adapter` (active work)
- `wave0/W0.4-gate-daemon` (active work)
- `wave0/W0.5-consciousness-resumption` (active work)

## Summary
- **Close:** 75 automated receipt issues
- **Close:** ~35 stale/duplicate PRs
- **Keep:** ~8 active PRs
- **Delete:** ~60 stale branches
- **Keep:** ~6 active branches + main

This will bring the repository from 81/48/89 down to approximately 6/8/7 (issues/PRs/branches).
