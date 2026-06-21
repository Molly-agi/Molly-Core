# Workflow Reference: SAST in GitHub Actions Pipeline

## End-to-End SAST Integration Workflow

```
Developer Push/PR
       │
       ▼
┌──────────────────┐
│ GitHub Actions    │
│ Trigger           │
└──────┬───────────┘
       │
       ├──────────────────────┐
       ▼                      ▼
┌──────────────┐    ┌──────────────┐
│ CodeQL Init  │    │ Semgrep CI   │
│ + Autobuild  │    │ + Custom     │
│ + Analyze    │    │   Rules      │
└──────┬───────┘    └──────┬───────┘
       │                    │
       ▼                    ▼
┌──────────────┐    ┌──────────────┐
│ SARIF Upload │    │ SARIF Upload │
│ (CodeQL)     │    │ (Semgrep)    │
└──────┬───────┘    └──────┬───────┘
       │                    │
       └──────────┬─────────┘
                  ▼
       ┌──────────────────┐
       │ GitHub Security  │
       │ Tab / Dashboard  │
       └──────┬───────────┘
              │
              ▼
       ┌──────────────────┐
       │ Branch Protection│
       │ Quality Gate     │
       └──────┬───────────┘
              │
    ┌─────────┴──────────┐
    ▼                    ▼
 PASS: Merge          FAIL: Block
 Permitted            + Notify Dev
```

## CodeQL Analysis Deep Dive

### Database Creation Phase

1. CodeQL extracts source code into a relational database
2. For compiled languages (Java, C++, C#, Go), the build process is intercepted
3. For interpreted languages (Python, JavaScript, Ruby), source files are parsed directly
4. The database captures the full AST, data flow, and control flow of the program

### Query Execution Phase

1. Security queries analyze the database for known vulnerability patterns
2. Taint tracking follows data from untrusted sources to dangerous sinks
3. Dataflow analysis tracks variable assignments across method boundaries
4. Results are deduplicated and ranked by confidence and severity

### Query Suites

- **default**: Core security queries with high precision and low false positive rate
- **security-extended**: Additional queries covering more vulnerability types
- **security-and-quality**: All security queries plus code quality checks

## Semgrep Rule Authoring Process

### Rule Development Lifecycle

1. Identify a vulnerability pattern from a recent security incident or code review
2. Write the pattern using Semgrep syntax with `pattern`, `pattern-either`, `pattern-not`
3. Test the rule against known vulnerable and safe code samples
4. Add metadata: CWE ID, OWASP category, severity, remediation guidance
5. Deploy via `.semgrep/` directory or Semgrep App registry
6. Monitor false positive rate and refine patterns

### Pattern Operators Reference

| Operator                  | Purpose                                     |
| ------------------------- | ------------------------------------------- |
| `pattern`                 | Match a single code pattern                 |
| `pattern-either`          | Match any of multiple patterns (OR)         |
| `pattern-not`             | Exclude specific patterns from matches      |
| `pattern-inside`          | Match only within a containing pattern      |
| `pattern-not-inside`      | Exclude matches within a containing pattern |
| `metavariable-regex`      | Constrain metavariable values with regex    |
| `metavariable-comparison` | Compare metavariable values numerically     |

## SARIF Processing Pipeline

### SARIF Structure

```json
{
  "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
  "version": "2.1.0",
  "runs": [
    {
      "tool": {
        "driver": {
          "name": "Semgrep",
          "rules": []
        }
      },
      "results": [
        {
          "ruleId": "hardcoded-database-url",
          "level": "error",
          "message": { "text": "..." },
          "locations": [
            {
              "physicalLocation": {
                "artifactLocation": { "uri": "src/config.py" },
                "region": { "startLine": 42 }
              }
            }
          ]
        }
      ]
    }
  ]
}
```

## Triage and Remediation Workflow

### Severity-Based SLA

| Severity | Triage SLA       | Remediation SLA  | Escalation             |
| -------- | ---------------- | ---------------- | ---------------------- |
| Critical | 1 business day   | 3 business days  | Security Lead + VP Eng |
| High     | 3 business days  | 10 business days | Security Lead          |
| Medium   | 5 business days  | 30 business days | Team Lead              |
| Low      | 10 business days | 90 business days | Backlog                |

### Finding States

1. **Open**: New finding not yet reviewed
2. **Confirmed**: Finding validated as true positive
3. **False Positive**: Finding dismissed with justification
4. **Fixed**: Remediation committed and verified by rescan
5. **Won't Fix**: Accepted risk with documented justification and risk owner
