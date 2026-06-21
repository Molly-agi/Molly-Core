# AWS Verified Access Deployment Template

## Deployment Configuration

- **AWS Region**: ******\_\_\_******
- **Account Type**: [ ] Single-account [ ] Multi-account (RAM)
- **Identity Provider**: [ ] IAM Identity Center [ ] Okta [ ] Other OIDC
- **Device Trust Provider**: [ ] CrowdStrike [ ] Jamf [ ] JumpCloud

## Trust Providers

| Provider | Type            | Reference Name | Status         |
| -------- | --------------- | -------------- | -------------- |
| \_\_\_   | user (identity) | \_\_\_         | [ ] Configured |
| \_\_\_   | device          | \_\_\_         | [ ] Configured |

## Access Groups

| Group Name | Policy Summary | Endpoint Count | Min Device Score |
| ---------- | -------------- | -------------- | ---------------- |
| \_\_\_     | \_\_\_         | \_\_\_         | \_\_\_           |

## Application Endpoints

| Application | Domain | Port | Group  | Policy Level   |
| ----------- | ------ | ---- | ------ | -------------- |
| \_\_\_      | \_\_\_ | 443  | \_\_\_ | group/endpoint |

## Cedar Policy Checklist

- [ ] Group-level policies defined for all groups
- [ ] Endpoint-level policies added for sensitive applications
- [ ] Device trust score thresholds set appropriately
- [ ] Forbid policies block unmanaged devices
- [ ] Admin access requires high device trust (>90)
- [ ] Policies tested in non-production first

## Monitoring Setup

- [ ] Access logs sent to CloudWatch Logs
- [ ] Access logs archived to S3
- [ ] CloudWatch alarms for high denial rates
- [ ] Dashboard created for access metrics
