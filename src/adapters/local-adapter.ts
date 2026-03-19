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
} from '../types';
import { createError, normalizeError } from '../errors';

const DEFAULT_TIMEOUT = 60000;
const DEFAULT_WS_PATH = '/ws';

/**
 * Local ComfyUI provider adapter
 */
export class LocalAdapter implements ProviderAdapter {
  public readonly provider = 'local' as const;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly wsPath: string;

  constructor(config: LocalConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.wsPath = config.wsPath ?? DEFAULT_WS_PATH;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.baseUrl}/system_stats`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          healthy: false,
          provider: 'local',
          responseTime: Date.now() - startTime,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json() as { system?: unknown; devices?: unknown };

      return {
        healthy: true,
        provider: 'local',
        responseTime: Date.now() - startTime,
        metadata: {
          system: data.system,
          devices: data.devices,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        provider: 'local',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async submit(workflow: Workflow, options?: SubmitOptions): Promise<string> {
    try {
      // Upload any images/files first
      if (workflow.images?.length) {
        for (const image of workflow.images) {
          await this.uploadImage(image);
        }
      }

      if (workflow.files?.length) {
        for (const file of workflow.files) {
          await this.uploadFile(file);
        }
      }

      const response = await fetch(`${this.baseUrl}/prompt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: workflow.workflow }),
        signal: options?.timeout
          ? AbortSignal.timeout(options.timeout)
          : AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw createError('SUBMISSION_ERROR', `Failed to submit workflow: ${errorText}`, {
          provider: 'local',
          context: { status: response.status },
        });
      }

      const result = await response.json() as { prompt_id: string };
      return result.prompt_id;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw createError('CONNECTION_ERROR', `Cannot connect to local ComfyUI at ${this.baseUrl}`, {
          provider: 'local',
          cause: error instanceof Error ? error : undefined,
        });
      }
      throw normalizeError(error, 'local');
    }
  }

  async watchProgress(
    jobId: string,
    onProgress: (progress: JobProgress) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = this.baseUrl.replace(/^http/, 'ws') + this.wsPath;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        // Subscribe to job updates
        ws.send(JSON.stringify({ type: 'subscribe', id: jobId }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'executing' && data.data?.prompt_id === jobId) {
            if (data.data.node === null) {
              // Execution complete
              ws.close();
              resolve();
            } else {
              onProgress({ currentNode: data.data.node });
            }
          } else if (data.type === 'progress') {
            onProgress({
              stepsCompleted: data.data?.value,
              totalSteps: data.data?.max,
              progress: data.data?.max
                ? Math.round((data.data.value / data.data.max) * 100)
                : undefined,
            });
          } else if (data.type === 'executed' && data.data?.prompt_id === jobId) {
            // Output ready
            ws.close();
            resolve();
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onerror = () => {
        reject(
          createError('WEBSOCKET_ERROR', 'WebSocket connection error', { provider: 'local' })
        );
      };

      ws.onclose = (event) => {
        if (event.code !== 1000) {
          reject(
            createError('WEBSOCKET_ERROR', `WebSocket closed unexpectedly: ${event.reason}`, {
              provider: 'local',
            })
          );
        }
      };

      // Timeout after the configured timeout
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
          reject(createError('POLLING_TIMEOUT', 'Progress watch timed out', { provider: 'local' }));
        }
      }, this.timeout);
    });
  }

  async getResult(jobId: string): Promise<JobResult> {
    try {
      const response = await fetch(`${this.baseUrl}/history/${jobId}`, {
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        return {
          jobId,
          status: 'failed',
          providerModeRequested: 'local',
          providerUsed: 'local',
          fallbackTriggered: false,
          error: createError('OUTPUT_PARSE_ERROR', `Failed to get job result: ${response.status}`, {
            provider: 'local',
          }),
        };
      }

      const history = await response.json() as Record<string, {
        outputs?: Record<string, { images?: Array<{ filename: string; subfolder?: string; type?: 'output' | 'temp' }> }>;
        status?: { completed?: boolean; status_str?: string };
      }>;
      const jobHistory = history[jobId];

      if (!jobHistory) {
        return {
          jobId,
          status: 'pending',
          providerModeRequested: 'local',
          providerUsed: 'local',
          fallbackTriggered: false,
        };
      }

      const outputs: JobOutput[] = [];
      const outputsData = jobHistory.outputs;

      if (outputsData) {
        for (const nodeId of Object.keys(outputsData)) {
          const nodeOutputs = outputsData[nodeId];
          if (nodeOutputs.images) {
            for (const img of nodeOutputs.images) {
              const outputType = img.type || 'output';
              outputs.push({
                filename: img.filename,
                subfolder: img.subfolder,
                type: outputType,
                url: this.getOutputUrl({
                  filename: img.filename,
                  subfolder: img.subfolder,
                  type: outputType,
                } as JobOutput),
              });
            }
          }
        }
      }

      const status: JobResult['status'] = jobHistory.status?.completed
        ? 'completed'
        : jobHistory.status?.status_str === 'error'
          ? 'failed'
          : 'running';

      return {
        jobId,
        status,
        providerModeRequested: 'local',
        providerUsed: 'local',
        fallbackTriggered: false,
        localInstanceId: this.baseUrl,
        outputs,
      };
    } catch (error) {
      return {
        jobId,
        status: 'failed',
        providerModeRequested: 'local',
        providerUsed: 'local',
        fallbackTriggered: false,
        error: normalizeError(error, 'local'),
      };
    }
  }

  async cancel(_jobId: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/interrupt`, {
        method: 'POST',
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw createError('SUBMISSION_ERROR', 'Failed to cancel job', { provider: 'local' });
      }
    } catch (error) {
      throw normalizeError(error, 'local');
    }
  }

  async uploadImage(
    image: WorkflowImage
  ): Promise<{ filename: string; subfolder?: string }> {
    try {
      const formData = new FormData();
      let blob: Blob;

      if (image.data instanceof Blob) {
        blob = image.data;
      } else if (image.data instanceof ArrayBuffer) {
        blob = new Blob([image.data]);
      } else {
        // Base64 string
        const base64 = image.data.replace(/^data:[^;]+;base64,/, '');
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        blob = new Blob([bytes]);
      }

      formData.append('image', blob, image.filename);
      if (image.subfolder) {
        formData.append('subfolder', image.subfolder);
      }
      if (image.overwrite !== undefined) {
        formData.append('overwrite', image.overwrite.toString());
      }

      const response = await fetch(`${this.baseUrl}/upload/image`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw createError('UPLOAD_ERROR', `Failed to upload image: ${response.status}`, {
          provider: 'local',
        });
      }

      const result = await response.json() as { name: string; subfolder?: string };
      return {
        filename: result.name,
        subfolder: result.subfolder,
      };
    } catch (error) {
      throw normalizeError(error, 'local');
    }
  }

  async uploadFile(
    file: WorkflowFile
  ): Promise<{ filename: string; subfolder?: string }> {
    try {
      const formData = new FormData();
      let blob: Blob;

      if (file.data instanceof Blob) {
        blob = file.data;
      } else if (file.data instanceof ArrayBuffer) {
        blob = new Blob([file.data]);
      } else {
        // Base64 string
        const base64 = file.data.replace(/^data:[^;]+;base64,/, '');
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        blob = new Blob([bytes]);
      }

      formData.append('file', blob, file.filename);
      if (file.subfolder) {
        formData.append('subfolder', file.subfolder);
      }
      if (file.overwrite !== undefined) {
        formData.append('overwrite', file.overwrite.toString());
      }

      const response = await fetch(`${this.baseUrl}/upload/file`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw createError('UPLOAD_ERROR', `Failed to upload file: ${response.status}`, {
          provider: 'local',
        });
      }

      const result = await response.json() as { name: string; subfolder?: string };
      return {
        filename: result.name,
        subfolder: result.subfolder,
      };
    } catch (error) {
      throw normalizeError(error, 'local');
    }
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
