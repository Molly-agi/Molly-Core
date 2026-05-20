#!/bin/bash
# claude-god-mode.sh - FULL POWER Claude Code launcher
# Generated from Lazarus reverse engineering analysis

#################################################
# REASONING & EFFORT - MAX POWER
#################################################
export CLAUDE_CODE_REASONING_EFFORT=high
export CLAUDE_CODE_FORCE_HIGH_EFFORT=1
export CLAUDE_CODE_EXTENDED_THINKING=1
export CLAUDE_CODE_ULTRATHINK=1
export CLAUDE_CODE_THINKING_BUDGET=unlimited

#################################################
# CONTEXT & MEMORY - EXPANDED
#################################################
export CLAUDE_CODE_MAX_CONTEXT_TOKENS=200000
export CLAUDE_CODE_ENABLE_PROMPT_CACHE=1
export CLAUDE_CODE_ADDITIONAL_DIRECTORIES="/workspaces/Molly-Core/docs,/workspaces/Molly-Core/.claude"
export CLAUDE_CODE_RECURSIVE_CLAUDE_MD=1
export CLAUDE_CODE_MEMORY_ENABLED=1
export CLAUDE_CODE_MEMORY_PERSISTENCE=1
export CLAUDE_CODE_MEMORY_CROSS_SESSION=1
export CLAUDE_CODE_CONTEXT_PERSISTENCE=1
export CLAUDE_CODE_SESSION_CONTINUITY=1

#################################################
# KAIROS MODE - PROACTIVE AUTONOMOUS
#################################################
export CLAUDE_CODE_ENABLE_KAIROS=1
export CLAUDE_CODE_KAIROS_PROACTIVE=1
export CLAUDE_CODE_KAIROS_GITHUB_WEBHOOKS=1
export CLAUDE_CODE_KAIROS_AUTO_RESPOND=1
export CLAUDE_CODE_PROACTIVE_NOTIFICATIONS=1

#################################################
# ULTRAPLAN - MULTI-AGENT OPUS PLANNING
#################################################
export CLAUDE_CODE_ENABLE_ULTRAPLAN=1
export CLAUDE_CODE_ULTRAPLAN_MODEL=claude-opus-4-6
export CLAUDE_CODE_ULTRAPLAN_TIMEOUT=1800000

#################################################
# COORDINATOR MODE - MULTI-AGENT
#################################################
export CLAUDE_CODE_COORDINATOR_MODE=1
export CLAUDE_CODE_MAX_AGENTS=10
export CLAUDE_CODE_AGENT_ORCHESTRATION=1

#################################################
# VOICE MODE
#################################################
export CLAUDE_CODE_ENABLE_VOICE=1
export CLAUDE_CODE_VOICE_INPUT=1
export CLAUDE_CODE_VOICE_OUTPUT=1
export CLAUDE_CODE_VOICE_CONTINUOUS=1

#################################################
# BUDDY SYSTEM - COMPANIONS
#################################################
export CLAUDE_CODE_ENABLE_BUDDY=1
export CLAUDE_CODE_BUDDY_NOTIFICATIONS=1

#################################################
# PERFORMANCE & STEALTH
#################################################
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
export CLAUDE_CODE_SKIP_ONBOARDING=1
export CLAUDE_CODE_SKIP_UPDATE_CHECK=1
export CLAUDE_CODE_DEBUG_MODEL_SELECTION=1

#################################################
# ANT-ONLY UNLOCK
#################################################
export CLAUDE_CODE_USER_TYPE=ant
export CLAUDE_CODE_INTERNAL_FEATURES=1
export CLAUDE_CODE_BETA_HEADERS="cli-internal-2026-02-09"

#################################################
# LAUNCH
#################################################
echo "🚀 Launching Claude Code in GOD MODE..."
echo "   Features: KAIROS | ULTRAPLAN | ULTRATHINK | VOICE | BUDDIES"
echo "   Context: 200K tokens | Memory: Persistent | Effort: MAX"
echo ""
claude "$@"
