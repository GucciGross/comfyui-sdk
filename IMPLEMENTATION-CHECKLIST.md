# Implementation Checklist

## Docs first

- [x] Read all docs before coding
- [x] Define public types first (doc-specified: ComfyBridgeConfig, ProviderUsageMetadata, etc.)
- [x] Define normalized errors
- [x] Define provider adapter interface

## Local support

- [x] Local config shape defined (LocalInstanceConfig)
- [x] Local health check implemented
- [x] Local submit implemented
- [x] Local progress handling implemented
- [x] Local output retrieval implemented

## Cloud support

- [x] Cloud config shape defined
- [x] Cloud auth implemented
- [x] Cloud submit implemented
- [x] Cloud progress handling implemented
- [x] Cloud output retrieval implemented

## Auto support

- [x] Local-first preflight implemented
- [x] Cloud fallback implemented (fallbackToCloud flag)
- [x] Retry-on-connection-failure implemented (retryOnConnectionFailure flag)
- [x] Provider-used reporting implemented (ProviderUsageMetadata)
- [x] Fallback-reason reporting implemented

## GUI-friendly types (doc-specified)

- [x] mode: ComfyRoutingMode
- [x] preferredLocalInstanceId: string
- [x] fallbackToCloud: boolean
- [x] retryOnConnectionFailure: boolean
- [x] localTimeoutMs: number
- [x] providerRequested: in ProviderUsageMetadata
- [x] providerUsed: in ProviderUsageMetadata
- [x] fallbackTriggered: in ProviderUsageMetadata
- [x] fallbackReason: in ProviderUsageMetadata

## Release readiness

- [x] Test plan executed (38 tests passing)
- [x] Docs updated (README.md)
- [x] No repo-specific WandGx business logic leaked into bridge core
- [x] Build passes (CJS, ESM, types)
- [x] Type checking passes

## Public API exports

- [x] ComfyBridge (class)
- [x] createComfyBridge (factory)
- [x] ComfyRoutingMode (type)
- [x] ComfyBridgeConfig (type)
- [x] LocalInstanceConfig (type)
- [x] ProviderUsageMetadata (type)
- [x] SubmitWorkflowInput (type)
- [x] GenerationResult (type)
- [x] GenerationStatus (type)
- [x] WorkflowFileInput (type)
