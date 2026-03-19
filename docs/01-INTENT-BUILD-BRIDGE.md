# INTENT: BUILD THE BRIDGE

Build a fresh standalone TypeScript package that normalizes ComfyUI Local and ComfyUI Cloud behind one public interface.

## Primary goals

1. Support provider modes:
   - `local`
   - `cloud`
   - `auto`

2. Support local-preferred fallback:
   - try selected or preferred local first
   - if local is unavailable and fallback is enabled, route to cloud
   - report the actual provider used

3. Expose GUI-ready public types:
   - mode
   - preferredLocalInstanceId
   - fallbackToCloud
   - retryOnConnectionFailure
   - localTimeoutMs
   - providerUsed
   - fallbackReason

4. Keep implementation modular:
   - shared core types
   - local adapter
   - cloud adapter
   - bridge client / router
   - normalized errors

## Product boundary

This repo is not WandGx itself.
This repo is the bridge package that WandGx or another app can import.

## Deliverable mindset

The output must be actual code, not just docs.
The public API must be stable enough to power a future UI switcher.
