# Architecture

## Repository purpose

This repo is a standalone bridge layer between WandGx and Comfy providers.

It should eventually expose one clean client abstraction over:

- ComfyUI Local
- ComfyUI Cloud

## Conceptual architecture

WandGx UI / API
-> WandGx integration layer
-> Comfy Bridge
-> Local adapter OR Cloud adapter
-> Comfy provider

## Main architecture pieces

### 1. Provider abstraction

One common client interface that WandGx can call without caring whether the request goes to local or cloud.

### 2. Local adapter

Handles:

- local base URL
- local websocket behavior
- local uploads
- local history retrieval
- local queue handling

### 3. Cloud adapter

Handles:

- cloud base URL
- cloud API key auth
- cloud websocket / polling behavior
- cloud uploads
- cloud history retrieval
- cloud-specific failure cases

### 4. Routing layer

Responsible for:

- local-only mode
- cloud-only mode
- auto mode
- local preferred behavior
- fallback decisions
- health preflight logic
- retry-on-connection-failure logic

### 5. Error normalization

Every provider-specific error should be converted into one normalized internal error shape.

### 6. Status / metadata reporting

Every generation attempt should report:

- requested provider mode
- actual provider used
- whether fallback happened
- why fallback happened
- status
- progress
- output references

## v1 architecture rule

Keep v1 simple.

Prefer:

- clear transport layer
- clear routing layer
- clear error layer

Avoid giant abstractions early.

## Important future architecture note

The bridge should not own WandGx project style profiles, asset manifests, business rules, billing rules, or game integration logic.

Those remain WandGx responsibilities.
