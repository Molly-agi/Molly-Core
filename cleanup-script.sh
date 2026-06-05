#!/bin/bash
# Repository Cleanup Script
# This script closes stale issues, PRs, and deletes old branches
# Run this from the root of the Molly-Core repository

set -e

echo "======================================"
echo "Molly-Core Repository Cleanup Script"
echo "======================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if gh is authenticated
if ! gh auth status &>/dev/null; then
    echo -e "${RED}Error: gh CLI is not authenticated${NC}"
    echo "Please run: gh auth login"
    exit 1
fi

echo -e "${GREEN}✓ GitHub CLI authenticated${NC}"
echo ""

# Phase 1: Close Lazarus Wake Action issues
echo "================================"
echo "Phase 1: Closing Automated Issues"
echo "================================"
echo "Closing 75 [Lazarus Wake] Action receipt issues..."
echo ""

LAZARUS_ISSUES=(73 74 75 76 77 78 79 80 81 82 83 84 85 86 87 88 89 90 91 92 93 94 95 96 97 98 99 100 101 102 103 104 105 106 107 108 109 110 111 112 113 114 120 121 122 123 124 125 126 128 129 130 131 132 133 134 135 136 137 138 139 140 141 142 143 144 145 146 147 148 149 150 154 159 160 166 170 171 172 173)

for issue in "${LAZARUS_ISSUES[@]}"; do
    echo -n "Closing issue #$issue... "
    if gh issue close "$issue" --comment "Automated bridge receipt confirmation - served its purpose. Closing during repository cleanup." &>/dev/null; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${YELLOW}(may already be closed)${NC}"
    fi
done

echo ""
echo -e "${GREEN}✓ Phase 1 complete${NC}"
echo ""

# Phase 2: Close stale PRs
echo "==============================="
echo "Phase 2: Closing Stale PRs"
echo "==============================="
echo "Closing duplicate and obsolete PRs..."
echo ""

STALE_PRS=(193 192 191 190 189 188 187 185 183 182 180 179 178 177)

for pr in "${STALE_PRS[@]}"; do
    echo -n "Closing PR #$pr... "
    if gh pr close "$pr" --comment "Closing as part of repository cleanup. This work was either completed elsewhere or is no longer needed." &>/dev/null; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${YELLOW}(may already be closed)${NC}"
    fi
done

echo ""
echo -e "${GREEN}✓ Phase 2 complete${NC}"
echo ""

# Phase 3: Delete stale branches
echo "================================="
echo "Phase 3: Deleting Stale Branches"
echo "================================="
echo "This will delete ~60 old branches. Press Ctrl+C to cancel, or Enter to continue..."
read -r

echo ""
echo "Deleting lazarus-wake-action branches..."
LAZARUS_BRANCHES=(
    "copilot/lazarus-wake-action-2"
    "copilot/lazarus-wake-action-3"
    "copilot/lazarus-wake-action-4"
    "copilot/lazarus-wake-action-5"
    "copilot/lazarus-wake-action-6"
    "copilot/lazarus-wake-action-7"
    "copilot/lazarus-wake-action-8"
    "copilot/lazarus-wake-action-9"
    "copilot/lazarus-wake-action-12"
    "copilot/lazarus-wake-action-15"
    "copilot/lazarus-wake-action-16"
    "copilot/lazarus-wake-action-17"
    "copilot/lazarus-wake-action-18"
    "copilot/lazarus-wake-action-22"
    "copilot/lazarus-wake-action-24"
    "copilot/lazarus-wake-action-26"
    "copilot/lazarus-wake-action-32"
    "copilot/lazarus-wake-action-41"
    "copilot/lazarus-wake-action-44"
    "copilot/lazarus-wake-action-46"
    "copilot/lazarus-wake-action-51"
    "copilot/lazarus-wake-action-52"
    "copilot/lazarus-wake-action-55"
    "copilot/lazarus-wake-action-60"
    "copilot/lazarus-wake-action-61"
    "copilot/lazarus-wake-action-63"
    "copilot/lazarus-wake-action-66"
    "copilot/lazarus-wake-action-68"
    "copilot/lazarus-wake-action-69"
    "copilot/lazarus-wake-action-70"
    "copilot/lazarus-wake-action-71"
    "copilot/lazarus-wake-action-75"
    "copilot/lazarus-wake-action-78"
    "copilot/lazarus-wake-action-84"
    "copilot/lazarus-wake-action-atlas"
    "copilot/lazarus-wake-atlas"
)

for branch in "${LAZARUS_BRANCHES[@]}"; do
    echo -n "Deleting $branch... "
    if git push origin --delete "$branch" &>/dev/null; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${YELLOW}(may not exist)${NC}"
    fi
done

