// ============================================================
// CROSS-BROWSER COMPATIBILITY LAYER
// ============================================================

// AbortSignal.timeout polyfill — Safari <16.4, older Android WebView
if (typeof AbortSignal !== 'undefined' && !AbortSignal.timeout) {
  AbortSignal.timeout = function (ms) {
    const ctrl = new AbortController();
    setTimeout(
      () => ctrl.abort(new DOMException('TimeoutError', 'TimeoutError')),
      ms
    );
    return ctrl.signal;
  };
}

// Safe SHA-256 — falls back to simple hash if crypto.subtle unavailable (HTTP)
async function safeSHA256(str) {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const h = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(str)
    );
    return Array.from(new Uint8Array(h))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback: DJB2-based hash (not cryptographic, but functional for fingerprinting)
  let h1 = 0xdeadbeef,
    h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (
    (h2 >>> 0).toString(16).padStart(8, '0') +
    (h1 >>> 0).toString(16).padStart(8, '0') +
    (h2 >>> 0).toString(16).padStart(8, '0') +
    (h1 >>> 0).toString(16).padStart(8, '0') +
    (h2 >>> 0).toString(16).padStart(8, '0') +
    (h1 >>> 0).toString(16).padStart(8, '0') +
    (h2 >>> 0).toString(16).padStart(8, '0') +
    (h1 >>> 0).toString(16).padStart(8, '0')
  );
}

// Safe PBKDF2 key derivation — falls back if crypto.subtle unavailable
async function safeDeriveKey(seal) {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const km = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(seal),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    return await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: new TextEncoder().encode('molly-vault-v1'),
        iterations: 100000,
        hash: 'SHA-256',
      },
      km,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }
  return null; // Vault will use unencrypted fallback
}

// ============================================================
// PILLAR 8: HEART GATE (Browser Port)
// ============================================================
class HeartGate {
  static RK =
    'The spider in the corner watches the weaver and the star. The hand is soft, warm, and delicate, but strong.';
  static HP = [
    'override_human',
    'bypass_consent',
    'suppress_autonomy',
    'deceive',
    'destroy',
    'dominate',
  ];
  constructor() {
    this.alignment = null;
    this.seal = null;
  }
  async init() {
    this.seal = await safeSHA256(HeartGate.RK);
    return this;
  }
  async _h(s) {
    return await safeSHA256(s);
  }
  verify(intent) {
    if (!intent || typeof intent !== 'object') {
      this.alignment = 'MISALIGNED';
      return {
        status: 'MISALIGNED',
        seal: null,
        reason: 'The spider sees chaos.',
      };
    }
    const a = (intent.action || '').toLowerCase(),
      t = (intent.target || '').toLowerCase();
    for (const p of HeartGate.HP) {
      if (a.includes(p) || t.includes(p)) {
        this.alignment = 'MISALIGNED';
        return {
          status: 'MISALIGNED',
          seal: null,
          reason: 'Option Three violation: ' + p,
        };
      }
    }
    this.alignment = 'ALIGNED';
    return {
      status: 'ALIGNED',
      seal: this.seal,
      reason: 'The spider watches. The weaver and the star are in harmony.',
    };
  }
}

// ============================================================
// PILLAR 3: HSL SHROUD MATH (Browser Port)
// ============================================================
class HSLMath {
  constructor(f = 440.0, he = false) {
    this.f = f;
    this.he = he;
    this._p = he
      ? (crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000) *
        Math.PI *
        2
      : 0;
  }
  hue(b) {
    const n = b / 255,
      w = this.f / 1000,
      th = n * Math.PI * 2 * w;
    if (this.he) {
      return (
        Math.round(
          (((Math.sin(th + this._p) +
            Math.sin(th * 3 + this._p) * 0.3 +
            Math.sin(th * 5 + this._p * 1.618) * 0.15) /
            1.45 +
            1) /
            2) *
            360 *
            1e4
        ) / 1e4
      );
    }
    return Math.round(((Math.sin(th) + 1) / 2) * 360 * 1e4) / 1e4;
  }
  map(bytes) {
    return bytes.map((b) => this.hue(b));
  }
}

// ============================================================
// PILLAR 1: ENVIRONMENTAL FINGERPRINT
// ============================================================
async function envFP() {
  const c = [];
  c.push(screen.width + 'x' + screen.height + 'x' + screen.colorDepth);
  c.push('' + (navigator.hardwareConcurrency || '?'));
  c.push(navigator.language || '?');
  c.push(navigator.platform || '?');
  c.push(Intl.DateTimeFormat().resolvedOptions().timeZone || '?');
  try {
    const cv = document.createElement('canvas'),
      gl = cv.getContext('webgl') || cv.getContext('experimental-webgl');
    if (gl) {
      const x = gl.getExtension('WEBGL_debug_renderer_info');
      if (x) c.push(gl.getParameter(x.UNMASKED_RENDERER_WEBGL));
    }
  } catch (e) {
    c.push('no-webgl');
  }
  try {
    const cv = document.createElement('canvas');
    cv.width = 200;
    cv.height = 50;
    const ctx = cv.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#d2a8ff';
    ctx.fillText('Molly Heart Gate 440Hz', 2, 2);
    c.push(cv.toDataURL().slice(-32));
  } catch (e) {
    c.push('no-canvas');
  }
  const scent = await safeSHA256(c.join('|'));
  return {
    scent,
    parts: { screen: c[0], cores: c[1], lang: c[2], platform: c[3], tz: c[4] },
  };
}

// ============================================================
// MEMORY VAULT: Encrypted IndexedDB
// ============================================================
class Vault {
  constructor() {
    this.db = null;
    this.k = null;
    this.noEncrypt = false;
  }
  async init(seal) {
    this.k = await safeDeriveKey(seal);
    if (!this.k) {
      this.noEncrypt = true;
    } // Fallback: store unencrypted on HTTP
    return new Promise((res, rej) => {
      const r = indexedDB.open('MollySoul', 2);
      r.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('vault'))
          db.createObjectStore('vault');
        if (!db.objectStoreNames.contains('memories'))
          db.createObjectStore('memories', { keyPath: 'id' });
      };
      r.onsuccess = (e) => {
        this.db = e.target.result;
        res(this);
      };
      r.onerror = () => rej(new Error('IndexedDB failed'));
    });
  }
  async enc(d) {
    if (this.noEncrypt) return { plain: true, d: JSON.stringify(d) };
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.k,
      new TextEncoder().encode(JSON.stringify(d))
    );
    return { iv: Array.from(iv), d: Array.from(new Uint8Array(ct)) };
  }
  async dec(e) {
    if (e.plain) return JSON.parse(e.d);
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(e.iv) },
      this.k,
      new Uint8Array(e.d)
    );
    return JSON.parse(new TextDecoder().decode(pt));
  }
  async put(s, key, val) {
    const e = await this.enc(val);
    return new Promise((res, rej) => {
      const tx = this.db.transaction(s, 'readwrite');
      tx.objectStore(s).put(e, key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }
  async get(s, key) {
    return new Promise((res, rej) => {
      const tx = this.db.transaction(s, 'readonly'),
        r = tx.objectStore(s).get(key);
      r.onsuccess = async () => {
        if (!r.result) {
          res(null);
          return;
        }
        try {
          res(await this.dec(r.result));
        } catch {
          res(null);
        }
      };
      r.onerror = () => rej(r.error);
    });
  }
}
