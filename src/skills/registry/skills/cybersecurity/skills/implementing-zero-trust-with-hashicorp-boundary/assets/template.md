# HashiCorp Boundary Deployment Template

## Deployment Information

- **Organization**: ******\_\_\_******
- **Deployment Type**: [ ] Self-hosted [ ] HCP Boundary
- **Identity Provider**: ******\_\_\_******
- **Vault Integration**: [ ] Yes [ ] No

## Scope Hierarchy

| Scope Type   | Name   | Description | Owner  |
| ------------ | ------ | ----------- | ------ |
| Organization | \_\_\_ | \_\_\_      | \_\_\_ |
| Project      | \_\_\_ | \_\_\_      | \_\_\_ |
| Project      | \_\_\_ | \_\_\_      | \_\_\_ |

## Targets Inventory

| Target Name | Type | Port | Hosts  | Session Max | Recording | Credentials |
| ----------- | ---- | ---- | ------ | ----------- | --------- | ----------- |
| \_\_\_      | ssh  | 22   | \_\_\_ | 3600s       | [ ] Yes   | injected    |
| \_\_\_      | tcp  | 5432 | \_\_\_ | 1800s       | [ ] Yes   | brokered    |
| \_\_\_      | tcp  | 443  | \_\_\_ | 3600s       | [ ] Yes   | none        |

## Role Assignments

| Role   | Scope  | Grants | Groups |
| ------ | ------ | ------ | ------ |
| \_\_\_ | \_\_\_ | \_\_\_ | \_\_\_ |

## Security Checklist

- [ ] OIDC authentication configured with MFA-enabled IdP
- [ ] Managed groups auto-assign roles from IdP claims
- [ ] Vault credential brokering enabled for database targets
- [ ] SSH certificate injection via Vault SSH engine
- [ ] Session recording enabled for privileged access
- [ ] Session duration limits configured per target
- [ ] KMS configured with Vault Transit (not static AEAD)
- [ ] Workers deployed in each network zone
- [ ] Audit logging enabled on controllers and workers
- [ ] Break-glass recovery KMS configured and secured
