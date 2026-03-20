# @wandgx/comfy-bridge

`@wandgx/comfy-bridge` is a standalone TypeScript router/adaptor layer for submitting ComfyUI workflows to:

- local ComfyUI instances
- ComfyUI Cloud

It keeps provider-specific transport details behind a stable package API and returns routing metadata that UI layers can surface directly.

## Scope

This package is intentionally transport-focused.

It does:

- choose between `local`, `cloud`, and `auto` modes
- prefer a selected local instance when one is configured
- perform local-first routing in `auto`
- fall back to cloud for specific local failures when allowed
- normalize uploads, results, and errors across providers
- expose GUI-friendly metadata about which provider was actually used

It does not:

- generate workflows for you
- manage billing, projects, or WandGx business logic
- orchestrate load balancing or advanced scheduling
- guarantee identical semantics across every ComfyUI server build

## Runtime requirements

- Node `>=18`

## Installation

```bash
npm install @wandgx/comfy-bridge
```

## Current confidence level

This repo is designed to be a **production-leaning bridge package**, not a speculative demo.

The implementation and tests in this repo currently verify:

- local-first routing and cloud fallback rules
- stable `providerRequested` / `providerUsed` / `fallbackTriggered` / `fallbackReason` metadata
- local instance tracking through `localInstanceId`
- upload-to-workflow rewriting before submission
- normalized output parsing for local history and cloud job results
- normalized error classification for connection, auth, timeout, upload, cancel, and execution failures
- local progress via websocket with polling fallback
- cloud progress via polling, with websocket treated as best-effort

