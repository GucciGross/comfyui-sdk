import type {
  ProviderAdapter,
  LocalConfig,
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

const DEFAULT_TIMEOUT = 60000;
const DEFAULT_POLL_INTERVAL = 1000;

type TrackedJobState = {
  status: JobResult['status'];
  progress?: JobProgress;
  outputs?: JobOutput[];
  error?: ComfyBridgeError;
};

type LocalHistoryItem = {
  outputs?: Record<string, unknown>;
  status?: {
    completed?: boolean;
    status_str?: string;
    messages?: unknown;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Local ComfyUI provider adapter
 */
export class LocalAdapter implements ProviderAdapter {
  public readonly provider = 'local' as const;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly wsPath: string;
  private readonly instanceId?: string;
  private readonly jobClientIds = new Map<string, string>();
  private readonly jobStates = new Map<string, TrackedJobState>();

  constructor(config: LocalConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.wsPath = config.wsPath ?? '/ws';
    this.instanceId = config.instanceId;
  }

  private createJobResult(jobId: string, state: TrackedJobState): JobResult {
    return {
      jobId,
      status: state.status,
      providerModeRequested: 'local',
      providerUsed: 'local',
      fallbackTriggered: false,
      localInstanceId: this.instanceId,
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

  private async uploadAsset(
    asset: WorkflowImage | WorkflowFile
  ): Promise<{ filename: string; subfolder?: string; type?: string }> {
    try {
      const formData = new FormData();
      formData.append('image', createBlob(asset.data, asset.contentType), asset.filename);
      formData.append('type', 'input');

      if (asset.subfolder) {
        formData.append('subfolder', asset.subfolder);
      }

      if (asset.overwrite !== undefined) {
        formData.append('overwrite', asset.overwrite.toString());
      }

      const response = await fetch(`${this.baseUrl}/upload/image`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw createError('UPLOAD_ERROR', `Failed to upload input asset: ${errorText}`, {
          provider: 'local',
          context: { status: response.status, instanceId: this.instanceId },
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
        throw createError('INVALID_RESPONSE', 'Local upload response did not include a file name', {
          provider: 'local',
          context: { instanceId: this.instanceId },
        });
      }

      return {
        filename: normalizedFilename,
        subfolder: result.subfolder,
        type: result.type ?? 'input',
      };
    } catch (error) {
      throw normalizeError(error, 'local', {
        context: { operation: 'upload', baseUrl: this.baseUrl, instanceId: this.instanceId },
        defaultCode: 'UPLOAD_ERROR',
      });
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      const response = await fetch(`${this.baseUrl}/system_stats`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return {
          healthy: false,
          provider: 'local',
          instanceId: this.instanceId,
          responseTime: Date.now() - startTime,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = (await response.json()) as { system?: unknown; devices?: unknown };

      return {
        healthy: true,
        provider: 'local',
        instanceId: this.instanceId,
        responseTime: Date.now() - startTime,
        metadata: {
          system: data.system,
          devices: data.devices,
        },
      };
    } catch (error) {
      const normalizedError = normalizeError(error, 'local', {
        context: { operation: 'healthCheck', baseUrl: this.baseUrl, instanceId: this.instanceId },
      });

      return {
        healthy: false,
        provider: 'local',
        instanceId: this.instanceId,
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
      const response = await fetch(`${this.baseUrl}/prompt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          client_id: clientId,
        }),
        signal: options?.timeout
          ? AbortSignal.timeout(options.timeout)
          : AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw createError(
          response.status === 400 ? 'INVALID_WORKFLOW' : 'SUBMISSION_ERROR',
          `Failed to submit workflow: ${errorText}`,
          {
            provider: 'local',
            context: { status: response.status, instanceId: this.instanceId },
          }
        );
      }

      const result = (await response.json()) as {
        prompt_id?: string;
        error?: string;
        node_errors?: unknown;
      };

      if (typeof result.prompt_id !== 'string') {
        if (result.error || result.node_errors) {
          throw createError('INVALID_WORKFLOW', result.error ?? 'Workflow validation failed', {
            provider: 'local',
            context: {
              nodeErrors: result.node_errors,
              instanceId: this.instanceId,
            },
          });
        }

        throw createError('INVALID_RESPONSE', 'Local submit response did not include prompt_id', {
          provider: 'local',
          context: { instanceId: this.instanceId },
        });
      }

      this.jobClientIds.set(result.prompt_id, clientId);
      this.rememberJobState(result.prompt_id, { status: 'queued', error: undefined, outputs: undefined });

      return result.prompt_id;
    } catch (error) {
      throw normalizeError(error, 'local', {
        context: { operation: 'submit', baseUrl: this.baseUrl, instanceId: this.instanceId },
        defaultCode: 'SUBMISSION_ERROR',
      });
    }
  }

  async watchProgress(jobId: string, onProgress: (progress: JobProgress) => void): Promise<void> {
    const clientId = this.jobClientIds.get(jobId);
    const webSocketCtor = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;

    if (clientId && typeof webSocketCtor === 'function') {
      try {
        await this.watchProgressViaWebSocket(jobId, clientId, onProgress);
        return;
      } catch (error) {
        const normalizedError = normalizeError(error, 'local', {
          context: { operation: 'watchProgress', jobId, instanceId: this.instanceId },
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
    clientId: string,
    onProgress: (progress: JobProgress) => void
  ): Promise<void> {
    const webSocketCtor = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;

    if (typeof webSocketCtor !== 'function') {
      throw createError('WEBSOCKET_ERROR', 'WebSocket is not available in this runtime', {
        provider: 'local',
        context: { jobId, instanceId: this.instanceId },
      });
    }

    const separator = this.wsPath.includes('?') ? '&' : '?';
    const wsUrl = `${this.baseUrl.replace(/^http/, 'ws')}${this.wsPath}${separator}clientId=${encodeURIComponent(clientId)}`;

    await new Promise<void>((resolve, reject) => {
      const ws = new webSocketCtor(wsUrl);
      let settled = false;
      let terminalEventTimeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeoutId = setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        ws.close();
        reject(
          createError('TIMEOUT_ERROR', 'Progress watch timed out', {
            provider: 'local',
            context: { jobId, instanceId: this.instanceId },
          })
        );
      }, this.timeout);

      const resolveOnce = () => {
        if (settled) {
          return;
        }

        settled = true;
        if (terminalEventTimeoutId) {
          clearTimeout(terminalEventTimeoutId);
        }
        clearTimeout(timeoutId);
        resolve();
      };

      const rejectOnce = (error: ComfyBridgeError) => {
        if (settled) {
          return;
        }

        settled = true;
        if (terminalEventTimeoutId) {
          clearTimeout(terminalEventTimeoutId);
        }
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

        if (payload.type === 'execution_start') {
          this.rememberJobState(jobId, { status: 'running' });
          return;
        }

        if (payload.type === 'executing') {
          const currentNode = typeof messageData.node === 'string' ? messageData.node : undefined;
          const progress = {
            ...(this.jobStates.get(jobId)?.progress ?? {}),
            currentNode,
          };

          if (terminalEventTimeoutId) {
            clearTimeout(terminalEventTimeoutId);
            terminalEventTimeoutId = undefined;
          }

          this.rememberJobState(jobId, { status: 'running', progress });

          if (currentNode) {
            onProgress(progress);
          } else {
            terminalEventTimeoutId = setTimeout(() => {
              if (settled) {
                return;
              }

              this.rememberJobState(jobId, { status: 'completed', progress });
              ws.close();
              resolveOnce();
            }, 250);
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
              : 'Workflow execution failed',
            {
              provider: 'local',
              context: {
                jobId,
                nodeId: typeof messageData.node_id === 'string' ? messageData.node_id : undefined,
                nodeType: typeof messageData.node_type === 'string' ? messageData.node_type : undefined,
                traceback: Array.isArray(messageData.traceback) ? messageData.traceback : undefined,
                instanceId: this.instanceId,
              },
            }
          );

          this.rememberJobState(jobId, { status: 'failed', error: executionError });
          ws.close();
          rejectOnce(executionError);
          return;
        }

        if (payload.type === 'execution_interrupted') {
          const cancelError = createError('CANCEL_ERROR', 'Workflow execution was interrupted', {
            provider: 'local',
            context: {
              jobId,
              nodeId: typeof messageData.node_id === 'string' ? messageData.node_id : undefined,
              nodeType: typeof messageData.node_type === 'string' ? messageData.node_type : undefined,
              instanceId: this.instanceId,
            },
          });

          this.rememberJobState(jobId, { status: 'cancelled', error: cancelError });
          ws.close();
          rejectOnce(cancelError);
        }
      };

      ws.onerror = () => {
        rejectOnce(
          createError('WEBSOCKET_ERROR', 'WebSocket connection error', {
            provider: 'local',
            context: { jobId, instanceId: this.instanceId },
          })
        );
      };

      ws.onclose = (event) => {
        if (!settled && event.code !== 1000) {
          rejectOnce(
            createError('WEBSOCKET_ERROR', `WebSocket closed unexpectedly: ${event.reason}`, {
              provider: 'local',
              context: { jobId, instanceId: this.instanceId },
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
    let lastProgressFingerprint: string | undefined;

    while (Date.now() - startTime < this.timeout) {
      const result = await this.getResult(jobId);

      if (result.progress) {
        const fingerprint = JSON.stringify(result.progress);
        if (fingerprint !== lastProgressFingerprint) {
          lastProgressFingerprint = fingerprint;
          onProgress(result.progress);
        }
      }

      if (result.status === 'completed') {
        return;
      }

      if (result.status === 'failed') {
        throw (
          result.error ??
          createError('EXECUTION_ERROR', 'Workflow execution failed', {
            provider: 'local',
            context: { jobId, instanceId: this.instanceId },
          })
        );
      }

      if (result.status === 'cancelled') {
        throw (
          result.error ??
          createError('CANCEL_ERROR', 'Workflow execution was cancelled', {
            provider: 'local',
            context: { jobId, instanceId: this.instanceId },
          })
        );
      }

      await delay(DEFAULT_POLL_INTERVAL);
    }

    throw createError('POLLING_TIMEOUT', 'Progress watch timed out', {
      provider: 'local',
      context: { jobId, instanceId: this.instanceId },
    });
  }

  async getResult(jobId: string): Promise<JobResult> {
    try {
      const response = await fetch(`${this.baseUrl}/history/${jobId}`, {
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        const trackedState = this.rememberJobState(jobId, {
          status: 'failed',
          error: createError(
            response.status === 404 ? 'JOB_NOT_FOUND' : 'OUTPUT_PARSE_ERROR',
            `Failed to get job result: ${response.status}`,
            {
              provider: 'local',
              context: { status: response.status, jobId, instanceId: this.instanceId },
            }
          ),
        });

        return this.createJobResult(jobId, trackedState);
      }

      const history = (await response.json()) as Record<string, LocalHistoryItem>;
      const jobHistory = history[jobId];

      if (!jobHistory) {
        const trackedState = this.jobStates.get(jobId) ?? this.rememberJobState(jobId, { status: 'queued' });
        return this.createJobResult(jobId, trackedState);
      }

      const outputs = flattenOutputs(jobHistory.outputs, (output) => this.getOutputUrl(output));
      let status: JobResult['status'];

      if (jobHistory.status?.completed) {
        status = 'completed';
      } else if (
        jobHistory.status?.status_str === 'cancelled' ||
        jobHistory.status?.status_str === 'interrupted'
      ) {
        status = 'cancelled';
      } else if (jobHistory.status?.status_str === 'error') {
        status = 'failed';
      } else {
        status = 'running';
      }

      const trackedState = this.rememberJobState(jobId, {
        status,
        outputs,
        error:
          status === 'failed'
            ? createError('EXECUTION_ERROR', 'Workflow execution failed', {
                provider: 'local',
                context: {
                  jobId,
                  status: jobHistory.status,
                  instanceId: this.instanceId,
                },
              })
            : status === 'cancelled'
              ? createError('CANCEL_ERROR', 'Workflow execution was cancelled', {
                  provider: 'local',
                  context: { jobId, instanceId: this.instanceId },
                })
              : undefined,
      });

      if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        this.jobClientIds.delete(jobId);
      }

      return this.createJobResult(jobId, trackedState);
    } catch (error) {
      const trackedState = this.rememberJobState(jobId, {
        status: 'failed',
        error: normalizeError(error, 'local', {
          context: {
            operation: 'getResult',
            baseUrl: this.baseUrl,
            jobId,
            instanceId: this.instanceId,
          },
          defaultCode: 'OUTPUT_PARSE_ERROR',
        }),
      });

      return this.createJobResult(jobId, trackedState);
    }
  }

  async cancel(jobId: string): Promise<void> {
    try {
      const currentResult = await this.getResult(jobId);

      if (
        currentResult.status === 'completed' ||
        currentResult.status === 'failed' ||
        currentResult.status === 'cancelled'
      ) {
        return;
      }

      if (currentResult.status === 'running') {
        const response = await fetch(`${this.baseUrl}/interrupt`, {
          method: 'POST',
          signal: AbortSignal.timeout(this.timeout),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw createError('CANCEL_ERROR', `Failed to interrupt running job: ${errorText}`, {
            provider: 'local',
            context: { status: response.status, jobId, instanceId: this.instanceId },
          });
        }
      } else {
        const response = await fetch(`${this.baseUrl}/queue`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ delete: [jobId] }),
          signal: AbortSignal.timeout(this.timeout),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw createError('CANCEL_ERROR', `Failed to remove queued job: ${errorText}`, {
            provider: 'local',
            context: { status: response.status, jobId, instanceId: this.instanceId },
          });
        }
      }

      this.rememberJobState(jobId, { status: 'cancelled', error: undefined });
      this.jobClientIds.delete(jobId);
    } catch (error) {
      throw normalizeError(error, 'local', {
        context: { operation: 'cancel', baseUrl: this.baseUrl, jobId, instanceId: this.instanceId },
        defaultCode: 'CANCEL_ERROR',
      });
    }
  }

  async uploadImage(
    image: WorkflowImage
  ): Promise<{ filename: string; subfolder?: string; type?: string }> {
    return this.uploadAsset(image);
  }

  async uploadFile(
    file: WorkflowFile
  ): Promise<{ filename: string; subfolder?: string; type?: string }> {
    return this.uploadAsset(file);
  }

  getOutputUrl(output: JobOutput): string {
    const params = new URLSearchParams({
      filename: output.filename,
      type: output.type,
    });

    if (output.subfolder) {
      params.append('subfolder', output.subfolder);
    }

    return `${this.baseUrl}/view?${params.toString()}`;
  }
}
