# Rollback Procedures and Diagnostics

## Overview

This document provides comprehensive rollback procedures for the Molly-Core application. Use these procedures when a deployment causes issues or when you need to revert to a previous stable version.

## Quick Rollback (Emergency)

### Via GitHub Actions (Recommended)

1. **Navigate to Actions:**
   - Go to: https://github.com/Asidburn76/Molly-Core/actions
   - Click on "Deploy - Production Deployment with Rollback"

2. **Start Rollback:**
   - Click "Run workflow"
   - Select branch: `main`
   - Choose environment: `production` or `staging`
   - Enter rollback version (see "Finding Versions" below)
   - Click "Run workflow"

3. **Monitor:**
   - Watch the workflow execution
   - Wait for health checks to pass
   - Verify application functionality

**Time to Complete:** 5-10 minutes

### Via Command Line (Advanced)

```bash
# 1. Find the version to rollback to
git fetch --tags
git tag -l "deploy-production-*" | sort -r | head -5

# 2. Checkout the specific version
git checkout deploy-production-YYYYMMDD-HHMMSS

# 3. Deploy
npm ci
npm run build
# Deploy to your hosting platform
```

---

## Finding Previous Versions

### List All Production Deployments

```bash
git tag -l "deploy-production-*" | sort -r
```

### List Recent 10 Deployments

```bash
git tag -l "deploy-production-*" | sort -r | head -10
```

### Show Deployment Details

```bash
# Show deployment info
git show deploy-production-20260213-120000

# Show files in that deployment
git ls-tree -r --name-only deploy-production-20260213-120000
```

### Find Deployment by Date

```bash
# Find all deployments from February 13, 2026
git tag -l "deploy-production-20260213-*"
```

---

## Rollback Decision Tree

```
Is production broken?
├─ YES → Emergency Rollback (use most recent working version)
│   └─ Execute "Quick Rollback" above
│
└─ NO → Gradual issue detected?
    ├─ YES → Investigate first
    │   ├─ Check logs: Health check endpoints
    │   ├─ Review metrics: Error rates, performance
    │   └─ Decision: Rollback or hotfix?
    │
    └─ NO → Preventive rollback for testing
        └─ Use staging environment first
```

---

## Pre-Rollback Checklist

Before rolling back, verify:

- [ ] **Identify the Issue:** What is broken?
- [ ] **Find Target Version:** Which version was stable?
- [ ] **Check Data Compatibility:** Will rollback affect database schema?
- [ ] **Notify Team:** Inform stakeholders of rollback
- [ ] **Backup Current State:** Save logs and current deployment info
- [ ] **Document Reason:** Record why rollback was necessary

---

## Rollback with Database Migrations

If the deployment included database changes:

### 1. Check for Schema Changes

```bash
# Compare database schema between versions
git diff deploy-production-OLD..deploy-production-NEW -- migrations/
```

### 2. Rollback Migrations First

```bash
# If using migration tool, rollback database first
npm run migrate:rollback

# Or manually revert schema changes
# Connect to database and run reverse migrations
```

### 3. Then Rollback Application

Follow the standard rollback procedure after database is reverted.

---

## Post-Rollback Verification

After rollback completes, verify:

### 1. Health Checks

```bash
# Check application health endpoint
curl https://your-app-url.com/api/health

# Expected: 200 OK with health status
```

### 2. Critical Functionality

Test these critical paths:
- [ ] User authentication
- [ ] Core AI functionality
- [ ] Data persistence
- [ ] API endpoints

### 3. Performance Metrics

Monitor for 30 minutes:
- [ ] Response times
- [ ] Error rates
- [ ] CPU/Memory usage
- [ ] User activity

### 4. User Verification

- [ ] Notify users that issue is resolved
- [ ] Monitor support channels for complaints
- [ ] Check analytics for drop in activity

---

## Rollback Logging

### Create Rollback Record

```bash
# Log the rollback event
cat >> rollback-log.txt << EOF
----------------------------------------
Date: $(date -u)
From: deploy-production-YYYYMMDD-NEW
To: deploy-production-YYYYMMDD-OLD
Reason: [Brief description]
Duration: [Time taken]
Impact: [User-facing impact]
Performed by: [Your name]
----------------------------------------
EOF
```

### Update Team

Post to team chat:
```
🔄 ROLLBACK COMPLETED

From: v1.2.3 (deploy-production-20260213-150000)
To: v1.2.2 (deploy-production-20260213-120000)
Reason: Critical bug in authentication flow
Status: ✅ Stable
Health: All checks passing
Next steps: Fix being developed on hotfix branch
```

