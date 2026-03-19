# INTENT: USE EXTERNAL COMFYUI SDK CORRECTLY

We reviewed `comfy-addons/comfyui-sdk` and the repo is useful, but it is not the final product we need.

## What to take from it

Useful ideas and/or optional internals for the local adapter:
- local server request handling
- websocket lifecycle handling
- polling fallback
- queue/history/status helpers
- multi-instance pool logic
- workflow builder patterns
- upload helpers

## What not to take from it

Do not let the external SDK define:
- this repo's public API
- cloud provider support
- provider switcher semantics
- app-facing routing metadata
- fallback policy
- GUI-facing config objects

## Required implementation stance

Build our own public API first.

Then choose one of these internal strategies for the local adapter:

### Strategy A: thin wrapper over external sdk
Pros:
- faster MVP
- less low-level local code
- proven websocket/polling patterns

Cons:
- external changes can affect internals
- some behavior may need adaptation

### Strategy B: selective code inspiration
Pros:
- tighter control
- fewer external runtime dependencies

Cons:
- more work

## Recommendation

For MVP:
- allow use of the external SDK inside the local adapter
- keep the dependency isolated behind an internal abstraction
- do not leak external classes like `ComfyApi`, `ComfyPool`, `PromptBuilder`, or `CallWrapper` into the package public surface

## Public API rule

Consumers of this repo should never need to know whether the local adapter uses:
- raw fetch/websocket code
- `comfy-addons/comfyui-sdk`
- a future replacement

That choice must remain internal.
