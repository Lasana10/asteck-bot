import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import 'leaflet/dist/leaflet.css';
import { registerSW } from 'virtual:pwa-register';
import { offlineSync } from './services/offlineSync';

// Register the Service Worker for Offline PWA support
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

// Start our offline sync queue manager
offlineSync.init();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
