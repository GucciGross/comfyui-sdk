import type { ComfyBridgeError, ErrorCode } from './types';

/**
 * Custom error class for Comfy Bridge errors
 */
export class ComfyBridgeErrorClass extends Error implements ComfyBridgeError {
  public readonly code: ErrorCode;
  public readonly provider?: 'local' | 'cloud';
  public readonly cause?: Error;
  public readonly context?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      provider?: 'local' | 'cloud';
      cause?: Error;
      context?: Record<string, unknown>;
    }
  ) {
    super(message);
    this.name = 'ComfyBridgeError';
    this.code = code;
    this.provider = options?.provider;
    this.cause = options?.cause;
    this.context = options?.context;
  }

  toJSON(): ComfyBridgeError {
    return {
      code: this.code,
      message: this.message,
      provider: this.provider,
      cause: this.cause,
      context: this.context,
    };
  }
}

/**
 * Create a normalized error
 */
export function createError(
  code: ErrorCode,
  message: string,
  options?: {
    provider?: 'local' | 'cloud';
    cause?: Error;
    context?: Record<string, unknown>;
  }
): ComfyBridgeError {
  return new ComfyBridgeErrorClass(code, message, options).toJSON();
}

/**
 * Check if an error is a ComfyBridgeError
 */
export function isComfyBridgeError(error: unknown): error is ComfyBridgeError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error
  );
}

/**
 * Normalize unknown errors into ComfyBridgeError
 */
export function normalizeError(
  error: unknown,
  provider?: 'local' | 'cloud'
): ComfyBridgeError {
  if (isComfyBridgeError(error)) {
    return error;
  }

  if (error instanceof Error) {
    // Try to infer error type from error message/properties
    const message = error.message.toLowerCase();

    if (
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('network')
    ) {
      return createError('CONNECTION_ERROR', error.message, { provider, cause: error });
    }

    if (message.includes('timeout')) {
      return createError('POLLING_TIMEOUT', error.message, { provider, cause: error });
    }

    if (message.includes('auth') || message.includes('unauthorized')) {
      return createError('AUTH_ERROR', error.message, { provider, cause: error });
    }

    return createError('SUBMISSION_ERROR', error.message, { provider, cause: error });
  }

  return createError('SUBMISSION_ERROR', String(error), { provider });
}
