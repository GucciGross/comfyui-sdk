/**
 * Provider modes supported by the Comfy Bridge
 */
export type ProviderMode = 'local' | 'cloud' | 'auto';

/**
 * Job status values
 */
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

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
 * Local provider configuration
 */
export interface LocalConfig {
  /** Base URL of the local ComfyUI instance */
  baseUrl: string;
  /** Timeout in milliseconds for requests */
  timeout?: number;
  /** WebSocket path (default: /ws) */
  wsPath?: string;
}

/**
 * Cloud provider configuration
 */
export interface CloudConfig {
  /** Base URL of the ComfyUI Cloud API */
  baseUrl?: string;
  /** API key for authentication */
  apiKey: string;
  /** Timeout in milliseconds for requests */
  timeout?: number;
}

/**
 * Routing policy configuration
 */
export interface RoutingPolicy {
  /** Enable fallback to cloud when local fails */
  enableFallback?: boolean;
  /** Enable retry on connection failure */
  retryOnConnectionFailure?: boolean;
  /** Maximum retries before giving up */
  maxRetries?: number;
  /** Connection timeout in milliseconds */
  connectionTimeout?: number;
}

/**
 * Bridge configuration
 */
export interface BridgeConfig {
  /** Provider mode: local, cloud, or auto */
  mode: ProviderMode;
  /** Local provider configuration */
  local?: LocalConfig;
  /** Cloud provider configuration */
  cloud?: CloudConfig;
  /** Routing policy for auto mode */
  routing?: RoutingPolicy;
}

/**
 * Workflow to submit
 */
export interface Workflow {
  /** The workflow JSON (ComfyUI API format) */
  workflow: Record<string, unknown>;
  /** Optional images to upload */
  images?: WorkflowImage[];
  /** Optional files to upload */
  files?: WorkflowFile[];
}

/**
 * Image to upload with the workflow
 */
export interface WorkflowImage {
  /** Image data as ArrayBuffer, Blob, or base64 string */
  data: ArrayBuffer | Blob | string;
  /** Original filename */
  filename: string;
  /** Subfolder path in ComfyUI input directory */
  subfolder?: string;
  /** Whether to overwrite existing file */
  overwrite?: boolean;
}

/**
 * File to upload with the workflow
 */
export interface WorkflowFile {
  /** File data as ArrayBuffer, Blob, or base64 string */
  data: ArrayBuffer | Blob | string;
  /** Original filename */
  filename: string;
  /** Subfolder path in ComfyUI input directory */
  subfolder?: string;
  /** Whether to overwrite existing file */
  overwrite?: boolean;
}

/**
 * Progress information for a running job
 */
export interface JobProgress {
  /** Current node being executed */
  currentNode?: string;
  /** Number of completed steps */
  stepsCompleted?: number;
  /** Total number of steps */
  totalSteps?: number;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Preview image (base64 or URL) */
  preview?: string;
}

/**
 * Output from a completed job
 */
export interface JobOutput {
  /** Output filename */
  filename: string;
  /** Subfolder path */
  subfolder?: string;
  /** Output type */
  type: 'output' | 'temp';
  /** URL to retrieve the output */
  url: string;
  /** MIME type if known */
  mimeType?: string;
  /** File size in bytes if known */
  size?: number;
}

/**
 * Job metadata and result
 */
export interface JobResult {
  /** Unique job ID */
  jobId: string;
  /** Current status */
  status: JobStatus;
  /** Provider mode that was requested */
  providerModeRequested: ProviderMode;
  /** Provider that was actually used */
  providerUsed: 'local' | 'cloud';
  /** Whether fallback was triggered */
  fallbackTriggered: boolean;
  /** Reason for fallback if applicable */
  fallbackReason?: FallbackReason;
  /** Local instance ID if local was used */
  localInstanceId?: string;
  /** Progress information */
  progress?: JobProgress;
  /** Outputs from completed job */
  outputs?: JobOutput[];
  /** Error if job failed */
  error?: ComfyBridgeError;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  /** Whether the provider is healthy */
  healthy: boolean;
  /** Provider that was checked */
  provider: 'local' | 'cloud';
  /** Response time in milliseconds */
  responseTime?: number;
  /** Error if unhealthy */
  error?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Normalized error
 */
export interface ComfyBridgeError {
  /** Error code */
  code: ErrorCode;
  /** Human-readable message */
  message: string;
  /** Original error if available */
  cause?: Error;
  /** Provider where the error occurred */
  provider?: 'local' | 'cloud';
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Options for submit operation
 */
export interface SubmitOptions {
  /** Override provider mode for this job */
  mode?: ProviderMode;
  /** Custom timeout for this job */
  timeout?: number;
  /** Callback for progress updates */
  onProgress?: (progress: JobProgress) => void;
}

/**
 * UI Switcher state payload
 */
export interface UISwitcherState {
  /** Current provider mode */
  mode: ProviderMode;
  /** Whether fallback is enabled */
  fallbackEnabled: boolean;
  /** Preferred local instance URL */
  preferredLocalUrl?: string;
  /** Last health check result */
  lastHealthCheck?: HealthCheckResult;
}

/**
 * UI Switcher runtime info
 */
export interface UISwitcherRuntimeInfo {
  /** Provider actually being used */
  providerUsed: 'local' | 'cloud';
  /** Current status badge */
  statusBadge: 'healthy' | 'degraded' | 'unavailable' | 'fallback';
  /** Fallback reason if in fallback mode */
  fallbackReason?: FallbackReason;
  /** Last checked timestamp */
  lastChecked: Date;
}

/**
 * Provider adapter interface
 */
export interface ProviderAdapter {
  /** Provider identifier */
  readonly provider: 'local' | 'cloud';

  /** Check if provider is healthy */
  healthCheck(): Promise<HealthCheckResult>;

  /** Submit a workflow */
  submit(workflow: Workflow, options?: SubmitOptions): Promise<string>;

  /** Watch job progress */
  watchProgress(
    jobId: string,
    onProgress: (progress: JobProgress) => void
  ): Promise<void>;

  /** Get job status and result */
  getResult(jobId: string): Promise<JobResult>;

  /** Cancel a job */
  cancel(jobId: string): Promise<void>;

  /** Upload an image */
  uploadImage(image: WorkflowImage): Promise<{ filename: string; subfolder?: string }>;

  /** Upload a file */
  uploadFile(file: WorkflowFile): Promise<{ filename: string; subfolder?: string }>;

  /** Get output URL */
  getOutputUrl(output: JobOutput): string;
}
