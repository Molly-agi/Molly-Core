# HackerOne Report: Timing Attack on Import Source User Reassignment Token

## Summary
A timing side-channel vulnerability exists in GitLab's Import Source User reassignment token validation. The token comparison uses Ruby's standard `==` operator instead of a constant-time comparison function, potentially allowing an attacker to brute-force reassignment tokens character-by-character through timing analysis.

## Vulnerability Type
- **CWE-208**: Observable Timing Discrepancy
- **CVSS 3.1**: Medium (estimated 5.3-6.5)

## Affected Component
- **File**: `app/services/import/source_users/accept_reassignment_service.rb`
- **Line**: 46
- **Function**: `reassignment_token_is_valid?`

## Vulnerable Code

```ruby
# app/services/import/source_users/accept_reassignment_service.rb:45-47
def reassignment_token_is_valid?
  reassignment_token == import_source_user.reassignment_token
end
```

The same pattern exists in:
- `app/services/import/source_users/reject_reassignment_service.rb:50-51`

## Technical Details

### The Issue
The `reassignment_token` is a 32-character hex string (16 bytes of entropy via `SecureRandom.hex`). When comparing tokens using `==`, Ruby's string comparison returns `false` as soon as a mismatched character is found. This creates a measurable timing difference:

- Tokens with no matching prefix: ~fastest
- Tokens with 1 matching char: slightly slower
- Tokens with N matching chars: progressively slower

### Attack Vector
1. Attacker initiates an import that creates an `Import::SourceUser` record
2. The system generates a reassignment token and sends it via email to the target user
3. Attacker can call the `/import/source_users/:namespace_id/:reassignment_token/accept` endpoint repeatedly
4. By measuring response times, attacker can statistically determine correct characters one-by-one
5. With sufficient requests, the full 32-character token can be recovered

### Why This Matters
The reassignment token allows accepting or rejecting the reassignment of imported user contributions. An attacker who recovers this token could:
- Accept reassignment of another user's imported contributions to themselves
- Reject legitimate reassignment requests
- Potentially gain attribution for code/commits they didn't author

## Proof of Concept

### Timing Difference Demonstration
```ruby
require 'benchmark'

correct_token = "a" * 32
test_tokens = [
  "b" * 32,           # 0 matching chars
  "a" + "b" * 31,     # 1 matching char  
  "aa" + "b" * 30,    # 2 matching chars
  "aaa" + "b" * 29,   # 3 matching chars
]

test_tokens.each do |token|
  time = Benchmark.measure { 100_000.times { token == correct_token } }
  puts "#{token[0..3]}...: #{time.real}"
end
```

Expected output shows increasing times as more prefix characters match.

### Endpoint to Target
```
POST /import/source_users/:namespace_id/:reassignment_token/accept
POST /import/source_users/:namespace_id/:reassignment_token/decline
```

## Recommended Fix

Replace the vulnerable comparison with `ActiveSupport::SecurityUtils.secure_compare`:

```ruby
# app/services/import/source_users/accept_reassignment_service.rb
def reassignment_token_is_valid?
  ActiveSupport::SecurityUtils.secure_compare(
    reassignment_token.to_s,
    import_source_user.reassignment_token.to_s
  )
end
```

GitLab already uses this pattern elsewhere:
- `vendor/gems/devise-pbkdf2-encryptable/lib/devise/pbkdf2_encryptable/encryptors/pbkdf2_sha512.rb:14` uses `Devise.secure_compare`
- Webhook signature verification documentation recommends `ActiveSupport::SecurityUtils.secure_compare`

## Impact

- **Confidentiality**: Token disclosure through timing side-channel
- **Integrity**: Unauthorized acceptance/rejection of user reassignment
- **Authentication Bypass**: Effectively bypasses the token-based authorization for reassignment actions

## Suggested Severity
Medium to High - While exploitation requires network timing analysis (which adds noise), the 32-character token space is significantly reduced when characters can be brute-forced sequentially rather than requiring 16^32 combinations.

## References
- [CWE-208: Observable Timing Discrepancy](https://cwe.mitre.org/data/definitions/208.html)
- [Rails Security Guide - Timing Attacks](https://guides.rubyonrails.org/security.html)
- [GitLab's own use of secure_compare in Devise](https://gitlab.com/gitlab-org/gitlab/-/blob/master/vendor/gems/devise-pbkdf2-encryptable/lib/devise/pbkdf2_encryptable/encryptors/pbkdf2_sha512.rb)

## Reporter
Submitted via GitLab Bug Bounty Program on HackerOne

---
**Status**: Ready for submission
**Target Program**: GitLab Bug Bounty
**Estimated Bounty**: $3,000 - $7,500 (High severity range)
