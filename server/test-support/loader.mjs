// ESM loader hooks used only by the backend test suite.
// Replaces external services imported by server.js with in-process fakes so the
// real server module can be loaded without credentials, network, or Firestore.
import { readFileSync } from 'node:fs';

const FAKES = new URL('./fakes/', import.meta.url);
const FIREBASE_ADMIN_FAKE_URL = 'test-fake:firebaseAdmin';

export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@google-cloud/vertexai') {
    return { url: new URL('vertexai.mjs', FAKES).href, shortCircuit: true };
  }
  if (specifier === 'google-auth-library') {
    return { url: new URL('google-auth-library.mjs', FAKES).href, shortCircuit: true };
  }
  if (specifier.endsWith('/services/firebaseAdmin.js')) {
    return { url: FIREBASE_ADMIN_FAKE_URL, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url === FIREBASE_ADMIN_FAKE_URL) {
    // Export a no-op for every name server.js imports from firebaseAdmin.js,
    // derived from server.js itself so new imports do not break the suite.
    const serverSrc = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
    const match = serverSrc.match(/import\s*\{([^}]*)\}\s*from\s*'\.\/services\/firebaseAdmin\.js'/);
    const names = match ? match[1].split(',').map((n) => n.trim()).filter(Boolean) : [];
    const source = names
      .map((n) => `export async function ${n}() { return { error: 'firebaseAdmin is faked in tests' }; }`)
      .join('\n');
    return { format: 'module', source, shortCircuit: true };
  }
  return nextLoad(url, context);
}
