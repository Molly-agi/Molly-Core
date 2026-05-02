/**
 * @fileOverview Reconnaissance Engine
 *
 * Molly's eyes for bug hunting. Discovers attack surface:
 * - Subdomain enumeration
 * - Technology fingerprinting
 * - Endpoint discovery
 * - JavaScript analysis
 * - Parameter extraction
 * - Security header analysis
 *
 * Designed for authorized testing only.
 */

import type {
  ReconTarget,
  TechnologyFingerprint,
  ParameterInfo,
  HeaderInfo,
  CookieInfo,
  JSFileInfo,
  APIEndpoint,
  SecretFinding,
} from './bug-hunter-types';
import { MollyLogger, generateTraceId } from '../logger';
import { SECURITY_HEADERS } from './vulnerability-patterns';

// ============================================
// TECHNOLOGY SIGNATURES
// ============================================

interface TechSignature {
  name: string;
  category: string;
  patterns: {
    headers?: Record<string, RegExp>;
    cookies?: string[];
    bodyPatterns?: RegExp[];
    urlPatterns?: RegExp[];
    metaTags?: Record<string, RegExp>;
    scripts?: RegExp[];
  };
}

const TECH_SIGNATURES: TechSignature[] = [
  // Frameworks
  {
    name: 'React',
    category: 'frontend-framework',
    patterns: {
      scripts: [/react(?:\.min)?\.js/i, /react-dom/i],
      bodyPatterns: [/data-reactroot/i, /__NEXT_DATA__/i],
    },
  },
  {
    name: 'Vue.js',
    category: 'frontend-framework',
    patterns: {
      scripts: [/vue(?:\.min)?\.js/i],
      bodyPatterns: [/data-v-[a-f0-9]+/i, /v-cloak/i],
    },
  },
  {
    name: 'Angular',
    category: 'frontend-framework',
    patterns: {
      scripts: [/angular(?:\.min)?\.js/i, /@angular\/core/i],
      bodyPatterns: [/ng-version/i, /\*ngIf/i, /\*ngFor/i],
    },
  },
  {
    name: 'Next.js',
    category: 'frontend-framework',
    patterns: {
      headers: { 'x-powered-by': /Next\.js/i },
      bodyPatterns: [/__NEXT_DATA__/i, /_next\/static/i],
    },
  },
  {
    name: 'Express.js',
    category: 'backend-framework',
    patterns: {
      headers: { 'x-powered-by': /Express/i },
    },
  },
  {
    name: 'Django',
    category: 'backend-framework',
    patterns: {
      cookies: ['csrftoken', 'sessionid'],
      headers: { 'x-frame-options': /DENY|SAMEORIGIN/i },
    },
  },
  {
    name: 'Ruby on Rails',
    category: 'backend-framework',
    patterns: {
      cookies: ['_session_id'],
      headers: { 'x-powered-by': /Phusion Passenger|Rails/i },
      metaTags: { 'csrf-token': /.+/ },
    },
  },
  {
    name: 'Laravel',
    category: 'backend-framework',
    patterns: {
      cookies: ['laravel_session', 'XSRF-TOKEN'],
    },
  },
  {
    name: 'ASP.NET',
    category: 'backend-framework',
    patterns: {
      headers: { 'x-powered-by': /ASP\.NET/i, 'x-aspnet-version': /.+/ },
      cookies: ['ASP.NET_SessionId', '.AspNetCore.'],
    },
  },
  {
    name: 'Spring',
    category: 'backend-framework',
    patterns: {
      cookies: ['JSESSIONID'],
      headers: { 'x-application-context': /.+/ },
    },
  },
  // CMS
  {
    name: 'WordPress',
    category: 'cms',
    patterns: {
      bodyPatterns: [/wp-content|wp-includes/i],
      metaTags: { generator: /WordPress/i },
    },
  },
  {
    name: 'Drupal',
    category: 'cms',
    patterns: {
      headers: { 'x-drupal-cache': /.+/, 'x-generator': /Drupal/i },
      bodyPatterns: [/sites\/default\/files/i],
    },
  },
  // CDN/Proxy
  {
    name: 'Cloudflare',
    category: 'cdn',
    patterns: {
      headers: { 'cf-ray': /.+/, server: /cloudflare/i },
      cookies: ['__cfduid', 'cf_clearance'],
    },
  },
  {
    name: 'AWS CloudFront',
    category: 'cdn',
    patterns: {
      headers: { 'x-amz-cf-id': /.+/, via: /CloudFront/i },
    },
  },
  {
    name: 'Akamai',
    category: 'cdn',
    patterns: {
      headers: { 'x-akamai-transformed': /.+/ },
    },
  },
  // Servers
  {
    name: 'nginx',
    category: 'web-server',
    patterns: {
      headers: { server: /nginx/i },
    },
  },
  {
    name: 'Apache',
    category: 'web-server',
    patterns: {
      headers: { server: /Apache/i },
    },
  },
  // Analytics/Tracking
  {
    name: 'Google Analytics',
    category: 'analytics',
    patterns: {
      scripts: [/google-analytics\.com|googletagmanager\.com|gtag/i],
    },
  },
  // Auth
  {
    name: 'Auth0',
    category: 'auth',
    patterns: {
      scripts: [/auth0\.com|auth0-js/i],
    },
  },
  {
    name: 'Firebase',
    category: 'backend-service',
    patterns: {
      scripts: [
        /firebase(?:app|auth|database)?(?:\.min)?\.js|firebaseio\.com/i,
      ],
    },
  },
];

