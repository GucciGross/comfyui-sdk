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

// Types - Doc-specified public types
export type {
  ComfyRoutingMode,
  ComfyBridgeConfig,
  LocalInstanceConfig,
  ProviderUsageMetadata,
  SubmitWorkflowInput,
  GenerationResult,
  GenerationStatus,
  WorkflowFileInput,
} from './types';

// Types - Extended types
export type {
  ProviderMode,
  JobStatus,
  ErrorCode,
  FallbackReason,
  LocalConfig,
  CloudConfig,
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
  BridgeConfig,
} from './types';
