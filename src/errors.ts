import type { ComfyBridgeError, ErrorCode } from './types';

interface NormalizeErrorOptions {
  context?: Record<string, unknown>;
  defaultCode?: ErrorCode;
}

function getErrorCause(error: unknown): Error | undefined {
  if (error instanceof Error) {
    return error;
  }

  return undefined;
}

function mergeContext(
  baseContext?: Record<string, unknown>,
  extraContext?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!baseContext && !extraContext) {
    return undefined;
  }

  return {
    ...(baseContext ?? {}),
    ...(extraContext ?? {}),
  };
}

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
    Object.setPrototypeOf(this, new.target.prototype);
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
  provider?: 'local' | 'cloud',
  options?: NormalizeErrorOptions
): ComfyBridgeError {
  if (isComfyBridgeError(error)) {
    return {
      ...error,
      provider: error.provider ?? provider,
      context: mergeContext(error.context, options?.context),
    };
  }

  const cause = getErrorCause(error);
  const rawMessage = cause?.message ?? String(error);
  const message = rawMessage.toLowerCase();

  if (
    cause?.name === 'AbortError' ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('aborted')
  ) {
    return createError('TIMEOUT_ERROR', rawMessage, {
      provider,
      cause,
      context: options?.context,
    });
  }

  if (
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('network') ||
    message.includes('failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('socket hang up') ||
    message.includes('connection refused') ||
    message.includes('connect')
  ) {
    return createError('CONNECTION_ERROR', rawMessage, {
      provider,
      cause,
      context: options?.context,
    });
  }

  if (
    message.includes('auth') ||
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('invalid api key') ||
    message.includes('x-api-key') ||
    message.includes('token')
  ) {
    return createError('AUTH_ERROR', rawMessage, {
      provider,
      cause,
      context: options?.context,
    });
  }

  if (message.includes('not found') || message.includes('404')) {
    return createError('JOB_NOT_FOUND', rawMessage, {
      provider,
      cause,
      context: options?.context,
    });
  }

  if (message.includes('cancel') || message.includes('interrupt')) {
    return createError('CANCEL_ERROR', rawMessage, {
      provider,
      cause,
      context: options?.context,
    });
  }

  if (
    message.includes('execution error') ||
    message.includes('node_errors') ||
    message.includes('exception_message') ||
    message.includes('workflow execution failed')
  ) {
    return createError('EXECUTION_ERROR', rawMessage, {
      provider,
      cause,
      context: options?.context,
    });
  }

  if (
    message.includes('unexpected token') ||
    message.includes('invalid json') ||
    message.includes('json parse') ||
    message.includes('invalid response')
  ) {
    return createError('INVALID_RESPONSE', rawMessage, {
      provider,
      cause,
      context: options?.context,
    });
  }

  return createError(options?.defaultCode ?? 'SUBMISSION_ERROR', rawMessage, {
    provider,
    cause,
    context: options?.context,
  });
}
