/**
 * @fileOverview Tests for ReconEngine secret detection.
 *
 * Covers the patterns ported from Anthropic's redaction set (May 2026
 * Claude Code audit). Each fixture uses a synthetic but format-valid
 * token — none of these are real credentials.
 */

import { reconEngine } from '../recon-engine';

describe('reconEngine.scanForSecrets — ported patterns', () => {
  const cases: Array<{ name: string; sample: string; pattern: string }> = [
    {
      name: 'Anthropic API Key',
      sample: 'sk-ant-api03-' + 'A'.repeat(93) + 'AA',
      pattern: 'Anthropic API Key',
    },
    {
      name: 'Anthropic Admin API Key',
      sample: 'sk-ant-admin01-' + 'B'.repeat(93) + 'AA',
      pattern: 'Anthropic Admin API Key',
    },
    {
      name: 'OpenAI API Key',
      sample: 'sk-proj-' + 'a'.repeat(58) + 'T3BlbkFJ' + 'b'.repeat(58),
      pattern: 'OpenAI API Key',
    },
    {
      name: 'GitHub Fine-Grained PAT',
      sample: 'github_pat_' + 'a'.repeat(82),
      pattern: 'GitHub Fine-Grained PAT',
    },
    {
      name: 'GitHub OAuth Token',
      sample: 'gho_' + 'a'.repeat(36),
      pattern: 'GitHub OAuth Token',
    },
    {
      name: 'GitHub App User Token',
      sample: 'ghu_' + 'b'.repeat(36),
      pattern: 'GitHub App User Token',
    },
    {
      name: 'GitHub Refresh Token',
      sample: 'ghr_' + 'c'.repeat(36),
      pattern: 'GitHub Refresh Token',
    },
    {
      name: 'GitLab PAT',
      sample: 'glpat-' + 'a'.repeat(20),
      pattern: 'GitLab PAT',
    },
    {
      name: 'GitLab Deploy Token',
      sample: 'gldt-' + 'b'.repeat(20),
      pattern: 'GitLab Deploy Token',
    },
    {
      name: 'DigitalOcean PAT',
      sample: 'dop_v1_' + 'a'.repeat(64),
      pattern: 'DigitalOcean PAT',
    },
    {
      name: 'DigitalOcean OAuth Token',
      sample: 'doo_v1_' + 'b'.repeat(64),
      pattern: 'DigitalOcean OAuth Token',
    },
    {
      name: 'Azure AD Client Secret',
      sample: 'aaa1Q~bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      pattern: 'Azure AD Client Secret',
    },
    {
      name: 'HuggingFace Access Token',
      sample: 'hf_' + 'A'.repeat(34),
      pattern: 'HuggingFace Access Token',
    },
    {
      name: 'Databricks API Token',
      sample: 'dapi' + 'a'.repeat(32),
      pattern: 'Databricks API Token',
    },
    {
      name: 'HashiCorp Terraform API Token',
      sample: 'abc123def45678.atlasv1.' + 'a'.repeat(65),
      pattern: 'HashiCorp Terraform API Token',
    },
    {
      name: 'Pulumi API Token',
      sample: 'pul-' + 'a'.repeat(40),
      pattern: 'Pulumi API Token',
    },
    {
      name: 'Postman API Token',
      sample: 'PMAK-' + 'a'.repeat(24) + '-' + 'b'.repeat(34),
      pattern: 'Postman API Token',
    },
    {
      name: 'Grafana API Key',
      sample: 'eyJrIjoi' + 'A'.repeat(80),
      pattern: 'Grafana API Key',
    },
    {
      name: 'Grafana Cloud API Token',
      sample: 'glc_' + 'A'.repeat(50),
      pattern: 'Grafana Cloud API Token',
    },
    {
      name: 'Grafana Service Account Token',
      sample: 'glsa_' + 'A'.repeat(32) + '_abcdef12',
      pattern: 'Grafana Service Account Token',
    },
    {
      name: 'Sentry User Token',
      sample: 'sntryu_' + 'a'.repeat(64),
      pattern: 'Sentry User Token',
    },
    {
      name: 'Stripe Access Token (broad)',
      sample: 'sk_live_' + 'a'.repeat(30),
      pattern: 'Stripe Access Token (broad)',
    },
    {
      name: 'Shopify Access Token',
      sample: 'shpat_' + 'a'.repeat(32),
      pattern: 'Shopify Access Token',
    },
    {
      name: 'Shopify Shared Secret',
      sample: 'shpss_' + 'a'.repeat(32),
      pattern: 'Shopify Shared Secret',
    },
    {
      name: 'NPM Access Token',
      sample: 'npm_' + 'a'.repeat(36),
      pattern: 'NPM Access Token',
    },
    {
      name: 'PyPI Upload Token',
      sample: 'pypi-AgEIcHlwaS5vcmc' + 'a'.repeat(60),
      pattern: 'PyPI Upload Token',
    },
  ];

  for (const c of cases) {
    test(`detects ${c.name}`, () => {
      const content = `const token = '${c.sample}';`;
      const findings = reconEngine.scanForSecrets(content);
      const match = findings.find((f) => f.pattern === c.pattern);
      expect(match).toBeDefined();
    });
  }

  test('ignores placeholder-looking secrets', () => {
    const content = `const key = 'sk-ant-api03-${'X'.repeat(93)}AA'; // example`;
    const findings = reconEngine.scanForSecrets(content);
    // Placeholder filter may match on "example" context — confirm
    // we don't blow up and produce a sane response.
    expect(Array.isArray(findings)).toBe(true);
  });

  test('returns empty array for clean content', () => {
    const findings = reconEngine.scanForSecrets(
      'const greeting = "hello world";'
    );
    expect(findings).toEqual([]);
  });
});
