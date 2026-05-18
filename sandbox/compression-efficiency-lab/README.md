# Compression Efficiency Lab

Purpose: isolated workspace for optimizing Molly compression components before promoting changes to production paths.

## Structure
- source/: mirrored copies of target production components
- notes/: audit notes and findings
- patches/: handoff-ready patch notes
- benchmarks/: benchmark outputs and experiment logs

## Safety Rules
1. Do all experimental edits in this lab first.
2. Keep production files unchanged until benchmarks and regression checks pass.
3. Track each optimization with before/after metrics.
4. Promote only low-risk, measured improvements.

## Promotion Flow
1. Edit in lab copy.
2. Benchmark in lab.
3. Record results in notes.
4. Re-apply vetted changes to production files.
5. Re-run tests and validation.

## Copied Components
See notes/COMPONENT_MANIFEST.md
