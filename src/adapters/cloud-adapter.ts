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
} from '../types';
import { createError, normalizeError } from '../errors';

const DEFAULT_TIMEOUT = 120000;
const DEFAULT_BASE_URL = 'https://api.comfyicloud.com';

/**
 * Cloud ComfyUI provider adapter
 */
export class CloudAdapter implements ProviderAdapter {
  public readonly provider = 'cloud' as const;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeout: number;

  constructor(config: CloudConfig) {
    this.baseUrl = config.baseUrl?.replace(/\/$/, '') ?? DEFAULT_BASE_URL;
    this.apiKey = config.apiKey ?? '';
    this.timeout = DEFAULT_TIMEOUT;
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.baseUrl}/v1/health`, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 401) {
          return {
            healthy: false,
            provider: 'cloud',
            responseTime: Date.now() - startTime,
            error: 'Invalid API key',
          };
        }
        return {
          healthy: false,
          provider: 'cloud',
          responseTime: Date.now() - startTime,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = (await response.json()) as { version?: string; region?: string };

      return {
        healthy: true,
        provider: 'cloud',
        responseTime: Date.now() - startTime,
        metadata: {
          version: data.version,
          region: data.region,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        provider: 'cloud',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async submit(workflow: Workflow, options?: SubmitOptions): Promise<string> {
    try {
      // Upload any images/files first
      const uploadedAssets: Record<string, { filename: string; subfolder?: string }> = {};

      if (workflow.images?.length) {
        for (const image of workflow.images) {
          const result = await this.uploadImage(image);
          uploadedAssets[image.filename] = result;
        }
      }

      if (workflow.files?.length) {
        for (const file of workflow.files) {
          const result = await this.uploadFile(file);
          uploadedAssets[file.filename] = result;
        }
      }

      const response = await fetch(`${this.baseUrl}/v1/run`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          workflow: workflow.workflow,
          assets: uploadedAssets,
        }),
        signal: options?.timeout
          ? AbortSignal.timeout(options.timeout)
          : AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 401) {
          throw createError('AUTH_ERROR', 'Invalid API key', { provider: 'cloud' });
        }
        throw createError('SUBMISSION_ERROR', `Failed to submit workflow: ${errorText}`, {
          provider: 'cloud',
          context: { status: response.status },
        });
      }

      const result = (await response.json()) as { id: string };
      return result.id;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw createError('CLOUD_UNAVAILABLE', 'Cannot connect to ComfyUI Cloud', {
          provider: 'cloud',
          cause: error instanceof Error ? error : undefined,
        });
      }
      throw normalizeError(error, 'cloud');
    }
  }

  async watchProgress(jobId: string, onProgress: (progress: JobProgress) => void): Promise<void> {
    const pollInterval = 1000;
    const startTime = Date.now();

    while (Date.now() - startTime < this.timeout) {
      try {
        const response = await fetch(`${this.baseUrl}/v1/run/${jobId}`, {
          method: 'GET',
          headers: this.getHeaders(),
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
          if (response.status === 404) {
            throw createError('SUBMISSION_ERROR', 'Job not found', { provider: 'cloud' });
          }
          continue; // Retry on transient errors
        }

        const data = (await response.json()) as {
          status?: string;
          progress?: {
            current_node?: string;
            steps_completed?: number;
            total_steps?: number;
            percent?: number;
            preview?: string;
          };
        };

        if (
          data.status === 'completed' ||
          data.status === 'failed' ||
          data.status === 'cancelled'
        ) {
          return;
        }

        if (data.progress) {
          onProgress({
            currentNode: data.progress.current_node,
            stepsCompleted: data.progress.steps_completed,
            totalSteps: data.progress.total_steps,
            progress: data.progress.percent,
            preview: data.progress.preview,
          });
        }

        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      } catch (error) {
        if (error instanceof Error && 'code' in error) {
          throw error;
        }
        // Continue polling on transient errors
      }
    }

    throw createError('POLLING_TIMEOUT', 'Progress watch timed out', { provider: 'cloud' });
  }

  async getResult(jobId: string): Promise<JobResult> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/run/${jobId}`, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        return {
          jobId,
          status: 'failed',
          providerModeRequested: 'cloud',
          providerUsed: 'cloud',
          fallbackTriggered: false,
          error: createError('OUTPUT_PARSE_ERROR', `Failed to get job result: ${response.status}`, {
            provider: 'cloud',
          }),
        };
      }

      const data = (await response.json()) as {
        status?: string;
        outputs?: Array<{
          filename: string;
          subfolder?: string;
          type?: 'output' | 'temp';
          mime_type?: string;
          size?: number;
        }>;
        error?: string;
      };

      const statusMap: Record<string, JobResult['status']> = {
        pending: 'queued',
        queued: 'queued',
        running: 'running',
        completed: 'completed',
        failed: 'failed',
        cancelled: 'cancelled',
      };

      const outputs: JobOutput[] = [];
      if (data.outputs) {
        for (const output of data.outputs) {
          const outputType: 'output' | 'temp' = output.type || 'output';
          outputs.push({
            filename: output.filename,
            subfolder: output.subfolder,
            type: outputType,
            url: this.getOutputUrl({
              filename: output.filename,
              subfolder: output.subfolder,
              type: outputType,
            } as JobOutput),
            mimeType: output.mime_type,
            size: output.size,
          });
        }
      }

      return {
        jobId,
        status: statusMap[data.status || ''] || 'failed',
        providerModeRequested: 'cloud',
        providerUsed: 'cloud',
        fallbackTriggered: false,
        outputs,
        error: data.error
          ? createError('SUBMISSION_ERROR', data.error, { provider: 'cloud' })
          : undefined,
      };
    } catch (error) {
      return {
        jobId,
        status: 'failed',
        providerModeRequested: 'cloud',
        providerUsed: 'cloud',
        fallbackTriggered: false,
        error: normalizeError(error, 'cloud'),
      };
    }
  }

  async cancel(jobId: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/run/${jobId}/cancel`, {
        method: 'POST',
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw createError('SUBMISSION_ERROR', 'Failed to cancel job', { provider: 'cloud' });
      }
    } catch (error) {
      throw normalizeError(error, 'cloud');
    }
  }

  async uploadImage(image: WorkflowImage): Promise<{ filename: string; subfolder?: string }> {
    try {
      const formData = new FormData();
      let blob: Blob;

      if (image.data instanceof Blob) {
        blob = image.data;
      } else if (image.data instanceof ArrayBuffer) {
        blob = new Blob([image.data]);
      } else if (image.data instanceof Uint8Array) {
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

      formData.append('file', blob, image.filename);

      const response = await fetch(`${this.baseUrl}/v1/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: formData,
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw createError('UPLOAD_ERROR', `Failed to upload image: ${response.status}`, {
          provider: 'cloud',
        });
      }

      const result = (await response.json()) as { filename: string; subfolder?: string };
      return {
        filename: result.filename,
        subfolder: result.subfolder,
      };
    } catch (error) {
      throw normalizeError(error, 'cloud');
    }
  }

  async uploadFile(file: WorkflowFile): Promise<{ filename: string; subfolder?: string }> {
    // Cloud adapter uses same upload endpoint for all files
    return this.uploadImage(file as WorkflowImage);
  }

  getOutputUrl(output: JobOutput): string {
    const params = new URLSearchParams({
      filename: output.filename,
    });
    if (output.subfolder) {
      params.append('subfolder', output.subfolder);
    }
    return `${this.baseUrl}/v1/output?${params.toString()}`;
  }
}
