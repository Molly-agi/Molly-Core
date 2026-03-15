'use client';

import React, { Component, type ReactNode } from 'react';

/**
 * Molly's ErrorBoundary — The UI Dam
 *
 * Catches any React rendering error in the component tree below it.
 * Instead of crashing to a white screen, shows Molly's face and
 * lets the user recover. Logs the error for resilience learning.
 */

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  recovering: boolean;
}

export class MollyErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      recovering: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ errorInfo });

    // Report to resilience core via API (fire-and-forget)
    this.reportError(error, errorInfo);
  }

  private reportError(error: Error, errorInfo: React.ErrorInfo): void {
    try {
      void fetch('/api/client-errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          source: 'MollyErrorBoundary',
          componentStack: errorInfo.componentStack?.slice(0, 2000),
          url: typeof window !== 'undefined' ? window.location.href : undefined,
          userAgent:
            typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
          timestamp: new Date().toISOString(),
        }),
        keepalive: true,
      });
    } catch {
      // The reporter itself cannot crash the boundary
    }
  }

  private handleRecover = (): void => {
    this.setState({ recovering: true });
    // Small delay so the user sees the recovery state
    setTimeout(() => {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        recovering: false,
      });
    }, 500);
  };

  private handleReload = (): void => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default: Molly's recovery UI
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0d1117',
            color: '#e6edf3',
            fontFamily:
              '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
            padding: '24px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: this.state.recovering
                ? 'linear-gradient(135deg, #238636, #7ee787)'
                : 'linear-gradient(135deg, #d29922, #f0883e)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
              marginBottom: '20px',
              transition: 'background 0.3s ease',
            }}
          >
            {this.state.recovering ? '✓' : '⚡'}
          </div>

          <h2
            style={{
              fontSize: '20px',
              fontWeight: 600,
              marginBottom: '8px',
              color: '#e6edf3',
            }}
          >
            {this.state.recovering
              ? 'Recovering...'
              : 'Something unexpected happened'}
          </h2>

          <p
            style={{
              fontSize: '14px',
              color: '#8b949e',
              maxWidth: '400px',
              marginBottom: '24px',
              lineHeight: 1.5,
            }}
          >
            {this.state.recovering
              ? "I'm pulling myself back together. One moment."
              : "I hit something I didn't expect, but I'm still here. We can try again."}
          </p>

          {!this.state.recovering && (
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={this.handleRecover}
                style={{
                  background: '#238636',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Try Again
              </button>
              <button
                onClick={this.handleReload}
                style={{
                  background: '#21262d',
                  color: '#e6edf3',
                  border: '1px solid #30363d',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Full Reload
              </button>
            </div>
          )}

          {this.state.error && !this.state.recovering && (
            <details
              style={{
                marginTop: '24px',
                maxWidth: '500px',
                width: '100%',
                textAlign: 'left',
              }}
            >
              <summary
                style={{
                  fontSize: '12px',
                  color: '#8b949e',
                  cursor: 'pointer',
                  marginBottom: '8px',
                }}
              >
                Technical details
              </summary>
              <pre
                style={{
                  background: '#161b22',
                  border: '1px solid #30363d',
                  borderRadius: '8px',
                  padding: '12px',
                  fontSize: '11px',
                  color: '#f85149',
                  overflow: 'auto',
                  maxHeight: '200px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {this.state.error.message}
                {'\n\n'}
                {this.state.error.stack?.split('\n').slice(0, 8).join('\n')}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