What is still intentionally bounded is listed in [Known limitations](#known-limitations).

## Verified provider contract

### Local ComfyUI

This package currently relies on these local endpoints/behaviors:

- `GET /system_stats`
- `POST /prompt`
- `GET /history/:prompt_id`
- `POST /upload/image`
- `GET /view`
- `GET /ws?clientId=...`

Important local behavior in this package:

- submissions include a generated `client_id`
- websocket progress does **not** send an undocumented subscribe message
- if websocket progress fails, the adapter falls back to polling `history`
- file uploads are routed through `/upload/image` with `type=input` rather than relying on `/upload/file`

### ComfyUI Cloud

This package now targets the documented Comfy Cloud base URL and auth shape:

- base URL: `https://cloud.comfy.org`
- auth header: `X-API-Key`

This package currently uses these cloud endpoints:

- `GET /api/queue` for health/auth reachability
- `POST /api/prompt`
- `GET /api/job/:id/status`
- `GET /api/jobs/:id`
- `POST /api/upload/image`
- `GET /api/view`
- `POST /api/queue` for queued-job deletion

## Provider modes

| Mode | Behavior |
| --- | --- |
| `local` | Use local only. Fail if a usable local instance is not configured. |
| `cloud` | Use cloud only. Fail if cloud is not configured or auth fails. |
| `auto` | Prefer local, then fall back to cloud only when configured and allowed. |

## Routing and fallback behavior

### `local`

- no cloud preflight
- no fallback
- `localInstanceId` is the resolved local instance id

### `cloud`

- no local preflight
- no fallback
- `localInstanceId` is `undefined`

### `auto`

The router does this:

1. resolve the preferred enabled local instance
2. health-check that local instance
3. use local if healthy
4. otherwise fall back to cloud only if `fallbackToCloud` is enabled and cloud is configured

The router can also retry on cloud after local submission fails with a connection error when:

- `mode` is `auto`
- `retryOnConnectionFailure` is `true`
- cloud is configured

The currently emitted fallback reasons are:

- `local_unhealthy`
- `local_connection_failed`
- `local_timeout`
- `local_submission_error`

## Configuration

```ts
import { createComfyBridge } from '@wandgx/comfy-bridge';

const bridge = createComfyBridge({
  mode: 'auto',
  preferredLocalInstanceId: 'main-gpu',
  fallbackToCloud: true,
  retryOnConnectionFailure: true,
  localTimeoutMs: 60_000,
  localInstances: [
    {
      id: 'main-gpu',
      name: 'Main GPU',
      baseUrl: 'http://127.0.0.1:8188',
    },
  ],
  cloud: {
    apiKey: process.env.COMFY_CLOUD_API_KEY,
  },
});
```

### Notes

- `cloud.baseUrl` is optional and defaults to `https://cloud.comfy.org`
- keep your cloud API key in environment variables or other secure server-side config
- the bridge does not inject secrets into frontend code for you

## Quick start

```ts
import { createComfyBridge } from '@wandgx/comfy-bridge';

const bridge = createComfyBridge({
  mode: 'auto',
  fallbackToCloud: true,
  retryOnConnectionFailure: true,
  localTimeoutMs: 60_000,
  localInstances: [
    { id: 'local-1', name: 'Local', baseUrl: 'http://127.0.0.1:8188' },
  ],
  cloud: {
    apiKey: process.env.COMFY_CLOUD_API_KEY,
  },
});

const submission = await bridge.submitWorkflow({
  workflow: {
    '3': {
      class_type: 'KSampler',
      inputs: {},
    },
  },
});

console.log(submission.promptId);
console.log(submission.usage.providerUsed);
console.log(submission.usage.fallbackTriggered);
console.log(submission.usage.fallbackReason);
```

## Upload behavior

Uploads are not cosmetic in this package.

Before submission:

- files and images are uploaded through the selected provider adapter
- provider upload responses are normalized to `{ filename, subfolder?, type? }`
- matching references inside the workflow JSON are rewritten before submit

That means this package does **not** upload a file and then submit stale workflow references.

## Progress behavior

### Local

- preferred path: websocket progress tied to the submit-time `client_id`
- fallback path: polling `GET /history/:prompt_id`

### Cloud

- reliable path in this package: polling `GET /api/job/:id/status`
- websocket support is attempted when a runtime `WebSocket` implementation exists, but polling remains the trusted fallback path

## API overview

### `submitWorkflow(input, options?)`

Use this when you want the simpler public input shape.

```ts
const result = await bridge.submitWorkflow(
  {
    workflow,
    files: [
      {
        name: 'input.png',
        data: imageBlob,
        contentType: 'image/png',
      },
    ],
  },
  {
    mode: 'auto',
  }
);

console.log(result.promptId);
console.log(result.usage.providerUsed);
```

### `submit(workflow, options?)`

Use this when you want explicit `images` and `files` arrays.

```ts
const result = await bridge.submit({
  workflow,
  images: [
    {
      filename: 'input.png',
      data: imageBlob,
      contentType: 'image/png',
    },
  ],
});
```

### `submitAndWait(workflow, options?)`

```ts
const result = await bridge.submitAndWait(
  { workflow },
  {
    onProgress(progress) {
      console.log(progress.currentNode, progress.progress);
    },
  }
);

if (result.status === 'completed') {
  console.log(result.outputs);
}
```

### `getStatus(promptId, provider, instanceId?)`

```ts
const status = await bridge.getStatus('job-123', 'local', 'local-1');
console.log(status.state);
console.log(status.usage?.localInstanceId);
```

Important:

- `getStatus` is stateless
- pass the provider and local instance you actually used, usually from prior usage metadata
- `GenerationStatus.state` does not have a `cancelled` variant, so cancelled jobs are surfaced as `failed` at this layer

### `getResult(jobId, provider, instanceId?)`

```ts
const result = await bridge.getResult('job-123', 'cloud');
console.log(result.status);
console.log(result.outputs);
```

### `watchProgress(jobId, provider, onProgress, instanceId?)`

```ts
await bridge.watchProgress('job-123', 'local', (progress) => {
  console.log(progress.stepsCompleted, progress.totalSteps, progress.progress);
}, 'local-1');
```

### `cancel(jobId, provider, instanceId?)`

```ts
await bridge.cancel('job-123', 'local', 'local-1');
```

## Metadata returned to callers

Every submission returns GUI-friendly usage data.

```ts
interface ProviderUsageMetadata {
  providerRequested: 'local' | 'cloud' | 'auto';
  providerUsed: 'local' | 'cloud';
  fallbackTriggered: boolean;
  fallbackReason?: string;
  localInstanceId?: string;
}
```

Interpretation:

- `providerRequested`: what you asked the router to do
- `providerUsed`: what actually ran the job
- `fallbackTriggered`: whether cloud was used as a fallback rather than the initial route
- `fallbackReason`: why that fallback happened
- `localInstanceId`: the resolved local instance id, when local routing was involved

For direct `getStatus()` / `getResult()` calls, the bridge uses the provider and local instance id you pass in rather than trying to reconstruct original submission routing.

## Error model

All thrown package errors are normalized into a `ComfyBridgeError` shape.

```ts
interface ComfyBridgeError {
  code: ErrorCode;
  message: string;
  provider?: 'local' | 'cloud';
  cause?: Error;
  context?: Record<string, unknown>;
}
```

Common error codes include:

- `NO_LOCAL_PROVIDER`
- `LOCAL_UNHEALTHY`
- `CLOUD_UNAVAILABLE`
- `AUTH_ERROR`
- `CONNECTION_ERROR`
- `TIMEOUT_ERROR`
- `INVALID_WORKFLOW`
- `UPLOAD_ERROR`
- `JOB_NOT_FOUND`
- `CANCEL_ERROR`
- `EXECUTION_ERROR`
- `INVALID_RESPONSE`

Example:

```ts
import { isComfyBridgeError } from '@wandgx/comfy-bridge';

try {
  await bridge.submitWorkflow({ workflow });
} catch (error) {
  if (isComfyBridgeError(error)) {
    console.error(error.code, error.provider, error.message, error.context);
  }
}
```

## UI switcher helpers

This package exposes two small helpers intended for provider-switcher UIs.

### `getUISwitcherState()`

Returns configuration-facing state:

```ts
const state = bridge.getUISwitcherState();
```

Shape:

- `mode`
- `fallbackEnabled`
- `preferredLocalUrl`

### `getUISwitcherRuntimeInfo()`

Returns runtime-facing status:

```ts
const runtime = await bridge.getUISwitcherRuntimeInfo();
```

Shape:

- `providerUsed`
- `statusBadge`
- `fallbackReason`
- `lastChecked`

## Known limitations

- cloud progress is trusted through status polling; websocket progress is best-effort
- cloud running-job cancellation is intentionally **not** performed as a targeted interrupt because the documented cloud API exposes queue deletion for queued jobs, but not a documented per-job interrupt for in-progress execution
- local queued-job cancellation uses the Comfy-compatible `/queue` deletion shape; exact behavior can still depend on the server build in front of you
- this package does not preserve original submission routing automatically if you later call `getStatus()` or `getResult()` without the recorded provider metadata
- output normalization covers common image/audio/video collections, not every possible custom node payload shape

## Development

```bash
npm run typecheck
npm test
npm run build
```

Current repository checks exercised during this hardening pass:

- `npm run typecheck`
- `npm test`

## Out of scope

- WandGx billing logic
- WandGx project management logic
- workflow authoring UX
- template systems
- multi-instance load balancing
- advanced scheduler/orchestrator behavior

## License

MIT
