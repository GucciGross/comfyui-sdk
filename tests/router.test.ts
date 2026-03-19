import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ComfyBridge, createComfyBridge } from '../src/router';
import type { BridgeConfig, HealthCheckResult } from '../src/types';

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
    it('throws error for local mode without local config', () => {
      expect(() => {
        createComfyBridge({ mode: 'local' });
      }).toThrow('Local mode requires local configuration');
    });

    it('throws error for cloud mode without cloud config', () => {
      expect(() => {
        createComfyBridge({ mode: 'cloud' });
      }).toThrow('Cloud mode requires cloud configuration');
    });

    it('throws error for auto mode without any config', () => {
      expect(() => {
        createComfyBridge({ mode: 'auto' });
      }).toThrow('Auto mode requires at least local or cloud configuration');
    });

    it('creates bridge with valid local config', () => {
      const bridge = createComfyBridge({
        mode: 'local',
        local: { baseUrl: 'http://localhost:8188' },
      });
      expect(bridge).toBeInstanceOf(ComfyBridge);
    });

    it('creates bridge with valid cloud config', () => {
      const bridge = createComfyBridge({
        mode: 'cloud',
        cloud: { apiKey: 'test-key' },
      });
      expect(bridge).toBeInstanceOf(ComfyBridge);
    });

    it('creates bridge with valid auto config (local only)', () => {
      const bridge = createComfyBridge({
        mode: 'auto',
        local: { baseUrl: 'http://localhost:8188' },
      });
      expect(bridge).toBeInstanceOf(ComfyBridge);
    });

    it('creates bridge with valid auto config (cloud only)', () => {
      const bridge = createComfyBridge({
        mode: 'auto',
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
        local: { baseUrl: 'http://localhost:8188' },
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
        json: () => Promise.resolve({ id: 'cloud-job-456' }),
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
        local: { baseUrl: 'http://localhost:8188' },
        cloud: { apiKey: 'test-key' },
        routing: { enableFallback: true },
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
        local: { baseUrl: 'http://localhost:8188' },
        cloud: { apiKey: 'test-key' },
        routing: { enableFallback: true, retryOnConnectionFailure: true },
      });
    });

    it('falls back to cloud when local is unhealthy', async () => {
      // Local health check fails
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      // Cloud submit succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'cloud-job-789' }),
      });

      const result = await bridge.submit({ workflow: { test: 'workflow' } });

      expect(result.providerUsed).toBe('cloud');
      expect(result.fallbackTriggered).toBe(true);
      expect(result.fallbackReason).toBe('local_unhealthy');
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
        json: () => Promise.resolve({ id: 'cloud-job-fallback' }),
      });

      const result = await bridge.submit({ workflow: { test: 'workflow' } });

      expect(result.providerUsed).toBe('cloud');
      expect(result.fallbackTriggered).toBe(true);
      expect(result.fallbackReason).toBe('local_connection_failed');
    });

    it('fails when both providers fail and fallback is disabled', async () => {
      const noFallbackBridge = createComfyBridge({
        mode: 'auto',
        local: { baseUrl: 'http://localhost:8188' },
        cloud: { apiKey: 'test-key' },
        routing: { enableFallback: false },
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
        cloud: { apiKey: 'test-key' },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'cloud-only-job' }),
      });

      const result = await bridge.submit({ workflow: { test: 'workflow' } });

      expect(result.providerUsed).toBe('cloud');
      expect(result.fallbackTriggered).toBe(false);
    });
  });

  describe('UI Switcher Integration', () => {
    it('returns UI switcher state', () => {
      const bridge = createComfyBridge({
        mode: 'auto',
        local: { baseUrl: 'http://localhost:8188' },
        cloud: { apiKey: 'test-key' },
        routing: { enableFallback: true },
      });

      const state = bridge.getUISwitcherState();

      expect(state.mode).toBe('auto');
      expect(state.fallbackEnabled).toBe(true);
      expect(state.preferredLocalUrl).toBe('http://localhost:8188');
    });

    it('returns runtime info for healthy local', async () => {
      const bridge = createComfyBridge({
        mode: 'auto',
        local: { baseUrl: 'http://localhost:8188' },
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
        local: { baseUrl: 'http://localhost:8188' },
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
        local: { baseUrl: 'http://localhost:8188' },
      });

      const config = bridge.getConfig();

      expect(config.mode).toBe('local');
      expect(config.local?.baseUrl).toBe('http://localhost:8188');
    });

    it('returns copy of routing policy', () => {
      const bridge = createComfyBridge({
        mode: 'auto',
        local: { baseUrl: 'http://localhost:8188' },
        cloud: { apiKey: 'test-key' },
        routing: { enableFallback: false, maxRetries: 3 },
      });

      const policy = bridge.getRoutingPolicy();

      expect(policy.enableFallback).toBe(false);
      expect(policy.maxRetries).toBe(3);
    });
  });
});
