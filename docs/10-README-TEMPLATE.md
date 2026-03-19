# README Template Draft

# WandGx Comfy Bridge

A standalone bridge layer for connecting WandGx to both ComfyUI Local and ComfyUI Cloud.

## What this is

This project exists to give WandGx one stable interface for Comfy-based generation across local and cloud providers.

## Supported modes

- Local
- Cloud
- Auto

## Auto mode

Auto mode prefers local first and can fall back to cloud when configured to do so.

## Why this repo is separate

This keeps provider-specific transport logic out of the main WandGx app and makes the integration easier to reuse, test, and evolve.

## Planned responsibilities

- provider selection
- workflow submission
- progress watching
- output retrieval
- error normalization
- fallback handling

## Not this repo's job

- WandGx billing logic
- WandGx project style profiles
- WandGx game asset manifests
- WandGx prompt builder business rules

## Integration target

WandGx should call this bridge through a clear provider mode and routing payload.

## UI support

WandGx should expose:
- Local
- Cloud
- Auto
- fallback toggle
- preferred local instance selector
- runtime status display

## Status

Early-stage build.
Public contract should be documented before implementation expands.
