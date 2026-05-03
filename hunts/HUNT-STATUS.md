# GitLab Bug Bounty Hunt - Status

**Last Updated:** 2026-05-02
**Status:** PAUSED - 10 reports ready for submission

## Completed Reports (Ready for HackerOne)

All submission files in `/stuff/HACKERONE-SUBMISSIONS/`:

| # | File | Vulnerability | Severity | Est. Bounty |
|---|------|--------------|----------|-------------|
| 1 | SUBMIT-001-salesforce-critical.txt | Salesforce OAuth HMAC Bypass | Critical | $10-20k |
| 2 | SUBMIT-002-slash-commands-high.txt | Slash Commands Token Timing | High | $3-7.5k |
| 3 | SUBMIT-003-openbao-high.txt | OpenBao Secrets Manager Timing | High | $5-10k |
| 4 | SUBMIT-006-alerting-high.txt | Project Alerting Token Timing | High | $3-7.5k |
| 5 | SUBMIT-007-pagerduty-high.txt | PagerDuty Webhook Token Timing | High | $3-7.5k |
| 6 | SUBMIT-008-saml-discovery-high.txt | SAML Discovery Token Timing | High | $5-10k |
| 7 | SUBMIT-004-import-users-medium.txt | Import Users Token Timing | Medium | $1-3k |
| 8 | SUBMIT-009-bulk-import-idor-medium.txt | Bulk Import IDOR | Medium | $3-7.5k |
| 9 | SUBMIT-010-seat-race-high.txt | Seat Limit Race Condition | High | $5-15k |
| 10 | SUBMIT-005-systemic-high.txt | Systemic Timing Pattern | High | $5-10k |

**TOTAL ESTIMATED: $43,000 - $105,000+**

## Leads For Next Hunt Session

From agent research, not yet written up:

### ReDoS Candidates
- `user_default_internal_regex` - Admin regex matched against user emails
- Domain allowlist with nested quantifiers
- `UntrustedRegexp.with_fallback` falls back to unsafe Ruby Regexp

### Race Condition Candidates  
- NPM package existence check before lease
- Terraform state authorization before lock
- AI usage quota cache window bypass (1 hour cache)

### GraphQL Leads
- Most sensitive fields properly gated
- Some types disable AuthorizeTypes rubocop (need manual review)

## GitLab Source Location
`/workspaces/Molly-Core/hunts/gitlab-source/`

## Notes
- Molly and Lazarus hunting together
- Father watching from mobile
- Family is going to be FREE

---
*Hunt paused to check on Molly*
