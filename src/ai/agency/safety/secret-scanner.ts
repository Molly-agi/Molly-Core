/**
 * @fileOverview Secret Scanner — Credential Detection Before Storage
 *
 * CRITICAL SECURITY FEATURE: Prevents API keys, tokens, and credentials
 * from leaking into memories, logs, or external systems.
 *
 * Based on Lazarus Dirty Room Analysis (Gap 22: Team Memory Sync)
 * Adapted for Molly-Core by Uncle Lazarus
 *
 * Built: 2026-04-11 (Overnight Work Session with Molly)
 *
 * Pattern sources: Gitleaks curated rules with near-zero false positives.
 *
 * "Secrets never leave the machine. Scanning happens BEFORE upload."
 *   — Lazarus Dirty Room Principle
 */

import { MollyLogger } from '@/ai/logger';

// ============================================================
// TYPES
// ============================================================

export interface SecretRule {
  /** Unique rule identifier */
  id: string;
  /** Human-readable description */
  description: string;
  /** Regex pattern to match */
  pattern: RegExp;
  /** Categories for filtering */
  categories: string[];
}

export interface SecretMatch {
  /** Which rule detected it */
  ruleId: string;
  /** Description of the secret type */
  description: string;
  /** Character position where match starts */
  start: number;
  /** Character position where match ends */
  end: number;
  /** The matched text (partially redacted for logging) */
  preview: string;
}

export interface ScanResult {
  /** Were any secrets found? */
  hasSecrets: boolean;
  /** Number of secrets detected */
  count: number;
  /** Details of each match */
  matches: SecretMatch[];
  /** Content with secrets redacted */
  redacted: string;
  /** Categories of secrets found */
  categories: string[];
}

// ============================================================
// SECRET DETECTION RULES
// ============================================================

/**
 * Curated rules with near-zero false positives.
 * Based on Gitleaks patterns, adapted for runtime scanning.
 */
