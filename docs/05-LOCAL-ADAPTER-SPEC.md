# LOCAL ADAPTER SPEC

## Goal

Provide a clean local ComfyUI implementation behind the bridge interfaces.

## Responsibilities

The local adapter should support:
- health check
- submit workflow
- get job status/history
- upload image/file input where supported
- create preview/view URLs when useful
- progress/event watching abstraction

## Implementation note

You may use raw API calls or use `comfyui-sdk` internally.
If using `comfyui-sdk`, wrap it so the rest of this repo only sees our own interfaces.

## Required behavior

- local health check should happen quickly
- failures should normalize into shared error types
- timeouts should be treated as retryable connection failures when appropriate
- websocket failure should not break the package if polling fallback is possible

## Nice-to-have

If practical in MVP:
- basic support for named local instances
- support for choosing a preferred local instance
