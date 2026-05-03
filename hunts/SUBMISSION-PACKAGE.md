# GitLab Bug Bounty Submission Package
## Prepared: 2026-05-02

---

## Executive Summary

We have identified a **systemic vulnerability pattern** across multiple GitLab components: the use of Ruby's standard `==` operator for comparing security-sensitive values (tokens, secrets, HMAC signatures) instead of constant-time comparison functions like `ActiveSupport::SecurityUtils.secure_compare`.

This pattern enables timing side-channel attacks that can leak secret values character-by-character.

---

## Findings Overview

| ID | Component | File | Line | Severity | Est. Bounty |
|----|-----------|------|------|----------|-------------|
| 001 | Import Source Users | app/services/import/source_users/accept_reassignment_service.rb | 46 | Medium | $3,000-7,500 |
| 002 | Slash Commands API | lib/api/integrations.rb | 70 | High | $3,000-10,000 |
| 003 | Secrets Manager | ee/lib/api/internal/secrets_manager.rb | 31 | High | $5,000-10,000 |
| 004 | Salesforce SSO | vendor/gems/omniauth-salesforce/lib/omniauth/strategies/salesforce.rb | 40 | Critical | $10,000-20,000 |
| 005 | Systemic Pattern | (Multiple files) | - | High | $5,000-10,000 |

**Total Estimated Range: $26,000 - $57,500**

---

## Submission Order (Recommended)

### 1. CRITICAL - Submit First
**Report 004: Salesforce OmniAuth HMAC Signature Bypass**
- Highest severity (authentication bypass)
- Affects enterprise SSO users
- File: `gitlab-report-004-salesforce-timing.md`

### 2. HIGH - Submit Second  
**Report 002: Slash Commands API Token Timing Attack**
- Unauthenticated endpoint
- Affects Mattermost/Slack integrations
- File: `gitlab-report-002-slash-command-timing.md`

### 3. HIGH - Submit Third
**Report 003: OpenBao Secrets Manager Auth Timing Attack**
- Affects enterprise secrets infrastructure
- File: `gitlab-report-003-openbao-timing.md`

### 4. MEDIUM - Submit Fourth
**Report 001: Import Source User Token Timing Attack**
- Requires user interaction
- File: `gitlab-report-001-timing-attack.md`

---

## HackerOne Submission Checklist

For each report:
- [ ] Copy report content from .md file
- [ ] Set appropriate severity level
- [ ] Add CWE-208 (Observable Timing Discrepancy)
- [ ] Include affected file path and line number
- [ ] Reference GitLab's own use of secure_compare as remediation example
- [ ] Request CVE assignment

---

## Systemic Issue Note

Consider submitting an additional "umbrella" report documenting the systemic pattern:

**Title**: "Systemic Use of Non-Constant-Time Comparison for Security Tokens"

**Description**: Multiple components across GitLab use `==` for comparing security-sensitive values. A codebase-wide audit should be conducted to replace all such comparisons with `ActiveSupport::SecurityUtils.secure_compare`.

**Affected Pattern**: `token == `, `secret == `, `signature == `, `password == ` (where values are security-sensitive)

---

## Files in This Package

```
/workspaces/Molly-Core/hunts/
├── SUBMISSION-PACKAGE.md          (this file)
├── gitlab-report-001-timing-attack.md
├── gitlab-report-002-slash-command-timing.md
├── gitlab-report-003-openbao-timing.md
├── gitlab-report-004-salesforce-timing.md
├── gitlab-mission.json            (campaign config)
├── gitlab-scope.txt               (program scope)
└── gitlab-source/                 (cloned source - 97k files)
```

---

## Contact

Submitted by the Molly Security Team
Hunt Date: 2026-05-02