---

## Automatic Rollback

The deployment workflow includes automatic rollback:

### When It Triggers

- Post-deployment health checks fail
- Smoke tests fail
- Critical endpoints return errors

### What It Does

1. Detects deployment failure
2. Identifies previous stable version
3. Automatically triggers rollback deployment
4. Notifies team of automatic rollback

### Disabling Auto-Rollback

If you need to disable automatic rollback temporarily:

Edit `.github/workflows/deploy.yml`:
```yaml
rollback-on-failure:
  if: false  # Disable automatic rollback
```

**Warning:** Only disable if you're intentionally deploying a breaking change that requires manual intervention.

---

## Diagnostics Tools

### 1. Security Diagnostics

```bash
# Run security checks on current deployment
./scripts/security-check.sh
```

### 2. Health Check Script

```bash
# Check application health
curl -s https://your-app-url.com/api/health | jq .
```

### 3. Log Analysis

```bash
# View recent errors (if using centralized logging)
# Adjust based on your logging platform
curl -s "https://your-logs.com/api/logs?level=error&hours=1"
```

### 4. Performance Check

```bash
# Run load test against deployment
# npm install -g autocannon
autocannon -c 10 -d 30 https://your-app-url.com
```

---

## Rollback Scenarios

### Scenario 1: Authentication Broken

**Symptoms:**
- Users cannot log in
- 401 errors across the board

**Rollback:**
```bash
# Immediate rollback - no investigation needed
gh workflow run deploy.yml \
  -f environment=production \
  -f rollback_version=deploy-production-20260213-120000
```

### Scenario 2: Performance Degradation

**Symptoms:**
- Slow response times
- Increased server load

**Action:**
1. Check if it's deployment-related or traffic spike
2. If deployment-related → Rollback
3. If traffic → Scale infrastructure

### Scenario 3: Data Corruption

**Symptoms:**
- Users reporting lost data
- Database inconsistencies

**Action:**
1. **STOP** - Don't rollback immediately
2. Identify affected data
3. Backup current database
4. Fix data manually or restore from backup
5. THEN rollback application if needed

### Scenario 4: New Feature Breaking Old Functionality

**Symptoms:**
- New feature works
- Old features broken

**Action:**
1. Assess impact: How many users affected?
2. If critical → Immediate rollback
3. If minor → Hotfix in progress, rollback only if fix delayed

---

## Preventing Future Rollbacks

After a rollback, take these steps:

### 1. Root Cause Analysis

Document:
- What broke?
- Why did it break?
- Why wasn't it caught in testing?

### 2. Improve Testing

Add tests that would have caught the issue:
```typescript
// Example: Add regression test
it('should not break authentication after deployment', async () => {
  const result = await authenticateUser(credentials);
  expect(result.success).toBe(true);
});
```

### 3. Update CI/CD

Add checks to prevent similar issues:
```yaml
# Add to .github/workflows/ci.yml
- name: Run regression tests
  run: npm run test:regression
```

### 4. Staging Verification

Always deploy to staging first:
1. Deploy to staging
2. Run full test suite
3. Manual verification
4. Wait 24 hours
5. If stable → Deploy to production

---

## Emergency Contacts

In case of critical deployment issues:

- **Primary:** [Your Name/Team]
- **Secondary:** [Backup Contact]
- **Infrastructure:** [Cloud Provider Support]
- **On-Call:** [On-Call Schedule Link]

---

## Rollback Success Criteria

A rollback is considered successful when:

- ✅ Application is accessible
- ✅ All health checks pass
- ✅ Error rates return to baseline
- ✅ Performance metrics are normal
- ✅ No user reports of issues
- ✅ Rollback is logged and documented

---

## Legal/Compliance

If your application handles sensitive data:

- [ ] Document rollback in compliance log
- [ ] Notify DPO if user data was affected
- [ ] Check if incident reporting is required
- [ ] Update audit trail

---

## Appendix: Common Commands

```bash
# List all deployment tags
git tag -l "deploy-*"

# Delete a bad deployment tag (careful!)
git tag -d deploy-production-20260213-150000
git push origin :refs/tags/deploy-production-20260213-150000

# Create manual deployment tag
git tag -a deploy-production-$(date +%Y%m%d-%H%M%S) -m "Manual deployment"

# View deployment tag details
git show deploy-production-20260213-120000

# Compare two deployments
git diff deploy-production-20260213-120000..deploy-production-20260213-150000
```

---

**Last Updated:** 2026-02-13  
**Version:** 1.0  
**Maintained By:** DevOps Team  
**Review Schedule:** Quarterly
