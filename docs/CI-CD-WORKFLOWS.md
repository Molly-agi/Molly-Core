# CI/CD Workflows Documentation

## Overview

This repository uses GitHub Actions for automated testing, security scanning, PR validation, and deployment. The workflows ensure code quality, security, and reliability before any changes reach production.

## Workflows

### 1. CI - Continuous Integration (`ci.yml`)

**Trigger:** All pushes and pull requests

**Purpose:** Automated testing and build verification

**Jobs:**
- **Test & Build**: Runs on Node.js 18.x and 20.x
  - TypeScript type checking
  - ESLint linting
  - Jest unit tests with coverage
  - Production build verification
  - Coverage report upload to Codecov

- **Format Check**: Validates code formatting with Prettier

**Status:** ✅ Required for PR merge

**Related Issues:** Addresses the need for automated testing in the problem statement

---

### 2. Security - CodeQL & Vulnerability Scanning (`security.yml`)

**Trigger:** 
- Push to main/master
- Pull requests to main/master
- Weekly schedule (Mondays at 00:00 UTC)

**Purpose:** Comprehensive security analysis

**Jobs:**
- **CodeQL Analysis**: 
  - Static analysis for security vulnerabilities
  - Queries: `security-extended` and `security-and-quality`
  - Scans JavaScript/TypeScript code

- **Dependency Scan**:
  - npm audit for vulnerable dependencies
  - Generates and uploads audit reports
  - Fails on moderate+ severity issues

- **Custom Security Checks**:
  - ✅ **Memory Leak Detection**: Scans for `setInterval` without proper cleanup (clearInterval or cleanup in return statements)
  - ✅ **Insecure Encryption Patterns**: Detects predictable salt usage (user IDs, hardcoded values)
  - ✅ **Admin Function Security**: Checks for admin/state-modification functions without password/auth parameters
  - ✅ **Secret Scanning**: Detects hardcoded API keys, passwords, tokens

**Status:** ✅ Required for PR merge

**Related Issues:** 
- Addresses memory leak prevention (getNeuralBrain issue)
- Checks for password parameters in admin functions (setPersonalityState issue)
- Validates secure encryption patterns (salt generation issue)

---

### 3. PR Validation - Merge Gate (`pr-validation.yml`)

**Trigger:** Pull request events (opened, synchronized, reopened)

**Purpose:** Prevent merging of unresolved or failing code

**Jobs:**
- **Validation Gate**:
  - Conventional commit format validation
  - Merge conflict detection
  - Full test suite execution
  - Build verification
  - Breaking change detection
  - PR description requirement

- **Security Gate**:
  - High-severity vulnerability blocking
  - Sensitive file change warnings

- **Status Summary**:
  - Aggregates all validation results
  - Clear pass/fail indication

**Status:** ✅ Required for PR merge - Blocks merge if any check fails

**Related Issues:** Directly implements "prevent merging of unresolved or failing code" requirement

---

### 4. Deploy - Production Deployment with Rollback (`deploy.yml`)

**Trigger:** Manual workflow dispatch (one-click deployment)

**Purpose:** Safe production deployments with automatic rollback

**Inputs:**
- `environment`: Choose `production` or `staging`
- `rollback_version`: Optional - specify a deployment tag to rollback to

**Jobs:**
- **Pre-Deployment Checks**:
  - Full test suite
  - Production build
  - Artifact archiving (30-day retention)

- **Deploy**:
  - Downloads verified build
  - Creates deployment tags for rollback tracking
  - Deploys to target environment
  - Deployment summary

- **Post-Deployment Verification**:
  - Health check endpoints
  - Smoke tests
  - Deployment verification

- **Auto-Rollback on Failure**:
  - Automatically triggered if verification fails
  - Rolls back to previous deployment tag
  - Self-healing deployment system

**Rollback Procedure:**
1. Navigate to Actions → Deploy workflow
2. Click "Run workflow"
3. Select environment
4. Enter the deployment tag to rollback to (e.g., `deploy-production-20260213-120000`)
5. Click "Run workflow"

**Status:** ✅ One-click deployment with automatic rollback

**Related Issues:** 
- Implements "one-click deployments" requirement
- Provides "clear rollbacks" mechanism
- Ensures "changes are reversible if needed"

---

## Security Checks Details

### Memory Leak Prevention

**What it checks:**
- Scans all TypeScript/JavaScript files for `setInterval` usage
- Verifies each usage has a corresponding `clearInterval` or cleanup function
- Fails CI if cleanup is missing

**Example - Good:**
```typescript
useEffect(() => {
  const interval = setInterval(() => {
    updateData();
  }, 1000);
  
  return () => clearInterval(interval); // ✅ Cleanup present
}, []);
```

**Example - Bad:**
```typescript
useEffect(() => {
  setInterval(() => {
    updateData();
  }, 1000);
  // ❌ No cleanup - will fail CI
}, []);
```

