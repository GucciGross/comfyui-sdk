# UI Switcher Spec

## Purpose

WandGx needs a user-facing provider switcher for Comfy generation.

The bridge should be designed so this UI is easy to integrate.

## Required modes

The UI must support:

- Local
- Cloud
- Auto

Recommended default:
- Auto

## Required fallback behavior

When Auto is selected:

- try preferred local first
- if local fails preflight, switch to cloud
- if local fails with connection-level failure during submission, retry on cloud if enabled
- record the fallback reason

## Recommended UI labels

User-facing wording should be clear.

Recommended primary label:
- Render Provider

Recommended mode labels:
- Local ComfyUI
- ComfyUI Cloud
- Auto · Prefer Local, Fallback to Cloud

## Recommended controls

### Primary selector
A dropdown, segmented control, or modal selector for:
- Local
- Cloud
- Auto

### Secondary controls
- Fallback to Cloud toggle
- Retry on Connection Failure toggle
- Preferred Local Instance selector

### Read-only runtime info
- Provider used
- Status badge
- Fallback reason
- Last checked time

## Placement inside WandGx

Best placement:
inside the game prompt builder and media generation flows.

Secondary placement:
advanced generation settings or admin defaults.

## UX requirement

Users should not need to manually type raw URLs or secrets in the normal creative flow.
Those belong in admin or configuration screens.
