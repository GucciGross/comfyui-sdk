import type {
  ProviderAdapter,
  CloudConfig,
  Workflow,
  WorkflowImage,
  WorkflowFile,
  JobProgress,
  JobResult,
  JobOutput,
  HealthCheckResult,
  SubmitOptions,
  ComfyBridgeError,
} from '../types';
import {
  createBlob,
  createClientId,
  delay,
  flattenOutputs,
  rewriteWorkflowWithUploadedAssets,
} from '../adapter-utils';
import { createError, normalizeError } from '../errors';

const DEFAULT_TIMEOUT = 300000;
const DEFAULT_BASE_URL = 'https://cloud.comfy.org';
const DEFAULT_POLL_INTERVAL = 1000;

type TrackedJobState = {
  status: JobResult['status'];
  progress?: JobProgress;
  outputs?: JobOutput[];
  error?: ComfyBridgeError;
};

type CloudJobStatusResponse = {
  id?: string;
  status?: string;
  error_message?: string;
  assigned_inference?: string;
  created_at?: string;
  updated_at?: string;
  last_state_update?: string;
};

type CloudJobDetailsResponse = {
  id?: string;
  status?: string;
  outputs?: unknown;
  preview_output?: unknown;
  execution_error?: {
    node_id?: string;
    node_type?: string;
    exception_message?: string;
    exception_type?: string;
    traceback?: string[];
    current_inputs?: Record<string, unknown>;
    current_outputs?: Record<string, unknown>;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Cloud ComfyUI provider adapter
 */
export class CloudAdapter implements ProviderAdapter {
  public readonly provider = 'cloud' as const;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeout: number;
  private readonly jobClientIds = new Map<string, string>();
  private readonly jobStates = new Map<string, TrackedJobState>();

  constructor(config: CloudConfig) {
    this.baseUrl = config.baseUrl?.replace(/\/$/, '') ?? DEFAULT_BASE_URL;
    this.apiKey = config.apiKey ?? '';
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
  }

  private getHeaders(includeContentType = true): Record<string, string> {
    return {
      ...(includeContentType ? { 'Content-Type': 'application/json' } : {}),
      'X-API-Key': this.apiKey,
    };
  }

  private mapStatus(status?: string): JobResult['status'] {
    if (status === 'waiting_to_dispatch' || status === 'pending') {
      return 'queued';
    }

    if (status === 'in_progress') {
      return 'running';
    }

    if (status === 'completed') {
      return 'completed';
    }

    if (status === 'cancelled') {
      return 'cancelled';
    }

    return 'failed';
  }

  private createJobResult(jobId: string, state: TrackedJobState): JobResult {
    return {
      jobId,
      status: state.status,
      providerModeRequested: 'cloud',
      providerUsed: 'cloud',
      fallbackTriggered: false,
      progress: state.progress,
      outputs: state.outputs,
      error: state.error,
    };
  }

  private rememberJobState(jobId: string, updates: Partial<TrackedJobState>): TrackedJobState {
    const current = this.jobStates.get(jobId) ?? { status: 'queued' as const };
    const next = {
      ...current,
      ...updates,
    };

    this.jobStates.set(jobId, next);
    return next;
  }

  private async fetchStatus(jobId: string): Promise<CloudJobStatusResponse> {
    const response = await fetch(`${this.baseUrl}/api/job/${jobId}/status`, {
      method: 'GET',
      headers: this.getHeaders(false),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorText = await response.text();

      if (response.status === 401 || response.status === 403) {
        throw createError('AUTH_ERROR', 'Invalid Comfy Cloud API key', {
          provider: 'cloud',
          context: { status: response.status },
        });
      }

      if (response.status === 404) {
        throw createError('JOB_NOT_FOUND', `Cloud job not found: ${jobId}`, {
          provider: 'cloud',
          context: { status: response.status, jobId },
        });
      }

      throw createError('SUBMISSION_ERROR', `Failed to fetch cloud job status: ${errorText}`, {
        provider: 'cloud',
        context: { status: response.status, jobId },
      });
    }

    return (await response.json()) as CloudJobStatusResponse;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      const response = await fetch(`${this.baseUrl}/api/queue`, {
        method: 'GET',
        headers: this.getHeaders(false),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return {
          healthy: false,
          provider: 'cloud',
          responseTime: Date.now() - startTime,
          error:
            response.status === 401 || response.status === 403
              ? 'Invalid API key'
              : `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = (await response.json()) as Record<string, unknown>;

      return {
        healthy: true,
        provider: 'cloud',
        responseTime: Date.now() - startTime,
        metadata: data,
      };
    } catch (error) {
      const normalizedError = normalizeError(error, 'cloud', {
        context: { operation: 'healthCheck', baseUrl: this.baseUrl },
      });

      return {
        healthy: false,
        provider: 'cloud',
        responseTime: Date.now() - startTime,
        error: normalizedError.message,
      };
    }
  }

  async submit(workflow: Workflow, options?: SubmitOptions): Promise<string> {
    try {
      const assetBindings = [] as Array<{
        originalFilename: string;
        originalSubfolder?: string;
        uploaded: { filename: string; subfolder?: string; type?: string };
      }>;

      if (workflow.images?.length) {
        for (const image of workflow.images) {
          assetBindings.push({
            originalFilename: image.filename,
            originalSubfolder: image.subfolder,
            uploaded: await this.uploadImage(image),
          });
        }
      }

      if (workflow.files?.length) {
        for (const file of workflow.files) {
          assetBindings.push({
            originalFilename: file.filename,
            originalSubfolder: file.subfolder,
            uploaded: await this.uploadFile(file),
          });
        }
      }

      const prompt = assetBindings.length
        ? rewriteWorkflowWithUploadedAssets(workflow.workflow, assetBindings)
        : workflow.workflow;
      const clientId = createClientId();
      const response = await fetch(`${this.baseUrl}/api/prompt`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ prompt, client_id: clientId }),
        signal: options?.timeout
          ? AbortSignal.timeout(options.timeout)
          : AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        const errorText = await response.text();

        if (response.status === 401 || response.status === 403) {
          throw createError('AUTH_ERROR', 'Invalid Comfy Cloud API key', { provider: 'cloud' });
        }

        throw createError(
          response.status === 400 ? 'INVALID_WORKFLOW' : 'SUBMISSION_ERROR',
          `Failed to submit workflow: ${errorText}`,
          {
            provider: 'cloud',
            context: { status: response.status },
          }
        );
      }

      const result = (await response.json()) as {
        prompt_id?: string;
        id?: string;
        error?: string;
        node_errors?: unknown;
      };
      const promptId =
        typeof result.prompt_id === 'string'
          ? result.prompt_id
          : typeof result.id === 'string'
            ? result.id
            : undefined;

      if (typeof promptId !== 'string') {
        if (result.error || result.node_errors) {
          throw createError('INVALID_WORKFLOW', result.error ?? 'Workflow validation failed', {
            provider: 'cloud',
            context: { nodeErrors: result.node_errors },
          });
        }

        throw createError('INVALID_RESPONSE', 'Cloud submit response did not include prompt_id', {
          provider: 'cloud',
        });
      }

      this.jobClientIds.set(promptId, clientId);
      this.rememberJobState(promptId, { status: 'queued', error: undefined, outputs: undefined });
      return promptId;
    } catch (error) {
      throw normalizeError(error, 'cloud', {
        context: { operation: 'submit', baseUrl: this.baseUrl },
        defaultCode: 'SUBMISSION_ERROR',
      });
    }
  }

  async watchProgress(jobId: string, onProgress: (progress: JobProgress) => void): Promise<void> {
    const webSocketCtor = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;

    if (typeof webSocketCtor === 'function') {
      try {
        await this.watchProgressViaWebSocket(jobId, onProgress);
        return;
      } catch (error) {
        const normalizedError = normalizeError(error, 'cloud', {
          context: { operation: 'watchProgress', jobId },
        });

        if (
          normalizedError.code !== 'WEBSOCKET_ERROR' &&
          normalizedError.code !== 'CONNECTION_ERROR'
        ) {
          throw normalizedError;
        }
      }
    }

    await this.watchProgressByPolling(jobId, onProgress);
  }

  private async watchProgressViaWebSocket(
    jobId: string,
    onProgress: (progress: JobProgress) => void
  ): Promise<void> {
    const webSocketCtor = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;

    if (typeof webSocketCtor !== 'function') {
      throw createError('WEBSOCKET_ERROR', 'WebSocket is not available in this runtime', {
        provider: 'cloud',
        context: { jobId },
      });
    }

    const clientId = this.jobClientIds.get(jobId) ?? createClientId();
    const wsUrl = `${this.baseUrl.replace(/^http/, 'ws')}/ws?clientId=${encodeURIComponent(clientId)}&token=${encodeURIComponent(this.apiKey)}`;

    await new Promise<void>((resolve, reject) => {
      const ws = new webSocketCtor(wsUrl);
      let settled = false;
      const timeoutId = setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        ws.close();
        reject(
          createError('TIMEOUT_ERROR', 'Progress watch timed out', {
            provider: 'cloud',
            context: { jobId },
          })
        );
      }, this.timeout);

      const resolveOnce = () => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeoutId);
        resolve();
      };

      const rejectOnce = (error: ComfyBridgeError) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeoutId);
        reject(error);
      };

      ws.onmessage = (event) => {
        if (typeof event.data !== 'string') {
          return;
        }

        let payload: unknown;

        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }

        if (!isRecord(payload) || typeof payload.type !== 'string') {
          return;
        }

        const messageData = isRecord(payload.data) ? payload.data : {};
        const promptId = typeof messageData.prompt_id === 'string' ? messageData.prompt_id : undefined;

        if (promptId && promptId !== jobId) {
          return;
        }

        if (payload.type === 'executing') {
          const progress = {
            ...(this.jobStates.get(jobId)?.progress ?? {}),
            currentNode: typeof messageData.node === 'string' ? messageData.node : undefined,
          };

          this.rememberJobState(jobId, { status: 'running', progress });

          if (progress.currentNode) {
            onProgress(progress);
          }

          return;
        }

        if (payload.type === 'progress') {
          const stepsCompleted = typeof messageData.value === 'number' ? messageData.value : undefined;
          const totalSteps = typeof messageData.max === 'number' ? messageData.max : undefined;
          const progress: JobProgress = {
            currentNode:
              typeof messageData.node === 'string'
                ? messageData.node
                : this.jobStates.get(jobId)?.progress?.currentNode,
            stepsCompleted,
            totalSteps,
            progress:
              stepsCompleted !== undefined && totalSteps
                ? Math.round((stepsCompleted / totalSteps) * 100)
                : undefined,
          };

          this.rememberJobState(jobId, { status: 'running', progress });
          onProgress(progress);
          return;
        }

        if (payload.type === 'execution_success') {
          this.rememberJobState(jobId, { status: 'completed' });
          ws.close();
          resolveOnce();
          return;
        }

        if (payload.type === 'execution_error') {
          const executionError = createError(
            'EXECUTION_ERROR',
            typeof messageData.exception_message === 'string'
              ? messageData.exception_message
              : 'Cloud workflow execution failed',
            {
              provider: 'cloud',
              context: {
                jobId,
                nodeId: typeof messageData.node === 'string' ? messageData.node : undefined,
                exceptionType:
                  typeof messageData.exception_type === 'string'
                    ? messageData.exception_type
                    : undefined,
                traceback: Array.isArray(messageData.traceback) ? messageData.traceback : undefined,
              },
            }
          );

          this.rememberJobState(jobId, { status: 'failed', error: executionError });
          ws.close();
          rejectOnce(executionError);
          return;
        }

        if (payload.type === 'execution_interrupted') {
          const cancelError = createError('CANCEL_ERROR', 'Cloud workflow execution was interrupted', {
            provider: 'cloud',
            context: { jobId },
          });

          this.rememberJobState(jobId, { status: 'cancelled', error: cancelError });
          ws.close();
          rejectOnce(cancelError);
        }
      };

      ws.onerror = () => {
        rejectOnce(
          createError('WEBSOCKET_ERROR', 'WebSocket connection error', {
            provider: 'cloud',
            context: { jobId },
          })
        );
      };

      ws.onclose = (event) => {
        if (!settled && event.code !== 1000) {
          rejectOnce(
            createError('WEBSOCKET_ERROR', `WebSocket closed unexpectedly: ${event.reason}`, {
              provider: 'cloud',
              context: { jobId },
            })
          );
        }
      };
    });
  }

  private async watchProgressByPolling(
    jobId: string,
    onProgress: (progress: JobProgress) => void
  ): Promise<void> {
    const startTime = Date.now();
    let lastReportedState: JobResult['status'] | undefined;

    while (Date.now() - startTime < this.timeout) {
      const statusResponse = await this.fetchStatus(jobId);
      const status = this.mapStatus(statusResponse.status);
      const trackedState = this.rememberJobState(jobId, { status });

      if (trackedState.progress && status === 'running') {
        onProgress(trackedState.progress);
      }

      if (status === 'completed') {
        return;
      }

      if (status === 'failed') {
        throw createError(
          'EXECUTION_ERROR',
          statusResponse.error_message ?? 'Cloud workflow execution failed',
          {
            provider: 'cloud',
            context: { jobId, status: statusResponse.status },
          }
        );
      }

      if (status === 'cancelled') {
        throw createError('CANCEL_ERROR', 'Cloud workflow execution was cancelled', {
          provider: 'cloud',
          context: { jobId },
        });
      }

      if (status !== lastReportedState) {
        lastReportedState = status;
      }

      await delay(DEFAULT_POLL_INTERVAL);
    }

    throw createError('POLLING_TIMEOUT', 'Progress watch timed out', { provider: 'cloud' });
  }

  async getResult(jobId: string): Promise<JobResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/jobs/${jobId}`, {
        method: 'GET',
        headers: this.getHeaders(false),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        const trackedState = this.rememberJobState(jobId, {
          status: 'failed',
          error: createError(
            response.status === 404 ? 'JOB_NOT_FOUND' : 'OUTPUT_PARSE_ERROR',
            `Failed to get cloud job result: ${response.status}`,
            {
              provider: 'cloud',
              context: { status: response.status, jobId },
            }
          ),
        });

        return this.createJobResult(jobId, trackedState);
      }

      const data = (await response.json()) as CloudJobDetailsResponse;
      const status = this.mapStatus(data.status);
      const outputs = flattenOutputs(data.outputs, (output) => this.getOutputUrl(output));
      const error =
        status === 'failed'
          ? createError(
              'EXECUTION_ERROR',
              data.execution_error?.exception_message ?? 'Cloud workflow execution failed',
              {
                provider: 'cloud',
                context: {
                  jobId,
                  nodeId: data.execution_error?.node_id,
                  nodeType: data.execution_error?.node_type,
                  exceptionType: data.execution_error?.exception_type,
                  traceback: data.execution_error?.traceback,
                },
              }
            )
          : status === 'cancelled'
            ? createError('CANCEL_ERROR', 'Cloud workflow execution was cancelled', {
                provider: 'cloud',
                context: { jobId },
              })
            : undefined;
      const trackedState = this.rememberJobState(jobId, {
        status,
        outputs,
        error,
      });

      if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        this.jobClientIds.delete(jobId);
      }

      return this.createJobResult(jobId, trackedState);
    } catch (error) {
      const trackedState = this.rememberJobState(jobId, {
        status: 'failed',
        error: normalizeError(error, 'cloud', {
          context: { operation: 'getResult', baseUrl: this.baseUrl, jobId },
          defaultCode: 'OUTPUT_PARSE_ERROR',
        }),
      });

      return this.createJobResult(jobId, trackedState);
    }
  }

  async cancel(jobId: string): Promise<void> {
    try {
      const statusResponse = await this.fetchStatus(jobId);
      const status = this.mapStatus(statusResponse.status);

      if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        return;
      }

      if (status === 'running') {
        throw createError(
          'CANCEL_ERROR',
          'ComfyUI Cloud only documents interrupting all running jobs for the API key. Targeted cancellation of an in-progress job is intentionally not performed by this package.',
          {
            provider: 'cloud',
            context: { jobId },
          }
        );
      }

      const response = await fetch(`${this.baseUrl}/api/queue`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ delete: [jobId] }),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw createError('CANCEL_ERROR', `Failed to cancel queued cloud job: ${errorText}`, {
          provider: 'cloud',
          context: { status: response.status, jobId },
        });
      }

      this.rememberJobState(jobId, { status: 'cancelled', error: undefined });
      this.jobClientIds.delete(jobId);
    } catch (error) {
      throw normalizeError(error, 'cloud', {
        context: { operation: 'cancel', baseUrl: this.baseUrl, jobId },
        defaultCode: 'CANCEL_ERROR',
      });
    }
  }

  async uploadImage(
    image: WorkflowImage
  ): Promise<{ filename: string; subfolder?: string; type?: string }> {
    try {
      const formData = new FormData();
      formData.append('image', createBlob(image.data, image.contentType), image.filename);
      formData.append('type', 'input');

      if (image.subfolder) {
        formData.append('subfolder', image.subfolder);
      }

      if (image.overwrite !== undefined) {
        formData.append('overwrite', image.overwrite.toString());
      }

      const response = await fetch(`${this.baseUrl}/api/upload/image`, {
        method: 'POST',
        headers: this.getHeaders(false),
        body: formData,
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw createError('UPLOAD_ERROR', `Failed to upload cloud input asset: ${errorText}`, {
          provider: 'cloud',
          context: { status: response.status },
        });
      }

      const result = (await response.json()) as {
        name?: string;
        filename?: string;
        subfolder?: string;
        type?: string;
      };
      const normalizedFilename =
        typeof result.name === 'string'
          ? result.name
          : typeof result.filename === 'string'
            ? result.filename
            : undefined;

      if (typeof normalizedFilename !== 'string') {
        throw createError('INVALID_RESPONSE', 'Cloud upload response did not include a file name', {
          provider: 'cloud',
        });
      }

      return {
        filename: normalizedFilename,
        subfolder: result.subfolder,
        type: result.type ?? 'input',
      };
    } catch (error) {
      throw normalizeError(error, 'cloud', {
        context: { operation: 'upload', baseUrl: this.baseUrl },
        defaultCode: 'UPLOAD_ERROR',
      });
    }
  }

  async uploadFile(
    file: WorkflowFile
  ): Promise<{ filename: string; subfolder?: string; type?: string }> {
    return this.uploadImage(file as WorkflowImage);
  }

  getOutputUrl(output: JobOutput): string {
    const params = new URLSearchParams({
      filename: output.filename,
      type: output.type,
    });

    if (output.subfolder) {
      params.append('subfolder', output.subfolder);
    }

    return `${this.baseUrl}/api/view?${params.toString()}`;
  }
}
