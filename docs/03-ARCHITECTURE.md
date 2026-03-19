# ARCHITECTURE

## High-level structure

Recommended package layout:

- `src/core/`
  - shared types
  - shared errors
  - bridge client
  - router / fallback logic

- `src/adapters/local/`
  - local adapter
  - optional internal wrapper for external comfyui sdk
  - local health checks
  - local upload + submit + status + outputs

- `src/adapters/cloud/`
  - cloud adapter
  - cloud auth handling
  - cloud health checks
  - cloud upload + submit + status + outputs

- `src/index.ts`
  - public exports only

## Core interfaces

The repo should define its own interfaces, for example:

- `ComfyBridgeConfig`
- `ComfyRoutingMode`
- `LocalInstanceConfig`
- `SubmitWorkflowInput`
- `GenerationResult`
- `GenerationStatus`
- `ProviderUsageMetadata`
- `IComfyProviderAdapter`

## Adapter pattern

Each adapter should implement the same contract.

Suggested responsibilities:
- `healthCheck()`
- `submitWorkflow()`
- `getJobStatus()`
- `uploadImage()`
- `watchJob()` or equivalent progress subscription
- `resolveOutputUrls()`

## Router behavior

The bridge client should:
- accept top-level config
- select provider based on mode
- perform preflight checks
- trigger fallback when appropriate
- normalize responses
- attach provider usage metadata

## Important boundary

Public API should be app-friendly.
Provider-specific quirks should stay inside adapters.
