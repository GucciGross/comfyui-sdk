# INTENT: CREATE README.md

## Mission

Create a README.md that teaches both humans and agents how to understand, integrate, and use this package.

## README must include

### 1. What this package is
Explain that it is a bridge package for ComfyUI Local and ComfyUI Cloud.

### 2. Why it exists
Explain that apps should not need to manage provider quirks directly.

### 3. MVP scope
Clearly explain what is included in MVP and what is not.

### 4. Installation
Document install steps.

### 5. Configuration
Show examples for:
- local mode
- cloud mode
- auto mode

### 6. Fallback behavior
Explain exactly how local-preferred with cloud fallback works.

### 7. Public API examples
Show how to:
- create the client
- run a health check
- submit a workflow
- inspect status
- read routing metadata

### 8. GUI integration guidance
Explain how an app like WandGx can wire this package into a provider switcher UI.
Mention fields like:
- mode
- preferred local instance
- fallback to cloud
- retry on failure
- timeout

### 9. Agent guidance
Include a short section for AI coding agents about how they should integrate this package without bypassing its public API.

## Rule

README is a required deliverable, not a nice-to-have.
