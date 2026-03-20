import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudAdapter } from '../src/adapters/cloud-adapter';

const mockFetch = vi.fn();
global.fetch = mockFetch as typeof fetch;

function createJsonResponse(body: unknown, init?: { ok?: boolean; status?: number; statusText?: string }) {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    statusText: init?.statusText ?? 'OK',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

describe('CloudAdapter', () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    mockFetch.mockReset();
    globalThis.WebSocket = undefined as never;
  });

  afterEach(() => {
    vi.clearAllMocks();
    globalThis.WebSocket = originalWebSocket;
  });

  it('checks health via the documented /api/queue endpoint using X-API-Key', async () => {
    const adapter = new CloudAdapter({ apiKey: 'cloud-key', timeout: 1000 });

    mockFetch.mockResolvedValueOnce(createJsonResponse({ queue_running: [] }));

    const result = await adapter.healthCheck();

    expect(result.healthy).toBe(true);
    expect(result.provider).toBe('cloud');
    expect(mockFetch.mock.calls[0]?.[0]).toBe('https://cloud.comfy.org/api/queue');
    expect(mockFetch.mock.calls[0]?.[1]?.headers).toEqual({ 'X-API-Key': 'cloud-key' });
  });

  it('submits prompts through /api/prompt with uploaded asset rewriting', async () => {
    const adapter = new CloudAdapter({ apiKey: 'cloud-key', timeout: 1000 });

    mockFetch.mockResolvedValueOnce(
      createJsonResponse({ name: 'remote.png', subfolder: 'inputs', type: 'input' })
    );
    mockFetch.mockResolvedValueOnce(createJsonResponse({ prompt_id: 'cloud-job-123' }));

    const jobId = await adapter.submit({
      workflow: {
        '1': {
          inputs: {
            image: 'source.png',
          },
        },
      },
      images: [
        {
          filename: 'source.png',
          contentType: 'image/png',
          data: new Uint8Array([1, 2, 3]),
        },
      ],
    });

    expect(jobId).toBe('cloud-job-123');
    expect(mockFetch.mock.calls[0]?.[0]).toBe('https://cloud.comfy.org/api/upload/image');
    expect(mockFetch.mock.calls[0]?.[1]?.headers).toEqual({ 'X-API-Key': 'cloud-key' });
    expect(mockFetch.mock.calls[1]?.[0]).toBe('https://cloud.comfy.org/api/prompt');

    const submitBody = JSON.parse(String(mockFetch.mock.calls[1]?.[1]?.body));
    expect(submitBody.prompt['1'].inputs.image).toBe('inputs/remote.png');
    expect(typeof submitBody.client_id).toBe('string');
  });

  it('accepts id as a fallback prompt identifier for compatibility', async () => {
    const adapter = new CloudAdapter({ apiKey: 'cloud-key', timeout: 1000 });

    mockFetch.mockResolvedValueOnce(createJsonResponse({ id: 'cloud-job-legacy' }));

    await expect(adapter.submit({ workflow: { test: 'workflow' } })).resolves.toBe('cloud-job-legacy');
  });

  it('normalizes completed results from /api/jobs/:id', async () => {
    const adapter = new CloudAdapter({ apiKey: 'cloud-key', timeout: 1000 });

    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        status: 'completed',
        outputs: {
          '9': {
            images: [{ filename: 'image.png', subfolder: 'output', type: 'output' }],
            videos: [{ filename: 'clip.mp4', subfolder: 'output', mime_type: 'video/mp4', size: 1024 }],
          },
        },
      })
    );

    const result = await adapter.getResult('cloud-job-456');

    expect(result.status).toBe('completed');
    expect(result.outputs).toEqual([
      {
        filename: 'image.png',
        subfolder: 'output',
        type: 'output',
        url: 'https://cloud.comfy.org/api/view?filename=image.png&type=output&subfolder=output',
        mimeType: undefined,
        size: undefined,
      },
      {
        filename: 'clip.mp4',
        subfolder: 'output',
        type: 'output',
        url: 'https://cloud.comfy.org/api/view?filename=clip.mp4&type=output&subfolder=output',
        mimeType: 'video/mp4',
        size: 1024,
      },
    ]);
  });

  it('exposes execution errors from /api/jobs/:id', async () => {
    const adapter = new CloudAdapter({ apiKey: 'cloud-key', timeout: 1000 });

    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        status: 'failed',
        execution_error: {
          node_id: '12',
          node_type: 'KSampler',
          exception_message: 'Sampler exploded',
          exception_type: 'RuntimeError',
        },
      })
    );

    const result = await adapter.getResult('cloud-job-error');

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('EXECUTION_ERROR');
    expect(result.error?.message).toBe('Sampler exploded');
    expect(result.error?.context).toEqual({
      jobId: 'cloud-job-error',
      nodeId: '12',
      nodeType: 'KSampler',
      exceptionType: 'RuntimeError',
      traceback: undefined,
    });
  });

  it('polls the documented status endpoint when websocket progress is unavailable', async () => {
    const adapter = new CloudAdapter({ apiKey: 'cloud-key', timeout: 2500 });

    mockFetch.mockResolvedValueOnce(createJsonResponse({ status: 'in_progress' }));
    mockFetch.mockResolvedValueOnce(createJsonResponse({ status: 'completed' }));

    await expect(adapter.watchProgress('cloud-job-poll', vi.fn())).resolves.toBeUndefined();
    expect(mockFetch.mock.calls[0]?.[0]).toBe('https://cloud.comfy.org/api/job/cloud-job-poll/status');
    expect(mockFetch.mock.calls[1]?.[0]).toBe('https://cloud.comfy.org/api/job/cloud-job-poll/status');
  });

  it('cancels queued jobs through /api/queue and refuses targeted running-job interrupts', async () => {
    const adapter = new CloudAdapter({ apiKey: 'cloud-key', timeout: 1000 });

    mockFetch.mockResolvedValueOnce(createJsonResponse({ status: 'waiting_to_dispatch' }));
    mockFetch.mockResolvedValueOnce(createJsonResponse({ deleted: ['cloud-job-queue'] }));

    await expect(adapter.cancel('cloud-job-queue')).resolves.toBeUndefined();
    expect(mockFetch.mock.calls[1]?.[0]).toBe('https://cloud.comfy.org/api/queue');
    expect(JSON.parse(String(mockFetch.mock.calls[1]?.[1]?.body))).toEqual({
      delete: ['cloud-job-queue'],
    });

    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(createJsonResponse({ status: 'in_progress' }));

    await expect(adapter.cancel('cloud-job-running')).rejects.toMatchObject({
      code: 'CANCEL_ERROR',
    });
  });
});
