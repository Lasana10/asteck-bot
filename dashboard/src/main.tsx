import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import 'leaflet/dist/leaflet.css';

// ═══ BULLETPROOF BOOT SEQUENCE ═══
// React MUST mount first. Everything else is secondary.

// ═══ GLOBAL ERROR BOUNDARY ═══
class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: any}> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error("[AFAT CRITICAL] React Crash:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', background: '#080c14', color: '#ef4444', height: '100vh', fontFamily: 'monospace' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>⚠️ SYSTEM CRASH</h1>
          <p style={{ color: '#94a3b8', fontSize: '14px' }}>AFAT OS encountered a critical rendering error.</p>
          <pre style={{ background: '#1e293b', padding: '20px', borderRadius: '8px', overflow: 'auto', marginTop: '20px' }}>
            {this.state.error?.message || "Unknown error"}
          </pre>
          <button 
            onClick={() => window.location.reload()}
            style={{ marginTop: '20px', background: '#3b82f6', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            RESTART SENTINEL
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

// PWA registration — wrapped in try/catch so it NEVER blocks rendering
try {
  import('virtual:pwa-register').then(({ registerSW }) => {
    const updateSW = registerSW({
      onNeedRefresh() {
        if (confirm('New content available. Reload?')) {
          updateSW(true);
        }
      },
      onOfflineReady() {
        console.log('AFAT is ready to work offline.');
      },
    });
  }).catch(err => {
    console.warn('[AFAT] PWA registration skipped:', err);
  });
} catch (e) {
  console.warn('[AFAT] PWA not available:', e);
}

// Offline sync — also non-blocking
try {
  import('./services/offlineSync').then(({ offlineSync }) => {
    offlineSync.init();
  }).catch(err => {
    console.warn('[AFAT] Offline sync skipped:', err);
  });
} catch (e) {
  console.warn('[AFAT] Offline sync not available:', e);
}