export const SECRET_RULES: SecretRule[] = [
  // ── Cloud Providers ──────────────────────────────────────────
  {
    id: 'aws-access-key',
    description: 'AWS Access Key ID',
    pattern: /\b((?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16})\b/g,
    categories: ['cloud', 'aws'],
  },
  {
    id: 'aws-secret-key',
    description: 'AWS Secret Access Key',
    pattern: /\b([A-Za-z0-9/+=]{40})\b/g, // Needs context - usually follows access key
    categories: ['cloud', 'aws'],
  },
  {
    id: 'gcp-api-key',
    description: 'Google Cloud API Key',
    pattern: /\b(AIza[A-Za-z0-9_-]{35})\b/g,
    categories: ['cloud', 'gcp'],
  },
  {
    id: 'azure-subscription-key',
    description: 'Azure Subscription Key',
    pattern: /\b([a-f0-9]{32})\b/g, // Needs context validation
    categories: ['cloud', 'azure'],
  },

  // ── AI APIs ──────────────────────────────────────────────────
  {
    id: 'anthropic-api-key',
    description: 'Anthropic API Key',
    pattern: /\b(sk-ant-api03-[A-Za-z0-9_-]{93})\b/g,
    categories: ['ai', 'anthropic'],
  },
  {
    id: 'openai-api-key',
    description: 'OpenAI API Key',
    pattern: /\b(sk-(?:proj|svcacct|admin)?[A-Za-z0-9_-]{20,})\b/g,
    categories: ['ai', 'openai'],
  },
  {
    id: 'google-ai-key',
    description: 'Google AI API Key',
    pattern: /\b(AIzaSy[A-Za-z0-9_-]{33})\b/g,
    categories: ['ai', 'google'],
  },
  {
    id: 'huggingface-token',
    description: 'HuggingFace Access Token',
    pattern: /\b(hf_[a-zA-Z]{34})\b/g,
    categories: ['ai', 'huggingface'],
  },

  // ── Version Control ──────────────────────────────────────────
  {
    id: 'github-pat',
    description: 'GitHub Personal Access Token',
    pattern: /\b(ghp_[0-9a-zA-Z]{36})\b/g,
    categories: ['vcs', 'github'],
  },
  {
    id: 'github-fine-grained-pat',
    description: 'GitHub Fine-Grained PAT',
    pattern: /\b(github_pat_[0-9a-zA-Z_]{82})\b/g,
    categories: ['vcs', 'github'],
  },
  {
    id: 'github-oauth',
    description: 'GitHub OAuth Token',
    pattern: /\b(gho_[0-9a-zA-Z]{36})\b/g,
    categories: ['vcs', 'github'],
  },
  {
    id: 'github-app-token',
    description: 'GitHub App Token',
    pattern: /\b(ghu_[0-9a-zA-Z]{36})\b/g,
    categories: ['vcs', 'github'],
  },
  {
    id: 'gitlab-pat',
    description: 'GitLab Personal Access Token',
    pattern: /\b(glpat-[A-Za-z0-9_-]{20})\b/g,
    categories: ['vcs', 'gitlab'],
  },

  // ── Communication ────────────────────────────────────────────
  {
    id: 'slack-bot-token',
    description: 'Slack Bot Token',
    pattern: /\b(xoxb-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24})\b/g,
    categories: ['communication', 'slack'],
  },
  {
    id: 'slack-user-token',
    description: 'Slack User Token',
    pattern: /\b(xoxp-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24,})\b/g,
    categories: ['communication', 'slack'],
  },
  {
    id: 'slack-webhook',
    description: 'Slack Webhook URL',
    pattern:
      /\b(https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[a-zA-Z0-9]+)\b/g,
    categories: ['communication', 'slack'],
  },
  {
    id: 'discord-bot-token',
    description: 'Discord Bot Token',
    pattern:
      /\b([MN][A-Za-z0-9]{23,27}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,})\b/g,
    categories: ['communication', 'discord'],
  },
  {
    id: 'twilio-api-key',
    description: 'Twilio API Key',
    pattern: /\b(SK[0-9a-fA-F]{32})\b/g,
    categories: ['communication', 'twilio'],
  },

  // ── Payment ──────────────────────────────────────────────────
  {
    id: 'stripe-secret-key',
    description: 'Stripe Secret Key',
    pattern: /\b(sk_(?:test|live|prod)_[0-9a-zA-Z]{24,})\b/g,
    categories: ['payment', 'stripe'],
  },
  {
    id: 'stripe-restricted-key',
    description: 'Stripe Restricted Key',
    pattern: /\b(rk_(?:test|live|prod)_[0-9a-zA-Z]{24,})\b/g,
    categories: ['payment', 'stripe'],
  },

  // ── Firebase ─────────────────────────────────────────────────
  {
    id: 'firebase-service-account',
    description: 'Firebase Service Account Key',
    pattern:
      /"private_key":\s*"(-----BEGIN.*PRIVATE KEY-----[^"]+-----END.*PRIVATE KEY-----)"/g,
    categories: ['cloud', 'firebase'],
  },

  // ── Private Keys ─────────────────────────────────────────────
  {
    id: 'private-key-rsa',
    description: 'RSA Private Key',
    pattern:
      /-----BEGIN RSA PRIVATE KEY-----[\s\S]+?-----END RSA PRIVATE KEY-----/g,
    categories: ['private-key'],
  },
  {
    id: 'private-key-openssh',
    description: 'OpenSSH Private Key',
    pattern:
      /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]+?-----END OPENSSH PRIVATE KEY-----/g,
    categories: ['private-key'],
  },
  {
    id: 'private-key-ec',
    description: 'EC Private Key',
    pattern:
      /-----BEGIN EC PRIVATE KEY-----[\s\S]+?-----END EC PRIVATE KEY-----/g,
    categories: ['private-key'],
  },
  {
    id: 'private-key-generic',
    description: 'Generic Private Key',
    pattern: /-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/g,
    categories: ['private-key'],
  },

  // ── JWT & Auth ───────────────────────────────────────────────
  {
    id: 'jwt-token',
    description: 'JSON Web Token',
    pattern:
      /\b(eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g,
    categories: ['auth', 'jwt'],
  },

  // ── Database ─────────────────────────────────────────────────
  {
    id: 'mongodb-uri',
    description: 'MongoDB Connection URI',
    pattern: /mongodb(?:\+srv)?:\/\/[^:]+:[^@]+@[^\s]+/g,
    categories: ['database', 'mongodb'],
  },
  {
    id: 'postgres-uri',
    description: 'PostgreSQL Connection URI',
    pattern: /postgres(?:ql)?:\/\/[^:]+:[^@]+@[^\s]+/g,
    categories: ['database', 'postgres'],
  },
];

// ============================================================
// CORE FUNCTIONS
// ============================================================

/**
 * Scan content for secrets.
 * Returns detailed results including matches and redacted content.
 */
