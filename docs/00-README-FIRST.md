# README FIRST

This repo exists to build a standalone TypeScript bridge for ComfyUI that supports:
- ComfyUI Local
- ComfyUI Cloud
- provider mode: `local`, `cloud`, `auto`
- local-preferred cloud fallback
- GUI-friendly public types for future app integration

## Why this doc set was updated

We reviewed the public `comfy-addons/comfyui-sdk` repository again.

What looks good there:
- `ComfyApi` already handles many local-server concerns like queueing, uploads, history, status, websocket reconnects, and polling fallback.
- `ComfyPool` already handles multi-instance local routing.
- `PromptBuilder` and `CallWrapper` are useful patterns for workflow mutation and execution handling.

What this means for this repo:
- do **not** reinvent every low-level local ComfyUI call from scratch if the external SDK can help
- do **not** let the external SDK define this repo's public API
- do **not** couple this repo tightly to the external SDK
- do build a WandGx-friendly and GUI-friendly abstraction on top

## Non-negotiable architecture rule

This repo's public API must belong to this repo.

The external `comfy-addons/comfyui-sdk` project may be used as:
- inspiration
- optional internal dependency inside the local adapter
- reference for websocket/polling/pool behavior

It may **not** be used as:
- the public API of this repo
- the cloud adapter
- the source of provider routing behavior
- the source of GUI-facing config types
- the source of fallback metadata

## MVP outcome

At MVP completion, this repo should expose a clean package that lets another app do things like:

- choose provider mode: `local`, `cloud`, `auto`
- select a preferred local instance
- enable cloud fallback
- configure retry behavior and timeout
- submit a workflow
- upload inputs
- observe progress
- know which provider actually handled the job
- know whether fallback happened and why
