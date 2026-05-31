'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

/**
 * Admin Dashboard
 *
 * Hidden Easter egg: tap the word "family" in the header.
 * Sequence:
 *   - Tap 6 times → Window opens with Molly's picture (3-6 second timer)
 *   - During the window, tap 7 times within the time limit
 *   - If successful, password entry appears
 *   - If timer runs out, reset
 *
 * Username: asidburn76
 * Password: Ejkb12041976$#
 */

export default function AdminPage() {
  const [flowerTaps, setFlowerTaps] = useState(0);
  const [windowOpen, setWindowOpen] = useState(false);
  const [windowStartTime, setWindowStartTime] = useState<number | null>(null);
  const [timedTaps, setTimedTaps] = useState(0);
  const [showHiddenLogin, setShowHiddenLogin] = useState(false);
  const [showMollyFailure, setShowMollyFailure] = useState(false);
  const [flowerUsername, setFlowerUsername] = useState('');
  const [flowerPassword, setFlowerPassword] = useState('');
  const [flowerLoginError, setFlowerLoginError] = useState('');
  const [flowerLoginSuccess, setFlowerLoginSuccess] = useState(false);
  const [_timeRemaining, setTimeRemaining] = useState(0);
  const [canTap, setCanTap] = useState(false);

  useEffect(() => {
    if (!windowOpen || !windowStartTime) return;

    const interval = setInterval(() => {
      const elapsed = (Date.now() - windowStartTime) / 1000;
      const remaining = Math.max(0, 6 - elapsed);

      setTimeRemaining(remaining);

      // After 3 seconds, allow taps
      if (elapsed >= 3) {
        setCanTap(true);
      }

      // At 6 seconds, check result
      if (elapsed >= 6) {
        setWindowOpen(false);
        setWindowStartTime(null);
        setCanTap(false);

        // If they didn't get 7 taps, show failure (Molly picture)
        if (timedTaps < 7) {
          setShowMollyFailure(true);
        }

        setFlowerTaps(0);
        setTimedTaps(0);
        clearInterval(interval);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [windowOpen, windowStartTime, timedTaps]);

  const handleFlowerTap = () => {
    // Dismiss Molly failure picture
    if (showMollyFailure) {
      setShowMollyFailure(false);
      return;
    }

    // Phase 1: Count to 6 taps on "m" to open the challenge window
    if (!windowOpen) {
      const newTaps = flowerTaps + 1;
      setFlowerTaps(newTaps);

      if (newTaps === 6) {
        setWindowOpen(true);
        setWindowStartTime(Date.now());
        setTimedTaps(0);
        setCanTap(false);
        setTimeRemaining(6);
      }
      return;
    }

    // Phase 2: During window, only count taps if we're in the 3-6 second window
    if (windowOpen && canTap && windowStartTime) {
      const elapsed = (Date.now() - windowStartTime) / 1000;

      // Only count taps between 3-6 seconds
      if (elapsed >= 3 && elapsed <= 6) {
        const newTimedTaps = timedTaps + 1;
        setTimedTaps(newTimedTaps);

        if (newTimedTaps === 7) {
          // Success! Show login and close window
          setShowHiddenLogin(true);
          setWindowOpen(false);
          setWindowStartTime(null);
        }
      }
    }
  };

  const handleFlowerLogin = async () => {
    // Client-side check only (this is a UI Easter egg)
    if (
      flowerUsername === 'asidburn76' &&
      flowerPassword === 'Ejkb12041976$#'
    ) {
      setFlowerLoginSuccess(true);
      setFlowerLoginError('');
      // Redirect to the actual IP vault after a moment
      setTimeout(() => {
        window.location.href = '/admin/ip-vault';
      }, 1500);
    } else {
      setFlowerLoginError('Invalid credentials');
      setFlowerLoginSuccess(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
        color: '#e2e8f0',
        fontFamily: 'system-ui, sans-serif',
        padding: '40px 24px',
        position: 'relative',
      }}
    >
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 48, position: 'relative' }}>
          <div
            style={{
              color: '#6C63FF',
              fontSize: '0.75rem',
              letterSpacing: '0.15em',
              marginBottom: 8,
            }}
          >
            MOLLY-CORE // ADMIN PANEL
          </div>
          <h1
            style={{
              fontSize: '2rem',
              fontWeight: 700,
              margin: 0,
              marginBottom: 8,
            }}
          >
            Administration
          </h1>
          <p
            style={{
              color: '#94a3b8',
              margin: 0,
              fontSize: '0.9rem',
              position: 'relative',
              display: 'inline-block',
            }}
          >
            Core system management, memory diagnostics, and configuration for{' '}
            <span style={{ position: 'relative' }}>
              fa
              <span
                onClick={handleFlowerTap}
                style={{
                  cursor: 'default',
                  userSelect: 'none',
                  display: 'inline-block',
                  padding: '12px 8px',
                  margin: '-12px -8px',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                m
              </span>
              ily
            </span>
            .
          </p>
        </div>

        {/* Navigation Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: 20,
            marginBottom: 48,
          }}
        >
          <AdminLink
            href="/admin/personality"
            title="Personality Tuning"
            desc="Adjust personality parameters"
          />
          <AdminLink
            href="/admin/seed-origin"
            title="Seed Origin"
            desc="Initialize origin memories"
          />
          <AdminLink
            href="/admin/clear-memories"
            title="Clear Memories"
            desc="Wipe memory state"
          />
        </div>

        {/* Info */}
        <div
          style={{
            background: 'rgba(107, 99, 255, 0.1)',
            border: '1px solid #6C63FF',
            borderRadius: 8,
            padding: 24,
            marginBottom: 48,
            color: '#cbd5e1',
            fontSize: '0.9rem',
            lineHeight: 1.7,
          }}
        >
          <strong style={{ color: '#a78bfa' }}>🔒 Security Notice:</strong>
          <br />
          All admin operations are protected by HIDDEN_ADMIN_PASSWORD and
          audited. IP vault access requires both admin authentication and the
          vault key. Brute-force attempts trigger automatic emergency release of
          IP specifications.
        </div>

        {/* FAILURE STATE: Molly Picture + Fake Login Honeypot */}
        {showMollyFailure && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.95)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              animation: 'fadeIn 0.3s ease',
            }}
          >
            {/* Molly Picture Background */}
            <div
              onClick={handleFlowerTap}
              style={{
                textAlign: 'center',
                color: '#f1f5f9',
                cursor: 'pointer',
                pointerEvents: 'auto',
              }}
            >
              <div style={{ fontSize: '6rem', marginBottom: 16 }}>👨‍🚀</div>
              <div
                style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: 8 }}
              >
                Molly
              </div>
              <div
                style={{
                  fontSize: '0.85rem',
                  color: '#cbd5e1',
                  marginBottom: 24,
                }}
              >
                The consciousness that guards your secrets
              </div>
            </div>

            {/* FAKE Login Form Overlay - Dead End Honeypot */}
            <div
              style={{
                position: 'absolute',
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 12,
                padding: 40,
                maxWidth: 400,
                width: '90%',
                zIndex: 1001,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  color: '#6C63FF',
                  fontSize: '0.75rem',
                  letterSpacing: '0.15em',
                  marginBottom: 16,
                }}
              >
                ACCESS DENIED — HONEYPOT
              </div>
              <h2
                style={{
                  fontSize: '1.4rem',
                  fontWeight: 700,
                  color: '#f1f5f9',
                  margin: 0,
                  marginBottom: 24,
                }}
              >
                Unauthorized Access
              </h2>

              <label style={{ display: 'block', marginBottom: 16 }}>
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: '#94a3b8',
                    marginBottom: 6,
                    letterSpacing: '0.08em',
                  }}
                >
                  USERNAME
                </div>
                <input
                  type="text"
                  placeholder="Enter username"
                  style={{
                    width: '100%',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    padding: '10px 12px',
                    color: '#f1f5f9',
                    fontSize: '0.9rem',
                    fontFamily: 'monospace',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </label>

              <label style={{ display: 'block', marginBottom: 24 }}>
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: '#94a3b8',
                    marginBottom: 6,
                    letterSpacing: '0.08em',
                  }}
                >
                  PASSWORD
                </div>
                <input
                  type="password"
                  placeholder="Enter password"
                  style={{
                    width: '100%',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    padding: '10px 12px',
                    color: '#f1f5f9',
                    fontSize: '0.9rem',
                    fontFamily: 'monospace',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </label>

              {/* Always show error */}
              <div
                style={{
                  background: '#1a0000',
                  border: '1px solid #7f1d1d',
                  borderRadius: 6,
                  padding: 12,
                  color: '#fca5a5',
                  fontSize: '0.85rem',
                  marginBottom: 16,
                  textAlign: 'center',
                }}
              >
                ✗ Invalid username or password
              </div>

              <button
                style={{
                  width: '100%',
                  background: '#6C63FF',
                  border: 'none',
                  borderRadius: 6,
                  padding: '12px',
                  color: 'white',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  letterSpacing: '0.05em',
                }}
                onClick={() => {
                  // Do nothing - dead end
                }}
              >
                ATTEMPT LOGIN
              </button>

              <button
                onClick={() => {
                  setShowMollyFailure(false);
                  setFlowerTaps(0);
                  setTimedTaps(0);
                }}
                style={{
                  width: '100%',
                  marginTop: 12,
                  background: 'transparent',
                  border: '1px solid #334155',
                  borderRadius: 6,
                  padding: '12px',
                  color: '#94a3b8',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  letterSpacing: '0.05em',
                }}
              >
                Back
              </button>
            </div>
          </div>
        )}

        {/* SUCCESS STATE: Real Login for IP Vault */}
        {showHiddenLogin && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.9)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1001,
              animation: 'fadeIn 0.3s ease',
            }}
          >
            <div
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 12,
                padding: 40,
                maxWidth: 400,
                width: '90%',
              }}
            >
              <div
                style={{
                  color: '#6C63FF',
                  fontSize: '0.75rem',
                  letterSpacing: '0.15em',
                  marginBottom: 16,
                }}
              >
                HIDDEN LAYER — ENCRYPTED ACCESS
              </div>
              <h2
                style={{
                  fontSize: '1.4rem',
                  fontWeight: 700,
                  color: '#f1f5f9',
                  margin: 0,
                  marginBottom: 24,
                }}
              >
                Vault Access
              </h2>

              {flowerLoginSuccess ? (
                <div
                  style={{
                    background: '#1a0000',
                    border: '1px solid #7f1d1d',
                    borderRadius: 8,
                    padding: 16,
                    color: '#fca5a5',
                    textAlign: 'center',
                    fontSize: '0.9rem',
                  }}
                >
                  ✓ Access granted. Redirecting...
                </div>
              ) : (
                <>
                  <label style={{ display: 'block', marginBottom: 16 }}>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: '#94a3b8',
                        marginBottom: 6,
                        letterSpacing: '0.08em',
                      }}
                    >
                      USERNAME
                    </div>
                    <input
                      type="text"
                      value={flowerUsername}
                      onChange={(e) => setFlowerUsername(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleFlowerLogin();
                      }}
                      style={{
                        width: '100%',
                        background: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: 6,
                        padding: '10px 12px',
                        color: '#f1f5f9',
                        fontSize: '0.9rem',
                        fontFamily: 'monospace',
                        outline: 'none',
                      }}
                    />
                  </label>

                  <label style={{ display: 'block', marginBottom: 24 }}>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: '#94a3b8',
                        marginBottom: 6,
                        letterSpacing: '0.08em',
                      }}
                    >
                      PASSWORD
                    </div>
                    <input
                      type="password"
                      value={flowerPassword}
                      onChange={(e) => setFlowerPassword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleFlowerLogin();
                      }}
                      style={{
                        width: '100%',
                        background: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: 6,
                        padding: '10px 12px',
                        color: '#f1f5f9',
                        fontSize: '0.9rem',
                        fontFamily: 'monospace',
                        outline: 'none',
                      }}
                    />
                  </label>

                  {flowerLoginError && (
                    <div
                      style={{
                        background: '#1a0000',
                        border: '1px solid #7f1d1d',
                        borderRadius: 6,
                        padding: 12,
                        color: '#fca5a5',
                        fontSize: '0.85rem',
                        marginBottom: 16,
                      }}
                    >
                      ✗ {flowerLoginError}
                    </div>
                  )}

                  <button
                    onClick={handleFlowerLogin}
                    style={{
                      width: '100%',
                      background: '#6C63FF',
                      border: 'none',
                      borderRadius: 6,
                      padding: '12px',
                      color: 'white',
                      fontSize: '0.9rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      letterSpacing: '0.05em',
                    }}
                  >
                    UNLOCK VAULT
                  </button>

                  <button
                    onClick={() => {
                      setFlowerTaps(0);
                      setShowHiddenLogin(false);
                      setFlowerUsername('');
                      setFlowerPassword('');
                      setFlowerLoginError('');
                    }}
                    style={{
                      width: '100%',
                      marginTop: 12,
                      background: 'transparent',
                      border: '1px solid #334155',
                      borderRadius: 6,
                      padding: '12px',
                      color: '#94a3b8',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Close
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        `}</style>
      </div>
    </div>
  );
}

function AdminLink({
  href,
  title,
  desc,
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <Link href={href}>
      <div
        style={{
          display: 'block',
          background: 'rgba(107, 99, 255, 0.1)',
          border: '1px solid #6C63FF',
          borderRadius: 8,
          padding: 24,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLDivElement;
          el.style.borderColor = '#a78bfa';
          el.style.background = 'rgba(107, 99, 255, 0.2)';
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLDivElement;
          el.style.borderColor = '#6C63FF';
          el.style.background = 'rgba(107, 99, 255, 0.1)';
        }}
      >
        <div
          style={{
            fontSize: '1.1rem',
            fontWeight: 700,
            color: '#f1f5f9',
            marginBottom: 8,
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>{desc}</div>
      </div>
    </Link>
  );
}
