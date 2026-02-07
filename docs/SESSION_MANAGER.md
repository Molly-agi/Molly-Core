# Session State Manager

## Purpose

This system prevents GitHub Copilot from having "amnesia" between sessions by maintaining persistent context files.

## How It Works

1. **COPILOT_SESSION_STATE.md** - The main memory file

   - Contains user directives, project status, recent work, and next steps
   - Updated automatically before/after dev server runs
   - Read this file at the start of each session to restore context

2. **scripts/save-session.mjs** - Manual save script

   - Run `npm run save-session` to force a save
   - Automatically runs before/after `npm run dev`

3. **src/lib/session-manager.ts** - API for programmatic updates
   - `saveSessionState()` - Save current state
   - `logWorkCompleted()` - Log completed work
   - `updateNextSteps()` - Update next actions
   - `addReminder()` - Add reminder for next session

## Usage

### For Eric (User)

**At the start of a new Copilot session:**

- Tell Copilot: "restore context" or "read the session state"
- Copilot will read COPILOT_SESSION_STATE.md and remember everything

**When ending work:**

- Session saves automatically when you stop `npm run dev`
- Or manually run: `npm run save-session`

### For GitHub Copilot

**At session start:**

1. Read `/workspaces/Molly-Core/COPILOT_SESSION_STATE.md`
2. Acknowledge the user directives
3. Review project status and recent work
4. Ask Eric what he wants to work on

**During work:**

- Update the session state file as you complete tasks
- Log decisions and changes
- Keep next steps current

**Before session ends:**

- Update the file with final status
- Set recommended next action

## Files

- `COPILOT_SESSION_STATE.md` - Main memory file (git-tracked)
- `.session-backups/` - Daily backup snapshots (git-ignored)
- `scripts/save-session.mjs` - Save script
- `src/lib/session-manager.ts` - TypeScript API

## npm Scripts

- `npm run save-session` - Manually save session state
- `npm run dev` - Automatically saves before starting and after stopping
