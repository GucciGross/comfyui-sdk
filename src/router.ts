import type {
  ComfyRoutingMode,
  ComfyBridgeConfig,
  Workflow,
  SubmitOptions,
  JobResult,
  JobProgress,
  HealthCheckResult,
  FallbackReason,
  ProviderAdapter,
  LocalInstanceConfig,
  UISwitcherState,
  UISwitcherRuntimeInfo,
  SubmitWorkflowInput,
  GenerationResult,
  GenerationStatus,
  WorkflowFile,
} from './types';
import { createError, normalizeError, isComfyBridgeError } from './errors';
import { LocalAdapter } from './adapters/local-adapter';
import { CloudAdapter } from './adapters/cloud-adapter';

const DEFAULT_LOCAL_TIMEOUT_MS = 60000;

/**
 * Result of routing decision
 */
interface RoutingDecision {
  adapter: ProviderAdapter;
  instanceId?: string;
  fallbackTriggered: boolean;
  fallbackReason?: FallbackReason;
}

/**
 * Main Comfy Bridge client
 */
export class ComfyBridge {
  private readonly config: ComfyBridgeConfig;
  private localAdapters: Map<string, ProviderAdapter> = new Map();
  private cloudAdapter?: ProviderAdapter;

  constructor(config: ComfyBridgeConfig) {
    this.config = config;
    this.validateConfig();
  }

  private validateConfig(): void {
    if (this.config.mode === 'local') {
      if (!this.config.localInstances?.length) {
        throw createError('NO_LOCAL_PROVIDER', 'Local mode requires localInstances configuration');
      }
    }

    if (this.config.mode === 'cloud') {
      if (!this.config.cloud) {
        throw createError('CLOUD_UNAVAILABLE', 'Cloud mode requires cloud configuration');
      }
    }

    if (this.config.mode === 'auto') {
      const hasLocal = this.config.localInstances?.some((i) => i.enabled !== false);
      if (!hasLocal && !this.config.cloud) {
        throw createError(
          'NO_PROVIDER_AVAILABLE',
          'Auto mode requires at least localInstances or cloud configuration'
        );
      }
    }
  }

  private getLocalAdapter(instanceId?: string): ProviderAdapter {
    const instances = this.config.localInstances ?? [];

    // Find the instance
    let instance: LocalInstanceConfig | undefined;
    if (instanceId) {
      instance = instances.find((i) => i.id === instanceId);
    } else if (this.config.preferredLocalInstanceId) {
      instance = instances.find((i) => i.id === this.config.preferredLocalInstanceId);
    }

    // Fall back to first enabled instance
    if (!instance) {
      instance = instances.find((i) => i.enabled !== false);
    }

    if (!instance) {
      throw createError('NO_LOCAL_PROVIDER', 'No local instance available');
    }

    // Cache adapters by instance ID
    let adapter = this.localAdapters.get(instance.id);
    if (!adapter) {
      adapter = new LocalAdapter({
        baseUrl: instance.baseUrl,
        instanceId: instance.id,
        timeout: this.config.localTimeoutMs ?? DEFAULT_LOCAL_TIMEOUT_MS,
      });
      this.localAdapters.set(instance.id, adapter);
    }

    return adapter;
  }

  private getCloudAdapter(): ProviderAdapter {
    if (!this.cloudAdapter && this.config.cloud) {
      this.cloudAdapter = new CloudAdapter({
        baseUrl: this.config.cloud.baseUrl,
        apiKey: this.config.cloud.apiKey ?? '',
      });
    }
    if (!this.cloudAdapter) {
      throw createError('CLOUD_UNAVAILABLE', 'Cloud provider not configured');
    }
    return this.cloudAdapter;
  }

  /**
   * Get the instance ID that would be used
   */
  private resolveLocalInstanceId(requestedInstanceId?: string): string | undefined {
    const instances = this.config.localInstances ?? [];

    if (requestedInstanceId) {
      const explicit = instances.find((i) => i.id === requestedInstanceId);
      if (explicit) return explicit.id;
    }

    if (this.config.preferredLocalInstanceId) {
      const preferred = instances.find(
        (i) => i.id === this.config.preferredLocalInstanceId && i.enabled !== false
      );
      if (preferred) return preferred.id;
    }

    const first = instances.find((i) => i.enabled !== false);
    return first?.id;
  }

