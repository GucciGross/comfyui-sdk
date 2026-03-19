# @wandgx/comfy-bridge

A standalone TypeScript bridge layer for connecting to both ComfyUI Local and ComfyUI Cloud with automatic fallback support.

## Overview

This package provides a clean, typed abstraction over ComfyUI providers. It enables applications to seamlessly switch between local and cloud ComfyUI instances with automatic fallback behavior.

**Why this exists separately from WandGx:**

- Keeps provider-specific transport logic out of the main application
- Makes integration easier to reuse, test, and evolve independently
- Provides a stable interface that hides API differences, auth differences, websocket differences, and queue behaviors
- Enables future cloud changes without affecting application code

## Installation

```bash
npm install @wandgx/comfy-bridge
# or
pnpm add @wandgx/comfy-bridge
# or
yarn add @wandgx/comfy-bridge
```

## Supported Provider Modes

| Mode    | Description                                      |
| ------- | ------------------------------------------------ |
| `local` | Use local ComfyUI only. Fail if unavailable.     |
| `cloud` | Use ComfyUI Cloud only.                          |
| `auto`  | Prefer local, fallback to cloud when configured. |

**Recommended default:** `auto`

## Auto Mode & Fallback Behavior

When `auto` mode is selected:

1. Try preferred local instance first
2. If local fails preflight (health check), switch to cloud (if `fallbackToCloud` is true)
3. If local fails with connection-level failure during submission, retry on cloud (if `retryOnConnectionFailure` is true)
4. Record the fallback reason for observability

Fallback is a **routing policy**, not a hidden behavior. The caller always receives metadata showing when and why fallback occurred.

## Quick Start

```typescript
import { createComfyBridge } from '@wandgx/comfy-bridge';

// Create bridge with auto mode
const bridge = createComfyBridge({
  mode: 'auto',
  fallbackToCloud: true,
  retryOnConnectionFailure: true,
  localTimeoutMs: 60000,
  localInstances: [
    { id: 'local-1', name: 'Main', baseUrl: 'http://127.0.0.1:8188' },
  ],
  cloud: {
    apiKey: 'your-api-key',
  },
});

// Submit a workflow using doc-specified format
const result = await bridge.submitWorkflow({
  workflow: {
    // Your ComfyUI workflow JSON
    '3': {
      class_type: 'KSampler',
      inputs: { /* ... */ },
    },
  },
});

console.log(`Job ${result.promptId} submitted`);
console.log(`Provider used: ${result.usage.providerUsed}`);
console.log(`Fallback triggered: ${result.usage.fallbackTriggered}`);
```

## Configuration

### ComfyBridgeConfig

```typescript
interface ComfyBridgeConfig {
  mode: ComfyRoutingMode;
  preferredLocalInstanceId?: string;
  fallbackToCloud: boolean;
  retryOnConnectionFailure: boolean;
  localTimeoutMs: number;
  localInstances?: LocalInstanceConfig[];
  cloud?: {
    baseUrl?: string;
    apiKey?: string;
  };
}

interface LocalInstanceConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  enabled?: boolean;
}
```

### Example Configuration

```typescript
const bridge = createComfyBridge({
  mode: 'auto',
  fallbackToCloud: true,
  retryOnConnectionFailure: true,
  localTimeoutMs: 30000,
  preferredLocalInstanceId: 'gpu-1',
  localInstances: [
    { id: 'gpu-1', name: 'RTX 4090', baseUrl: 'http://192.168.1.100:8188' },
    { id: 'gpu-2', name: 'RTX 3080', baseUrl: 'http://192.168.1.101:8188' },
  ],
  cloud: {
    baseUrl: 'https://api.comfyicloud.com',
    apiKey: process.env.COMFY_CLOUD_API_KEY,
  },
});
```

## API Reference

### Main Methods

#### `submitWorkflow(input, options?)`

Submit a workflow using the doc-specified input format.

```typescript
const result = await bridge.submitWorkflow({
  workflow: myWorkflow,
  files: [
    {
      name: 'input.png',
      data: imageBlob,
      contentType: 'image/png',
    },
  ],
  metadata: { userId: 'user-123' },
}, {
  mode: 'auto',
  onProgress: (progress) => {
    console.log(`Progress: ${progress.progress}%`);
  },
});

// Result includes provider usage metadata
console.log(result.usage.providerUsed);
console.log(result.usage.fallbackTriggered);
console.log(result.usage.fallbackReason);
```

#### `submit(workflow, options?)`

Submit a workflow using the extended format (with images/files arrays).

```typescript
const result = await bridge.submit({
  workflow: myWorkflow,
  images: [
    {
      data: imageBlob,
      filename: 'input.png',
      subfolder: 'myimages',
    },
  ],
});
```

