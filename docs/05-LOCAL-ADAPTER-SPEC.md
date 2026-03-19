# LOCAL ADAPTER SPEC

The local adapter handles self-hosted ComfyUI instances.

## Responsibilities

- choose a local instance
- perform local health checks
- submit workflows to the selected instance
- upload files/images
- retrieve job status/history
- watch progress if available
- normalize outputs

## Important note from latest review

The external `comfy-addons/comfyui-sdk` already appears strong for local concerns:
- queue/status/history
- upload helpers
- websocket reconnect
- polling fallback
- multi-instance pooling

This makes it acceptable to:
- use it internally
- wrap it with our own local adapter interface

But the adapter must still expose our own types.

## Required local behavior

- supports multiple local instances
- supports preferred instance id
- supports health check timeout
- reports the local instance used
- returns normalized errors when no local instance is usable

## Recommended internal shape

- `LocalComfyAdapter`
- `LocalInstanceResolver`
- optional `ComfySdkLocalClient` internal wrapper
