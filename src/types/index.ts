/**
 * @makemore/agent-client — Type definitions
 *
 * Source of truth for event shapes: django-agent-runtime EventType enum.
 */

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/** Injectable storage so callers decide persistence (localStorage, in-memory, etc). */
export interface AgentClientStorage {
  get(key: string): string | null | Promise<string | null>;
  set(key: string, value: string | null): void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export type AuthStrategy = 'token' | 'jwt' | 'anonymous' | 'session' | 'none';

export interface TokenAuthConfig {
  strategy: 'token';
  token: string;
  header?: string;        // default: 'Authorization'
  prefix?: string;        // default: 'Token'
}

export interface JwtAuthConfig {
  strategy: 'jwt';
  token: string;
  header?: string;        // default: 'Authorization'
  prefix?: string;        // default: 'Bearer'
}

export interface AnonymousAuthConfig {
  strategy: 'anonymous';
  sessionEndpoint?: string;       // default: apiPaths.anonymousSession
  tokenHeader?: string;           // default: 'X-Anonymous-Token'
  tokenStorageKey?: string;       // default: 'agent_client_anonymous_token'
  storage?: AgentClientStorage;
}

export interface SessionAuthConfig {
  strategy: 'session';
  csrfCookieName?: string;   // default: 'csrftoken'
}

export interface NoneAuthConfig {
  strategy: 'none';
}

export type AuthConfig =
  | TokenAuthConfig
  | JwtAuthConfig
  | AnonymousAuthConfig
  | SessionAuthConfig
  | NoneAuthConfig;

// ---------------------------------------------------------------------------
// API Paths
// ---------------------------------------------------------------------------

export interface ApiPaths {
  anonymousSession: string;
  conversations: string;
  runs: string;
  runEvents: string;
  cancelRun?: string;
  /** Mints a short-lived voice token (POST). */
  voiceToken?: string;
  /** TTS streaming endpoint (POST, audio/mpeg response). */
  voiceTts?: string;
  /** Lists available voices (GET). */
  voiceVoices?: string;
}

export const DEFAULT_API_PATHS: ApiPaths = {
  anonymousSession: '/api/accounts/anonymous-session/',
  conversations: '/api/agent-runtime/conversations/',
  runs: '/api/agent-runtime/runs/',
  runEvents: '/api/agent-runtime/runs/{runId}/events/',
  voiceToken: '/api/agent-runtime/voice/token/',
  voiceTts: '/api/agent-runtime/voice/tts/',
  voiceVoices: '/api/agent-runtime/voice/voices/',
};

// ---------------------------------------------------------------------------
// Voice
// ---------------------------------------------------------------------------

/** Short-lived bearer token minted by the backend for direct TTS streaming. */
export interface VoiceToken {
  token: string;
  /** ISO timestamp when the token stops being valid. */
  expiresAt: string;
  /** Absolute or relative URL of the TTS streaming endpoint. */
  ttsUrl: string;
}

export interface VoiceDescriptor {
  id: string;
  name: string;
  /** Provider-specific labels such as gender, accent, age, use_case. */
  labels?: Record<string, string>;
  preview_url?: string;
}

// ---------------------------------------------------------------------------
// Client Config
// ---------------------------------------------------------------------------

export type CaseStyle = 'auto' | 'camel' | 'snake';

export interface AgentClientConfig {
  backendUrl: string;
  apiPaths?: Partial<ApiPaths>;
  auth?: AuthConfig;
  apiCaseStyle?: CaseStyle;  // default: 'auto'
  /** When true, all runs default to ephemeral mode (client-side history). */
  ephemeral?: boolean;
}

// ---------------------------------------------------------------------------
// Run creation
// ---------------------------------------------------------------------------

export interface CreateRunParams {
  agentKey: string;
  messages: Array<{ role: string; content: string }>;
  conversationId?: string | null;
  metadata?: Record<string, unknown>;
  model?: string;
  thinking?: boolean;
  supersedeFromMessageIndex?: number;
  files?: File[];
  /** When true, the server treats this run as ephemeral (client owns history). */
  ephemeral?: boolean;
  /** Client-side memories to inject into the agent context (ephemeral mode). */
  memories?: Array<{ key: string; value: string; type?: string }>;
}

export interface RunResponse {
  id: string;
  conversationId?: string;
  status?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Conversation
// ---------------------------------------------------------------------------

export interface ConversationMessage {
  role: string;
  content: string;
  timestamp?: string;
  toolCalls?: Array<{
    id: string;
    function?: { name: string; arguments: string };
    name?: string;
    arguments?: string;
  }>;
  toolCallId?: string;
  [key: string]: unknown;
}

export interface ConversationResponse {
  id: string;
  messages: ConversationMessage[];
  hasMore?: boolean;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Events — mirrors django-agent-runtime EventType enum
// ---------------------------------------------------------------------------

export type AgentEventType =
  | 'assistant.message'
  | 'assistant.delta'
  | 'tool.call'
  | 'tool.result'
  | 'content.blocks'
  | 'sub_agent.start'
  | 'sub_agent.end'
  | 'custom'
  | 'error'
  | 'run.started'
  | 'run.succeeded'
  | 'run.failed'
  | 'run.cancelled'
  | 'run.timed_out'
  | 'run.suspended'
  | 'run.resumed'
  | 'client.action.required'
  | 'run.heartbeat'
  | 'tool.progress'
  | 'state.checkpoint'
  | 'step.started'
  | 'step.completed'
  | 'step.failed'
  | 'step.skipped'
  | 'step.retrying'
  | 'progress.update'
  | 'memory.update';

// --- Individual event payload shapes ---

/**
 * Optional affective metadata attached to assistant messages/deltas.
 * Provider-neutral; voice subsystems map name/intensity onto their own
 * controls (e.g. ElevenLabs voice settings or SSML).
 */
export interface AgentEmotion {
  /** e.g. "neutral" | "happy" | "sad" | "excited" | "concerned" — free-form. */
  name: string;
  /** 0.0 – 1.0 strength hint. */
  intensity?: number;
  /** Provider-specific extras (e.g. SSML overrides). */
  metadata?: Record<string, unknown>;
}

export interface AssistantMessagePayload {
  content: string;
  emotion?: AgentEmotion;
}

export interface AssistantDeltaPayload {
  delta: string;
  emotion?: AgentEmotion;
}

export interface ToolCallPayload {
  id: string;
  name: string;
  arguments: string | Record<string, unknown>;
}

export interface ToolResultPayload {
  name: string;
  tool_call_id: string;
  result: unknown;
}

export interface ContentBlocksPayload {
  tool_name: string;
  tool_call_id: string;
  blocks: unknown[];
}

export interface SubAgentStartPayload {
  sub_agent_key: string;
  agent_name?: string;
  invocation_mode?: string;
}

export interface SubAgentEndPayload {
  sub_agent_key: string;
  agent_name?: string;
}

export interface RunFailedPayload {
  error: string;
  [key: string]: unknown;
}

export interface RequiredActionPayload {
  action_id: string;
  action_type: string;
  title?: string;
  message?: string;
  action_url?: string;
  action_label?: string;
  metadata?: Record<string, unknown>;
  resume_hint?: Record<string, unknown>;
}

export interface ErrorPayload {
  error: string;
  [key: string]: unknown;
}

export interface CustomPayload {
  type?: string;
  [key: string]: unknown;
}

export interface MemoryUpdatePayload {
  memories: Array<{
    key: string;
    value: string | null;
    type: string;
    action: 'upsert' | 'delete';
  }>;
}

// --- Discriminated event union ---

export type AgentEvent =
  | { type: 'assistant.message'; payload: AssistantMessagePayload }
  | { type: 'assistant.delta';   payload: AssistantDeltaPayload }
  | { type: 'tool.call';         payload: ToolCallPayload }
  | { type: 'tool.result';       payload: ToolResultPayload }
  | { type: 'content.blocks';    payload: ContentBlocksPayload }
  | { type: 'sub_agent.start';   payload: SubAgentStartPayload }
  | { type: 'sub_agent.end';     payload: SubAgentEndPayload }
  | { type: 'custom';            payload: CustomPayload }
  | { type: 'error';             payload: ErrorPayload }
  | { type: 'run.started';       payload: Record<string, unknown> }
  | { type: 'run.succeeded';     payload: Record<string, unknown> }
  | { type: 'run.failed';        payload: RunFailedPayload }
  | { type: 'run.cancelled';     payload: Record<string, unknown> }
  | { type: 'run.timed_out';     payload: Record<string, unknown> }
  | { type: 'run.suspended';     payload: Record<string, unknown> }
  | { type: 'run.resumed';       payload: Record<string, unknown> }
  | { type: 'client.action.required'; payload: RequiredActionPayload }
  | { type: 'run.heartbeat';     payload: Record<string, unknown> }
  | { type: 'tool.progress';     payload: Record<string, unknown> }
  | { type: 'state.checkpoint';  payload: Record<string, unknown> }
  | { type: 'step.started';      payload: Record<string, unknown> }
  | { type: 'step.completed';    payload: Record<string, unknown> }
  | { type: 'step.failed';       payload: Record<string, unknown> }
  | { type: 'step.skipped';      payload: Record<string, unknown> }
  | { type: 'step.retrying';     payload: Record<string, unknown> }
  | { type: 'progress.update';   payload: Record<string, unknown> }
  | { type: 'memory.update';    payload: MemoryUpdatePayload };

/** Terminal event types — these signal end of a run. */
export const TERMINAL_EVENT_TYPES: ReadonlySet<string> = new Set([
  'run.succeeded',
  'run.failed',
  'run.cancelled',
  'run.timed_out',
]);

/** Events after which a live SSE stream can be considered complete for UI. */
export const STREAM_COMPLETION_EVENT_TYPES: ReadonlySet<string> = new Set([
  ...TERMINAL_EVENT_TYPES,
  'run.suspended',
  'client.action.required',
]);

/** Whether an event type is terminal (signals end of run). */
export function isTerminalEvent(type: string): boolean {
  return TERMINAL_EVENT_TYPES.has(type);
}

/** Whether an event should complete the active SSE subscription. */
export function isStreamCompletionEvent(type: string): boolean {
  return STREAM_COMPLETION_EVENT_TYPES.has(type);
}

export type RunState =
  | 'idle'
  | 'sending'
  | 'streaming'
  | 'waiting'
  | 'cancelling'
  | 'cancelled'
  | 'failed'
  | 'succeeded';

/** Update a generic run state from a protocol event. */
export function reduceRunState(current: RunState, eventType: string): RunState {
  switch (eventType) {
    case 'run.started':
    case 'assistant.delta':
    case 'assistant.message':
    case 'tool.call':
    case 'tool.result':
    case 'content.blocks':
      return 'streaming';
    case 'run.suspended':
    case 'client.action.required':
      return 'waiting';
    case 'run.cancelled':
      return 'cancelled';
    case 'run.failed':
    case 'run.timed_out':
      return 'failed';
    case 'run.succeeded':
      return 'succeeded';
    default:
      return current;
  }
}
