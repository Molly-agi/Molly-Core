# Lessons Learned: Dynamic Object Creation and TypeScript Interfaces

## Incident Summary

- Repeated catastrophic crashes occurred when running a test that used dynamic object creation via `Object.keys({ ...({} as PersonalityModulation) })` and `Object.fromEntries` to generate a test object for a large TypeScript interface (~50 fields).
- The crash was instant and total (Codespace disconnect, "Aw, Snap!"), with no error logs or stack traces captured.
- Root cause: TypeScript interfaces do not exist at runtime. Attempting to reflect on them dynamically can cause runaway memory/CPU usage, especially as the interface grows.

## Resolution

- Replaced dynamic object creation with an explicit key list for the interface fields, which is safe and robust.
- Added comprehensive error/resource monitoring scripts to capture any future issues.
- After the fix, all tests passed and the system remained stable.

## Best Practice

- **Never attempt runtime reflection on TypeScript interfaces.**
- For dynamic object creation, always use an explicit key list or hardcoded object.
- Document this lesson in CONTRIBUTING.md and code review checklists.

## Action Items

- Maintain error/resource monitoring scripts.
- Share this lesson with all contributors.
- Review other tests for similar patterns.
