# @makemore/agent-client

Framework-agnostic TypeScript client for the **agent-runtime** protocol. Provides SSE streaming, auth strategies, case conversion, and a typed event system — zero runtime dependencies.

The client follows the product-neutral mobile runtime contract in `agent/docs/mobile-protocol-contract.md`. It understands terminal run events plus stream-completion waiting states such as `run.suspended` and `client.action.required`.

## Install

```bash
npm install @makemore/agent-client
```

## Quick start

```ts
import { AgentClient } from '@makemore/agent-client';

const client = new AgentClient({
  backendUrl: 'https://api.example.com',
  auth: { strategy: 'token', token: 'my-api-token' },
});

const { run, handle } = await client.createRun({
  agentKey: 'my-assistant',
  messages: [{ role: 'user', content: 'Hello!' }],
});

for await (const ev of handle.events()) {
  switch (ev.type) {
    case 'assistant.delta':
      process.stdout.write(ev.payload.delta);
      break;
    case 'assistant.message':
      console.log('\n---\n', ev.payload.content);
      break;
    case 'run.succeeded':
    case 'run.failed':
      console.log('Run finished:', ev.type);
      break;
  }
}
```

## Auth strategies

| Strategy    | Behaviour                                                                 |
| ----------- | ------------------------------------------------------------------------- |
| `token`     | `Authorization: Token <t>` (configurable header + prefix)                |
| `jwt`       | `Authorization: Bearer <t>`                                              |
| `anonymous` | POSTs anonymous-session endpoint, stores token, re-uses via header        |
| `session`   | Cookie-based, adds `X-CSRFToken` from configurable cookie                |
| `none`      | No auth headers                                                          |

For SSE (EventSource can't set headers):

- **token / jwt / anonymous** — token is appended as `?token=<t>` query param
- **session** — relies on cookies (same-origin)

### Storage

The `anonymous` strategy requires a `storage` implementation to persist the session token:

```ts
const client = new AgentClient({
  backendUrl: 'https://api.example.com',
  auth: {
    strategy: 'anonymous',
    storage: {
      get: (key) => localStorage.getItem(key),
      set: (key, value) => value ? localStorage.setItem(key, value) : localStorage.removeItem(key),
    },
  },
});
```

## API

### `AgentClient`

| Method                                  | Description                               |
| --------------------------------------- | ----------------------------------------- |
| `createRun(params)`                     | Start a run, returns `{ run, handle }`    |
| `cancelRun(runId)`                      | Cancel a running run                      |
| `getConversation(id, { limit, offset })` | Fetch conversation with messages          |
| `ensureAuth(forceRefresh?)`             | Ensure auth token exists                  |
| `transformRequest(body)`                | Apply case conversion for outgoing data   |
| `transformResponse(data)`               | Apply case conversion for incoming data   |

### `RunHandle`

| Member      | Description                                              |
| ----------- | -------------------------------------------------------- |
| `runId`     | The run ID                                               |
| `events()`  | `AsyncIterable<AgentEvent>` — completes on terminal or waiting stream-completion event |
| `close()`   | Close the SSE connection                                 |

### Run state helpers

`RunState` and `reduceRunState(current, eventType)` provide a small generic state machine: `idle`, `sending`, `streaming`, `waiting`, `cancelling`, `cancelled`, `failed`, `succeeded`. Use `waiting` for generic required-action cards or suspended runs that may later resume.

## License

Business Source License 1.1 — see [LICENSE](LICENSE) for details.