  /**
   * Determine which provider to use based on mode and health
   */
  private async resolveProvider(mode?: ComfyRoutingMode): Promise<RoutingDecision> {
    const effectiveMode = mode ?? this.config.mode;

    if (effectiveMode === 'local') {
      const instanceId = this.resolveLocalInstanceId();
      return {
        adapter: this.getLocalAdapter(instanceId),
        instanceId,
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
      const instances = this.config.localInstances ?? [];
      const hasLocal = instances.some((i) => i.enabled !== false);

      if (!hasLocal) {
        if (!this.config.cloud) {
          throw createError('NO_PROVIDER_AVAILABLE', 'No providers configured');
        }
        return {
          adapter: this.getCloudAdapter(),
          fallbackTriggered: false,
        };
      }

      // Check local health
      const instanceId = this.resolveLocalInstanceId();
      const localAdapter = this.getLocalAdapter(instanceId);
      const localHealth = await localAdapter.healthCheck();

      if (localHealth.healthy) {
        return {
          adapter: localAdapter,
          instanceId,
          fallbackTriggered: false,
        };
      }

      // Local unhealthy, check if cloud fallback is available
      if (this.config.fallbackToCloud && this.config.cloud) {
        return {
          adapter: this.getCloudAdapter(),
          instanceId,
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

  private getLocalFallbackReason(
    error: unknown,
    effectiveMode: ComfyRoutingMode,
    routing: RoutingDecision
  ): FallbackReason | undefined {
    if (effectiveMode !== 'auto' || routing.adapter.provider !== 'local' || !this.config.cloud) {
      return undefined;
    }

    if (!isComfyBridgeError(error)) {
      return undefined;
    }

    if (error.code === 'CONNECTION_ERROR' && this.config.retryOnConnectionFailure) {
      return 'local_connection_failed';
    }

    if (error.code === 'TIMEOUT_ERROR' && this.config.fallbackToCloud) {
      return 'local_timeout';
    }

    return undefined;
  }

  private async submitWithRouting(
    workflow: Workflow,
    options?: SubmitOptions
  ): Promise<{
    jobId: string;
    providerModeRequested: ComfyRoutingMode;
    providerUsed: 'local' | 'cloud';
    fallbackTriggered: boolean;
    fallbackReason?: FallbackReason;
    localInstanceId?: string;
  }> {
    const routing = await this.resolveProvider(options?.mode);
    const effectiveMode = options?.mode ?? this.config.mode;

    try {
      const jobId = await routing.adapter.submit(workflow, options);

      return {
        jobId,
        providerModeRequested: effectiveMode,
        providerUsed: routing.adapter.provider,
        fallbackTriggered: routing.fallbackTriggered,
        fallbackReason: routing.fallbackReason,
        localInstanceId: routing.instanceId,
      };
    } catch (error) {
      const fallbackReason = this.getLocalFallbackReason(error, effectiveMode, routing);

      if (fallbackReason) {
        try {
          const jobId = await this.getCloudAdapter().submit(workflow, options);

          return {
            jobId,
            providerModeRequested: effectiveMode,
            providerUsed: 'cloud',
            fallbackTriggered: true,
            fallbackReason,
            localInstanceId: routing.instanceId,
          };
        } catch (cloudError) {
          throw normalizeError(cloudError, 'cloud', {
            context: {
              attemptedFallbackFrom: 'local',
              localInstanceId: routing.instanceId,
            },
          });
        }
      }

      throw normalizeError(error, routing.adapter.provider, {
        context: {
          requestedMode: effectiveMode,
          localInstanceId: routing.instanceId,
        },
      });
    }
  }

  /**
   * Check health of all configured providers
   */
  async healthCheck(): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];

    const instances = this.config.localInstances ?? [];
    for (const instance of instances) {
      if (instance.enabled !== false) {
        const adapter = this.getLocalAdapter(instance.id);
        results.push(await adapter.healthCheck());
      }
    }

    if (this.config.cloud) {
      results.push(await this.getCloudAdapter().healthCheck());
    }

    return results;
  }

  /**
   * Submit a workflow for execution using the doc-specified input format
   */
  async submitWorkflow(input: SubmitWorkflowInput, options?: SubmitOptions): Promise<GenerationResult> {
    const workflow: Workflow = {
      workflow: input.workflow,
      files: input.files?.map(
        (f): WorkflowFile => ({
          data: f.data,
          filename: f.name,
          contentType: f.contentType,
        })
      ),
    };

    const result = await this.submitWithRouting(workflow, options);

    return {
      promptId: result.jobId,
      usage: {
        providerRequested: result.providerModeRequested,
        providerUsed: result.providerUsed,
        fallbackTriggered: result.fallbackTriggered,
        fallbackReason: result.fallbackReason,
        localInstanceId: result.localInstanceId,
      },
    };
  }

  /**
   * Submit a workflow (extended format with images/files)
   */
  async submit(workflow: Workflow, options?: SubmitOptions): Promise<JobResult> {
    const result = await this.submitWithRouting(workflow, options);

    return {
      jobId: result.jobId,
      status: 'queued',
      providerModeRequested: result.providerModeRequested,
      providerUsed: result.providerUsed,
      fallbackTriggered: result.fallbackTriggered,
      fallbackReason: result.fallbackReason,
      localInstanceId: result.localInstanceId,
    };
  }

  /**
   * Submit and wait for completion
   */
  async submitAndWait(workflow: Workflow, options?: SubmitOptions): Promise<JobResult> {
    const result = await this.submit(workflow, options);

    const adapter =
      result.providerUsed === 'local'
        ? this.getLocalAdapter(result.localInstanceId)
        : this.getCloudAdapter();

    if (options?.onProgress) {
      await adapter.watchProgress(result.jobId, options.onProgress);
    } else {
      await adapter.watchProgress(result.jobId, () => {});
    }

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
   * Get the status of a generation
   */
  async getStatus(promptId: string, provider: 'local' | 'cloud', instanceId?: string): Promise<GenerationStatus> {
    const resolvedInstanceId = provider === 'local' ? this.resolveLocalInstanceId(instanceId) : undefined;
    const adapter = provider === 'local' ? this.getLocalAdapter(resolvedInstanceId) : this.getCloudAdapter();
    const result = await adapter.getResult(promptId);

    const stateMap: Record<string, GenerationStatus['state']> = {
      pending: 'queued',
      queued: 'queued',
      running: 'running',
      completed: 'completed',
      failed: 'failed',
      cancelled: 'failed',
    };

    return {
      promptId,
      state: stateMap[result.status] || 'failed',
      progress: result.progress?.progress,
      outputs: result.outputs,
      error: result.error?.message,
      usage: {
        providerRequested: provider,
        providerUsed: provider,
        fallbackTriggered: false,
        localInstanceId: resolvedInstanceId,
      },
    };
  }

  /**
   * Watch progress of an existing job
   */
  async watchProgress(
    jobId: string,
    provider: 'local' | 'cloud',
    onProgress: (progress: JobProgress) => void,
    instanceId?: string
  ): Promise<void> {
    const adapter = provider === 'local' ? this.getLocalAdapter(instanceId) : this.getCloudAdapter();
    await adapter.watchProgress(jobId, onProgress);
  }

  /**
   * Get the result of a job
   */
  async getResult(jobId: string, provider: 'local' | 'cloud', instanceId?: string): Promise<JobResult> {
    const resolvedInstanceId = provider === 'local' ? this.resolveLocalInstanceId(instanceId) : undefined;
    const adapter = provider === 'local' ? this.getLocalAdapter(resolvedInstanceId) : this.getCloudAdapter();
    const result = await adapter.getResult(jobId);

    return {
      ...result,
      providerModeRequested: provider,
      providerUsed: provider,
      fallbackTriggered: false,
      fallbackReason: undefined,
      localInstanceId: resolvedInstanceId,
    };
  }

  /**
   * Cancel a running job
   */
  async cancel(jobId: string, provider: 'local' | 'cloud', instanceId?: string): Promise<void> {
    const adapter = provider === 'local' ? this.getLocalAdapter(instanceId) : this.getCloudAdapter();
    await adapter.cancel(jobId);
  }

  /**
   * Upload an image
   */
  async uploadImage(
    image: import('./types').WorkflowImage,
    provider?: 'local' | 'cloud',
    instanceId?: string
  ): Promise<{ filename: string; subfolder?: string; type?: string }> {
    if (provider === 'cloud') {
      return this.getCloudAdapter().uploadImage(image);
    }
    return this.getLocalAdapter(instanceId).uploadImage(image);
  }

  /**
   * Upload a file
   */
  async uploadFile(
    file: import('./types').WorkflowFile,
    provider?: 'local' | 'cloud',
    instanceId?: string
  ): Promise<{ filename: string; subfolder?: string; type?: string }> {
    if (provider === 'cloud') {
      return this.getCloudAdapter().uploadFile(file);
    }
    return this.getLocalAdapter(instanceId).uploadFile(file);
  }

  /**
   * Get URL for an output
   */
  getOutputUrl(
    output: import('./types').JobOutput,
    provider?: 'local' | 'cloud',
    instanceId?: string
  ): string {
    if (provider === 'cloud') {
      return this.getCloudAdapter().getOutputUrl(output);
    }
    return this.getLocalAdapter(instanceId).getOutputUrl(output);
  }

  /**
   * Get UI switcher state
   */
  getUISwitcherState(): UISwitcherState {
    const preferredInstance = this.config.localInstances?.find(
      (i) => i.id === this.config.preferredLocalInstanceId
    );

    return {
      mode: this.config.mode,
      fallbackEnabled: this.config.fallbackToCloud,
      preferredLocalUrl: preferredInstance?.baseUrl,
    };
  }

  /**
   * Get UI switcher runtime info
   */
  async getUISwitcherRuntimeInfo(): Promise<UISwitcherRuntimeInfo> {
    const healthResults = await this.healthCheck();
    const resolvedLocalInstanceId = this.resolveLocalInstanceId();
    const localHealth = healthResults.find(
      (h) => h.provider === 'local' && h.instanceId === resolvedLocalInstanceId
    );
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
      } else if (cloudHealth?.healthy && this.config.fallbackToCloud) {
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
  getConfig(): ComfyBridgeConfig {
    return { ...this.config };
  }
}

/**
 * Create a Comfy Bridge client
 */
export function createComfyBridge(config: ComfyBridgeConfig): ComfyBridge {
  return new ComfyBridge(config);
}
