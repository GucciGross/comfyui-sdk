# README FIRST

This repo is a fresh standalone package whose goal is to become the cleanest possible bridge between ComfyUI Local and ComfyUI Cloud.

These docs replace the earlier intent set.

## Core direction

Build a standalone TypeScript package that:
- supports ComfyUI Local
- supports ComfyUI Cloud
- supports provider mode `local`, `cloud`, and `auto`
- supports local-preferred with cloud fallback
- exposes GUI-friendly types so apps like WandGx can build a provider switcher on top
- keeps business logic out of the transport layer

## Important architecture rule

Do not treat the external `comfyui-sdk` repo as the final product.
It should be treated as either:
- inspiration, or
- an internal dependency for the local adapter only

Our package must own:
- provider abstraction
- cloud adapter
- auto routing
- fallback logic
- normalized errors
- public types for app/UI integration
- README and developer guidance

## What not to do in MVP

Do not overbuild:
- no billing system
- no WandGx-specific asset registry in this repo
- no database requirement
- no giant plugin system
- no unnecessary CLI unless required by docs later

## What success looks like

A clean, usable MVP package with:
- local adapter
- cloud adapter
- bridge client/factory
- provider routing and fallback
- health checks
- normalized results and errors
- README that teaches humans and agents how to use it
