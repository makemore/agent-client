/**
 * Auth strategies — extracted from agent-frontend api.js
 *
 * Handles token, jwt, anonymous, session, and none strategies.
 */

import type { AuthConfig, AgentClientStorage } from './types/index.js';

// ---------------------------------------------------------------------------
// CSRF helper (browser-only)
// ---------------------------------------------------------------------------

function getCSRFToken(cookieName = 'csrftoken'): string | null {
  if (typeof document === 'undefined') return null;
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === cookieName) {
      return decodeURIComponent(value);
    }
  }
  const metaTag = document.querySelector('meta[name="csrf-token"]');
  if (metaTag) {
    return metaTag.getAttribute('content');
  }
  return null;
}

// ---------------------------------------------------------------------------
// Auth handler
// ---------------------------------------------------------------------------

export interface AuthHandler {
  /** Get headers to add to fetch() requests. */
  getHeaders(): Record<string, string>;
  /** Get fetch credentials mode ('include' for session, undefined otherwise). */
  getCredentials(): RequestCredentials | undefined;
  /** Get token to append as query param for EventSource URLs (SSE can't set headers). */
  getTokenParam(): string | null;
  /** Ensure a session exists (only relevant for anonymous strategy). Returns token or null. */
  ensureSession(backendUrl: string, endpoint: string, forceRefresh?: boolean): Promise<string | null>;
  /** Clear stored session (call on 401 to force re-auth). */
  clearSession(): void;
}

export function createAuthHandler(config: AuthConfig | undefined): AuthHandler {
  const strategy = config?.strategy ?? 'none';

  // In-memory token for anonymous sessions
  let anonToken: string | null = null;

  const getStorage = (): AgentClientStorage | undefined => {
    if (config && 'storage' in config) return config.storage;
    return undefined;
  };

  const getHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {};

    switch (strategy) {
      case 'token': {
        const c = config as Extract<AuthConfig, { strategy: 'token' }>;
        const headerName = c.header ?? 'Authorization';
        const prefix = c.prefix ?? 'Token';
        headers[headerName] = prefix ? `${prefix} ${c.token}` : c.token;
        break;
      }
      case 'jwt': {
        const c = config as Extract<AuthConfig, { strategy: 'jwt' }>;
        const headerName = c.header ?? 'Authorization';
        const prefix = c.prefix ?? 'Bearer';
        headers[headerName] = prefix ? `${prefix} ${c.token}` : c.token;
        break;
      }
      case 'anonymous': {
        if (anonToken) {
          const c = config as Extract<AuthConfig, { strategy: 'anonymous' }>;
          const headerName = c.tokenHeader ?? 'X-Anonymous-Token';
          headers[headerName] = anonToken;
        }
        break;
      }
      case 'session': {
        const c = config as Extract<AuthConfig, { strategy: 'session' }>;
        const csrf = getCSRFToken(c.csrfCookieName);
        if (csrf) headers['X-CSRFToken'] = csrf;
        break;
      }
    }
    return headers;
  };

  const getCredentials = (): RequestCredentials | undefined => {
    return strategy === 'session' ? 'include' : undefined;
  };

  const getTokenParam = (): string | null => {
    switch (strategy) {
      case 'token':
        return (config as Extract<AuthConfig, { strategy: 'token' }>).token;
      case 'jwt':
        return (config as Extract<AuthConfig, { strategy: 'jwt' }>).token;
      case 'anonymous':
        return anonToken;
      default:
        return null; // session relies on cookies; none has nothing
    }
  };

  const ensureSession = async (
    backendUrl: string,
    endpoint: string,
    forceRefresh = false,
  ): Promise<string | null> => {
    if (strategy !== 'anonymous') {
      // For non-anonymous strategies the token is static config
      return getTokenParam();
    }
    const c = config as Extract<AuthConfig, { strategy: 'anonymous' }>;
    const storageKey = c.tokenStorageKey ?? 'agent_client_anonymous_token';
    const storage = getStorage();

    if (!forceRefresh) {
      if (anonToken) return anonToken;
      if (storage) {
        const stored = await Promise.resolve(storage.get(storageKey));
        if (stored) { anonToken = stored; return stored; }
      }
    }

    // Fetch a new anonymous token
    const sessionEndpoint = c.sessionEndpoint ?? endpoint;
    try {
      const res = await fetch(`${backendUrl}${sessionEndpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        anonToken = data.token;
        if (storage && anonToken) await Promise.resolve(storage.set(storageKey, anonToken));
        return anonToken;
      }
    } catch (e) {
      // Swallow — caller gets null
    }
    return null;
  };

  const clearSession = (): void => {
    if (strategy !== 'anonymous') return;
    const c = config as Extract<AuthConfig, { strategy: 'anonymous' }>;
    const storageKey = c.tokenStorageKey ?? 'agent_client_anonymous_token';
    anonToken = null;
    const storage = getStorage();
    if (storage) void Promise.resolve(storage.set(storageKey, null));
  };

  return { getHeaders, getCredentials, getTokenParam, ensureSession, clearSession };
}