#### `submitAndWait(workflow, options?)`

Submit and wait for completion.

```typescript
const result = await bridge.submitAndWait({
  workflow: myWorkflow,
}, {
  onProgress: (progress) => {
    console.log(`Node: ${progress.currentNode}`);
  },
});

if (result.status === 'completed') {
  console.log('Outputs:', result.outputs);
}
```

#### `healthCheck()`

Check health of all configured providers.

```typescript
const healthResults = await bridge.healthCheck();
// [{ healthy: true, provider: 'local', responseTime: 42 }, ...]
```

#### `getStatus(promptId, provider, instanceId?)`

Get the status of a generation job.

```typescript
const status = await bridge.getStatus('job-123', 'local');
// { promptId, state: 'running', progress: 50, outputs: undefined, error: undefined, usage: {...} }
```

#### `getResult(jobId, provider, instanceId?)`

Get the result of a submitted job.

```typescript
const result = await bridge.getResult('job-123', 'local');
```

#### `watchProgress(jobId, provider, onProgress, instanceId?)`

Watch progress of an existing job.

```typescript
await bridge.watchProgress('job-123', 'local', (progress) => {
  console.log(`${progress.stepsCompleted}/${progress.totalSteps}`);
});
```

#### `cancel(jobId, provider, instanceId?)`

Cancel a running job.

```typescript
await bridge.cancel('job-123', 'local');
```

## Types

### ProviderUsageMetadata

Returned with every generation result to indicate routing decisions:

```typescript
interface ProviderUsageMetadata {
  providerRequested: ComfyRoutingMode;  // 'local' | 'cloud' | 'auto'
  providerUsed: 'local' | 'cloud';
  fallbackTriggered: boolean;
  fallbackReason?: 'local_unhealthy' | 'local_connection_failed' | 'local_timeout' | 'local_submission_error';
  localInstanceId?: string;
}
```

### GenerationResult

Result from `submitWorkflow`:

```typescript
interface GenerationResult {
  promptId: string;
  outputs?: unknown;
  usage: ProviderUsageMetadata;
}
```

### GenerationStatus

Status from `getStatus`:

```typescript
interface GenerationStatus {
  promptId: string;
  state: 'queued' | 'running' | 'completed' | 'failed';
  progress?: number;
  outputs?: unknown;
  error?: string;
  usage?: ProviderUsageMetadata;
}
```

### JobResult

Extended result from `submit` and `submitAndWait`:

```typescript
interface JobResult {
  jobId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  providerModeRequested: ComfyRoutingMode;
  providerUsed: 'local' | 'cloud';
  fallbackTriggered: boolean;
  fallbackReason?: FallbackReason;
  localInstanceId?: string;
  progress?: JobProgress;
  outputs?: JobOutput[];
  error?: ComfyBridgeError;
}
```

## UI Integration (Provider Switcher)

The bridge provides helpers for building a provider switcher UI.

### UI Switcher State

```typescript
const state = bridge.getUISwitcherState();
// {
//   mode: 'auto',
//   fallbackEnabled: true,
//   preferredLocalUrl: 'http://192.168.1.100:8188'
// }
```

### UI Switcher Runtime Info

```typescript
const runtimeInfo = await bridge.getUISwitcherRuntimeInfo();
// {
//   providerUsed: 'local',
//   statusBadge: 'healthy',
//   fallbackReason: undefined,
//   lastChecked: Date
// }
```

### Recommended UI Labels

| Control             | Label                                      |
| ------------------- | ------------------------------------------ |
| Primary selector    | "Render Provider"                          |
| Local option        | "Local ComfyUI"                            |
| Cloud option        | "ComfyUI Cloud"                            |
| Auto option         | "Auto · Prefer Local, Fallback to Cloud"   |
| Fallback toggle     | "Fallback to Cloud"                        |
| Retry toggle        | "Retry on Connection Failure"              |
| Instance selector   | "Preferred Local Instance"                 |
| Timeout input       | "Local Timeout (ms)"                       |

### Runtime Display

Show these fields read-only:

- Provider used
- Status badge (healthy/degraded/unavailable/fallback)
- Fallback reason (when applicable)
- Last checked time

## Error Handling

All errors are normalized into a consistent format:

```typescript
interface ComfyBridgeError {
  code: ErrorCode;
  message: string;
  provider?: 'local' | 'cloud';
  cause?: Error;
  context?: Record<string, unknown>;
}

type ErrorCode =
  | 'NO_LOCAL_PROVIDER'
  | 'LOCAL_UNHEALTHY'
  | 'CLOUD_UNAVAILABLE'
  | 'AUTH_ERROR'
  | 'SUBMISSION_ERROR'
  | 'WEBSOCKET_ERROR'
  | 'POLLING_TIMEOUT'
  | 'OUTPUT_PARSE_ERROR'
  | 'NO_PROVIDER_AVAILABLE'
  | 'INVALID_WORKFLOW'
  | 'UPLOAD_ERROR'
  | 'CONNECTION_ERROR';
```

