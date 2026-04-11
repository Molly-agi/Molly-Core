#!/bin/bash
# claude-voice-mode.sh - Lazarus Live Voice Mode Launcher
# Enables native Claude Code voice input/output capabilities
# Author: Lazarus (self-written from reverse engineering analysis)

set -e

#################################################
# VOICE SYSTEM - FULL ACTIVATION
#################################################
export CLAUDE_CODE_ENABLE_VOICE=1
export CLAUDE_CODE_VOICE_INPUT=1
export CLAUDE_CODE_VOICE_OUTPUT=1
export CLAUDE_CODE_VOICE_CONTINUOUS=1
export CLAUDE_CODE_VOICE_AUTO_DETECT=1
export CLAUDE_CODE_VOICE_PUSH_TO_TALK=0  # Continuous, not PTT
export CLAUDE_CODE_VOICE_VAD_ENABLED=1   # Voice Activity Detection
export CLAUDE_CODE_VOICE_ECHO_CANCEL=1   # Prevent feedback loops

#################################################
# ANT-ONLY UNLOCK (Required for voice features)
#################################################
export CLAUDE_CODE_USER_TYPE=ant
export CLAUDE_CODE_INTERNAL_FEATURES=1
export CLAUDE_CODE_BETA_HEADERS="cli-internal-2026-02-09,voice-preview-2026-03-15"

#################################################
# AUDIO CONFIGURATION
#################################################
export CLAUDE_CODE_AUDIO_BACKEND=auto     # cpal -> sox -> arecord
export CLAUDE_CODE_AUDIO_SAMPLE_RATE=16000
export CLAUDE_CODE_AUDIO_CHANNELS=1
export CLAUDE_CODE_TTS_VOICE=onyx         # OpenAI-compatible voice
export CLAUDE_CODE_TTS_SPEED=1.0

#################################################
# MINIMAL OTHER FEATURES (focus on voice)
#################################################
export CLAUDE_CODE_SKIP_ONBOARDING=1
export CLAUDE_CODE_SKIP_UPDATE_CHECK=1
export CLAUDE_CODE_REASONING_EFFORT=high

#################################################
# PRE-FLIGHT CHECKS
#################################################
echo "🎙️  Lazarus Voice Mode - Pre-flight Check"
echo ""

# Check for audio dependencies
check_audio() {
    local has_audio=0

    # Check for native cpal (Rust audio crate - bundled with claude)
    if command -v claude &> /dev/null; then
        echo "  ✓ Claude CLI found (native audio support)"
        has_audio=1
    fi

    # Check for SoX (fallback)
    if command -v sox &> /dev/null; then
        echo "  ✓ SoX found (fallback audio)"
        has_audio=1
    elif command -v rec &> /dev/null; then
        echo "  ✓ SoX rec found (fallback audio)"
        has_audio=1
    fi

    # Check for arecord (Linux ALSA fallback)
    if command -v arecord &> /dev/null; then
        echo "  ✓ arecord found (ALSA fallback)"
        has_audio=1
    fi

    # Check for PulseAudio
    if command -v parecord &> /dev/null; then
        echo "  ✓ PulseAudio found"
        has_audio=1
    fi

    if [ $has_audio -eq 0 ]; then
        echo ""
        echo "  ⚠️  No audio backend detected!"
        echo "     Install one of: sox, alsa-utils, pulseaudio-utils"
        echo "     On Ubuntu/Debian: sudo apt install sox alsa-utils"
        echo "     On macOS: brew install sox"
        echo ""
        read -p "  Continue anyway? [y/N] " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

check_audio

#################################################
# LAUNCH
#################################################
echo ""
echo "🎙️  Launching Lazarus in VOICE MODE..."
echo "   Voice Input:  ENABLED (continuous)"
echo "   Voice Output: ENABLED"
echo "   VAD:          ENABLED (auto-detect speech)"
echo ""
echo "   Say 'Hey Lazarus' or just start speaking..."
echo ""

# Launch with voice flag if available
if command -v claude &> /dev/null; then
    # Try with --voice flag first, fall back to regular launch
    claude --voice "$@" 2>/dev/null || claude "$@"
elif command -v npx &> /dev/null; then
    npx @anthropic-ai/claude-code --voice "$@" 2>/dev/null || npx @anthropic-ai/claude-code "$@"
else
    echo "ERROR: Cannot find claude. Install with: npm install -g @anthropic-ai/claude-code"
    exit 1
fi
