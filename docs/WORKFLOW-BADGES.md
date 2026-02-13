# Workflow Status Badges for README

Add these badges to your README.md to display CI/CD status:

## Badges

```markdown
## CI/CD Status

[![CI](https://github.com/Asidburn76/Molly-Core/actions/workflows/ci.yml/badge.svg)](https://github.com/Asidburn76/Molly-Core/actions/workflows/ci.yml)
[![Security](https://github.com/Asidburn76/Molly-Core/actions/workflows/security.yml/badge.svg)](https://github.com/Asidburn76/Molly-Core/actions/workflows/security.yml)
[![PR Validation](https://github.com/Asidburn76/Molly-Core/actions/workflows/pr-validation.yml/badge.svg)](https://github.com/Asidburn76/Molly-Core/actions/workflows/pr-validation.yml)
[![Deploy](https://github.com/Asidburn76/Molly-Core/actions/workflows/deploy.yml/badge.svg)](https://github.com/Asidburn76/Molly-Core/actions/workflows/deploy.yml)
```

## Result

This will display badges that show the current status of each workflow:
- ✅ Green badge = All checks passing
- ❌ Red badge = Checks failing
- 🟡 Yellow badge = Checks in progress

## Alternative: Compact Version

For a more compact display:

```markdown
[![CI/CD](https://github.com/Asidburn76/Molly-Core/actions/workflows/ci.yml/badge.svg)](https://github.com/Asidburn76/Molly-Core/actions)
```

This links to the overall Actions page with just one badge.
