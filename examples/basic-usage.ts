/**
 * Basic usage example for @wandgx/comfy-bridge
 *
 * This example demonstrates:
 * - Creating a bridge client
 * - Running health checks
 * - Submitting a workflow
 * - Inspecting routing metadata
 */

import { createComfyBridge, isComfyBridgeError } from '@wandgx/comfy-bridge';

async function main() {
  // Create the bridge client with auto mode
  const bridge = createComfyBridge({
    mode: 'auto',
    local: {
      baseUrl: 'http://127.0.0.1:8188',
    },
    cloud: {
      apiKey: process.env.COMFY_CLOUD_API_KEY || 'your-api-key',
    },
    routing: {
      enableFallback: true,
      retryOnConnectionFailure: true,
    },
  });

  // Check health of all providers
  console.log('Checking provider health...');
  const healthResults = await bridge.healthCheck();

  for (const result of healthResults) {
    console.log(`  ${result.provider}: ${result.healthy ? 'healthy' : 'unhealthy'} (${result.responseTime}ms)`);
  }

  // Define a simple workflow
  const workflow = {
    '3': {
      class_type: 'KSampler',
      inputs: {
        seed: 12345,
        steps: 20,
        cfg: 7.5,
        sampler_name: 'euler',
        scheduler: 'normal',
        denoise: 1.0,
        model: ['4', 0],
        positive: ['6', 0],
        negative: ['7', 0],
        latent_image: ['5', 0],
      },
    },
    '4': {
      class_type: 'CheckpointLoaderSimple',
      inputs: {
        ckpt_name: 'v1-5-pruned.safetensors',
      },
    },
    '5': {
      class_type: 'EmptyLatentImage',
      inputs: {
        width: 512,
        height: 512,
        batch_size: 1,
      },
    },
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: 'a beautiful sunset over mountains',
        clip: ['4', 1],
      },
    },
    '7': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: 'ugly, blurry, low quality',
        clip: ['4', 1],
      },
    },
    '8': {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['3', 0],
        vae: ['4', 2],
      },
    },
    '9': {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: 'output',
        images: ['8', 0],
      },
    },
  };

  // Submit the workflow with progress tracking
  console.log('\nSubmitting workflow...');
  try {
    const result = await bridge.submitAndWait(
      { workflow },
      {
        onProgress: (progress) => {
          const pct = progress.progress
            ? `${progress.progress}%`
            : `${progress.stepsCompleted}/${progress.totalSteps}`;
          console.log(`  Progress: ${pct} (node: ${progress.currentNode || 'unknown'})`);
        },
      }
    );

    // Display results
    console.log('\n--- Job Result ---');
    console.log(`Job ID: ${result.jobId}`);
    console.log(`Status: ${result.status}`);
    console.log(`Provider Requested: ${result.providerModeRequested}`);
    console.log(`Provider Used: ${result.providerUsed}`);
    console.log(`Fallback Triggered: ${result.fallbackTriggered}`);

    if (result.fallbackReason) {
      console.log(`Fallback Reason: ${result.fallbackReason}`);
    }

    if (result.outputs && result.outputs.length > 0) {
      console.log('\nOutputs:');
      for (const output of result.outputs) {
        console.log(`  - ${output.filename}: ${output.url}`);
      }
    }

    if (result.error) {
      console.log(`\nError: [${result.error.code}] ${result.error.message}`);
    }
  } catch (error) {
    if (isComfyBridgeError(error)) {
      console.error(`\nError [${error.code}]: ${error.message}`);
      if (error.provider) {
        console.error(`Provider: ${error.provider}`);
      }
    } else {
      console.error('\nUnexpected error:', error);
    }
  }

  // Get UI switcher state
  console.log('\n--- UI Switcher State ---');
  const switcherState = bridge.getUISwitcherState();
  console.log(`Mode: ${switcherState.mode}`);
  console.log(`Fallback Enabled: ${switcherState.fallbackEnabled}`);
  console.log(`Preferred Local URL: ${switcherState.preferredLocalUrl}`);

  // Get runtime info
  const runtimeInfo = await bridge.getUISwitcherRuntimeInfo();
  console.log(`\nProvider Used: ${runtimeInfo.providerUsed}`);
  console.log(`Status Badge: ${runtimeInfo.statusBadge}`);
  if (runtimeInfo.fallbackReason) {
    console.log(`Fallback Reason: ${runtimeInfo.fallbackReason}`);
  }
}

main().catch(console.error);
