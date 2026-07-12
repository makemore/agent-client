/**
 * AgentClient — main entry point for interacting with a django-agent-runtime backend.
 */

import type {
  AgentClientConfig,
  ApiPaths,
  CaseStyle,
  CreateRunParams,
  RunResponse,
  ConversationResponse,
  VoiceToken,
  VoiceDescriptor,
} from './types/index.js';
import { DEFAULT_API_PATHS } from './types/index.js';
import { createAuthHandler, type AuthHandler } from './auth.js';
import { keysToSnake, keysToCamel } from './case.js';
import { subscribeToRun, type RunHandle } from './run.js';

export class AgentClient {
  private readonly backendUrl: string;
  private readonly paths: ApiPaths;
  private readonly caseStyle: CaseStyle;
  private readonly auth: AuthHandler;
  private readonly defaultEphemeral: boolean;

  constructor(config: AgentClientConfig) {
    this.backendUrl = config.backendUrl.replace(/\/+$/, '');
    this.paths = { ...DEFAULT_API_PATHS, ...config.apiPaths };
    this.caseStyle = config.apiCaseStyle ?? 'auto';
    this.auth = createAuthHandler(config.auth);
    this.defaultEphemeral = config.ephemeral ?? false;
  }

  // ---------------------------------------------------------------------------
  // Case conversion (mirrors agent-frontend api.js transformRequest/Response)
  // ---------------------------------------------------------------------------

  /** Transform outgoing request body (camel → snake for 'auto'/'snake'). */
  transformRequest<T>(body: T): unknown {
    if (!body || typeof body !== 'object') return body;
    if (this.caseStyle === 'camel') return body;
    return keysToSnake(body);
  }

  /** Transform incoming response data (snake → camel for 'auto'/'camel'). */
  transformResponse<T>(data: T): T {
    if (!data || typeof data !== 'object') return data;
    if (this.caseStyle === 'snake') return data;
    return keysToCamel(data) as T;
  }

  // ---------------------------------------------------------------------------
  // Fetch helpers
  // ---------------------------------------------------------------------------

