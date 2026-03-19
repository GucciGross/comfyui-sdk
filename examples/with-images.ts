/**
 * Example with image uploads
 *
 * Demonstrates how to upload images with your workflow
 */

import { createComfyBridge } from '@wandgx/comfy-bridge';
import { readFileSync } from 'fs';

async function main() {
  const bridge = createComfyBridge({
    mode: 'auto',
    local: { baseUrl: 'http://127.0.0.1:8188' },
    cloud: { apiKey: process.env.COMFY_CLOUD_API_KEY || 'your-api-key' },
    routing: { enableFallback: true },
  });

  // Read an image file
  const imageBuffer = readFileSync('./input-image.png');

  // Create workflow that uses the uploaded image
  const workflow = {
    '10': {
      class_type: 'LoadImage',
      inputs: {
        image: 'input-image.png', // This should match the filename in the upload
      },
    },
    // ... rest of workflow
  };

  // Submit with image
  const result = await bridge.submit({
    workflow,
    images: [
      {
        data: imageBuffer,
        filename: 'input-image.png',
        subfolder: '', // optional
        overwrite: true, // optional
      },
    ],
  });

  console.log(`Job submitted: ${result.jobId}`);
  console.log(`Provider: ${result.providerUsed}`);
  console.log(`Fallback: ${result.fallbackTriggered}`);
}

main().catch(console.error);