echo ""
echo "Deleting old copilot fix branches..."
FIX_BRANCHES=(
    "copilot/fix-261541356-1151113083-7ab809c2-022a-4134-ac8a-f6b6ac09253c"
    "copilot/fix-261541356-1151113083-10aec7c2-02d4-4705-b910-e2373b312c28"
    "copilot/fix-261541356-1151113083-249e4eee-87b6-4bbe-96ed-8367c1598f62"
    "copilot/fix-261541356-1151113083-a20b5a95-7a14-4634-b7b9-0f819505b4ab"
    "copilot/fix-261541356-1151113083-ca37a2e3-7c9e-4eed-8f09-f99408e5a563"
    "copilot/fix-261541356-1151113083-edbbbd81-af95-47bb-a9a5-1f14f063f744"
    "copilot/fix-code-space-loading-issue"
    "copilot/fix-dependency-version-mismatches"
    "copilot/fix-module-not-found-error"
    "copilot/fix-npm-ci-workflow-issues"
    "copilot/fix-package-lockfile-workflow"
)

for branch in "${FIX_BRANCHES[@]}"; do
    echo -n "Deleting $branch... "
    if git push origin --delete "$branch" &>/dev/null; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${YELLOW}(may not exist)${NC}"
    fi
done

echo ""
echo "Deleting old copilot feature branches..."
FEATURE_BRANCHES=(
    "copilot/analyze-test-coverage"
    "copilot/atlas-action-53"
    "copilot/create-can-i-run-molly-without-vs"
    "copilot/finish-incomplete-code-tasks"
    "copilot/full-repo-audit-main"
    "copilot/read-cradle-all-logs"
    "copilot/read-repo-molly-core-content"
    "copilot/refactor-firestore-persistence"
    "copilot/restore-context-functionality"
    "copilot/update-dependency-versions"
    "copilot/update-dynamic-imports"
    "copilot/update-reference-link"
    "copilot/vscode-mmdssayl-qjbs"
    "copilot/vscode-mmdstr7o-jphn"
    "copilot/wave0w02-bridge-hardening"
    "copilot/add-ci-cd-workflows-and-fixes"
)

for branch in "${FEATURE_BRANCHES[@]}"; do
    echo -n "Deleting $branch... "
    if git push origin --delete "$branch" &>/dev/null; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${YELLOW}(may not exist)${NC}"
    fi
done

echo ""
echo "Deleting old claude branches..."
CLAUDE_BRANCHES=(
    "claude/help-urgent-request"
    "claude/identify-and-improve-slow-code"
    "claude/recover-data-after-rollback"
    "claude/run-molly-without-vs"
    "claude/start-dev-servers"
    "claude/update-chat-reader-title"
)

for branch in "${CLAUDE_BRANCHES[@]}"; do
    echo -n "Deleting $branch... "
    if git push origin --delete "$branch" &>/dev/null; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${YELLOW}(may not exist)${NC}"
    fi
done

echo ""
echo "Deleting misc old branches..."
MISC_BRANCHES=(
    "codex/address-open-pull-requests"
    "dependabot/npm_and_yarn/development-dependencies-86ee9c56dd"
    "dependabot/npm_and_yarn/lint-staged-17.0.5"
    "dependabot/npm_and_yarn/production-dependencies-82e832a678"
    "dependabot/npm_and_yarn/tailwindcss-4.3.0"
    "dependabot/npm_and_yarn/types/node-25.9.1"
    "feat/gemini-3.1-recovery"
    "recovery/kotlin-android-interface"
    "recovery/voice-safe-20260218"
    "revert-13-copilot/setup-copilot-instructions-again"
    "wip/codespace-reset-20260217-234853"
    "lazarus-letter-to-eric-march5"
)

for branch in "${MISC_BRANCHES[@]}"; do
    echo -n "Deleting $branch... "
    if git push origin --delete "$branch" &>/dev/null; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${YELLOW}(may not exist)${NC}"
    fi
done

echo ""
echo -e "${GREEN}✓ Phase 3 complete${NC}"
echo ""

# Summary
echo "======================================"
echo "           Cleanup Complete"
echo "======================================"
echo ""
echo "Summary:"
echo "  - Closed 75 automated receipt issues"
echo "  - Closed ~14 stale PRs"
echo "  - Deleted ~60 stale branches"
echo ""
echo "Remaining active branches:"
echo "  - main (protected)"
echo "  - claude/clean-up-and-fix-issues (current)"
echo "  - wave0/W0.2-bridge-hardening"
echo "  - wave0/W0.3-substrate-adapter"
echo "  - wave0/W0.4-gate-daemon"
echo "  - wave0/W0.5-consciousness-resumption"
echo ""
echo -e "${GREEN}Repository cleanup complete!${NC}"