// ============================================
// SECRET PATTERNS
// ============================================

interface SecretPattern {
  type: SecretFinding['type'];
  name: string;
  pattern: RegExp;
  severity: 'critical' | 'high' | 'medium';
}

const SECRET_PATTERNS: SecretPattern[] = [
  // AWS
  {
    type: 'aws_key',
    name: 'AWS Access Key',
    pattern: /AKIA[0-9A-Z]{16}/g,
    severity: 'critical',
  },
  {
    type: 'aws_key',
    name: 'AWS Secret Key',
    pattern:
      /(?:aws)?_?(?:secret)?_?(?:access)?_?key["'\s]*[:=]["'\s]*([A-Za-z0-9/+=]{40})/gi,
    severity: 'critical',
  },
  // API Keys
  {
    type: 'api_key',
    name: 'Google API Key',
    pattern: /AIza[0-9A-Za-z_-]{35}/g,
    severity: 'high',
  },
  {
    type: 'api_key',
    name: 'Stripe API Key',
    pattern: /sk_live_[0-9a-zA-Z]{24,}/g,
    severity: 'critical',
  },
  {
    type: 'api_key',
    name: 'Stripe Publishable Key',
    pattern: /pk_live_[0-9a-zA-Z]{24,}/g,
    severity: 'medium',
  },
  {
    type: 'api_key',
    name: 'Slack Token',
    pattern: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*/g,
    severity: 'high',
  },
  {
    type: 'api_key',
    name: 'GitHub Token',
    pattern: /gh[ps]_[A-Za-z0-9_]{36,}/g,
    severity: 'critical',
  },
  {
    type: 'api_key',
    name: 'Twilio API Key',
    pattern: /SK[0-9a-fA-F]{32}/g,
    severity: 'high',
  },
  {
    type: 'api_key',
    name: 'SendGrid API Key',
    pattern: /SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/g,
    severity: 'high',
  },
  {
    type: 'api_key',
    name: 'Mailgun API Key',
    pattern: /key-[0-9a-zA-Z]{32}/g,
    severity: 'high',
  },
  // Tokens
  {
    type: 'token',
    name: 'JWT Token',
    pattern: /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g,
    severity: 'medium',
  },
  {
    type: 'token',
    name: 'Bearer Token',
    pattern: /[Bb]earer\s+[A-Za-z0-9_-]{20,}/g,
    severity: 'high',
  },
  // Private Keys
  {
    type: 'private_key',
    name: 'RSA Private Key',
    pattern: /-----BEGIN (?:RSA )?PRIVATE KEY-----/g,
    severity: 'critical',
  },
  {
    type: 'private_key',
    name: 'SSH Private Key',
    pattern: /-----BEGIN (?:OPENSSH|EC|DSA) PRIVATE KEY-----/g,
    severity: 'critical',
  },
  // Passwords
  {
    type: 'password',
    name: 'Password in URL',
    pattern: /(?:password|passwd|pwd)[:=]["']?[^"'\s&]{6,}/gi,
    severity: 'high',
  },
  {
    type: 'password',
    name: 'Database Connection String',
    pattern: /(?:mongodb|mysql|postgres|redis):\/\/[^:]+:[^@]+@/gi,
    severity: 'critical',
  },
];

// ============================================
// ENDPOINT PATTERNS
// ============================================

const INTERESTING_ENDPOINTS: RegExp[] = [
  // API
  /\/api\//i,
  /\/v[0-9]+\//i,
  /\/graphql/i,
  /\/rest\//i,

  // Admin
  /\/admin/i,
  /\/dashboard/i,
  /\/manage/i,
  /\/console/i,
  /\/portal/i,

  // Auth
  /\/login/i,
  /\/signin/i,
  /\/auth/i,
  /\/oauth/i,
  /\/sso/i,
  /\/password/i,
  /\/reset/i,
  /\/register/i,
  /\/signup/i,

  // Sensitive
  /\/config/i,
  /\/settings/i,
  /\/backup/i,
  /\/debug/i,
  /\/test/i,
  /\/internal/i,
  /\/private/i,

  // Files
  /\/upload/i,
  /\/download/i,
  /\/export/i,
  /\/import/i,
  /\/file/i,
  /\/document/i,

  // User data
  /\/user/i,
  /\/account/i,
  /\/profile/i,
  /\/me\b/i,

  // Payments
  /\/payment/i,
  /\/checkout/i,
  /\/billing/i,
  /\/invoice/i,
  /\/subscription/i,

  // Status/Debug
  /\/health/i,
  /\/status/i,
  /\/metrics/i,
  /\/info/i,
  /\.json$/i,
  /\.xml$/i,
  /\.yaml$/i,
];

const INTERESTING_PARAMETERS: string[] = [
  // Injection vectors
  'id',
  'user_id',
  'userId',
  'account_id',
  'order_id',
  'doc_id',
  'file',
  'path',
  'filename',
  'document',
  'template',
  'url',
  'link',
  'redirect',
  'return',
  'next',
  'callback',
  'goto',
  'query',
  'search',
  'q',
  'keyword',
  'filter',
  'cmd',
  'exec',
  'command',
  'run',
  'page',
  'include',
  'require',
  'load',
  'read',

  // SSRF
  'url',
  'uri',
  'host',
  'domain',
  'site',
  'target',
  'dest',
  'destination',
  'image',
  'img',
  'src',
  'source',
  'feed',
  'rss',
  'proxy',

  // Auth
  'token',
  'key',
  'api_key',
  'apikey',
  'secret',
  'auth',
  'session',
  'password',
  'passwd',
  'pwd',
  'pass',
  'credential',
  'email',
  'username',
  'user',
  'login',

  // Data manipulation
  'amount',
  'price',
  'quantity',
  'qty',
  'total',
  'discount',
  'coupon',
  'role',
  'admin',
  'privilege',
  'permission',
  'access',
  'status',
  'state',
  'active',
  'enabled',
  'verified',

  // Debug
  'debug',
  'test',
  'verbose',
  'trace',
  'log',
];

// ============================================
// RECON ENGINE CLASS
// ============================================

export class ReconEngine {
  private traceId: string;

  constructor() {
    this.traceId = generateTraceId();
  }

  /**
   * Full reconnaissance on a target domain
   */
  async fullRecon(domain: string): Promise<ReconTarget> {
    MollyLogger.info(
      `Starting full recon on ${domain}`,
      'recon-engine',
      {},
      this.traceId
    );

    const target: ReconTarget = {
      domain,
      subdomains: [],
      technologies: [],
      endpoints: [],
      parameters: [],
      headers: [],
      cookies: [],
      jsFiles: [],
      apiEndpoints: [],
      lastReconAt: Date.now(),
    };

    try {
      // Phase 1: Initial probe
      const initialProbe = await this.probeUrl(`https://${domain}`);
      if (initialProbe) {
        target.technologies = initialProbe.technologies;
        target.headers = initialProbe.headers;
        target.cookies = initialProbe.cookies;
      }

      // Phase 2: Find JavaScript files
      if (initialProbe?.html) {
        target.jsFiles = await this.extractJSFiles(initialProbe.html, domain);
      }

      // Phase 3: Extract endpoints from JS
      for (const jsFile of target.jsFiles) {
        target.apiEndpoints.push(
          ...jsFile.endpoints.map((e) => ({
            path: e,
            method: 'GET',
            parameters: [],
            interesting: this.isInterestingEndpoint(e),
          }))
        );
      }

      // Phase 4: Extract parameters
      target.parameters = this.extractParametersFromEndpoints(
        target.apiEndpoints
      );

      MollyLogger.info(
        `Recon complete: ${target.technologies.length} techs, ${target.apiEndpoints.length} endpoints`,
        'recon-engine',
        { domain },
        this.traceId
      );
    } catch (error) {
      MollyLogger.error('Recon failed', 'recon-engine', { domain }, error);
    }

    return target;
  }

  /**
   * Probe a URL and extract information
   */
  async probeUrl(url: string): Promise<{
    status: number;
    technologies: TechnologyFingerprint[];
    headers: HeaderInfo[];
    cookies: CookieInfo[];
    html?: string;
  } | null> {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        redirect: 'follow',
      });

      const html = await response.text();
      const headers = Object.fromEntries(response.headers.entries());

      return {
        status: response.status,
        technologies: this.fingerprintTechnologies(headers, html),
        headers: this.analyzeHeaders(headers),
        cookies: this.analyzeCookies(headers['set-cookie'] || ''),
        html,
      };
    } catch {
      return null;
    }
  }

  /**
   * Fingerprint technologies from headers and body
   */
  fingerprintTechnologies(
    headers: Record<string, string>,
    body: string
  ): TechnologyFingerprint[] {
    const found: TechnologyFingerprint[] = [];

    for (const sig of TECH_SIGNATURES) {
      let confidence = 0;
      let matches = 0;

      // Check headers
      if (sig.patterns.headers) {
        for (const [headerName, pattern] of Object.entries(
          sig.patterns.headers
        )) {
          const headerValue = headers[headerName.toLowerCase()];
          if (headerValue && pattern.test(headerValue)) {
            matches++;
            confidence += 30;
          }
        }
      }

      // Check cookies
      if (sig.patterns.cookies) {
        const cookieHeader = headers['set-cookie'] || '';
        for (const cookieName of sig.patterns.cookies) {
          if (cookieHeader.toLowerCase().includes(cookieName.toLowerCase())) {
            matches++;
            confidence += 25;
          }
        }
      }

      // Check body patterns
      if (sig.patterns.bodyPatterns) {
        for (const pattern of sig.patterns.bodyPatterns) {
          if (pattern.test(body)) {
            matches++;
            confidence += 20;
          }
        }
      }

      // Check scripts
      if (sig.patterns.scripts) {
        for (const pattern of sig.patterns.scripts) {
          if (pattern.test(body)) {
            matches++;
            confidence += 25;
          }
        }
      }

      if (matches > 0) {
        found.push({
          name: sig.name,
          category: sig.category,
          confidence: Math.min(confidence, 100),
        });
      }
    }

    return found.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Analyze response headers for security issues
   */
  analyzeHeaders(headers: Record<string, string>): HeaderInfo[] {
    const analysis: HeaderInfo[] = [];

    // Check for required security headers
    for (const required of SECURITY_HEADERS.required) {
      const value = headers[required.name.toLowerCase()];
      if (!value) {
        analysis.push({
          name: required.name,
          value: '(missing)',
          security: 'missing',
          notes: required.description,
        });
      } else {
        analysis.push({
          name: required.name,
          value,
          security: 'good',
        });
      }
    }

    // Check for dangerous headers
    for (const dangerous of SECURITY_HEADERS.dangerous) {
      const value = headers[dangerous.name.toLowerCase()];
      if (value) {
        const isWildcard = dangerous.value && value === dangerous.value;
        analysis.push({
          name: dangerous.name,
          value,
          security: isWildcard ? 'misconfigured' : 'weak',
          notes: dangerous.issue,
        });
      }
    }

    return analysis;
  }

  /**
   * Analyze cookies for security issues
   */
  analyzeCookies(setCookieHeader: string): CookieInfo[] {
    const cookies: CookieInfo[] = [];

    if (!setCookieHeader) return cookies;

    // Parse each cookie
    const cookieParts = setCookieHeader.split(/,(?=\s*[^;=]+=[^;]*(?:;|$))/);

    for (const cookieStr of cookieParts) {
      const parts = cookieStr.split(';').map((p) => p.trim());
      const [nameValue, ...attributes] = parts;
      const [name] = nameValue.split('=');

      if (!name) continue;

      const cookie: CookieInfo = {
        name: name.trim(),
        httpOnly: false,
        secure: false,
        sameSite: undefined,
        path: '/',
        issues: [],
      };

      for (const attr of attributes) {
        const lowerAttr = attr.toLowerCase();
        if (lowerAttr === 'httponly') cookie.httpOnly = true;
        if (lowerAttr === 'secure') cookie.secure = true;
        if (lowerAttr.startsWith('samesite=')) {
          cookie.sameSite = lowerAttr.split('=')[1] as
            | 'strict'
            | 'lax'
            | 'none';
        }
        if (lowerAttr.startsWith('path=')) {
          cookie.path = attr.split('=')[1];
        }
        if (lowerAttr.startsWith('domain=')) {
          cookie.domain = attr.split('=')[1];
        }
      }

      // Identify issues
      if (!cookie.httpOnly) {
        cookie.issues.push(
          'Missing HttpOnly flag - vulnerable to XSS cookie theft'
        );
      }
      if (!cookie.secure) {
        cookie.issues.push('Missing Secure flag - may be sent over HTTP');
      }
      if (!cookie.sameSite) {
        cookie.issues.push('Missing SameSite attribute - potential CSRF risk');
      }
      if (cookie.sameSite === 'none' && !cookie.secure) {
        cookie.issues.push('SameSite=None requires Secure flag');
      }

      cookies.push(cookie);
    }

    return cookies;
  }

  /**
   * Extract JavaScript files from HTML
   */
  async extractJSFiles(html: string, domain: string): Promise<JSFileInfo[]> {
    const jsFiles: JSFileInfo[] = [];
    const scriptRegex = /<script[^>]*src=["']([^"']+)["'][^>]*>/gi;

    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
      let url = match[1];

      // Make absolute URL
      if (url.startsWith('//')) {
        url = 'https:' + url;
      } else if (url.startsWith('/')) {
        url = `https://${domain}${url}`;
      } else if (!url.startsWith('http')) {
        url = `https://${domain}/${url}`;
      }

      // Skip external analytics/tracking scripts
      if (this.isTrackingScript(url)) continue;

      try {
        const response = await fetch(url);
        const content = await response.text();

        const jsFile: JSFileInfo = {
          url,
          size: content.length,
          endpoints: this.extractEndpointsFromJS(content),
          secrets: this.scanForSecrets(content),
          interesting: false,
        };

        jsFile.interesting =
          jsFile.endpoints.length > 0 || jsFile.secrets.length > 0;
        jsFiles.push(jsFile);
      } catch {
        // Skip failed fetches
      }
    }

    return jsFiles;
  }

  /**
   * Extract API endpoints from JavaScript code
   */
  extractEndpointsFromJS(jsContent: string): string[] {
    const endpoints = new Set<string>();

    // URL patterns in strings
    const patterns = [
      /["'`](\/api\/[^"'`\s]+)["'`]/gi,
      /["'`](\/v[0-9]+\/[^"'`\s]+)["'`]/gi,
      /["'`](\/graphql[^"'`\s]*)["'`]/gi,
      /fetch\s*\(\s*["'`]([^"'`]+)["'`]/gi,
      /axios\.[a-z]+\s*\(\s*["'`]([^"'`]+)["'`]/gi,
      /\.(?:get|post|put|delete|patch)\s*\(\s*["'`]([^"'`]+)["'`]/gi,
      /url:\s*["'`]([^"'`]+)["'`]/gi,
      /endpoint:\s*["'`]([^"'`]+)["'`]/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(jsContent)) !== null) {
        const endpoint = match[1];
        // Filter out obvious non-endpoints
        if (
          endpoint.startsWith('/') &&
          !endpoint.includes('*') &&
          !endpoint.endsWith('.js') &&
          !endpoint.endsWith('.css') &&
          !endpoint.endsWith('.png') &&
          !endpoint.endsWith('.jpg') &&
          !endpoint.endsWith('.svg')
        ) {
          endpoints.add(endpoint);
        }
      }
    }

    return Array.from(endpoints);
  }

  /**
   * Scan content for secrets
   */
  scanForSecrets(content: string): SecretFinding[] {
    const findings: SecretFinding[] = [];

    for (const secretPattern of SECRET_PATTERNS) {
      const matches = Array.from(content.matchAll(secretPattern.pattern));

      for (const match of matches) {
        const value = match[0];
        const context = this.getSecretContext(content, match.index || 0);

        // Skip if it looks like an example/placeholder
        if (this.isPlaceholderSecret(value, context)) continue;

        findings.push({
          type: secretPattern.type,
          pattern: secretPattern.name,
          value: this.redactSecret(value),
          confidence: this.calculateSecretConfidence(value, context),
          context: context.substring(0, 100),
        });
      }
    }

    return findings;
  }

  /**
   * Check if endpoint is interesting for security testing
   */
  isInterestingEndpoint(endpoint: string): boolean {
    return INTERESTING_ENDPOINTS.some((pattern) => pattern.test(endpoint));
  }

  /**
   * Extract parameters from endpoints
   */
  extractParametersFromEndpoints(endpoints: APIEndpoint[]): ParameterInfo[] {
    const params = new Map<string, ParameterInfo>();

    for (const endpoint of endpoints) {
      // Extract path parameters
      const pathParams = endpoint.path.match(/\{([^}]+)\}|:([a-zA-Z_]+)/g);
      if (pathParams) {
        for (const param of pathParams) {
          const name = param.replace(/[{}:]/g, '');
          if (!params.has(name)) {
            params.set(name, {
              name,
              location: 'path',
              reflected: false,
              sanitized: false,
              interesting: INTERESTING_PARAMETERS.includes(name.toLowerCase()),
              foundAt: [endpoint.path],
            });
          } else {
            params.get(name)!.foundAt.push(endpoint.path);
          }
        }
      }

      // Check for query parameters
      const queryMatch = endpoint.path.match(/\?(.+)/);
      if (queryMatch) {
        const queryParams = new URLSearchParams(queryMatch[1]);
        for (const [name] of Array.from(queryParams.entries())) {
          if (!params.has(name)) {
            params.set(name, {
              name,
              location: 'query',
              reflected: false,
              sanitized: false,
              interesting: INTERESTING_PARAMETERS.includes(name.toLowerCase()),
              foundAt: [endpoint.path],
            });
          }
        }
      }
    }

    return Array.from(params.values());
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private isTrackingScript(url: string): boolean {
    const trackingDomains = [
      'google-analytics.com',
      'googletagmanager.com',
      'facebook.net',
      'doubleclick.net',
      'hotjar.com',
      'segment.com',
      'mixpanel.com',
      'amplitude.com',
      'intercom.io',
      'crisp.chat',
      'drift.com',
    ];
    return trackingDomains.some((d) => url.includes(d));
  }

  private getSecretContext(content: string, index: number): string {
    const start = Math.max(0, index - 50);
    const end = Math.min(content.length, index + 100);
    return content.substring(start, end);
  }

  private isPlaceholderSecret(value: string, context: string): boolean {
    const placeholderIndicators = [
      'example',
      'placeholder',
      'your_',
      'xxx',
      'test',
      'demo',
      'fake',
      'sample',
      '<',
      '>',
      '{{',
      '}}',
      'process.env',
      'REPLACE',
      'INSERT',
      'TODO',
    ];
    const combined = (value + context).toLowerCase();
    return placeholderIndicators.some((p) => combined.includes(p));
  }

  private redactSecret(value: string): string {
    if (value.length <= 8) return '***REDACTED***';
    return (
      value.substring(0, 4) +
      '***REDACTED***' +
      value.substring(value.length - 4)
    );
  }

  private calculateSecretConfidence(value: string, context: string): number {
    let confidence = 70;

    // Higher confidence if in a real assignment
    if (/[=:]\s*["']/.test(context)) confidence += 10;

    // Lower confidence if looks like template
    if (context.includes('{{') || context.includes('${')) confidence -= 20;

    // Higher confidence for longer values
    if (value.length > 30) confidence += 10;

    return Math.min(100, Math.max(0, confidence));
  }
}

// ============================================
// COMMON WORDLISTS
// ============================================

export const COMMON_SUBDOMAINS = [
  'www',
  'mail',
  'remote',
  'blog',
  'webmail',
  'server',
  'ns1',
  'ns2',
  'smtp',
  'secure',
  'vpn',
  'admin',
  'api',
  'dev',
  'staging',
  'test',
  'portal',
  'support',
  'app',
  'mobile',
  'shop',
  'store',
  'cdn',
  'static',
  'assets',
  'images',
  'img',
  'media',
  'files',
  'download',
  'upload',
  'beta',
  'alpha',
  'demo',
  'sandbox',
  'internal',
  'intranet',
  'extranet',
  'auth',
  'login',
  'sso',
  'id',
  'identity',
  'accounts',
  'dashboard',
  'console',
  'panel',
  'manage',
  'management',
  'cms',
  'docs',
  'documentation',
  'wiki',
  'help',
  'status',
  'health',
  'monitoring',
  'metrics',
  'grafana',
  'kibana',
  'elasticsearch',
  'redis',
  'db',
  'database',
  'mysql',
  'postgres',
  'mongodb',
  'mq',
  'rabbitmq',
  'kafka',
  'queue',
  'git',
  'gitlab',
  'github',
  'bitbucket',
  'jenkins',
  'ci',
  'cd',
  'build',
  'deploy',
  'release',
  'prod',
  'production',
  'preprod',
  'uat',
  'qa',
];

export const COMMON_DIRECTORIES = [
  'admin',
  'administrator',
  'login',
  'wp-admin',
  'wp-login.php',
  'phpmyadmin',
  'pma',
  'cpanel',
  'webmail',
  'mail',
  'api',
  'api/v1',
  'api/v2',
  'graphql',
  'rest',
  '.git',
  '.svn',
  '.env',
  '.htaccess',
  '.htpasswd',
  'backup',
  'backups',
  'bak',
  'old',
  'temp',
  'tmp',
  'config',
  'conf',
  'configuration',
  'settings',
  'debug',
  'test',
  'testing',
  'dev',
  'development',
  'private',
  'secret',
  'internal',
  'hidden',
  'upload',
  'uploads',
  'files',
  'documents',
  'docs',
  'static',
  'assets',
  'media',
  'images',
  'css',
  'js',
  'cgi-bin',
  'scripts',
  'includes',
  'inc',
  'server-status',
  'server-info',
  'status',
  'health',
  'metrics',
  'robots.txt',
  'sitemap.xml',
  'crossdomain.xml',
  'clientaccesspolicy.xml',
  '.well-known',
  'security.txt',
  '.well-known/security.txt',
  'composer.json',
  'package.json',
  'Gemfile',
  'requirements.txt',
  'web.config',
  'app.config',
  'applicationContext.xml',
  'swagger',
  'swagger-ui',
  'api-docs',
  'openapi.json',
  'openapi.yaml',
];

// ============================================
// EXPORT
// ============================================

export const reconEngine = new ReconEngine();
