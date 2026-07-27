import { createServer } from 'vite';
const s = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try { await s.ssrLoadModule('/tests/nav-diag.mjs'); } catch (e) { console.error('ERR', e); } finally { await s.close(); }
