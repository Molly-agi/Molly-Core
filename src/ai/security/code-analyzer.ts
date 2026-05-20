/**
 * @fileOverview Source Code Analyzer
 *
 * Molly's deep code analysis for vulnerability hunting.
 * Performs static analysis to find security issues:
 * - Taint analysis (source to sink tracking)
 * - Pattern matching against known vulnerabilities
 * - Dependency vulnerability checking
 * - Secret detection in code
 * - Security hotspot identification
 *
 * Designed for source code review bug bounties.
 */

import type {
  SourceCodeAnalysis,
  CodeFinding,
  SecurityHotspot,
  DependencyInfo,
  SecretFinding,
  VulnerabilitySeverity,
  VulnerabilityCategory,
} from './bug-hunter-types';
import { MollyLogger, generateTraceId } from '../logger';
import { CWE_DATABASE } from './vulnerability-patterns';

// ============================================
// LANGUAGE-SPECIFIC PATTERNS
// ============================================

interface LanguageConfig {
  name: string;
  extensions: string[];
  sources: SourcePattern[];
  sinks: SinkPattern[];
  sanitizers: string[];
  dangerousFunctions: DangerousFunction[];
}

interface SourcePattern {
  pattern: RegExp;
  name: string;
  taintType: 'user_input' | 'file' | 'network' | 'database' | 'environment';
}

interface SinkPattern {
  pattern: RegExp;
  name: string;
  vulnerability: VulnerabilityCategory;
  severity: VulnerabilitySeverity;
  cwe: string;
}

interface DangerousFunction {
  pattern: RegExp;
  name: string;
  reason: string;
  severity: VulnerabilitySeverity;
  cwe: string;
  safeAlternative?: string;
}

// ============================================
// JAVASCRIPT/TYPESCRIPT PATTERNS
// ============================================

