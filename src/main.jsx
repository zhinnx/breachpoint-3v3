import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

const el = document.getElementById('root');
createRoot(el).render(<App />);

// PWA service worker registration (vite-plugin-pwa, autoUpdate)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* offline SW optional */ });
  });
}
