# README Spec

## Goal

This document defines what the repo `README.md` must contain.

## Required opening

The README should immediately explain that this repo is:

- a standalone bridge for ComfyUI Local and ComfyUI Cloud
- designed for WandGx integration
- intended to support Local, Cloud, and Auto modes
- built with fallback support in mind

## Required sections

### Overview
What the project is and what problem it solves.

### Why separate repo
Why WandGx should depend on this as a reusable package instead of baking all provider logic into the main app.

### Modes
Explain Local, Cloud, and Auto.

### Fallback
Explain local-first and cloud fallback behavior.

### Planned public API
Describe the intended client contract before or during implementation.

### WandGx integration
Explain how WandGx should call the bridge.

### UI integration
Explain how a provider switcher should interact with the bridge.

### Configuration
Explain the expected configuration surface.

### Errors
Explain normalized typed errors.

### Testing
Explain the expected local, cloud, and auto-mode tests.

### Roadmap
Explain likely next features after MVP.

## Agent instruction note

The README should explicitly tell AI coding agents:

- do not invent provider modes outside the documented ones
- do not bypass the routing layer
- do not mix WandGx business logic into the bridge
- keep the bridge transport-focused
- update docs when public contract changes