  private async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string> | undefined),
      ...this.auth.getHeaders(),
    };
    const credentials = this.auth.getCredentials();

    return fetch(`${this.backendUrl}${path}`, {
      ...init,
      headers,
      ...(credentials ? { credentials } : {}),
    });
  }

  /** Ensure auth token exists (creates anonymous session if needed). */
  async ensureAuth(forceRefresh = false): Promise<string | null> {
    return this.auth.ensureSession(
      this.backendUrl,
      this.paths.anonymousSession,
      forceRefresh,
    );
  }

  // ---------------------------------------------------------------------------
  // Runs
  // ---------------------------------------------------------------------------

  /**
   * Create a new agent run and return a handle for streaming events.
   *
   * Handles:
   * - JSON or FormData body (when files are present)
   * - 401 retry with token refresh (anonymous strategy)
   * - Case conversion
   */
  async createRun(params: CreateRunParams): Promise<{ run: RunResponse; handle: RunHandle }> {
    await this.ensureAuth();

    let init: RequestInit;
    if (params.files && params.files.length > 0) {
      init = this.buildFormDataInit(params);
    } else {
      init = this.buildJsonInit(params);
    }

    let response = await this.fetch(this.paths.runs, init);

    // 401 retry (anonymous token may have expired)
    if (response.status === 401) {
      this.auth.clearSession();
      await this.ensureAuth(true);
      // Rebuild init to pick up new auth headers
      if (params.files && params.files.length > 0) {
        init = this.buildFormDataInit(params);
      } else {
        init = this.buildJsonInit(params);
      }
      response = await this.fetch(this.paths.runs, init);
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const msg = errData.error || errData.detail || `HTTP ${response.status}`;
      throw new Error(msg);
    }

    const rawRun = await response.json();
    const run = this.transformResponse<RunResponse>(rawRun);

    // Build SSE URL
    const eventPath = this.paths.runEvents.replace('{runId}', run.id);
    let sseUrl = `${this.backendUrl}${eventPath}`;
    const tokenParam = this.auth.getTokenParam();
    if (tokenParam) {
      sseUrl += `?token=${encodeURIComponent(tokenParam)}`;
    }

    const handle = subscribeToRun(sseUrl, run.id);
    return { run, handle };
  }

  /** Cancel a running agent run. */
  async cancelRun(runId: string): Promise<boolean> {
    const cancelPath = `${this.paths.runs}${runId}/cancel/`;
    const response = await this.fetch(cancelPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return response.ok;
  }

  // ---------------------------------------------------------------------------
  // Conversations
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Voice
  // ---------------------------------------------------------------------------

  /**
   * Mint a short-lived bearer token for the TTS streaming endpoint.
   *
   * The token is bound to the current authenticated principal and may
   * embed quota/rate-limit metadata. Voice providers should call this
   * before each playback session and refresh on 401.
   *
   * Returns ``null`` if the backend has no voice endpoint configured.
   */
  async voiceToken(): Promise<VoiceToken | null> {
    const path = this.paths.voiceToken;
    if (!path) return null;
    await this.ensureAuth();
    const response = await this.fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`voiceToken HTTP ${response.status}`);
    const raw = await response.json();
    const data = this.transformResponse<VoiceToken>(raw);
    // ttsUrl may be a relative path; absolutise so consumers can fetch directly.
    if (data.ttsUrl && data.ttsUrl.startsWith('/')) {
      data.ttsUrl = `${this.backendUrl}${data.ttsUrl}`;
    }
    return data;
  }

  /** List voices available on the configured provider (e.g. ElevenLabs). */
  async voices(): Promise<VoiceDescriptor[]> {
    const path = this.paths.voiceVoices;
    if (!path) return [];
    await this.ensureAuth();
    const response = await this.fetch(path, { method: 'GET' });
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`voices HTTP ${response.status}`);
    const raw = await response.json();
    const data = this.transformResponse<{ voices: VoiceDescriptor[] }>(raw);
    return data.voices ?? [];
  }

  /** Fetch a conversation with messages. */
  async getConversation(
    conversationId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<ConversationResponse> {
    const limit = options.limit ?? 10;
    const offset = options.offset ?? 0;
    const url = `${this.paths.conversations}${conversationId}/?limit=${limit}&offset=${offset}`;
    const response = await this.fetch(url, { method: 'GET' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const raw = await response.json();
    return this.transformResponse<ConversationResponse>(raw);
  }

  // ---------------------------------------------------------------------------
  // Private helpers for building request init
  // ---------------------------------------------------------------------------

  private buildJsonInit(params: CreateRunParams): RequestInit {
    const ephemeral = params.ephemeral ?? this.defaultEphemeral;
    const body = this.transformRequest({
      agentKey: params.agentKey,
      conversationId: params.conversationId ?? null,
      messages: params.messages,
      metadata: params.metadata ?? {},
      ...(params.model ? { model: params.model } : {}),
      ...(params.thinking ? { thinking: true } : {}),
      ...(params.supersedeFromMessageIndex !== undefined
        ? { supersedeFromMessageIndex: params.supersedeFromMessageIndex }
        : {}),
      ...(ephemeral ? { ephemeral: true } : {}),
      ...(params.memories && params.memories.length > 0
        ? { memories: params.memories }
        : {}),
    });
    return {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.auth.getHeaders() },
      body: JSON.stringify(body),
      ...(this.auth.getCredentials() ? { credentials: this.auth.getCredentials() } : {}),
    };
  }

  private buildFormDataInit(params: CreateRunParams): RequestInit {
    const useSnake = this.caseStyle !== 'camel';
    const k = (key: string): string => (useSnake ? key.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`) : key);

    const formData = new FormData();
    formData.append(k('agentKey'), params.agentKey);
    if (params.conversationId) formData.append(k('conversationId'), params.conversationId);
    formData.append('messages', JSON.stringify(params.messages));
    formData.append('metadata', JSON.stringify(params.metadata ?? {}));
    if (params.model) formData.append('model', params.model);
    if (params.thinking) formData.append('thinking', 'true');
    const ephemeralFd = params.ephemeral ?? this.defaultEphemeral;
    if (ephemeralFd) formData.append(k('ephemeral'), 'true');
    if (params.memories && params.memories.length > 0) {
      formData.append('memories', JSON.stringify(params.memories));
    }
    if (params.files) {
      for (const file of params.files) {
        formData.append('files', file);
      }
    }
    return {
      method: 'POST',
      headers: { ...this.auth.getHeaders() }, // No Content-Type — browser sets boundary
      body: formData,
      ...(this.auth.getCredentials() ? { credentials: this.auth.getCredentials() } : {}),
    };
  }
}