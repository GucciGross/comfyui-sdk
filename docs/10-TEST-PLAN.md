# TEST PLAN

## Minimum coverage targets

Test these behaviors if practical:
- local mode routes to local
- cloud mode routes to cloud
- auto mode prefers local when healthy
- auto mode falls back to cloud when local preflight fails
- auto mode falls back to cloud on retryable local connection failure
- workflow errors do not trigger fallback unless policy allows it
- normalized errors return correct provider/code/retryable flags
- routing metadata is populated correctly

## Documentation check

Also verify README examples match actual API names.
