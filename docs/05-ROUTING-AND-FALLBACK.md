# Routing and Fallback Logic

## Supported modes

### Local
Use local only.
If unavailable, fail clearly.
Do not silently switch unless policy explicitly allows it.

### Cloud
Use cloud only.

### Auto
Try local first.
Fall back to cloud when allowed.

## Preflight sequence for Auto

1. Resolve preferred local instance
2. Run local health check
3. If healthy, use local
4. If unhealthy and fallback is enabled, use cloud
5. If unhealthy and fallback is disabled, return a clear error

## Mid-run fallback

If a local submission attempt fails because of connection-level issues, the bridge may retry on cloud when:

- mode is Auto
- fallback is enabled
- retry-on-connection-failure is enabled

## Must record on each job

Each job should record:

- providerModeRequested
- providerUsed
- fallbackTriggered
- fallbackReason
- localInstanceId if relevant
- status
- progress
- output references

## Failure classes

Normalize failures into useful categories such as:

- NO_LOCAL_PROVIDER
- LOCAL_UNHEALTHY
- CLOUD_UNAVAILABLE
- AUTH_ERROR
- SUBMISSION_ERROR
- WEBSOCKET_ERROR
- POLLING_TIMEOUT
- OUTPUT_PARSE_ERROR
- NO_PROVIDER_AVAILABLE

## Policy rule

Fallback is a routing policy, not a hidden surprise.
The caller should always be able to see when and why it happened.