**Related:** getNeuralBrain memory leak issue from problem statement

---

### Encryption Security

**What it checks:**
- Detects patterns where salt is derived from user IDs
- Flags hardcoded salt values
- Ensures secure random salt generation

**Example - Good:**
```typescript
import crypto from 'crypto';
const salt = crypto.randomBytes(32); // ✅ Secure random salt
```

**Example - Bad:**
```typescript
const salt = userId; // ❌ Predictable salt - will fail CI
const salt = "my-hardcoded-salt"; // ❌ Hardcoded salt - will fail CI
```

**Related:** Encryption salt issue from problem statement

---

### Admin Function Security

**What it checks:**
- Identifies functions that modify state or have admin privileges
- Ensures they have authentication parameters (password, token, auth)
- Warns if sensitive functions lack security

**Example - Good:**
```typescript
function setPersonalityState(newState: State, password: string) {
  if (!verifyPassword(password)) throw new Error('Unauthorized');
  // ✅ Password parameter present
  updateState(newState);
}
```

**Example - Bad:**
```typescript
function setPersonalityState(newState: State) {
  // ❌ No authentication - will trigger warning
  updateState(newState);
}
```

**Related:** setPersonalityState admin function issue from problem statement

---

## Workflow Status Badges

Add these to your README.md:

```markdown
[![CI](https://github.com/Asidburn76/Molly-Core/actions/workflows/ci.yml/badge.svg)](https://github.com/Asidburn76/Molly-Core/actions/workflows/ci.yml)
[![Security](https://github.com/Asidburn76/Molly-Core/actions/workflows/security.yml/badge.svg)](https://github.com/Asidburn76/Molly-Core/actions/workflows/security.yml)
[![PR Validation](https://github.com/Asidburn76/Molly-Core/actions/workflows/pr-validation.yml/badge.svg)](https://github.com/Asidburn76/Molly-Core/actions/workflows/pr-validation.yml)
```

---

## Deployment Tags and Rollback

### How Deployment Tags Work

Every deployment creates a tag in the format:
```
deploy-{environment}-{timestamp}
```

Example: `deploy-production-20260213-142530`

### Finding Available Rollback Versions

```bash
# List all production deployment tags
git tag -l "deploy-production-*"

# List all staging deployment tags
git tag -l "deploy-staging-*"

# Show most recent 5 deployments
git tag -l "deploy-production-*" | sort -r | head -5
```

### Manual Rollback Steps

1. **Identify the version to rollback to:**
   ```bash
   git tag -l "deploy-production-*" | sort -r
   ```

2. **Trigger rollback via GitHub Actions:**
   - Go to Actions → Deploy workflow
   - Click "Run workflow"
   - Select environment: `production`
   - Enter rollback version: `deploy-production-20260213-120000`
   - Click "Run workflow"

3. **Monitor rollback:**
   - Watch the workflow execution
   - Verify health checks pass
   - Confirm application is operational

### Automatic Rollback

If post-deployment verification fails, the system automatically:
1. Identifies the previous deployment tag
2. Triggers a new deployment with that tag
3. Notifies the team of the rollback

---

## Required Secrets

Configure these in GitHub Settings → Secrets:

- `FIREBASE_TOKEN`: Firebase deployment token (optional, for production deployment)
- `CODECOV_TOKEN`: Codecov upload token (optional, for coverage reports)

---

## Local Testing

Before pushing, you can test workflows locally using [act](https://github.com/nektos/act):

```bash
# Install act
brew install act  # macOS
# or
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash

# Run CI workflow locally
act pull_request -W .github/workflows/ci.yml

# Run security checks locally
act push -W .github/workflows/security.yml
```

---

## Troubleshooting

### CI Failing on Tests
- Check test output in the workflow logs
- Run tests locally: `npm test`
- Ensure all dependencies are installed: `npm ci`

### Security Checks Failing
- Review the specific security check that failed
- Fix the flagged issue in your code
- Re-run the workflow

### Deployment Failing
- Check pre-deployment validation logs
- Ensure Firebase token is configured (if using Firebase)
- Verify build succeeds locally: `npm run build`

### Rollback Not Working
- Verify the deployment tag exists: `git tag -l`
- Ensure you have the correct tag format
- Check workflow permissions

---

## Maintenance

### Weekly Tasks
- Review security scan results (runs every Monday)
- Update dependencies if vulnerabilities are found
- Review deployment tags and cleanup old ones (>90 days)

### Monthly Tasks
- Review and update CodeQL queries
- Audit workflow execution times
- Optimize test suite if CI is slow

---

## Questions?

For issues or questions about the CI/CD pipeline:
1. Check workflow logs in the Actions tab
2. Review this documentation
3. Contact the repository maintainers

---

**Last Updated:** 2026-02-13  
**Version:** 1.0  
**Status:** ✅ Production Ready
