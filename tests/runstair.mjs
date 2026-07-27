import { createServer } from 'vite';
const s = await createServer({ server:{middlewareMode:true}, appType:'custom', logLevel:'error' });
try { await s.ssrLoadModule('/tests/stair-diag.mjs'); } catch(e){ console.error(e); } finally { await s.close(); }
