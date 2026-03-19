# ROUTING AND FALLBACK

## Modes

### local
- always use local
- if local is unavailable, fail with normalized local-unavailable error
- do not silently switch unless a documented explicit option says otherwise

### cloud
- always use cloud

### auto
- try local first
- if local health check fails and fallback is enabled, use cloud
- if local submit fails for connection/access reasons and retry/fallback policy allows it, use cloud
- return provider usage metadata

## Required metadata

Every generation result or status must be able to indicate:
- requested mode
- actual provider used
- whether fallback happened
- why fallback happened
- which local instance was selected when relevant

## Preflight rule

In `auto` mode:
- do a local health check before first submission attempt
- do not wait for a long failure if a timeout is configured

## Failure normalization examples

- `LOCAL_UNAVAILABLE`
- `CLOUD_UNAVAILABLE`
- `FALLBACK_DISABLED`
- `SUBMIT_FAILED`
- `UPLOAD_FAILED`
- `JOB_NOT_FOUND`

Use typed errors or a strongly typed error shape.
