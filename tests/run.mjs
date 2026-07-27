// Runs the sim test through Vite's SSR pipeline so JSX-free game modules resolve.
import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  await server.ssrLoadModule('/tests/sim-match.mjs');
} catch (e) {
  console.error('TEST HARNESS ERROR:', e);
  process.exitCode = 1;
} finally {
  await server.close();
}
