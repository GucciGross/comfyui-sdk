# ARCHITECTURE

## High-level design

Use an adapter architecture.

### Core layers

1. Public types layer
2. Bridge client / factory
3. Provider router
4. Local adapter
5. Cloud adapter
6. Shared error normalization and result mapping

## Suggested modules

- `types/`
- `errors/`
- `core/`
- `adapters/local/`
- `adapters/cloud/`
- `routing/`
- `utils/`

## Core public interfaces

The package should define interfaces similar to:

- provider config
- routing mode
- health result
- job submission input
- job status
- job result
- upload result
- event payloads
- normalized error

## Routing model

The router decides:
- which provider to try first
- whether fallback is allowed
- whether a retry should occur
- what provider was actually used
- what fallback reason should be recorded

## GUI support requirement

The public types must make a GUI switcher easy to build.
That means the API must support:
- selected mode
- preferred local instance ID
- fallback enabled/disabled
- retry enabled/disabled
- timeout config
- runtime provider used
- runtime fallback reason

## Clean separation

This repo is transport and routing focused.
It should not contain WandGx product logic.
