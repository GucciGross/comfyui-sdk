# INTENT: USE comfyui-sdk CORRECTLY

## Decision

The external `comfyui-sdk` project is a useful building block, especially for local ComfyUI behavior, but it is not the final architecture for this repo.

## Approved usage

Allowed:
- use it as inspiration
- use it as an optional internal dependency for the local adapter
- borrow architectural ideas for websocket handling, queue watching, prompt submission, and pooling

Not allowed:
- exposing its raw API directly as this package's public contract
- letting it define cloud support
- letting it define our routing model
- letting it leak into GUI-facing app types

## Why

This package must own:
- the provider abstraction
- the local/cloud switcher model
- auto routing
- fallback reasons
- provider used metadata
- normalized return types
- normalized error types

## Design consequence

Create our own interfaces first.
Then implement local using either raw HTTP/WebSocket or `comfyui-sdk` internally where it helps.
