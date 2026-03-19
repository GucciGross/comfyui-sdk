/**
 * Provider modes supported by the Comfy Bridge
 * Doc: 04-PUBLIC-TYPES-SPEC.md
 */
export type ComfyRoutingMode = 'local' | 'cloud' | 'auto';

// Alias for backwards compatibility
export type ProviderMode = ComfyRoutingMode;

/**
 * Local instance configuration for multi-instance support
 */
export interface LocalInstanceConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  enabled?: boolean;
}

/**
 * Bridge configuration - GUI-friendly flat structure
 * Doc: 04-PUBLIC-TYPES-SPEC.md
 */
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

// Alias for internal use
export type BridgeConfig = ComfyBridgeConfig;

/**
 * Provider usage metadata - returned with every generation result
 * Doc: 04-PUBLIC-TYPES-SPEC.md
 */
export interface ProviderUsageMetadata {
  providerRequested: ComfyRoutingMode;
  providerUsed: 'local' | 'cloud';
  fallbackTriggered: boolean;
  fallbackReason?: string;
  localInstanceId?: string;
}

/**
 * File input for workflow submission
 */
export interface WorkflowFileInput {
  name: string;
  data: Uint8Array | ArrayBuffer | Blob;
  contentType?: string;
}

/**
 * Input for submitting a workflow
 * Doc: 04-PUBLIC-TYPES-SPEC.md
 */
export interface SubmitWorkflowInput {
  workflow: Record<string, unknown>;
  files?: WorkflowFileInput[];
  metadata?: Record<string, unknown>;
}

/**
 * Result from a generation request
 * Doc: 04-PUBLIC-TYPES-SPEC.md
 */
export interface GenerationResult {
  promptId: string;
  outputs?: unknown;
  usage: ProviderUsageMetadata;
}

/**
 * Status of a generation job
 * Doc: 04-PUBLIC-TYPES-SPEC.md
 */
export interface GenerationStatus {
  promptId: string;
  state: 'queued' | 'running' | 'completed' | 'failed';
  progress?: number;
  outputs?: unknown;
  error?: string;
  usage?: ProviderUsageMetadata;
}

// ============================================================================
// Additional types for internal adapter interface
// ============================================================================

/**
 * Job status values (extended)
 */
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Normalized error codes
 */
export type ErrorCode =
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

/**
 * Fallback reason when cloud is used instead of local
 */
export type FallbackReason =
  | 'local_unhealthy'
  | 'local_connection_failed'
  | 'local_timeout'
  | 'local_submission_error';

/**
 * Legacy local config (for single-instance backwards compat)
 */
export interface LocalConfig {
  baseUrl: string;
  timeout?: number;
  wsPath?: string;
}

/**
 * Legacy cloud config
 */
export interface CloudConfig {
  baseUrl?: string;
  apiKey: string;
  timeout?: number;
}

/**
 * Workflow to submit (extended format)
 */
export interface Workflow {
  workflow: Record<string, unknown>;
  images?: WorkflowImage[];
  files?: WorkflowFile[];
}

/**
 * Image to upload with the workflow
 */
export interface WorkflowImage {
  data: ArrayBuffer | Blob | string | Uint8Array;
  filename: string;
  subfolder?: string;
  overwrite?: boolean;
}

/**
 * File to upload with the workflow
 */
export interface WorkflowFile {
  data: ArrayBuffer | Blob | string | Uint8Array;
  filename: string;
  subfolder?: string;
  overwrite?: boolean;
}

/**
 * Progress information for a running job
 */
export interface JobProgress {
  currentNode?: string;
  stepsCompleted?: number;
  totalSteps?: number;
  progress?: number;
  preview?: string;
}

/**
 * Output from a completed job
 */
export interface JobOutput {
  filename: string;
  subfolder?: string;
  type: 'output' | 'temp';
  url: string;
  mimeType?: string;
  size?: number;
}

/**
 * Job result (extended)
 */
export interface JobResult {
  jobId: string;
  status: JobStatus;
  providerModeRequested: ComfyRoutingMode;
  providerUsed: 'local' | 'cloud';
  fallbackTriggered: boolean;
  fallbackReason?: FallbackReason;
  localInstanceId?: string;
  progress?: JobProgress;
  outputs?: JobOutput[];
  error?: ComfyBridgeError;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  healthy: boolean;
  provider: 'local' | 'cloud';
  responseTime?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Normalized error
 */
export interface ComfyBridgeError {
  code: ErrorCode;
  message: string;
  cause?: Error;
  provider?: 'local' | 'cloud';
  context?: Record<string, unknown>;
}

/**
 * Options for submit operation
 */
export interface SubmitOptions {
  mode?: ComfyRoutingMode;
  timeout?: number;
  onProgress?: (progress: JobProgress) => void;
}

/**
 * UI Switcher state payload
 */
export interface UISwitcherState {
  mode: ComfyRoutingMode;
  fallbackEnabled: boolean;
  preferredLocalUrl?: string;
  lastHealthCheck?: HealthCheckResult;
}

/**
 * UI Switcher runtime info
 */
export interface UISwitcherRuntimeInfo {
  providerUsed: 'local' | 'cloud';
  statusBadge: 'healthy' | 'degraded' | 'unavailable' | 'fallback';
  fallbackReason?: FallbackReason;
  lastChecked: Date;
}

/**
 * Provider adapter interface
 */
export interface ProviderAdapter {
  readonly provider: 'local' | 'cloud';
  healthCheck(): Promise<HealthCheckResult>;
  submit(workflow: Workflow, options?: SubmitOptions): Promise<string>;
  watchProgress(jobId: string, onProgress: (progress: JobProgress) => void): Promise<void>;
  getResult(jobId: string): Promise<JobResult>;
  cancel(jobId: string): Promise<void>;
  uploadImage(image: WorkflowImage): Promise<{ filename: string; subfolder?: string }>;
  uploadFile(file: WorkflowFile): Promise<{ filename: string; subfolder?: string }>;
  getOutputUrl(output: JobOutput): string;
}
