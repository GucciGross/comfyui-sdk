# Intent: Build WandGx Comfy Bridge

## Mission

Create a brand new standalone repository that acts as a bridge between WandGx and both ComfyUI Local and ComfyUI Cloud.

This repo is not WandGx itself.
This repo is a separate integration layer that WandGx can install and use.

The bridge must support:

- Local ComfyUI connections
- ComfyUI Cloud connections
- A provider switcher model
- Auto mode
- Local-first fallback to cloud
- Health checks
- Job submission
- Progress watching
- Output retrieval
- Normalized errors
- Future GUI integration

## Why this exists

WandGx needs one stable abstraction over both local and cloud Comfy providers.

We do not want WandGx app code to directly own every API difference, auth difference, websocket difference, queue behavior, or future cloud change.

The bridge should hide those differences and present one clean interface.

## Core product requirement

The bridge must make this user experience possible inside WandGx:

- User chooses Local
- User chooses Cloud
- User chooses Auto
- In Auto mode, WandGx tries local first
- If local is unavailable, WandGx falls back to cloud
- WandGx can show the provider actually used
- WandGx can show fallback reason
- WandGx can show health / status clearly in the UI

## Non-goals for v1

Do not overbuild v1.

Avoid trying to solve everything at once:

- do not build billing first
- do not build a huge workflow visual editor first
- do not build advanced scheduling first
- do not build multi-region routing first
- do not build every media pipeline first
- do not tightly couple this repo to WandGx internals

## v1 outcomes

Version 1 should do these things reliably:

- connect to local
- connect to cloud
- submit a workflow
- upload required inputs
- watch progress
- get outputs
- return normalized typed errors
- support auto fallback mode

## Required docs to create and maintain

This repo must include a strong top-level README that explains:

- what this bridge is
- what local mode is
- what cloud mode is
- what auto mode is
- how fallback works
- how WandGx should integrate it
- how UI switchers should call it
- how agents should work with it
- how developers should test it

## Delivery expectation

Build the bridge in stages, but document the intended API and user experience before implementation starts.
