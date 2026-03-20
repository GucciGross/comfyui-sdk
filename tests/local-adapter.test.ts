import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalAdapter } from '../src/adapters/local-adapter';

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

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  public readonly url: string;
  public readyState = 1;
  public onopen: (() => void) | null = null;
  public onmessage: ((event: { data: string }) => void) | null = null;
  public onerror: (() => void) | null = null;
  public onclose: ((event: { code: number; reason: string }) => void) | null = null;
  public send = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.onopen?.();
    });
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.({ code: 1000, reason: '' });
  }

  emitMessage(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  emitError(): void {
    this.onerror?.();
  }
}

describe('LocalAdapter', () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    mockFetch.mockReset();
    MockWebSocket.instances = [];
    globalThis.WebSocket = MockWebSocket as never;
  });

  afterEach(() => {
    vi.clearAllMocks();
    globalThis.WebSocket = originalWebSocket;
  });

  it('returns health metadata with the configured instance id', async () => {
    const adapter = new LocalAdapter({
      baseUrl: 'http://localhost:8188',
      instanceId: 'local-1',
      timeout: 1000,
    });

    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        system: { os: 'linux' },
        devices: [{ name: 'GPU' }],
      })
    );

    const result = await adapter.healthCheck();

    expect(result.healthy).toBe(true);
    expect(result.provider).toBe('local');
    expect(result.instanceId).toBe('local-1');
    expect(result.metadata).toEqual({
      system: { os: 'linux' },
      devices: [{ name: 'GPU' }],
    });
    expect(mockFetch.mock.calls[0]?.[0]).toBe('http://localhost:8188/system_stats');
  });

  it('uploads workflow assets and rewrites prompt references before submit', async () => {
    const adapter = new LocalAdapter({
      baseUrl: 'http://localhost:8188',
      instanceId: 'local-1',
      timeout: 1000,
    });

    mockFetch.mockResolvedValueOnce(
      createJsonResponse({ name: 'remote-source.png', subfolder: 'inputs', type: 'input' })
    );
    mockFetch.mockResolvedValueOnce(createJsonResponse({ prompt_id: 'job-123' }));

    const jobId = await adapter.submit({
      workflow: {
        '1': {
          inputs: {
            image: 'source.png',
            asset: { filename: 'source.png' },
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

    expect(jobId).toBe('job-123');
    expect(mockFetch.mock.calls[0]?.[0]).toBe('http://localhost:8188/upload/image');
    expect(mockFetch.mock.calls[1]?.[0]).toBe('http://localhost:8188/prompt');

    const submitBody = JSON.parse(String(mockFetch.mock.calls[1]?.[1]?.body));
    expect(submitBody.prompt['1'].inputs.image).toBe('inputs/remote-source.png');
    expect(submitBody.prompt['1'].inputs.asset).toEqual({
      filename: 'remote-source.png',
      subfolder: 'inputs',
      type: 'input',
    });
    expect(typeof submitBody.client_id).toBe('string');
  });

  it('watches local progress over websocket without sending a subscribe message', async () => {
    const adapter = new LocalAdapter({
      baseUrl: 'http://localhost:8188',
      instanceId: 'local-1',
      timeout: 1000,
    });

    mockFetch.mockResolvedValueOnce(createJsonResponse({ prompt_id: 'job-123' }));
    await adapter.submit({ workflow: { test: 'workflow' } });

    const progressSpy = vi.fn();
    const watchPromise = adapter.watchProgress('job-123', progressSpy);
    const socket = MockWebSocket.instances[0];

    expect(socket?.url).toContain('ws://localhost:8188/ws?clientId=');

    socket.emitMessage({
      type: 'progress',
      data: { prompt_id: 'job-123', value: 2, max: 4 },
    });
    socket.emitMessage({
      type: 'execution_success',
      data: { prompt_id: 'job-123' },
    });

    await expect(watchPromise).resolves.toBeUndefined();
    expect(progressSpy).toHaveBeenCalledWith({
      currentNode: undefined,
      stepsCompleted: 2,
      totalSteps: 4,
      progress: 50,
    });
    expect(socket.send).not.toHaveBeenCalled();
  });

  it('falls back to polling when websocket progress fails', async () => {
    const adapter = new LocalAdapter({
      baseUrl: 'http://localhost:8188',
      instanceId: 'local-1',
      timeout: 1000,
    });

    mockFetch.mockResolvedValueOnce(createJsonResponse({ prompt_id: 'job-456' }));
    await adapter.submit({ workflow: { test: 'workflow' } });

    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        'job-456': {
          status: { completed: true },
          outputs: {},
        },
      })
    );

    const watchPromise = adapter.watchProgress('job-456', vi.fn());
    MockWebSocket.instances[0]?.emitError();

    await expect(watchPromise).resolves.toBeUndefined();
    expect(mockFetch.mock.calls[1]?.[0]).toBe('http://localhost:8188/history/job-456');
  });

  it('parses history results into normalized outputs', async () => {
    const adapter = new LocalAdapter({
      baseUrl: 'http://localhost:8188',
      instanceId: 'local-1',
      timeout: 1000,
    });

    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        'job-789': {
          status: { completed: true },
          outputs: {
            '9': {
              images: [{ filename: 'image.png', subfolder: 'output', type: 'output' }],
              audio: [{ filename: 'sound.wav', subfolder: 'output', mime_type: 'audio/wav' }],
            },
          },
        },
      })
    );

    const result = await adapter.getResult('job-789');

    expect(result.status).toBe('completed');
    expect(result.localInstanceId).toBe('local-1');
    expect(result.outputs).toEqual([
      {
        filename: 'image.png',
        subfolder: 'output',
        type: 'output',
        url: 'http://localhost:8188/view?filename=image.png&type=output&subfolder=output',
        mimeType: undefined,
        size: undefined,
      },
      {
        filename: 'sound.wav',
        subfolder: 'output',
        type: 'output',
        url: 'http://localhost:8188/view?filename=sound.wav&type=output&subfolder=output',
        mimeType: 'audio/wav',
        size: undefined,
      },
    ]);
  });

  it('cancels queued jobs through the queue endpoint', async () => {
    const adapter = new LocalAdapter({
      baseUrl: 'http://localhost:8188',
      instanceId: 'local-1',
      timeout: 1000,
    });

    mockFetch.mockResolvedValueOnce(createJsonResponse({}));
    mockFetch.mockResolvedValueOnce(createJsonResponse({}));

    await adapter.cancel('job-queue');

    expect(mockFetch.mock.calls[1]?.[0]).toBe('http://localhost:8188/queue');
    expect(JSON.parse(String(mockFetch.mock.calls[1]?.[1]?.body))).toEqual({
      delete: ['job-queue'],
    });
  });
});
