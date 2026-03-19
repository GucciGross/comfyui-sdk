// Main client
export { ComfyBridge, createComfyBridge } from './router';

// Adapters
export { LocalAdapter } from './adapters/local-adapter';
export { CloudAdapter } from './adapters/cloud-adapter';

// Errors
export {
  ComfyBridgeErrorClass,
  createError,
  isComfyBridgeError,
  normalizeError,
} from './errors';

// Types
export type {
  ProviderMode,
  JobStatus,
  ErrorCode,
  FallbackReason,
  LocalConfig,
  CloudConfig,
  RoutingPolicy,
  BridgeConfig,
  Workflow,
  WorkflowImage,
  WorkflowFile,
  JobProgress,
  JobOutput,
  JobResult,
  HealthCheckResult,
  ComfyBridgeError,
  SubmitOptions,
  UISwitcherState,
  UISwitcherRuntimeInfo,
  ProviderAdapter,
} from './types';
