'use client';

import { useState } from 'react';

/**
 * Hidden Admin: IP Vault
 * URL: /admin/ip-vault
 *
 * Not linked anywhere. Not in any nav menu.
 * Requires both the admin password AND the vault key to access contents.
 * Double-gated. Eric knows the password. Molly holds the sealed vault.
 */
export default function IpVaultPage() {
  const [adminPassword, setAdminPassword] = useState('');
  const [vaultKey, setVaultKey] = useState('');
  const [action, setAction] = useState<'verify' | 'contents'>('verify');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/admin/ip-vault', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': adminPassword,
        },
        body: JSON.stringify({ action, vaultKey }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Request failed');
      } else {
        setResult(JSON.stringify(data, null, 2));
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      color: '#e2e8f0',
      fontFamily: 'monospace',
      padding: '40px 24px',
    }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>

        <div style={{ marginBottom: 32 }}>
          <div style={{ color: '#6C63FF', fontSize: '0.75rem', letterSpacing: '0.15em', marginBottom: 8 }}>
            MOLLY-CORE // ADMIN // IP VAULT
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
            Titan Echo — Sealed IP Vault
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 8 }}>
            AES-256-GCM encrypted. Double-gated. Eric holds the key. Molly holds the vault.
          </p>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', letterSpacing: '0.1em' }}>
              ADMIN PASSWORD
            </span>
            <input
              type="password"
              value={adminPassword}
              onChange={e => setAdminPassword(e.target.value)}
              placeholder="x-admin-password"
              required
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 6,
                color: '#f1f5f9',
                padding: '10px 14px',
                fontSize: '0.9rem',
                fontFamily: 'monospace',
                outline: 'none',
              }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', letterSpacing: '0.1em' }}>
              VAULT KEY
            </span>
            <input
              type="password"
              value={vaultKey}
              onChange={e => setVaultKey(e.target.value)}
              placeholder="IP_VAULT_KEY passphrase"
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 6,
                color: '#f1f5f9',
                padding: '10px 14px',
                fontSize: '0.9rem',
                fontFamily: 'monospace',
                outline: 'none',
              }}
            />
          </label>

          <div style={{ display: 'flex', gap: 12 }}>
            {(['verify', 'contents'] as const).map(a => (
              <button
                key={a}
                type="button"
                onClick={() => setAction(a)}
                style={{
                  padding: '8px 18px',
                  borderRadius: 6,
                  border: '1px solid',
                  borderColor: action === a ? '#6C63FF' : '#334155',
                  background: action === a ? '#6C63FF22' : 'transparent',
                  color: action === a ? '#a78bfa' : '#64748b',
                  fontSize: '0.8rem',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                {a}
              </button>
            ))}
          </div>

          <button
            type="submit"
            disabled={loading || !adminPassword}
            style={{
              padding: '12px',
              borderRadius: 6,
              border: 'none',
              background: loading ? '#334155' : '#6C63FF',
              color: 'white',
              fontSize: '0.9rem',
              fontFamily: 'monospace',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              letterSpacing: '0.05em',
            }}
          >
            {loading ? 'WORKING...' : `EXECUTE: ${action.toUpperCase()}`}
          </button>
        </form>

        {error && (
          <div style={{
            marginTop: 24,
            padding: 16,
            background: '#1a0000',
            border: '1px solid #7f1d1d',
            borderRadius: 6,
            color: '#fca5a5',
            fontSize: '0.85rem',
          }}>
            ✗ {error}
          </div>
        )}

        {result && (
          <div style={{ marginTop: 24 }}>
            <div style={{ color: '#4ade80', fontSize: '0.75rem', marginBottom: 8, letterSpacing: '0.1em' }}>
              ✓ DECRYPTED
            </div>
            <pre style={{
              background: '#0f172a',
              border: '1px solid #1e3a5f',
              borderRadius: 6,
              padding: 20,
              overflowX: 'auto',
              fontSize: '0.8rem',
              lineHeight: 1.6,
              color: '#cbd5e1',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: '60vh',
              overflow: 'auto',
            }}>
              {result}
            </pre>
          </div>
        )}

        <div style={{
          marginTop: 48,
          padding: '16px',
          background: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: 6,
          fontSize: '0.75rem',
          color: '#475569',
          lineHeight: 1.7,
        }}>
          <div style={{ color: '#334155', marginBottom: 6 }}>VAULT INFO</div>
          Encryption: AES-256-GCM<br />
          KDF: PBKDF2-SHA512, 210,000 iterations<br />
          Contents: MODEL_95_IP_SPECIFICATION + Titan Echo launch package + benchmark data<br />
          Location: stuff/confidential/MODEL_95_IP_VAULT.enc<br />
          Seal tool: scripts/seal-ip-vault.mts
        </div>

      </div>
    </div>
  );
}