const JS_CONFIG: LanguageConfig = {
  name: 'javascript',
  extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'],
  sources: [
    {
      pattern: /req\.(?:body|query|params|headers|cookies)\b/g,
      name: 'Express request',
      taintType: 'user_input',
    },
    {
      pattern: /request\.(?:body|query|params)\b/g,
      name: 'HTTP request',
      taintType: 'user_input',
    },
    {
      pattern: /ctx\.(?:request|query|params)\b/g,
      name: 'Koa context',
      taintType: 'user_input',
    },
    {
      pattern: /event\.(?:body|queryStringParameters|pathParameters)\b/g,
      name: 'Lambda event',
      taintType: 'user_input',
    },
    {
      pattern: /document\.(?:location|URL|referrer|cookie)\b/g,
      name: 'DOM source',
      taintType: 'user_input',
    },
    {
      pattern: /window\.location\b/g,
      name: 'Window location',
      taintType: 'user_input',
    },
    {
      pattern: /localStorage\.getItem|sessionStorage\.getItem/g,
      name: 'Storage',
      taintType: 'user_input',
    },
    {
      pattern: /new\s+URLSearchParams/g,
      name: 'URL params',
      taintType: 'user_input',
    },
    {
      pattern: /process\.env\b/g,
      name: 'Environment variable',
      taintType: 'environment',
    },
    {
      pattern: /fs\.readFile|fs\.readFileSync/g,
      name: 'File read',
      taintType: 'file',
    },
  ],
  sinks: [
    // XSS sinks
    {
      pattern: /\.innerHTML\s*=/g,
      name: 'innerHTML assignment',
      vulnerability: 'xss',
      severity: 'high',
      cwe: 'CWE-79',
    },
    {
      pattern: /\.outerHTML\s*=/g,
      name: 'outerHTML assignment',
      vulnerability: 'xss',
      severity: 'high',
      cwe: 'CWE-79',
    },
    {
      pattern: /document\.write\s*\(/g,
      name: 'document.write',
      vulnerability: 'xss',
      severity: 'high',
      cwe: 'CWE-79',
    },
    {
      pattern: /document\.writeln\s*\(/g,
      name: 'document.writeln',
      vulnerability: 'xss',
      severity: 'high',
      cwe: 'CWE-79',
    },
    {
      pattern: /\.insertAdjacentHTML\s*\(/g,
      name: 'insertAdjacentHTML',
      vulnerability: 'xss',
      severity: 'high',
      cwe: 'CWE-79',
    },
    {
      pattern: /dangerouslySetInnerHTML/g,
      name: 'React dangerouslySetInnerHTML',
      vulnerability: 'xss',
      severity: 'high',
      cwe: 'CWE-79',
    },
    {
      pattern: /\$\(.*\)\.html\s*\(/g,
      name: 'jQuery html()',
      vulnerability: 'xss',
      severity: 'high',
      cwe: 'CWE-79',
    },
    {
      pattern: /v-html\s*=/g,
      name: 'Vue v-html',
      vulnerability: 'xss',
      severity: 'high',
      cwe: 'CWE-79',
    },

    // Code execution sinks
    {
      pattern: /\beval\s*\(/g,
      name: 'eval()',
      vulnerability: 'injection',
      severity: 'critical',
      cwe: 'CWE-94',
    },
    {
      pattern: /new\s+Function\s*\(/g,
      name: 'new Function()',
      vulnerability: 'injection',
      severity: 'critical',
      cwe: 'CWE-94',
    },
    {
      pattern: /setTimeout\s*\(\s*["'`]/g,
      name: 'setTimeout with string',
      vulnerability: 'injection',
      severity: 'high',
      cwe: 'CWE-94',
    },
    {
      pattern: /setInterval\s*\(\s*["'`]/g,
      name: 'setInterval with string',
      vulnerability: 'injection',
      severity: 'high',
      cwe: 'CWE-94',
    },

    // Command injection sinks
    {
      pattern: /child_process\.exec\s*\(/g,
      name: 'child_process.exec',
      vulnerability: 'injection',
      severity: 'critical',
      cwe: 'CWE-78',
    },
    {
      pattern: /child_process\.execSync\s*\(/g,
      name: 'child_process.execSync',
      vulnerability: 'injection',
      severity: 'critical',
      cwe: 'CWE-78',
    },
    {
      pattern: /child_process\.spawn\s*\([^,]+,\s*\{[^}]*shell:\s*true/g,
      name: 'spawn with shell',
      vulnerability: 'injection',
      severity: 'critical',
      cwe: 'CWE-78',
    },
    {
      pattern: /require\s*\(\s*["']child_process["']\s*\)\.exec/g,
      name: 'exec via require',
      vulnerability: 'injection',
      severity: 'critical',
      cwe: 'CWE-78',
    },

    // SQL injection sinks
    {
      pattern: /\.query\s*\(\s*["'`].*\$\{/g,
      name: 'SQL template literal',
      vulnerability: 'injection',
      severity: 'critical',
      cwe: 'CWE-89',
    },
    {
      pattern: /\.query\s*\(\s*["'`].*\+/g,
      name: 'SQL concatenation',
      vulnerability: 'injection',
      severity: 'critical',
      cwe: 'CWE-89',
    },
    {
      pattern: /\.raw\s*\(\s*["'`]/g,
      name: 'Raw SQL query',
      vulnerability: 'injection',
      severity: 'high',
      cwe: 'CWE-89',
    },

    // Path traversal sinks
    {
      pattern: /fs\.readFile\s*\(/g,
      name: 'fs.readFile',
      vulnerability: 'file_handling',
      severity: 'high',
      cwe: 'CWE-22',
    },
    {
      pattern: /fs\.readFileSync\s*\(/g,
      name: 'fs.readFileSync',
      vulnerability: 'file_handling',
      severity: 'high',
      cwe: 'CWE-22',
    },
    {
      pattern: /fs\.writeFile\s*\(/g,
      name: 'fs.writeFile',
      vulnerability: 'file_handling',
      severity: 'high',
      cwe: 'CWE-22',
    },
    {
      pattern: /fs\.unlink\s*\(/g,
      name: 'fs.unlink',
      vulnerability: 'file_handling',
      severity: 'high',
      cwe: 'CWE-22',
    },
    {
      pattern: /path\.join\s*\(/g,
      name: 'path.join (check for traversal)',
      vulnerability: 'file_handling',
      severity: 'medium',
      cwe: 'CWE-22',
    },

    // SSRF sinks
    {
      pattern: /fetch\s*\(/g,
      name: 'fetch()',
      vulnerability: 'ssrf',
      severity: 'high',
      cwe: 'CWE-918',
    },
    {
      pattern: /axios\s*\(/g,
      name: 'axios()',
      vulnerability: 'ssrf',
      severity: 'high',
      cwe: 'CWE-918',
    },
    {
      pattern: /axios\.(?:get|post|put|delete)\s*\(/g,
      name: 'axios method',
      vulnerability: 'ssrf',
      severity: 'high',
      cwe: 'CWE-918',
    },
    {
      pattern: /http\.request\s*\(/g,
      name: 'http.request',
      vulnerability: 'ssrf',
      severity: 'high',
      cwe: 'CWE-918',
    },
    {
      pattern: /https\.request\s*\(/g,
      name: 'https.request',
      vulnerability: 'ssrf',
      severity: 'high',
      cwe: 'CWE-918',
    },

    // Redirect sinks
    {
      pattern: /res\.redirect\s*\(/g,
      name: 'Express redirect',
      vulnerability: 'information_leak',
      severity: 'medium',
      cwe: 'CWE-601',
    },
    {
      pattern: /window\.location\s*=/g,
      name: 'location assignment',
      vulnerability: 'information_leak',
      severity: 'medium',
      cwe: 'CWE-601',
    },
    {
      pattern: /location\.href\s*=/g,
      name: 'location.href assignment',
      vulnerability: 'information_leak',
      severity: 'medium',
      cwe: 'CWE-601',
    },
  ],
  sanitizers: [
    'escape',
    'encode',
    'sanitize',
    'clean',
    'purify',
    'validate',
    'DOMPurify',
    'xss',
    'htmlEntities',
    'escapeHtml',
  ],
  dangerousFunctions: [
    {
      pattern: /\beval\s*\(/g,
      name: 'eval()',
      reason: 'Executes arbitrary code',
      severity: 'critical',
      cwe: 'CWE-94',
      safeAlternative: 'JSON.parse() for JSON data',
    },
    {
      pattern: /document\.write\s*\(/g,
      name: 'document.write()',
      reason: 'Can introduce XSS',
      severity: 'high',
      cwe: 'CWE-79',
      safeAlternative: 'DOM manipulation methods',
    },
    {
      pattern: /innerHTML\s*=/g,
      name: 'innerHTML',
      reason: 'Can introduce XSS',
      severity: 'high',
      cwe: 'CWE-79',
      safeAlternative: 'textContent or sanitized input',
    },
    {
      pattern: /\.exec\s*\([^)]*\+/g,
      name: 'exec with concatenation',
      reason: 'Command injection risk',
      severity: 'critical',
      cwe: 'CWE-78',
      safeAlternative: 'execFile with array args',
    },
    {
      pattern: /new\s+RegExp\s*\([^)]*\+/g,
      name: 'RegExp with user input',
      reason: 'ReDoS risk',
      severity: 'medium',
      cwe: 'CWE-1333',
      safeAlternative: 'Static regex or input validation',
    },
    {
      pattern: /Math\.random\s*\(\)/g,
      name: 'Math.random()',
      reason: 'Not cryptographically secure',
      severity: 'low',
      cwe: 'CWE-338',
      safeAlternative: 'crypto.randomBytes()',
    },
    {
      pattern: /createHash\s*\(\s*["'](?:md5|sha1)["']\s*\)/g,
      name: 'Weak hash algorithm',
      reason: 'MD5/SHA1 are cryptographically broken',
      severity: 'medium',
      cwe: 'CWE-327',
      safeAlternative: 'SHA-256 or bcrypt for passwords',
    },
    {
      pattern: /jwt\.(?:sign|verify)\s*\([^)]*algorithm:\s*["']none["']/gi,
      name: 'JWT none algorithm',
      reason: 'Allows unsigned tokens',
      severity: 'critical',
      cwe: 'CWE-287',
    },
    {
      pattern: /\.verify\s*=\s*false/g,
      name: 'TLS verify disabled',
      reason: 'Man-in-the-middle risk',
      severity: 'high',
      cwe: 'CWE-295',
    },
    {
      pattern: /rejectUnauthorized:\s*false/g,
      name: 'TLS cert validation disabled',
      reason: 'Man-in-the-middle risk',
      severity: 'high',
      cwe: 'CWE-295',
    },
  ],
};

// ============================================
// PYTHON PATTERNS
// ============================================

const PYTHON_CONFIG: LanguageConfig = {
  name: 'python',
  extensions: ['.py'],
  sources: [
    {
      pattern:
        /request\.(?:args|form|json|data|values|files|headers|cookies)\b/g,
      name: 'Flask request',
      taintType: 'user_input',
    },
    {
      pattern: /request\.(?:GET|POST|DATA|FILES|COOKIES|META)\b/g,
      name: 'Django request',
      taintType: 'user_input',
    },
    {
      pattern: /self\.request\.(?:query_params|data)\b/g,
      name: 'DRF request',
      taintType: 'user_input',
    },
    { pattern: /input\s*\(/g, name: 'input()', taintType: 'user_input' },
    {
      pattern: /sys\.argv\b/g,
      name: 'Command line args',
      taintType: 'user_input',
    },
    {
      pattern: /os\.environ\b/g,
      name: 'Environment variable',
      taintType: 'environment',
    },
    { pattern: /open\s*\(/g, name: 'File read', taintType: 'file' },
  ],
  sinks: [
    // Code execution
    {
      pattern: /\beval\s*\(/g,
      name: 'eval()',
      vulnerability: 'injection',
      severity: 'critical',
      cwe: 'CWE-94',
    },
    {
      pattern: /\bexec\s*\(/g,
      name: 'exec()',
      vulnerability: 'injection',
      severity: 'critical',
      cwe: 'CWE-94',
    },
    {
      pattern: /compile\s*\(/g,
      name: 'compile()',
      vulnerability: 'injection',
      severity: 'high',
      cwe: 'CWE-94',
    },

    // Command injection
    {
      pattern: /os\.system\s*\(/g,
      name: 'os.system()',
      vulnerability: 'injection',
      severity: 'critical',
      cwe: 'CWE-78',
    },
    {
      pattern: /os\.popen\s*\(/g,
      name: 'os.popen()',
      vulnerability: 'injection',
      severity: 'critical',
      cwe: 'CWE-78',
    },
    {
      pattern: /subprocess\..*shell\s*=\s*True/g,
      name: 'subprocess with shell=True',
      vulnerability: 'injection',
      severity: 'critical',
      cwe: 'CWE-78',
    },
    {
      pattern: /commands\.getoutput\s*\(/g,
      name: 'commands.getoutput()',
      vulnerability: 'injection',
      severity: 'critical',
      cwe: 'CWE-78',
    },

    // SQL injection
    {
      pattern: /\.execute\s*\(\s*f?["'].*%/g,
      name: 'SQL string formatting',
      vulnerability: 'injection',
      severity: 'critical',
      cwe: 'CWE-89',
    },
    {
      pattern: /\.execute\s*\(\s*f["']/g,
      name: 'SQL f-string',
      vulnerability: 'injection',
      severity: 'critical',
      cwe: 'CWE-89',
    },
    {
      pattern: /\.raw\s*\(\s*f?["']/g,
      name: 'Django raw SQL',
      vulnerability: 'injection',
      severity: 'critical',
      cwe: 'CWE-89',
    },
    {
      pattern: /cursor\.execute\s*\([^,]+%/g,
      name: 'cursor with % formatting',
      vulnerability: 'injection',
      severity: 'critical',
      cwe: 'CWE-89',
    },

    // Deserialization
    {
      pattern: /pickle\.loads?\s*\(/g,
      name: 'pickle.load()',
      vulnerability: 'deserialization',
      severity: 'critical',
      cwe: 'CWE-502',
    },
    {
      pattern: /yaml\.(?:load|unsafe_load)\s*\(/g,
      name: 'yaml.load()',
      vulnerability: 'deserialization',
      severity: 'critical',
      cwe: 'CWE-502',
    },
    {
      pattern: /marshal\.loads?\s*\(/g,
      name: 'marshal.load()',
      vulnerability: 'deserialization',
      severity: 'critical',
      cwe: 'CWE-502',
    },

    // SSRF
    {
      pattern: /requests\.(?:get|post|put|delete|patch)\s*\(/g,
      name: 'requests library',
      vulnerability: 'ssrf',
      severity: 'high',
      cwe: 'CWE-918',
    },
    {
      pattern: /urllib\.request\.urlopen\s*\(/g,
      name: 'urllib.urlopen()',
      vulnerability: 'ssrf',
      severity: 'high',
      cwe: 'CWE-918',
    },
    {
      pattern: /httpx\.(?:get|post|put|delete)\s*\(/g,
      name: 'httpx library',
      vulnerability: 'ssrf',
      severity: 'high',
      cwe: 'CWE-918',
    },

    // Path traversal
    {
      pattern: /open\s*\(/g,
      name: 'open()',
      vulnerability: 'file_handling',
      severity: 'high',
      cwe: 'CWE-22',
    },
    {
      pattern: /os\.path\.join\s*\(/g,
      name: 'os.path.join()',
      vulnerability: 'file_handling',
      severity: 'medium',
      cwe: 'CWE-22',
    },
    {
      pattern: /send_file\s*\(/g,
      name: 'Flask send_file()',
      vulnerability: 'file_handling',
      severity: 'high',
      cwe: 'CWE-22',
    },

    // Template injection
    {
      pattern: /render_template_string\s*\(/g,
      name: 'Flask render_template_string',
      vulnerability: 'injection',
      severity: 'critical',
      cwe: 'CWE-94',
    },
    {
      pattern: /Template\s*\([^)]*\)\.render/g,
      name: 'Jinja2 Template render',
      vulnerability: 'injection',
      severity: 'high',
      cwe: 'CWE-94',
    },
  ],
  sanitizers: [
    'escape',
    'quote',
    'sanitize',
    'clean',
    'validate',
    'bleach',
    'markupsafe',
    'html.escape',
    'shlex.quote',
  ],
  dangerousFunctions: [
    {
      pattern: /\beval\s*\(/g,
      name: 'eval()',
      reason: 'Executes arbitrary code',
      severity: 'critical',
      cwe: 'CWE-94',
      safeAlternative: 'ast.literal_eval() for literals',
    },
    {
      pattern: /pickle\.loads?\s*\(/g,
      name: 'pickle',
      reason: 'Arbitrary code execution via deserialization',
      severity: 'critical',
      cwe: 'CWE-502',
      safeAlternative: 'JSON or signed data',
    },
    {
      pattern: /yaml\.load\s*\([^)]*\)/g,
      name: 'yaml.load()',
      reason: 'Code execution without safe_load',
      severity: 'critical',
      cwe: 'CWE-502',
      safeAlternative: 'yaml.safe_load()',
    },
    {
      pattern: /shell\s*=\s*True/g,
      name: 'shell=True',
      reason: 'Command injection risk',
      severity: 'critical',
      cwe: 'CWE-78',
      safeAlternative: 'shell=False with list args',
    },
    {
      pattern: /hashlib\.(?:md5|sha1)\s*\(/g,
      name: 'Weak hash',
      reason: 'MD5/SHA1 are cryptographically broken',
      severity: 'medium',
      cwe: 'CWE-327',
      safeAlternative: 'hashlib.sha256() or bcrypt',
    },
    {
      pattern: /random\./g,
      name: 'random module',
      reason: 'Not cryptographically secure',
      severity: 'low',
      cwe: 'CWE-338',
      safeAlternative: 'secrets module',
    },
    {
      pattern: /verify\s*=\s*False/g,
      name: 'SSL verify=False',
      reason: 'Man-in-the-middle risk',
      severity: 'high',
      cwe: 'CWE-295',
    },
    {
      pattern: /DEBUG\s*=\s*True/g,
      name: 'DEBUG=True',
      reason: 'Exposes sensitive information in production',
      severity: 'medium',
      cwe: 'CWE-489',
    },
  ],
};

// ============================================
// JAVA PATTERNS
// ============================================

const JAVA_CONFIG: LanguageConfig = {
  name: 'java',
  extensions: ['.java'],
  sources: [
    {
      pattern: /request\.getParameter\s*\(/g,
      name: 'getParameter()',
      taintType: 'user_input',
    },
    {
      pattern: /request\.getHeader\s*\(/g,
      name: 'getHeader()',
      taintType: 'user_input',
    },
    {
      pattern: /request\.getCookies\s*\(/g,
      name: 'getCookies()',
      taintType: 'user_input',
    },
    {
      pattern: /request\.getInputStream\s*\(/g,
      name: 'getInputStream()',
      taintType: 'user_input',
    },
    {
      pattern: /@RequestParam/g,
      name: '@RequestParam',
      taintType: 'user_input',
    },
    {
      pattern: /@PathVariable/g,
      name: '@PathVariable',
      taintType: 'user_input',
    },
    { pattern: /@RequestBody/g, name: '@RequestBody', taintType: 'user_input' },
    {
      pattern: /System\.getenv\s*\(/g,
      name: 'System.getenv()',
      taintType: 'environment',
    },
  ],
  sinks: [
    // SQL injection
    {
      pattern: /Statement\.execute(?:Query|Update)?\s*\(/g,
      name: 'Statement.execute',
      vulnerability: 'injection',
      severity: 'critical',
      cwe: 'CWE-89',
    },
    {
      pattern: /createStatement\s*\(\)/g,
      name: 'createStatement()',
      vulnerability: 'injection',
      severity: 'high',
      cwe: 'CWE-89',
    },
    {
      pattern: /\.createQuery\s*\([^)]*\+/g,
      name: 'JPA createQuery concatenation',
      vulnerability: 'injection',
      severity: 'critical',
      cwe: 'CWE-89',
    },

    // Command injection
    {
      pattern: /Runtime\.getRuntime\s*\(\s*\)\.exec\s*\(/g,
      name: 'Runtime.exec()',
      vulnerability: 'injection',
      severity: 'critical',
      cwe: 'CWE-78',
    },
    {
      pattern: /ProcessBuilder\s*\(/g,
      name: 'ProcessBuilder',
      vulnerability: 'injection',
      severity: 'high',
      cwe: 'CWE-78',
    },

    // Deserialization
    {
      pattern: /ObjectInputStream\s*\(/g,
      name: 'ObjectInputStream',
      vulnerability: 'deserialization',
      severity: 'critical',
      cwe: 'CWE-502',
    },
    {
      pattern: /\.readObject\s*\(/g,
      name: 'readObject()',
      vulnerability: 'deserialization',
      severity: 'critical',
      cwe: 'CWE-502',
    },
    {
      pattern: /XMLDecoder\s*\(/g,
      name: 'XMLDecoder',
      vulnerability: 'deserialization',
      severity: 'critical',
      cwe: 'CWE-502',
    },

    // XXE
    {
      pattern: /DocumentBuilderFactory\.newInstance\s*\(/g,
      name: 'DocumentBuilderFactory',
      vulnerability: 'xxe',
      severity: 'high',
      cwe: 'CWE-611',
    },
    {
      pattern: /SAXParserFactory\.newInstance\s*\(/g,
      name: 'SAXParserFactory',
      vulnerability: 'xxe',
      severity: 'high',
      cwe: 'CWE-611',
    },
    {
      pattern: /XMLInputFactory\.newInstance\s*\(/g,
      name: 'XMLInputFactory',
      vulnerability: 'xxe',
      severity: 'high',
      cwe: 'CWE-611',
    },

    // Path traversal
    {
      pattern: /new\s+File\s*\(/g,
      name: 'new File()',
      vulnerability: 'file_handling',
      severity: 'high',
      cwe: 'CWE-22',
    },
    {
      pattern: /Paths\.get\s*\(/g,
      name: 'Paths.get()',
      vulnerability: 'file_handling',
      severity: 'medium',
      cwe: 'CWE-22',
    },

    // SSRF
    {
      pattern: /new\s+URL\s*\(/g,
      name: 'new URL()',
      vulnerability: 'ssrf',
      severity: 'high',
      cwe: 'CWE-918',
    },
    {
      pattern: /\.openConnection\s*\(/g,
      name: 'openConnection()',
      vulnerability: 'ssrf',
      severity: 'high',
      cwe: 'CWE-918',
    },

    // XSS
    {
      pattern: /response\.getWriter\s*\(\s*\)\.(?:print|write)\s*\(/g,
      name: 'Response writer',
      vulnerability: 'xss',
      severity: 'high',
      cwe: 'CWE-79',
    },
  ],
  sanitizers: [
    'escape',
    'encode',
    'sanitize',
    'validate',
    'ESAPI',
    'StringEscapeUtils',
    'HtmlUtils',
    'PreparedStatement',
  ],
  dangerousFunctions: [
    {
      pattern: /ObjectInputStream/g,
      name: 'ObjectInputStream',
      reason: 'Arbitrary code execution via deserialization',
      severity: 'critical',
      cwe: 'CWE-502',
      safeAlternative: 'JSON parsing or whitelist classes',
    },
    {
      pattern: /Runtime\.getRuntime\(\)\.exec/g,
      name: 'Runtime.exec()',
      reason: 'Command injection risk',
      severity: 'critical',
      cwe: 'CWE-78',
      safeAlternative: 'ProcessBuilder with array args',
    },
    {
      pattern: /Statement\.execute/g,
      name: 'Statement.execute',
      reason: 'SQL injection risk',
      severity: 'critical',
      cwe: 'CWE-89',
      safeAlternative: 'PreparedStatement',
    },
    {
      pattern: /MessageDigest\.getInstance\s*\(\s*["'](?:MD5|SHA-1)["']\s*\)/g,
      name: 'Weak hash',
      reason: 'MD5/SHA-1 are broken',
      severity: 'medium',
      cwe: 'CWE-327',
      safeAlternative: 'SHA-256 or bcrypt',
    },
  ],
};

// ============================================
// ALL LANGUAGE CONFIGS
// ============================================

const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
  javascript: JS_CONFIG,
  typescript: JS_CONFIG,
  python: PYTHON_CONFIG,
  java: JAVA_CONFIG,
};

// ============================================
// SOURCE CODE ANALYZER CLASS
// ============================================

export class SourceCodeAnalyzer {
  private traceId: string;
  private findings: CodeFinding[] = [];
  private hotspots: SecurityHotspot[] = [];
  private secrets: SecretFinding[] = [];

  constructor() {
    this.traceId = generateTraceId();
  }

  /**
   * Analyze a code file for vulnerabilities
   */
  analyzeFile(
    filePath: string,
    content: string,
    language?: string
  ): {
    findings: CodeFinding[];
    hotspots: SecurityHotspot[];
    secrets: SecretFinding[];
  } {
    // Detect language from extension if not provided
    const lang = language || this.detectLanguage(filePath);
    const config = LANGUAGE_CONFIGS[lang];

    if (!config) {
      MollyLogger.warn(
        `Unsupported language for ${filePath}`,
        'code-analyzer',
        { lang }
      );
      return { findings: [], hotspots: [], secrets: [] };
    }

    const findings: CodeFinding[] = [];
    const hotspots: SecurityHotspot[] = [];
    const secrets: SecretFinding[] = [];

    const lines = content.split('\n');

    // Scan each line
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      const lineNumber = lineNum + 1;

      // Check for dangerous function usage
      for (const dangerous of config.dangerousFunctions) {
        if (dangerous.pattern.test(line)) {
          // Reset regex lastIndex
          dangerous.pattern.lastIndex = 0;

          findings.push({
            id: `${filePath}:${lineNumber}:${dangerous.name}`,
            rule: dangerous.name,
            severity: dangerous.severity,
            category: this.categorizeFromCWE(dangerous.cwe),
            file: filePath,
            line: lineNumber,
            snippet: line.trim(),
            message: `${dangerous.name}: ${dangerous.reason}`,
            cwe: dangerous.cwe,
            confidence: 80,
            falsePositiveRisk: this.assessFalsePositiveRisk(
              line,
              config.sanitizers
            ),
          });
        }
      }

      // Check for sink patterns with potential taint
      for (const sink of config.sinks) {
        if (sink.pattern.test(line)) {
          sink.pattern.lastIndex = 0;

          // Check if there's a source nearby (simple taint approximation)
          const contextStart = Math.max(0, lineNum - 10);
          const contextEnd = Math.min(lines.length, lineNum + 3);
          const context = lines.slice(contextStart, contextEnd).join('\n');

          const hasTaintedSource = config.sources.some((source) => {
            source.pattern.lastIndex = 0;
            return source.pattern.test(context);
          });

          if (hasTaintedSource) {
            findings.push({
              id: `${filePath}:${lineNumber}:${sink.name}`,
              rule: `Tainted ${sink.name}`,
              severity: sink.severity,
              category: sink.vulnerability,
              file: filePath,
              line: lineNumber,
              snippet: line.trim(),
              message: `User input may reach ${sink.name} - potential ${sink.vulnerability}`,
              cwe: sink.cwe,
              confidence: 70,
              falsePositiveRisk: this.assessFalsePositiveRisk(
                line,
                config.sanitizers
              ),
            });
          } else {
            // Still flag as hotspot for review
            hotspots.push({
              file: filePath,
              line: lineNumber,
              type: sink.vulnerability,
              description: `${sink.name} usage - verify input is sanitized`,
              reviewRequired: true,
            });
          }
        }
      }

      // Check for hardcoded secrets
      const lineSecrets = this.scanLineForSecrets(line, filePath, lineNumber);
      secrets.push(...lineSecrets);
    }

    return { findings, hotspots, secrets };
  }

  /**
   * Analyze an entire repository
   */
  async analyzeRepository(
    files: Array<{ path: string; content: string }>
  ): Promise<SourceCodeAnalysis> {
    MollyLogger.info(
      `Analyzing ${files.length} files`,
      'code-analyzer',
      {},
      this.traceId
    );

    const analysis: SourceCodeAnalysis = {
      repository: 'analyzed-repo',
      language: 'mixed',
      files: files.length,
      linesOfCode: 0,
      analyzedAt: Date.now(),
      findings: [],
      hotspots: [],
      dependencies: [],
      secrets: [],
    };

    for (const file of files) {
      const lines = file.content.split('\n').length;
      analysis.linesOfCode += lines;

      const result = this.analyzeFile(file.path, file.content);
      analysis.findings.push(...result.findings);
      analysis.hotspots.push(...result.hotspots);
      analysis.secrets.push(...result.secrets);

      // Check for dependency files
      if (this.isDependencyFile(file.path)) {
        const deps = this.parseDependencies(file.path, file.content);
        analysis.dependencies.push(...deps);
      }
    }

    // Sort findings by severity
    analysis.findings.sort((a, b) => {
      const severityOrder = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
        informational: 4,
      };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

    MollyLogger.info(
      `Analysis complete: ${analysis.findings.length} findings, ${analysis.hotspots.length} hotspots`,
      'code-analyzer',
      { findings: analysis.findings.length },
      this.traceId
    );

    return analysis;
  }

  /**
   * Detect language from file extension
   */
  private detectLanguage(filePath: string): string {
    const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();

    for (const [lang, config] of Object.entries(LANGUAGE_CONFIGS)) {
      if (config.extensions.includes(ext)) {
        return lang;
      }
    }

    return 'unknown';
  }

  /**
   * Categorize finding from CWE ID
   */
  private categorizeFromCWE(cweId: string): VulnerabilityCategory {
    const cwe = CWE_DATABASE[cweId];
    return cwe?.category || 'security_misconfig';
  }

  /**
   * Assess false positive risk based on sanitizers
   */
  private assessFalsePositiveRisk(line: string, sanitizers: string[]): number {
    const lowerLine = line.toLowerCase();
    let risk = 30; // Base risk

    // Higher confidence if sanitizers are present
    for (const sanitizer of sanitizers) {
      if (lowerLine.includes(sanitizer.toLowerCase())) {
        risk += 20;
      }
    }

    // Lower confidence if it's in a comment
    if (lowerLine.trim().startsWith('//') || lowerLine.trim().startsWith('#')) {
      risk += 40;
    }

    return Math.min(risk, 100);
  }

  /**
   * Scan a line for hardcoded secrets
   */
  private scanLineForSecrets(
    line: string,
    filePath: string,
    lineNumber: number
  ): SecretFinding[] {
    const secrets: SecretFinding[] = [];

    // Skip comments
    if (line.trim().startsWith('//') || line.trim().startsWith('#')) {
      return secrets;
    }

    // Common secret patterns
    const patterns = [
      {
        pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*["']([^"']{20,})["']/gi,
        type: 'api_key' as const,
      },
      {
        pattern:
          /(?:secret|password|passwd|pwd)\s*[:=]\s*["']([^"']{8,})["']/gi,
        type: 'password' as const,
      },
      {
        pattern: /(?:token|auth)\s*[:=]\s*["']([^"']{20,})["']/gi,
        type: 'token' as const,
      },
      { pattern: /AKIA[0-9A-Z]{16}/g, type: 'aws_key' as const },
      {
        pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g,
        type: 'private_key' as const,
      },
    ];

    for (const { pattern, type } of patterns) {
      let match;
      while ((match = pattern.exec(line)) !== null) {
        // Skip obvious placeholders
        const value = match[1] || match[0];
        if (this.isPlaceholder(value)) continue;

        secrets.push({
          type,
          pattern: pattern.source,
          value: this.redact(value),
          confidence: this.assessSecretConfidence(line, value),
          context: `${filePath}:${lineNumber}`,
        });
      }
      pattern.lastIndex = 0;
    }

    return secrets;
  }

  /**
   * Check if value is a placeholder
   */
  private isPlaceholder(value: string): boolean {
    const placeholders = [
      'xxx',
      'your_',
      'example',
      'test',
      'demo',
      'fake',
      'sample',
      'placeholder',
      'replace',
      'insert',
      'todo',
      'change_me',
      '<',
      '>',
      '{{',
      '}}',
      '${',
      'process.env',
      'os.environ',
    ];
    const lower = value.toLowerCase();
    return placeholders.some((p) => lower.includes(p));
  }

  /**
   * Redact a secret value
   */
  private redact(value: string): string {
    if (value.length <= 8) return '***';
    return value.substring(0, 4) + '***' + value.substring(value.length - 4);
  }

  /**
   * Assess confidence that a value is a real secret
   */
  private assessSecretConfidence(line: string, value: string): number {
    let confidence = 60;

    // Higher if looks random
    if (/[A-Za-z0-9+/]{20,}/.test(value)) confidence += 15;

    // Higher if in assignment
    if (/[:=]/.test(line)) confidence += 10;

    // Lower if in test file
    if (line.includes('test') || line.includes('mock')) confidence -= 20;

    return Math.min(Math.max(confidence, 0), 100);
  }

  /**
   * Check if file is a dependency manifest
   */
  private isDependencyFile(filePath: string): boolean {
    const depFiles = [
      'package.json',
      'package-lock.json',
      'yarn.lock',
      'requirements.txt',
      'Pipfile',
      'Pipfile.lock',
      'Gemfile',
      'Gemfile.lock',
      'pom.xml',
      'build.gradle',
      'go.mod',
      'Cargo.toml',
    ];
    return depFiles.some((f) => filePath.endsWith(f));
  }

  /**
   * Parse dependencies from manifest file
   */
  private parseDependencies(
    filePath: string,
    content: string
  ): DependencyInfo[] {
    const deps: DependencyInfo[] = [];

    if (filePath.endsWith('package.json')) {
      try {
        const pkg = JSON.parse(content);
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

        for (const [name, version] of Object.entries(allDeps)) {
          deps.push({
            name,
            version: String(version).replace(/[\^~]/g, ''),
            ecosystem: 'npm',
            vulnerabilities: [], // Would need to query vulnerability database
            outdated: false,
          });
        }
      } catch {
        // Invalid JSON
      }
    }

    if (filePath.endsWith('requirements.txt')) {
      const lines = content.split('\n');
      for (const line of lines) {
        const match = line.match(/^([a-zA-Z0-9_-]+)(?:==|>=|<=|~=)?(.+)?$/);
        if (match) {
          deps.push({
            name: match[1],
            version: match[2] || 'latest',
            ecosystem: 'pip',
            vulnerabilities: [],
            outdated: false,
          });
        }
      }
    }

    return deps;
  }
}

// ============================================
// EXPORT
// ============================================

export const codeAnalyzer = new SourceCodeAnalyzer();
