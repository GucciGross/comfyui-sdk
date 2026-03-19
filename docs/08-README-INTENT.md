# INTENT: README

A real `README.md` is required.

It must teach both humans and coding agents:
- what this package is
- why it exists
- what problem it solves
- how to install it
- how to configure local mode
- how to configure cloud mode
- how to configure auto mode
- how fallback works
- how to wire it into a UI switcher
- what metadata comes back
- what is included in MVP
- what is intentionally deferred

## README requirement from latest review

The README should clearly explain that:
- local adapter internals may optionally use `comfy-addons/comfyui-sdk`
- the package public API is still our own abstraction
- consumers should not depend on the external sdk API directly
