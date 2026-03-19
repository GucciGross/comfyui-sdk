# ROUTING AND FALLBACK

## Required routing modes

### local
Use local only.

### cloud
Use cloud only.

### auto
Try local first, then fall back to cloud when allowed.

## Auto mode policy

In MVP, implement this policy:

1. Run a local preflight health check
2. If local is healthy, attempt local submit
3. If local is unhealthy and cloud fallback is enabled, use cloud
4. If local submit fails because of timeout, refused connection, unreachable host, websocket unavailable without workable fallback, or equivalent access failure, retry once on cloud if enabled
5. Record the actual provider used and fallback reason

## Metadata requirement

Every job result/status must record:
- providerRequested
- providerUsed
- fallbackTriggered
- fallbackReason

## Failure handling rule

Only trigger fallback for connection/access/provider-availability failures, not for ordinary workflow/content errors unless explicitly chosen later.

## Default product stance

Recommended default for apps:
- mode = `auto`
- fallbackToCloud = true
- retryOnConnectionFailure = true
