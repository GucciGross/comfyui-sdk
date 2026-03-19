# PUBLIC TYPES SPEC

## Required public types

```ts
export type ComfyRoutingMode = "local" | "cloud" | "auto";

export interface LocalInstanceConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  enabled?: boolean;
}

export interface ComfyBridgeConfig {
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

export interface ProviderUsageMetadata {
  providerRequested: ComfyRoutingMode;
  providerUsed: "local" | "cloud";
  fallbackTriggered: boolean;
  fallbackReason?: string;
  localInstanceId?: string;
}

export interface SubmitWorkflowInput {
  workflow: Record<string, unknown>;
  files?: Array<{
    name: string;
    data: Uint8Array | ArrayBuffer | Blob;
    contentType?: string;
  }>;
  metadata?: Record<string, unknown>;
}

export interface GenerationResult {
  promptId: string;
  outputs?: unknown;
  usage: ProviderUsageMetadata;
}

export interface GenerationStatus {
  promptId: string;
  state: "queued" | "running" | "completed" | "failed";
  progress?: number;
  outputs?: unknown;
  error?: string;
  usage?: ProviderUsageMetadata;
}
```

## Public typing requirements

- GUI-ready
- app-friendly
- no dependency on external SDK classes
- no leaking provider-specific internals
