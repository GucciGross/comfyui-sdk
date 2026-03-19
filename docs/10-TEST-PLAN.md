# TEST PLAN

## Required MVP coverage

1. local mode routes to local
2. cloud mode routes to cloud
3. auto mode uses local when local is healthy
4. auto mode falls back to cloud when local health check fails
5. auto mode returns correct provider usage metadata
6. local mode errors correctly when no local instance is available
7. normalized error shapes remain consistent
8. preferred local instance selection works

## Nice-to-have
- retry behavior tests
- timeout behavior tests
- adapter contract tests
