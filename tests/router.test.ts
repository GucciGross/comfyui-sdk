import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ComfyBridge, createComfyBridge } from '../src/router';
import type { ComfyBridgeConfig, HealthCheckResult } from '../src/types';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ComfyBridge Router', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Configuration Validation', () => {
    it('throws error for local mode without localInstances config', () => {
      expect(() => {
        createComfyBridge({
          mode: 'local',
          fallbackToCloud: false,
          retryOnConnectionFailure: false,
          localTimeoutMs: 60000,
        });
      }).toThrow('Local mode requires localInstances configuration');
    });

    it('throws error for cloud mode without cloud config', () => {
      expect(() => {
        createComfyBridge({
          mode: 'cloud',
          fallbackToCloud: false,
          retryOnConnectionFailure: false,
          localTimeoutMs: 60000,
        });
      }).toThrow('Cloud mode requires cloud configuration');
    });

    it('throws error for auto mode without any config', () => {
      expect(() => {
        createComfyBridge({
          mode: 'auto',
          fallbackToCloud: false,
          retryOnConnectionFailure: false,
          localTimeoutMs: 60000,
        });
      }).toThrow('Auto mode requires at least localInstances or cloud configuration');
    });

    it('creates bridge with valid local config', () => {
      const bridge = createComfyBridge({
        mode: 'local',
        fallbackToCloud: false,
        retryOnConnectionFailure: false,
        localTimeoutMs: 60000,
        localInstances: [{ id: 'local-1', name: 'Local', baseUrl: 'http://localhost:8188' }],
      });
      expect(bridge).toBeInstanceOf(ComfyBridge);
    });

    it('creates bridge with valid cloud config', () => {
      const bridge = createComfyBridge({
        mode: 'cloud',
        fallbackToCloud: false,
        retryOnConnectionFailure: false,
        localTimeoutMs: 60000,
        cloud: { apiKey: 'test-key' },
      });
      expect(bridge).toBeInstanceOf(ComfyBridge);
    });

    it('creates bridge with valid auto config (local only)', () => {
      const bridge = createComfyBridge({
        mode: 'auto',
        fallbackToCloud: false,
        retryOnConnectionFailure: false,
        localTimeoutMs: 60000,
        localInstances: [{ id: 'local-1', name: 'Local', baseUrl: 'http://localhost:8188' }],
      });
      expect(bridge).toBeInstanceOf(ComfyBridge);
    });

    it('creates bridge with valid auto config (cloud only)', () => {
      const bridge = createComfyBridge({
        mode: 'auto',
        fallbackToCloud: false,
        retryOnConnectionFailure: false,
        localTimeoutMs: 60000,
        cloud: { apiKey: 'test-key' },
      });
      expect(bridge).toBeInstanceOf(ComfyBridge);
    });

    it('supports preferredLocalInstanceId', () => {
      const bridge = createComfyBridge({
        mode: 'auto',
        fallbackToCloud: true,
        retryOnConnectionFailure: true,
        localTimeoutMs: 30000,
        preferredLocalInstanceId: 'local-2',
        localInstances: [
          { id: 'local-1', name: 'Local 1', baseUrl: 'http://localhost:8188' },
          { id: 'local-2', name: 'Local 2', baseUrl: 'http://localhost:8189' },
        ],
        cloud: { apiKey: 'test-key' },
      });
      expect(bridge).toBeInstanceOf(ComfyBridge);
    });
  });

  describe('Local Mode', () => {
    let bridge: ComfyBridge;

    beforeEach(() => {
      bridge = createComfyBridge({
        mode: 'local',
        fallbackToCloud: false,
        retryOnConnectionFailure: false,
        localTimeoutMs: 60000,
        localInstances: [{ id: 'local-1', name: 'Local', baseUrl: 'http://localhost:8188' }],
      });
    });

    it('returns healthy status for healthy local instance', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ system: { os: 'linux' }, devices: [] }),
      });

      const results = await bridge.healthCheck();
      expect(results).toHaveLength(1);
      expect(results[0].healthy).toBe(true);
      expect(results[0].provider).toBe('local');
    });

    it('returns unhealthy status for unreachable local instance', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const results = await bridge.healthCheck();
      expect(results).toHaveLength(1);
      expect(results[0].healthy).toBe(false);
      expect(results[0].provider).toBe('local');
    });

    it('submits workflow to local provider', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ prompt_id: 'job-123' }),
      });

      const result = await bridge.submit({ workflow: { test: 'workflow' } });

      expect(result.jobId).toBe('job-123');
      expect(result.providerUsed).toBe('local');
      expect(result.providerModeRequested).toBe('local');
      expect(result.fallbackTriggered).toBe(false);
    });
  });

  describe('Cloud Mode', () => {
    let bridge: ComfyBridge;

    beforeEach(() => {
      bridge = createComfyBridge({
        mode: 'cloud',
        fallbackToCloud: false,
        retryOnConnectionFailure: false,
        localTimeoutMs: 60000,
        cloud: { apiKey: 'test-key' },
      });
    });

    it('returns healthy status for healthy cloud instance', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ version: '1.0', region: 'us-east' }),
      });

      const results = await bridge.healthCheck();
      expect(results).toHaveLength(1);
      expect(results[0].healthy).toBe(true);
      expect(results[0].provider).toBe('cloud');
    });

    it('submits workflow to cloud provider', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ prompt_id: 'cloud-job-456' }),
      });

      const result = await bridge.submit({ workflow: { test: 'workflow' } });

      expect(result.jobId).toBe('cloud-job-456');
      expect(result.providerUsed).toBe('cloud');
      expect(result.providerModeRequested).toBe('cloud');
      expect(result.fallbackTriggered).toBe(false);
    });
  });

  describe('Auto Mode - Local Healthy', () => {
    let bridge: ComfyBridge;

    beforeEach(() => {
      bridge = createComfyBridge({
        mode: 'auto',
        fallbackToCloud: true,
        retryOnConnectionFailure: true,
        localTimeoutMs: 60000,
        localInstances: [{ id: 'local-1', name: 'Local', baseUrl: 'http://localhost:8188' }],
        cloud: { apiKey: 'test-key' },
      });
    });

    it('uses local when healthy', async () => {
      // Health check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ system: {}, devices: [] }),
      });

      // Submit
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ prompt_id: 'job-123' }),
      });

      const result = await bridge.submit({ workflow: { test: 'workflow' } });

      expect(result.providerUsed).toBe('local');
      expect(result.fallbackTriggered).toBe(false);
    });
  });

  describe('Auto Mode - Fallback', () => {
    let bridge: ComfyBridge;

    beforeEach(() => {
      bridge = createComfyBridge({
        mode: 'auto',
        fallbackToCloud: true,
        retryOnConnectionFailure: true,
        localTimeoutMs: 60000,
        localInstances: [{ id: 'local-1', name: 'Local', baseUrl: 'http://localhost:8188' }],
        cloud: { apiKey: 'test-key' },
      });
    });

    it('falls back to cloud when local is unhealthy', async () => {
      // Local health check fails
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      // Cloud submit succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ prompt_id: 'cloud-job-789' }),
      });

      const result = await bridge.submit({ workflow: { test: 'workflow' } });

      expect(result.providerUsed).toBe('cloud');
      expect(result.fallbackTriggered).toBe(true);
      expect(result.fallbackReason).toBe('local_unhealthy');
      expect(result.providerModeRequested).toBe('auto');
      expect(result.localInstanceId).toBe('local-1');
    });

    it('falls back to cloud on connection failure during submission', async () => {
      // Local health check passes
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ system: {}, devices: [] }),
      });

      // Local submit fails with connection error
      mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

      // Cloud submit succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ prompt_id: 'cloud-job-fallback' }),
      });

      const result = await bridge.submit({ workflow: { test: 'workflow' } });

      expect(result.providerUsed).toBe('cloud');
      expect(result.fallbackTriggered).toBe(true);
      expect(result.fallbackReason).toBe('local_connection_failed');
      expect(result.providerModeRequested).toBe('auto');
      expect(result.localInstanceId).toBe('local-1');
    });

    it('fails when both providers fail and fallback is disabled', async () => {
      const noFallbackBridge = createComfyBridge({
        mode: 'auto',
        fallbackToCloud: false,
        retryOnConnectionFailure: false,
        localTimeoutMs: 60000,
        localInstances: [{ id: 'local-1', name: 'Local', baseUrl: 'http://localhost:8188' }],
        cloud: { apiKey: 'test-key' },
      });

      // Local health check fails
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(noFallbackBridge.submit({ workflow: {} })).rejects.toThrow();
    });
  });

  describe('Auto Mode - Cloud Only', () => {
    it('uses cloud when only cloud is configured', async () => {
      const bridge = createComfyBridge({
        mode: 'auto',
        fallbackToCloud: false,
        retryOnConnectionFailure: false,
        localTimeoutMs: 60000,
        cloud: { apiKey: 'test-key' },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ prompt_id: 'cloud-only-job' }),
      });

      const result = await bridge.submit({ workflow: { test: 'workflow' } });

      expect(result.providerUsed).toBe('cloud');
      expect(result.fallbackTriggered).toBe(false);
    });
  });

  describe('Preferred Local Instance Selection', () => {
    it('uses preferred instance when specified', async () => {
      const bridge = createComfyBridge({
        mode: 'auto',
        fallbackToCloud: true,
        retryOnConnectionFailure: true,
        localTimeoutMs: 60000,
        preferredLocalInstanceId: 'local-2',
        localInstances: [
          { id: 'local-1', name: 'Local 1', baseUrl: 'http://localhost:8188' },
          { id: 'local-2', name: 'Local 2', baseUrl: 'http://localhost:8189' },
        ],
        cloud: { apiKey: 'test-key' },
      });

      // Health check for local-2
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ system: {}, devices: [] }),
      });

      // Submit to local-2
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ prompt_id: 'job-123' }),
      });

      const result = await bridge.submit({ workflow: { test: 'workflow' } });

      expect(result.providerUsed).toBe('local');
      expect(result.localInstanceId).toBe('local-2');
    });

    it('uses the requested local instance for getStatus metadata', async () => {
      const bridge = createComfyBridge({
        mode: 'auto',
        fallbackToCloud: true,
        retryOnConnectionFailure: true,
        localTimeoutMs: 60000,
        localInstances: [
          { id: 'local-1', name: 'Local 1', baseUrl: 'http://localhost:8188' },
          { id: 'local-2', name: 'Local 2', baseUrl: 'http://localhost:8189' },
        ],
        cloud: { apiKey: 'test-key' },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            'job-123': {
              status: { completed: true },
              outputs: {
                '9': {
                  images: [{ filename: 'result.png', subfolder: 'output', type: 'output' }],
                },
              },
            },
          }),
      });

      const status = await bridge.getStatus('job-123', 'local', 'local-2');

      expect(status.state).toBe('completed');
      expect(status.usage?.providerRequested).toBe('local');
      expect(status.usage?.providerUsed).toBe('local');
      expect(status.usage?.localInstanceId).toBe('local-2');
      expect(mockFetch.mock.calls[0]?.[0]).toBe('http://localhost:8189/history/job-123');
    });
  });

  describe('UI Switcher Integration', () => {
    it('returns UI switcher state', () => {
      const bridge = createComfyBridge({
        mode: 'auto',
        fallbackToCloud: true,
        retryOnConnectionFailure: true,
        localTimeoutMs: 60000,
        preferredLocalInstanceId: 'local-1',
        localInstances: [{ id: 'local-1', name: 'Local', baseUrl: 'http://localhost:8188' }],
        cloud: { apiKey: 'test-key' },
      });

      const state = bridge.getUISwitcherState();

      expect(state.mode).toBe('auto');
      expect(state.fallbackEnabled).toBe(true);
      expect(state.preferredLocalUrl).toBe('http://localhost:8188');
    });

    it('returns runtime info for healthy local', async () => {
      const bridge = createComfyBridge({
        mode: 'auto',
        fallbackToCloud: true,
        retryOnConnectionFailure: true,
        localTimeoutMs: 60000,
        localInstances: [{ id: 'local-1', name: 'Local', baseUrl: 'http://localhost:8188' }],
        cloud: { apiKey: 'test-key' },
      });

      // Local health check passes
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ system: {}, devices: [] }),
      });

      // Cloud health check passes
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ version: '1.0' }),
      });

      const runtimeInfo = await bridge.getUISwitcherRuntimeInfo();

      expect(runtimeInfo.providerUsed).toBe('local');
      expect(runtimeInfo.statusBadge).toBe('healthy');
      expect(runtimeInfo.fallbackReason).toBeUndefined();
    });

    it('returns runtime info with fallback status', async () => {
      const bridge = createComfyBridge({
        mode: 'auto',
        fallbackToCloud: true,
        retryOnConnectionFailure: true,
        localTimeoutMs: 60000,
        localInstances: [{ id: 'local-1', name: 'Local', baseUrl: 'http://localhost:8188' }],
        cloud: { apiKey: 'test-key' },
      });

      // Local health check fails
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      // Cloud health check passes
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ version: '1.0' }),
      });

      const runtimeInfo = await bridge.getUISwitcherRuntimeInfo();

      expect(runtimeInfo.providerUsed).toBe('cloud');
      expect(runtimeInfo.statusBadge).toBe('fallback');
      expect(runtimeInfo.fallbackReason).toBe('local_unhealthy');
    });
  });

  describe('Config Access', () => {
    it('returns copy of config', () => {
      const bridge = createComfyBridge({
        mode: 'local',
        fallbackToCloud: false,
        retryOnConnectionFailure: false,
        localTimeoutMs: 60000,
        localInstances: [{ id: 'local-1', name: 'Local', baseUrl: 'http://localhost:8188' }],
      });

      const config = bridge.getConfig();

      expect(config.mode).toBe('local');
      expect(config.fallbackToCloud).toBe(false);
      expect(config.localInstances?.[0]?.baseUrl).toBe('http://localhost:8188');
    });
  });

  describe('Doc-specified API (submitWorkflow)', () => {
    it('submits workflow using doc-specified input format', async () => {
      const bridge = createComfyBridge({
        mode: 'local',
        fallbackToCloud: false,
        retryOnConnectionFailure: false,
        localTimeoutMs: 60000,
        localInstances: [{ id: 'local-1', name: 'Local', baseUrl: 'http://localhost:8188' }],
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ prompt_id: 'job-123' }),
      });

      const result = await bridge.submitWorkflow({
        workflow: { '3': { class_type: 'KSampler' } },
        metadata: { userId: 'user-1' },
      });

      expect(result.promptId).toBe('job-123');
      expect(result.usage.providerRequested).toBe('local');
      expect(result.usage.providerUsed).toBe('local');
      expect(result.usage.fallbackTriggered).toBe(false);
    });
  });
});