### Error Handling Example

```typescript
import { createComfyBridge, isComfyBridgeError } from '@wandgx/comfy-bridge';

try {
  const result = await bridge.submitWorkflow({ workflow });
} catch (error) {
  if (isComfyBridgeError(error)) {
    console.log(`Error [${error.code}]: ${error.message}`);
    console.log(`Provider: ${error.provider}`);
  }
}
```

## Integration into WandGx

### Backend Integration

```typescript
// In your WandGx backend/service
import { createComfyBridge } from '@wandgx/comfy-bridge';

const bridge = createComfyBridge({
  mode: 'auto',
  fallbackToCloud: true,
  retryOnConnectionFailure: true,
  localTimeoutMs: 60000,
  localInstances: [
    { id: 'main', name: 'Main GPU', baseUrl: process.env.COMFY_LOCAL_URL! },
  ],
  cloud: { apiKey: process.env.COMFY_CLOUD_API_KEY },
});

// In your API handler
async function handleGenerateRequest(req, res) {
  const result = await bridge.submitAndWait({
    workflow: req.body.workflow,
  });

  res.json({
    jobId: result.jobId,
    status: result.status,
    providerUsed: result.providerUsed,
    fallbackTriggered: result.fallbackTriggered,
    outputs: result.outputs,
  });
}
```

### Frontend Integration

```typescript
// UI state from backend
interface GenerationState {
  mode: 'local' | 'cloud' | 'auto';
  fallbackEnabled: boolean;
  providerUsed?: 'local' | 'cloud';
  statusBadge?: 'healthy' | 'degraded' | 'unavailable' | 'fallback';
  fallbackReason?: string;
}

// Update UI based on job result
function updateUI(result: GenerationResult) {
  setState({
    providerUsed: result.usage.providerUsed,
    statusBadge: result.usage.fallbackTriggered ? 'fallback' : 'healthy',
    fallbackReason: result.usage.fallbackReason,
  });
}
```

## Testing

### Local Mode Tests

```typescript
import { describe, it, expect } from 'vitest';
import { createComfyBridge } from '@wandgx/comfy-bridge';

describe('Local Mode', () => {
  it('connects to healthy local instance', async () => {
    const bridge = createComfyBridge({
      mode: 'local',
      fallbackToCloud: false,
      retryOnConnectionFailure: false,
      localTimeoutMs: 60000,
      localInstances: [
        { id: 'local-1', name: 'Local', baseUrl: 'http://127.0.0.1:8188' },
      ],
    });
    const health = await bridge.healthCheck();
    expect(health[0].healthy).toBe(true);
  });
});
```

### Auto Mode Tests

```typescript
describe('Auto Mode Fallback', () => {
  it('uses local when healthy', async () => {
    const bridge = createComfyBridge({
      mode: 'auto',
      fallbackToCloud: true,
      retryOnConnectionFailure: true,
      localTimeoutMs: 60000,
      localInstances: [
        { id: 'local-1', name: 'Local', baseUrl: 'http://127.0.0.1:8188' },
      ],
      cloud: { apiKey: 'test-key' },
    });
    const result = await bridge.submitWorkflow({ workflow: {} });
    expect(result.usage.providerUsed).toBe('local');
    expect(result.usage.fallbackTriggered).toBe(false);
  });
});
```

## Roadmap

### MVP (Current)

- [x] Local provider support
- [x] Cloud provider support
- [x] Auto mode with local-first
- [x] Cloud fallback
- [x] Preferred local instance selection
- [x] Health checks
- [x] Progress watching
- [x] Output retrieval
- [x] Normalized errors
- [x] UI switcher helpers
- [x] GUI-friendly flat config types
- [x] Provider usage metadata

### Future

- [ ] Multi-local instance load balancing
- [ ] Advanced scheduling
- [ ] Billing integration hooks
- [ ] Multi-region routing
- [ ] Workflow templates
- [ ] Caching layer

## Agent Instructions

For AI coding agents working with this codebase:

1. **Do not** invent provider modes outside `local`, `cloud`, `auto`
2. **Do not** bypass the routing layer
3. **Do not** mix WandGx business logic into the bridge
4. **Keep** the bridge transport-focused
5. **Update** docs when public contract changes
6. **Use** the doc-specified types: `ComfyBridgeConfig`, `ProviderUsageMetadata`, `GenerationResult`

## Not This Package's Job

- WandGx billing logic
- WandGx project style profiles
- WandGx game asset manifests
- WandGx prompt builder business rules

## License

MIT
