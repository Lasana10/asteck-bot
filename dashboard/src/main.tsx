import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import 'leaflet/dist/leaflet.css';

// ═══ BULLETPROOF BOOT SEQUENCE ═══
// React MUST mount first. Everything else is secondary.

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
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
