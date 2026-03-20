import { describe, expect, it } from 'vitest';
import {
  createBlob,
  flattenOutputs,
  rewriteWorkflowWithUploadedAssets,
  toWorkflowFilename,
} from '../src/adapter-utils';

describe('adapter-utils', () => {
  it('rewrites string and object asset references using uploaded asset bindings', () => {
    const workflow = {
      '1': {
        inputs: {
          image: 'source.png',
          mask: {
            filename: 'source.png',
            subfolder: 'incoming',
            type: 'input',
          },
          nested: ['incoming/source.png'],
        },
      },
    };

    const rewritten = rewriteWorkflowWithUploadedAssets(workflow, [
      {
        originalFilename: 'source.png',
        originalSubfolder: 'incoming',
        uploaded: {
          filename: 'uploaded.png',
          subfolder: 'remote',
          type: 'input',
        },
      },
    ]);

    expect(rewritten).not.toBe(workflow);
    expect((rewritten['1'] as { inputs: Record<string, unknown> }).inputs.image).toBe(
      'remote/uploaded.png'
    );
    expect((rewritten['1'] as { inputs: Record<string, unknown> }).inputs.mask).toEqual({
      filename: 'uploaded.png',
      subfolder: 'remote',
      type: 'input',
    });
    expect((rewritten['1'] as { inputs: Record<string, unknown> }).inputs.nested).toEqual([
      'remote/uploaded.png',
    ]);
    expect((workflow['1'] as { inputs: Record<string, unknown> }).inputs.image).toBe('source.png');
  });

  it('normalizes nested output collections into JobOutput entries', () => {
    const normalized = flattenOutputs(
      {
        '9': {
          images: [{ filename: 'image.png', subfolder: 'output', type: 'output' }],
          audio: [{ filename: 'sound.wav', subfolder: 'output', mime_type: 'audio/wav', size: 512 }],
        },
      },
      (output) => `https://example.test/${output.subfolder ?? ''}/${output.filename}`
    );

    expect(normalized).toEqual([
      {
        filename: 'image.png',
        subfolder: 'output',
        type: 'output',
        url: 'https://example.test/output/image.png',
        mimeType: undefined,
        size: undefined,
      },
      {
        filename: 'sound.wav',
        subfolder: 'output',
        type: 'output',
        url: 'https://example.test/output/sound.wav',
        mimeType: 'audio/wav',
        size: 512,
      },
    ]);
  });

  it('creates blobs from base64 payloads and preserves content type', async () => {
    const blob = createBlob('data:text/plain;base64,SGVsbG8=', 'text/plain');

    expect(blob.type).toBe('text/plain');
    expect(await blob.text()).toBe('Hello');
  });

  it('builds workflow filenames from uploaded asset references', () => {
    expect(toWorkflowFilename({ filename: 'plain.png' })).toBe('plain.png');
    expect(toWorkflowFilename({ filename: 'nested.png', subfolder: 'inputs/' })).toBe(
      'inputs/nested.png'
    );
  });
});