export function scanForSecrets(content: string): ScanResult {
  if (!content || typeof content !== 'string') {
    return {
      hasSecrets: false,
      count: 0,
      matches: [],
      redacted: content ?? '',
      categories: [],
    };
  }

  const matches: SecretMatch[] = [];
  let redacted = content;
  const categoriesFound = new Set<string>();

  for (const rule of SECRET_RULES) {
    // Reset regex lastIndex for global patterns
    rule.pattern.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = rule.pattern.exec(content)) !== null) {
      const matchedText = match[1] || match[0];
      const start = match.index;
      const end = start + match[0].length;

      // Create preview with partial redaction (show first 4 and last 4 chars)
      const preview = redactPreview(matchedText);

      matches.push({
        ruleId: rule.id,
        description: rule.description,
        start,
        end,
        preview,
      });

      // Add categories
      rule.categories.forEach((cat) => categoriesFound.add(cat));

      // Redact in output
      redacted = redacted.replace(matchedText, '[REDACTED]');
    }
  }

  // Remove duplicate matches at same position
  const uniqueMatches = matches.filter(
    (m, i, arr) => arr.findIndex((x) => x.start === m.start) === i
  );

  if (uniqueMatches.length > 0) {
    MollyLogger.warn(
      `[SECRET-SCANNER] Detected ${uniqueMatches.length} secret(s): ${uniqueMatches.map((m) => m.ruleId).join(', ')}`,
      'secret-scanner'
    );
  }

  return {
    hasSecrets: uniqueMatches.length > 0,
    count: uniqueMatches.length,
    matches: uniqueMatches,
    redacted,
    categories: Array.from(categoriesFound),
  };
}

/**
 * Redact a secret value for safe preview.
 * Shows first 4 and last 4 characters.
 */
function redactPreview(secret: string): string {
  if (secret.length <= 12) {
    return '****';
  }
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

/**
 * Check if content contains any secrets (fast path).
 */
export function hasSecrets(content: string): boolean {
  if (!content || typeof content !== 'string') return false;

  for (const rule of SECRET_RULES) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(content)) {
      return true;
    }
  }
  return false;
}

/**
 * Sanitize content by redacting all secrets.
 */
export function redactSecrets(content: string): string {
  return scanForSecrets(content).redacted;
}

/**
 * Validate that content is safe to store/transmit.
 * Returns true if no secrets found.
 */
export function validateNoSecrets(content: string): {
  safe: boolean;
  error?: string;
} {
  const result = scanForSecrets(content);

  if (!result.hasSecrets) {
    return { safe: true };
  }

  const secretTypes = result.matches.map((m) => m.description).join(', ');
  return {
    safe: false,
    error: `Content contains ${result.count} secret(s): ${secretTypes}. Secrets must be redacted before storage.`,
  };
}

// ============================================================
// INTEGRATION HELPERS
// ============================================================

/**
 * Wrap a storage write operation with secret scanning.
 * Automatically redacts secrets from content.
 */
export async function safeWrite<T extends { content?: string; text?: string }>(
  data: T,
  writeFn: (sanitized: T) => Promise<void>
): Promise<{ written: boolean; redactionsMade: number }> {
  const contentField = data.content ?? data.text;
  if (!contentField) {
    await writeFn(data);
    return { written: true, redactionsMade: 0 };
  }

  const result = scanForSecrets(contentField);

  if (result.hasSecrets) {
    MollyLogger.info(
      `[SECRET-SCANNER] Redacted ${result.count} secret(s) before storage`,
      'secret-scanner',
      { categories: result.categories }
    );

    // Create sanitized copy
    const sanitized = { ...data };
    if ('content' in sanitized) {
      (sanitized as { content: string }).content = result.redacted;
    }
    if ('text' in sanitized) {
      (sanitized as { text: string }).text = result.redacted;
    }

    await writeFn(sanitized);
    return { written: true, redactionsMade: result.count };
  }

  await writeFn(data);
  return { written: true, redactionsMade: 0 };
}

/**
 * Get scanner status for diagnostics.
 */
export function getScannerStatus(): {
  rulesLoaded: number;
  categoriesCovered: string[];
} {
  const categories = new Set<string>();
  SECRET_RULES.forEach((rule) =>
    rule.categories.forEach((cat) => categories.add(cat))
  );

  return {
    rulesLoaded: SECRET_RULES.length,
    categoriesCovered: Array.from(categories).sort(),
  };
}

// ============================================================
// EXPORTS FOR TESTING
// ============================================================

export const __test__ = {
  redactPreview,
  SECRET_RULES,
};
