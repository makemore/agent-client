/**
 * @makemore/agent-client
 *
 * Framework-agnostic TypeScript client for the agent-runtime protocol.
 * SSE streaming, auth strategies, case conversion.
 */

// --- Client ---
export { AgentClient } from './client.js';

// --- Run handle ---
export { subscribeToRun } from './run.js';
export type { RunHandle } from './run.js';

// --- Auth ---
export { createAuthHandler } from './auth.js';
export type { AuthHandler } from './auth.js';

// --- Case conversion ---
export { snakeToCamel, camelToSnake, keysToCamel, keysToSnake, getAnyCase } from './case.js';

// --- Types (re-export everything) ---
export type {
  AgentClientConfig,
  AgentClientStorage,
  ApiPaths,
  AuthConfig,
  AuthStrategy,
  TokenAuthConfig,
  JwtAuthConfig,
  AnonymousAuthConfig,
  SessionAuthConfig,
  NoneAuthConfig,
  CaseStyle,
  CreateRunParams,
  RunResponse,
  ConversationMessage,
  ConversationResponse,
  AgentEventType,
  AgentEvent,
  AssistantMessagePayload,
  AssistantDeltaPayload,
  ToolCallPayload,
  ToolResultPayload,
  ContentBlocksPayload,
  SubAgentStartPayload,
  SubAgentEndPayload,
  RunFailedPayload,
  RequiredActionPayload,
  ErrorPayload,
  CustomPayload,
  RunState,
} from './types/index.js';

export {
  DEFAULT_API_PATHS,
  TERMINAL_EVENT_TYPES,
  STREAM_COMPLETION_EVENT_TYPES,
  isTerminalEvent,
  isStreamCompletionEvent,
  reduceRunState,
} from './types/index.js';
