import type {
  ProviderMode,
  BridgeConfig,
  RoutingPolicy,
  Workflow,
  SubmitOptions,
  JobResult,
  JobProgress,
  HealthCheckResult,
  FallbackReason,
  ProviderAdapter,
  WorkflowImage,
  WorkflowFile,
  JobOutput,
  UISwitcherState,
  UISwitcherRuntimeInfo,
} from './types';
import { createError, normalizeError, isComfyBridgeError } from './errors';
import { LocalAdapter } from './adapters/local-adapter';
import { CloudAdapter } from './adapters/cloud-adapter';

const DEFAULT_ROUTING_POLICY: RoutingPolicy = {
  enableFallback: true,
  retryOnConnectionFailure: true,
  maxRetries: 1,
  connectionTimeout: 5000,
};

/**
 * Result of routing decision
 */
interface RoutingDecision {
  adapter: ProviderAdapter;
  fallbackTriggered: boolean;
  fallbackReason?: FallbackReason;
}

/**
 * Main Comfy Bridge client
 */
export class ComfyBridge {
  private readonly config: BridgeConfig;
  private readonly routingPolicy: RoutingPolicy;
  private localAdapter?: ProviderAdapter;
  private cloudAdapter?: ProviderAdapter;

  constructor(config: BridgeConfig) {
    this.config = config;
    this.routingPolicy = { ...DEFAULT_ROUTING_POLICY, ...config.routing };

    // Validate configuration
    this.validateConfig();
  }

  private validateConfig(): void {
    if (this.config.mode === 'local' && !this.config.local) {
      throw createError('NO_LOCAL_PROVIDER', 'Local mode requires local configuration');
    }

    if (this.config.mode === 'cloud' && !this.config.cloud) {
      throw createError('CLOUD_UNAVAILABLE', 'Cloud mode requires cloud configuration');
    }

    if (this.config.mode === 'auto') {
      if (!this.config.local && !this.config.cloud) {
        throw createError(
          'NO_PROVIDER_AVAILABLE',
          'Auto mode requires at least local or cloud configuration'
        );
      }
    }
  }

  private getLocalAdapter(): ProviderAdapter {
    if (!this.localAdapter && this.config.local) {
      this.localAdapter = new LocalAdapter(this.config.local);
    }
    if (!this.localAdapter) {
      throw createError('NO_LOCAL_PROVIDER', 'Local provider not configured');
    }
    return this.localAdapter;
  }

  private getCloudAdapter(): ProviderAdapter {
    if (!this.cloudAdapter && this.config.cloud) {
      this.cloudAdapter = new CloudAdapter(this.config.cloud);
    }
    if (!this.cloudAdapter) {
      throw createError('CLOUD_UNAVAILABLE', 'Cloud provider not configured');
    }
    return this.cloudAdapter;
  }

  /**
   * Determine which provider to use based on mode and health
   */
  private async resolveProvider(mode?: ProviderMode): Promise<RoutingDecision> {
    const effectiveMode = mode ?? this.config.mode;

    if (effectiveMode === 'local') {
      return {
        adapter: this.getLocalAdapter(),
        fallbackTriggered: false,
      };
    }

    if (effectiveMode === 'cloud') {
      return {
        adapter: this.getCloudAdapter(),
        fallbackTriggered: false,
      };
    }

    // Auto mode: try local first, fallback to cloud
    if (effectiveMode === 'auto') {
      // Check if local is configured
      if (!this.config.local) {
        if (!this.config.cloud) {
          throw createError('NO_PROVIDER_AVAILABLE', 'No providers configured');
        }
        return {
          adapter: this.getCloudAdapter(),
          fallbackTriggered: false,
        };
      }

      // Check local health
      const localAdapter = this.getLocalAdapter();
      const localHealth = await localAdapter.healthCheck();

      if (localHealth.healthy) {
        return {
          adapter: localAdapter,
          fallbackTriggered: false,
        };
      }

      // Local unhealthy, check if cloud fallback is available
      if (this.routingPolicy.enableFallback && this.config.cloud) {
        return {
          adapter: this.getCloudAdapter(),
          fallbackTriggered: true,
          fallbackReason: 'local_unhealthy',
        };
      }

      // No fallback available
      throw createError('LOCAL_UNHEALTHY', `Local provider unhealthy: ${localHealth.error}`, {
        provider: 'local',
        context: { healthCheck: localHealth },
      });
    }

    throw createError('NO_PROVIDER_AVAILABLE', `Unknown mode: ${effectiveMode}`);
  }

