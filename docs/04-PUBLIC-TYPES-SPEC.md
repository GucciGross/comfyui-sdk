# PUBLIC TYPES SPEC

## Required types

Create clean exported types for at least:

### Provider mode
- `ComfyProviderMode = 'local' | 'cloud' | 'auto'`

### Bridge config
Should support:
- mode
- local config
- cloud config
- fallbackToCloud
- retryOnConnectionFailure
- localTimeoutMs

### Local provider config
Should support:
- baseUrl
- optional auth
- optional instanceId
- optional label/name

### Cloud provider config
Should support:
- baseUrl
- apiKey
- optional clientId

### Routing result metadata
Should include:
- providerRequested
- providerUsed
- fallbackTriggered
- fallbackReason

### Workflow submission input
Should include:
- workflow object
- optional files/uploads
- optional metadata
- optional abort signal if practical

### Job status
Should include:
- promptId or jobId
- providerUsed
- state (`queued`, `running`, `completed`, `failed`)
- progress if available
- outputs when available
- error when failed
- routing metadata

### Health result
Should include:
- provider
- ok boolean
- latency if available
- details message if needed

### Normalized error
Must be typed and include:
- code
- message
- provider
- retryable boolean
- raw cause if appropriate

## Rule

Do not make UI apps parse raw provider-specific responses.
