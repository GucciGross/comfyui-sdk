# CLOUD ADAPTER SPEC

## Goal

Provide a ComfyUI Cloud adapter behind the same bridge interfaces.

## Responsibilities

The cloud adapter should support:
- health or readiness check where practical
- authenticated workflow submission
- job status lookup
- progress/event watching if supported
- normalized outputs
- normalized errors

## Important rule

Do not make cloud-specific auth/header behavior leak into the public app API.
That should be hidden inside the adapter.

## Implementation note

Cloud is expected to differ mainly in:
- base URL
- authentication
- websocket/session details
- future API drift

That is exactly why the adapter exists.
