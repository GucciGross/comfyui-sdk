/**
 * Local-only mode example
 *
 * Use this when you only want to use local ComfyUI
 */

import { createComfyBridge } from '@wandgx/comfy-bridge';

async function main() {
  const bridge = createComfyBridge({
    mode: 'local',
    local: {
      baseUrl: 'http://127.0.0.1:8188',
      timeout: 60000,
    },
  });

  // Health check
  const health = await bridge.healthCheck();
  if (!health[0].healthy) {
    console.error('Local ComfyUI is not available');
    console.error(`Error: ${health[0].error}`);
    process.exit(1);
  }

  console.log(`Local ComfyUI is healthy (${health[0].responseTime}ms)`);

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
