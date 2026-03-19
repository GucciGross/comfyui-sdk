# @wandgx/comfy-bridge

A standalone bridge layer for connecting to both ComfyUI Local and ComfyUI Cloud with automatic fallback support.

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
2. If local fails preflight (health check), switch to cloud (if fallback enabled)
3. If local fails with connection-level failure during submission, retry on cloud (if enabled)
4. Record the fallback reason for observability

Fallback is a **routing policy**, not a hidden behavior. The caller always receives metadata showing when and why fallback occurred.

## Quick Start

```typescript
import { createComfyBridge } from '@wandgx/comfy-bridge';

// Create bridge with auto mode
const bridge = createComfyBridge({
  mode: 'auto',
  local: {
    baseUrl: 'http://127.0.0.1:8188',
  },
  cloud: {
    apiKey: 'your-api-key',
  },
  routing: {
    enableFallback: true,
    retryOnConnectionFailure: true,
  },
});

// Submit a workflow
const result = await bridge.submit({
  workflow: {
    // Your ComfyUI workflow JSON
    '3': {
      class_type: 'KSampler',
      inputs: { /* ... */ },
    },
    // ...
  },
});

console.log(`Job ${result.jobId} submitted`);
console.log(`Provider used: ${result.providerUsed}`);
console.log(`Fallback triggered: ${result.fallbackTriggered}`);
```

## API Reference

### Configuration

```typescript
interface BridgeConfig {
  mode: 'local' | 'cloud' | 'auto';
  local?: LocalConfig;
  cloud?: CloudConfig;
  routing?: RoutingPolicy;
}

interface LocalConfig {
  baseUrl: string;        // e.g., 'http://127.0.0.1:8188'
  timeout?: number;       // Default: 60000ms
  wsPath?: string;        // Default: '/ws'
}

interface CloudConfig {
  baseUrl?: string;       // Default: 'https://api.comfyicloud.com'
  apiKey: string;
  timeout?: number;       // Default: 120000ms
}

interface RoutingPolicy {
  enableFallback?: boolean;           // Default: true
  retryOnConnectionFailure?: boolean; // Default: true
  maxRetries?: number;                // Default: 1
  connectionTimeout?: number;         // Default: 5000ms
}
```

### Main Methods

#### `submit(workflow, options?)`

Submit a workflow for execution.

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
}, {
  mode: 'auto',
  onProgress: (progress) => {
    console.log(`Progress: ${progress.progress}%`);
  },
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

#### `getResult(jobId, provider)`

Get the result of a submitted job.

```typescript
const result = await bridge.getResult('job-123', 'local');
```

#### `watchProgress(jobId, provider, onProgress)`

Watch progress of an existing job.

```typescript
await bridge.watchProgress('job-123', 'local', (progress) => {
  console.log(`${progress.stepsCompleted}/${progress.totalSteps}`);
});
```

#### `cancel(jobId, provider)`

Cancel a running job.

```typescript
await bridge.cancel('job-123', 'local');
```

### Job Result

```typescript
interface JobResult {
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  providerModeRequested: 'local' | 'cloud' | 'auto';
  providerUsed: 'local' | 'cloud';
  fallbackTriggered: boolean;
  fallbackReason?: 'local_unhealthy' | 'local_connection_failed' | 'local_timeout' | 'local_submission_error';
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
//   preferredLocalUrl: 'http://127.0.0.1:8188'
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
  const result = await bridge.submit({ workflow });
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
  local: { baseUrl: process.env.COMFY_LOCAL_URL },
  cloud: { apiKey: process.env.COMFY_CLOUD_API_KEY },
  routing: {
    enableFallback: true,
    retryOnConnectionFailure: true,
  },
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
function updateUI(result: JobResult) {
  setState({
    providerUsed: result.providerUsed,
    statusBadge: result.fallbackTriggered ? 'fallback' : 'healthy',
    fallbackReason: result.fallbackReason,
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
      local: { baseUrl: 'http://127.0.0.1:8188' },
    });
    const health = await bridge.healthCheck();
    expect(health[0].healthy).toBe(true);
  });

  it('fails clearly when local is unreachable', async () => {
    const bridge = createComfyBridge({
      mode: 'local',
      local: { baseUrl: 'http://nonexistent:8188' },
    });
    const health = await bridge.healthCheck();
    expect(health[0].healthy).toBe(false);
  });
});
```

### Auto Mode Tests

```typescript
describe('Auto Mode Fallback', () => {
  it('uses local when healthy', async () => {
    const bridge = createComfyBridge({
      mode: 'auto',
      local: { baseUrl: 'http://127.0.0.1:8188' },
      cloud: { apiKey: 'test-key' },
    });
    const result = await bridge.submit({ workflow: {} });
    expect(result.providerUsed).toBe('local');
    expect(result.fallbackTriggered).toBe(false);
  });

  it('falls back to cloud when local unhealthy', async () => {
    const bridge = createComfyBridge({
      mode: 'auto',
      local: { baseUrl: 'http://nonexistent:8188' },
      cloud: { apiKey: 'test-key' },
      routing: { enableFallback: true },
    });
    const result = await bridge.submit({ workflow: {} });
    expect(result.providerUsed).toBe('cloud');
    expect(result.fallbackTriggered).toBe(true);
  });
});
```

## Roadmap

### MVP (Current)

- [x] Local provider support
- [x] Cloud provider support
- [x] Auto mode with local-first
- [x] Cloud fallback
- [x] Health checks
- [x] Progress watching
- [x] Output retrieval
- [x] Normalized errors
- [x] UI switcher helpers

### Future

- [ ] Multi-local instance support
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

## Not This Package's Job

- WandGx billing logic
- WandGx project style profiles
- WandGx game asset manifests
- WandGx prompt builder business rules

## License

MIT
