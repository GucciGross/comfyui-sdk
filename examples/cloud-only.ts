/**
 * Cloud-only mode example
 *
 * Use this when you only want to use ComfyUI Cloud
 */

import { createComfyBridge } from '@wandgx/comfy-bridge';

async function main() {
  const bridge = createComfyBridge({
    mode: 'cloud',
    cloud: {
      apiKey: process.env.COMFY_CLOUD_API_KEY || 'your-api-key',
      baseUrl: 'https://api.comfyicloud.com', // optional, this is the default
    },
  });

  // Health check
  const health = await bridge.healthCheck();
  if (!health[0].healthy) {
    console.error('ComfyUI Cloud is not available');
    console.error(`Error: ${health[0].error}`);
    process.exit(1);
  }

  console.log(`ComfyUI Cloud is healthy (${health[0].responseTime}ms)`);

  // Submit workflow
  const result = await bridge.submit({
    workflow: {
      // Your workflow here
    },
  });

  console.log(`Job submitted: ${result.jobId}`);
  console.log(`Provider: ${result.providerUsed}`);
}

main().catch(console.error);