  /**
   * Check health of all configured providers
   */
  async healthCheck(): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];

    if (this.config.local) {
      results.push(await this.getLocalAdapter().healthCheck());
    }

    if (this.config.cloud) {
      results.push(await this.getCloudAdapter().healthCheck());
    }

    return results;
  }

  /**
   * Submit a workflow for execution
   */
  async submit(workflow: Workflow, options?: SubmitOptions): Promise<JobResult> {
    const routing = await this.resolveProvider(options?.mode);
    const effectiveMode = options?.mode ?? this.config.mode;

    try {
      const jobId = await routing.adapter.submit(workflow, options);

      return {
        jobId,
        status: 'pending',
        providerModeRequested: effectiveMode,
        providerUsed: routing.adapter.provider,
        fallbackTriggered: routing.fallbackTriggered,
        fallbackReason: routing.fallbackReason,
        localInstanceId:
          routing.adapter.provider === 'local' ? this.config.local?.baseUrl : undefined,
      };
    } catch (error) {
      // Check if we should retry on connection failure
      if (
        this.routingPolicy.retryOnConnectionFailure &&
        routing.fallbackTriggered === false &&
        effectiveMode === 'auto' &&
        this.config.cloud &&
        isComfyBridgeError(error) &&
        error.code === 'CONNECTION_ERROR'
      ) {
        // Retry on cloud
        try {
          const cloudAdapter = this.getCloudAdapter();
          const jobId = await cloudAdapter.submit(workflow, options);

          return {
            jobId,
            status: 'pending',
            providerModeRequested: effectiveMode,
            providerUsed: 'cloud',
            fallbackTriggered: true,
            fallbackReason: 'local_connection_failed',
          };
        } catch (cloudError) {
          throw normalizeError(cloudError, 'cloud');
        }
      }

      throw normalizeError(error, routing.adapter.provider);
    }
  }

  /**
   * Submit and wait for completion
   */
  async submitAndWait(
    workflow: Workflow,
    options?: SubmitOptions
  ): Promise<JobResult> {
    const result = await this.submit(workflow, options);

    const adapter =
      result.providerUsed === 'local' ? this.getLocalAdapter() : this.getCloudAdapter();

    // Watch progress
    if (options?.onProgress) {
      await adapter.watchProgress(result.jobId, options.onProgress);
    } else {
      await adapter.watchProgress(result.jobId, () => {});
    }

    // Get final result
    const finalResult = await adapter.getResult(result.jobId);

    return {
      ...finalResult,
      providerModeRequested: result.providerModeRequested,
      providerUsed: result.providerUsed,
      fallbackTriggered: result.fallbackTriggered,
      fallbackReason: result.fallbackReason,
      localInstanceId: result.localInstanceId,
    };
  }

  /**
   * Watch progress of an existing job
   */
  async watchProgress(
    jobId: string,
    provider: 'local' | 'cloud',
    onProgress: (progress: JobProgress) => void
  ): Promise<void> {
    const adapter = provider === 'local' ? this.getLocalAdapter() : this.getCloudAdapter();
    await adapter.watchProgress(jobId, onProgress);
  }

  /**
   * Get the result of a job
   */
  async getResult(jobId: string, provider: 'local' | 'cloud'): Promise<JobResult> {
    const adapter = provider === 'local' ? this.getLocalAdapter() : this.getCloudAdapter();
    return adapter.getResult(jobId);
  }

  /**
   * Cancel a running job
   */
  async cancel(jobId: string, provider: 'local' | 'cloud'): Promise<void> {
    const adapter = provider === 'local' ? this.getLocalAdapter() : this.getCloudAdapter();
    await adapter.cancel(jobId);
  }

  /**
   * Upload an image
   */
  async uploadImage(
    image: WorkflowImage,
    provider?: 'local' | 'cloud'
  ): Promise<{ filename: string; subfolder?: string }> {
    const effectiveProvider = provider ?? this.config.mode;
    const adapter =
      effectiveProvider === 'cloud' ? this.getCloudAdapter() : this.getLocalAdapter();
    return adapter.uploadImage(image);
  }

  /**
   * Upload a file
   */
  async uploadFile(
    file: WorkflowFile,
    provider?: 'local' | 'cloud'
  ): Promise<{ filename: string; subfolder?: string }> {
    const effectiveProvider = provider ?? this.config.mode;
    const adapter =
      effectiveProvider === 'cloud' ? this.getCloudAdapter() : this.getLocalAdapter();
    return adapter.uploadFile(file);
  }

  /**
   * Get URL for an output
   */
  getOutputUrl(output: JobOutput, provider?: 'local' | 'cloud'): string {
    const effectiveProvider = provider ?? this.config.mode;
    const adapter =
      effectiveProvider === 'cloud' ? this.getCloudAdapter() : this.getLocalAdapter();
    return adapter.getOutputUrl(output);
  }

  /**
   * Get UI switcher state
   */
  getUISwitcherState(): UISwitcherState {
    return {
      mode: this.config.mode,
      fallbackEnabled: this.routingPolicy.enableFallback ?? false,
      preferredLocalUrl: this.config.local?.baseUrl,
    };
  }

  /**
   * Get UI switcher runtime info
   */
  async getUISwitcherRuntimeInfo(): Promise<UISwitcherRuntimeInfo> {
    const healthResults = await this.healthCheck();
    const localHealth = healthResults.find((h) => h.provider === 'local');
    const cloudHealth = healthResults.find((h) => h.provider === 'cloud');

    let providerUsed: 'local' | 'cloud';
    let statusBadge: UISwitcherRuntimeInfo['statusBadge'];
    let fallbackReason: FallbackReason | undefined;

    if (this.config.mode === 'local') {
      providerUsed = 'local';
      statusBadge = localHealth?.healthy ? 'healthy' : 'unavailable';
    } else if (this.config.mode === 'cloud') {
      providerUsed = 'cloud';
      statusBadge = cloudHealth?.healthy ? 'healthy' : 'unavailable';
    } else {
      // Auto mode
      if (localHealth?.healthy) {
        providerUsed = 'local';
        statusBadge = 'healthy';
      } else if (cloudHealth?.healthy) {
        providerUsed = 'cloud';
        statusBadge = 'fallback';
        fallbackReason = 'local_unhealthy';
      } else {
        providerUsed = cloudHealth ? 'cloud' : 'local';
        statusBadge = 'unavailable';
      }
    }

    return {
      providerUsed,
      statusBadge,
      fallbackReason,
      lastChecked: new Date(),
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): BridgeConfig {
    return { ...this.config };
  }

  /**
   * Get routing policy
   */
  getRoutingPolicy(): RoutingPolicy {
    return { ...this.routingPolicy };
  }
}

/**
 * Create a Comfy Bridge client
 */
export function createComfyBridge(config: BridgeConfig): ComfyBridge {
  return new ComfyBridge(config);
}
