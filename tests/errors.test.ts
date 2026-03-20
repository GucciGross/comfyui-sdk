import { describe, it, expect } from 'vitest';
import {
  createError,
  isComfyBridgeError,
  normalizeError,
  ComfyBridgeErrorClass,
} from '../src/errors';

describe('Error Handling', () => {
  describe('createError', () => {
    it('creates a normalized error object', () => {
      const error = createError('LOCAL_UNHEALTHY', 'Local provider is not responding', {
        provider: 'local',
      });

      expect(error.code).toBe('LOCAL_UNHEALTHY');
      expect(error.message).toBe('Local provider is not responding');
      expect(error.provider).toBe('local');
    });

    it('includes cause and context', () => {
      const cause = new Error('Original error');
      const error = createError('SUBMISSION_ERROR', 'Failed to submit', {
        provider: 'cloud',
        cause,
        context: { jobId: '123' },
      });

      expect(error.cause).toBe(cause);
      expect(error.context).toEqual({ jobId: '123' });
    });
  });

  describe('ComfyBridgeErrorClass', () => {
    it('serializes to JSON correctly', () => {
      const error = new ComfyBridgeErrorClass('AUTH_ERROR', 'Invalid API key', {
        provider: 'cloud',
      });

      const json = error.toJSON();

      expect(json.code).toBe('AUTH_ERROR');
      expect(json.message).toBe('Invalid API key');
      expect(json.provider).toBe('cloud');
    });
  });

  describe('isComfyBridgeError', () => {
    it('returns true for ComfyBridgeError', () => {
      const error = createError('CONNECTION_ERROR', 'Cannot connect');
      expect(isComfyBridgeError(error)).toBe(true);
    });

    it('returns true for ComfyBridgeErrorClass instance', () => {
      const error = new ComfyBridgeErrorClass('TIMEOUT_ERROR', 'Timed out');
      expect(isComfyBridgeError(error)).toBe(true);
    });

    it('returns false for regular Error', () => {
      const error = new Error('Regular error');
      expect(isComfyBridgeError(error)).toBe(false);
    });

    it('returns false for non-objects', () => {
      expect(isComfyBridgeError('error')).toBe(false);
      expect(isComfyBridgeError(null)).toBe(false);
      expect(isComfyBridgeError(undefined)).toBe(false);
    });
  });

  describe('normalizeError', () => {
    it('returns ComfyBridgeError unchanged', () => {
      const original = createError('AUTH_ERROR', 'Auth failed', { provider: 'cloud' });
      const normalized = normalizeError(original, 'local');

      expect(normalized.code).toBe('AUTH_ERROR');
      expect(normalized.message).toBe('Auth failed');
      expect(normalized.provider).toBe('cloud'); // Should preserve original
    });

    it('normalizes connection errors', () => {
      const error = new Error('ECONNREFUSED localhost:8188');
      const normalized = normalizeError(error, 'local');

      expect(normalized.code).toBe('CONNECTION_ERROR');
      expect(normalized.provider).toBe('local');
      expect(normalized.cause).toBe(error);
    });

    it('normalizes network errors', () => {
      const error = new Error('ENOTFOUND unknown-host');
      const normalized = normalizeError(error, 'local');

      expect(normalized.code).toBe('CONNECTION_ERROR');
    });

    it('normalizes timeout errors', () => {
      const error = new Error('Request timeout exceeded');
      const normalized = normalizeError(error, 'cloud');

      expect(normalized.code).toBe('TIMEOUT_ERROR');
    });

    it('normalizes auth errors', () => {
      const error = new Error('Unauthorized: invalid token');
      const normalized = normalizeError(error, 'cloud');

      expect(normalized.code).toBe('AUTH_ERROR');
    });

    it('normalizes generic errors', () => {
      const error = new Error('Something went wrong');
      const normalized = normalizeError(error, 'local');

      expect(normalized.code).toBe('SUBMISSION_ERROR');
    });

    it('normalizes non-Error values', () => {
      const normalized = normalizeError('string error', 'cloud');

      expect(normalized.code).toBe('SUBMISSION_ERROR');
      expect(normalized.message).toBe('string error');
    });

    it('merges context into an existing ComfyBridgeError', () => {
      const original = createError('AUTH_ERROR', 'Auth failed', {
        provider: 'cloud',
        context: { status: 401 },
      });

      const normalized = normalizeError(original, 'cloud', {
        context: { operation: 'submit' },
      });

      expect(normalized.context).toEqual({
        status: 401,
        operation: 'submit',
      });
    });

    it('uses the provided default code for generic errors', () => {
      const normalized = normalizeError(new Error('Upload exploded'), 'cloud', {
        defaultCode: 'UPLOAD_ERROR',
      });

      expect(normalized.code).toBe('UPLOAD_ERROR');
    });
  });
});
