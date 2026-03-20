import type { JobOutput } from './types';

export interface UploadedAssetReference {
  filename: string;
  subfolder?: string;
  type?: string;
}

export interface WorkflowAssetBinding {
  originalFilename: string;
  originalSubfolder?: string;
  uploaded: UploadedAssetReference;
}

const OUTPUT_COLLECTION_KEYS = new Set(['images', 'image', 'audio', 'video', 'videos']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function decodeBase64Payload(input: string): Uint8Array {
  const base64 = input.replace(/^data:[^;]+;base64,/, '');
  const atobFn = (globalThis as { atob?: (value: string) => string }).atob;

  if (typeof atobFn === 'function') {
    const binary = atobFn(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  const bufferCtor = (globalThis as {
    Buffer?: { from(value: string, encoding: string): Uint8Array };
  }).Buffer;

  if (bufferCtor) {
    return new Uint8Array(bufferCtor.from(base64, 'base64'));
  }

  throw new Error('Base64 decoding is not available in this runtime');
}

function matchesAssetReference(value: string, binding: WorkflowAssetBinding): boolean {
  if (value === binding.originalFilename) {
    return true;
  }

  if (binding.originalSubfolder) {
    return value === `${binding.originalSubfolder}/${binding.originalFilename}`;
  }

  return false;
}

function matchesAssetObjectReference(
  filename: string,
  subfolder: string | undefined,
  binding: WorkflowAssetBinding
): boolean {
  if (filename !== binding.originalFilename) {
    return false;
  }

  if (binding.originalSubfolder === undefined) {
    return true;
  }

  return subfolder === binding.originalSubfolder;
}

export function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export function createClientId(): string {
  const cryptoObject = (globalThis as {
    crypto?: { randomUUID?: () => string };
  }).crypto;

  if (typeof cryptoObject?.randomUUID === 'function') {
    return cryptoObject.randomUUID();
  }

  return `comfy-bridge-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createBlob(
  data: ArrayBuffer | Blob | string | Uint8Array,
  contentType?: string
): Blob {
  if (data instanceof Blob) {
    return data;
  }

  if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
    return new Blob([data], contentType ? { type: contentType } : undefined);
  }

  return new Blob([decodeBase64Payload(data)], contentType ? { type: contentType } : undefined);
}

export function toWorkflowFilename(reference: UploadedAssetReference): string {
  if (!reference.subfolder) {
    return reference.filename;
  }

  return `${reference.subfolder.replace(/\/+$/, '')}/${reference.filename}`;
}

export function rewriteWorkflowWithUploadedAssets(
  workflow: Record<string, unknown>,
  bindings: WorkflowAssetBinding[]
): Record<string, unknown> {
  const rewriteValue = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map((entry) => rewriteValue(entry));
    }

    if (typeof value === 'string') {
      const binding = bindings.find((candidate) => matchesAssetReference(value, candidate));
      return binding ? toWorkflowFilename(binding.uploaded) : value;
    }

    if (!isRecord(value)) {
      return value;
    }

    const originalFilename = typeof value.filename === 'string' ? value.filename : undefined;
    const originalSubfolder = typeof value.subfolder === 'string' ? value.subfolder : undefined;
    const nextValue: Record<string, unknown> = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      if (key === 'filename' && originalFilename !== undefined) {
        nextValue[key] = nestedValue;
        continue;
      }

      nextValue[key] = rewriteValue(nestedValue);
    }

    if (originalFilename !== undefined) {
      const binding = bindings.find((candidate) =>
        matchesAssetObjectReference(originalFilename, originalSubfolder, candidate)
      );

      if (binding) {
        nextValue.filename = binding.uploaded.filename;
        if (binding.uploaded.subfolder !== undefined) {
          nextValue.subfolder = binding.uploaded.subfolder;
        }
        if (binding.uploaded.type !== undefined) {
          nextValue.type = binding.uploaded.type;
        }
      }
    }

    return nextValue;
  };

  return rewriteValue(workflow) as Record<string, unknown>;
}

export function flattenOutputs(
  outputs: unknown,
  resolveUrl: (output: JobOutput) => string
): JobOutput[] {
  const normalizedOutputs: JobOutput[] = [];

  const appendOutputsFromContainer = (container: unknown): void => {
    if (!isRecord(container)) {
      return;
    }

    for (const [key, value] of Object.entries(container)) {
      if (!OUTPUT_COLLECTION_KEYS.has(key) || !Array.isArray(value)) {
        continue;
      }

      for (const item of value) {
        if (!isRecord(item) || typeof item.filename !== 'string') {
          continue;
        }

        const type = item.type === 'temp' ? 'temp' : 'output';
        const output: JobOutput = {
          filename: item.filename,
          subfolder: typeof item.subfolder === 'string' ? item.subfolder : undefined,
          type,
          url: '',
          mimeType:
            typeof item.mime_type === 'string'
              ? item.mime_type
              : typeof item.mimeType === 'string'
                ? item.mimeType
                : undefined,
          size: typeof item.size === 'number' ? item.size : undefined,
        };

        output.url = resolveUrl(output);
        normalizedOutputs.push(output);
      }
    }
  };

  if (isRecord(outputs)) {
    appendOutputsFromContainer(outputs);
    for (const entry of Object.values(outputs)) {
      appendOutputsFromContainer(entry);
    }
  }

  return normalizedOutputs;
}
