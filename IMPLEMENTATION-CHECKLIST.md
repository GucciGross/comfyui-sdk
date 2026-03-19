# Implementation Checklist

## Docs first

- [x] Create `README.md`
- [x] Keep README aligned with docs pack
- [x] Define provider mode contract
- [x] Define fallback contract
- [x] Define normalized error contract

## Local support

- [x] Local config shape defined
- [x] Local health check implemented
- [x] Local submit implemented
- [x] Local progress handling implemented
- [x] Local output retrieval implemented

## Cloud support

- [x] Cloud config shape defined
- [x] Cloud auth implemented
- [x] Cloud submit implemented
- [x] Cloud progress handling implemented
- [x] Cloud output retrieval implemented

## Auto support

- [x] Local-first preflight implemented
- [x] Cloud fallback implemented
- [x] Retry-on-connection-failure implemented
- [x] Provider-used reporting implemented
- [x] Fallback-reason reporting implemented

## WandGx integration support

- [x] UI switcher payload documented
- [x] API payload documented
- [x] Runtime metadata documented
- [x] Integration example added to README

## Release readiness

- [x] Test plan executed
- [x] Docs updated
- [x] No repo-specific WandGx business logic leaked into bridge core
