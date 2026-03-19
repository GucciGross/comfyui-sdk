# INTENT: BUILD THE COMFY BRIDGE PACKAGE

## Mission

Build a standalone TypeScript package that provides one clean API for:
- ComfyUI Local
- ComfyUI Cloud
- Auto mode with local-preferred and cloud fallback

## Why this exists

Apps like WandGx should not need to know:
- local API quirks
- cloud auth quirks
- websocket differences
- retry/fallback details

They should only need to provide configuration and call a stable client.

## Product goals

The package must provide:
- stable provider abstraction
- consistent workflow submission API
- health/preflight checks
- upload helpers
- progress watching
- normalized output access
- normalized error model
- routing metadata showing requested provider vs actual provider used

## Public provider modes

The package must support:
- `local`
- `cloud`
- `auto`

### Mode rules

`local`
- always use local
- do not silently switch unless explicitly configured to allow fallback in this mode

`cloud`
- always use cloud

`auto`
- local is preferred
- if local health check fails, route to cloud
- if local submission fails due to connection/access timeout type issues, retry on cloud when fallback is enabled

## MVP feature set

Required in MVP:
- provider config types
- local adapter
- cloud adapter
- bridge client factory
- submit workflow
- upload input image/file helper where supported
- poll/get job status
- progress/event watching abstraction
- health check
- fallback metadata
- normalized errors
- strong README

## Explicit non-goals for MVP

Not required yet:
- cost tracking
- advanced scheduling policies
- tenant billing
- WandGx asset manifests
- project-level visual style canon persistence
- advanced queue balancing across many nodes beyond basic support

## Deliverable standard

The code should be readable, modular, and production-friendly.
Favor clean interfaces over clever abstractions.
