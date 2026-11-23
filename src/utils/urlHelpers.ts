/**
 * Pure URL & asset path helpers that work across:
 * - AI Studio / unified Node Express server (root '/')
 * - GitHub Pages project subpath ('/<repo>/' or relative './')
 * - Split frontend (GitHub Pages) + remote backend (VITE_API_BASE_URL)
 */

function readEnvValue(key: 'BASE_URL' | 'VITE_API_BASE_URL'): string | undefined {
  try {
    const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    return metaEnv?.[key];
  } catch {
    return undefined;
  }
}

/**
 * Resolves a public/ static asset path relative to the active Vite base URL.
 * Guarantees subpath deployments (e.g. GitHub Pages '/repo-name/') never request '/assets/...'.
 */
export function resolvePublicAssetUrl(assetPath: string, explicitBaseUrl?: string): string {
  const cleanAsset = assetPath.replace(/^\/+/, '');
  const rawBase = explicitBaseUrl !== undefined ? explicitBaseUrl : readEnvValue('BASE_URL') || './';
  const trimmedBase = rawBase.trim() || './';

  if (trimmedBase === '.' || trimmedBase === './') {
    return `./${cleanAsset}`;
  }

  const normalizedBase = trimmedBase.endsWith('/') ? trimmedBase : `${trimmedBase}/`;
  return `${normalizedBase}${cleanAsset}`;
}

/**
 * Resolves an API endpoint path against optional VITE_API_BASE_URL.
 * Defaults to root-relative '/api/...' when frontend and backend share the same origin.
 */
export function resolveApiUrl(apiPath: string, explicitApiBaseUrl?: string): string {
  const normalizedPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  const rawApiBase =
    explicitApiBaseUrl !== undefined ? explicitApiBaseUrl : readEnvValue('VITE_API_BASE_URL') || '';
  const trimmedApiBase = rawApiBase.trim().replace(/\/+$/, '');

  if (!trimmedApiBase) {
    return normalizedPath;
  }

  return `${trimmedApiBase}${normalizedPath}`;
}

/**
 * Detects when an API request hit a static-only host (such as GitHub Pages returning 404/405 HTML)
 * instead of the NextCandle Node.js Express backend.
 */
export function isStaticHostApiUnavailable(status: number, contentType: string | null): boolean {
  if (status !== 404 && status !== 405) return false;
  const ct = (contentType || '').toLowerCase();
  return !ct.includes('application/json');
}
