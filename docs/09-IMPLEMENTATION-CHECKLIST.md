# Implementation Checklist

## Docs first

- [ ] Create `README.md`
- [ ] Keep README aligned with docs pack
- [ ] Define provider mode contract
- [ ] Define fallback contract
- [ ] Define normalized error contract

## Local support

- [ ] Local config shape defined
- [ ] Local health check implemented
- [ ] Local submit implemented
- [ ] Local progress handling implemented
- [ ] Local output retrieval implemented

## Cloud support

- [ ] Cloud config shape defined
- [ ] Cloud auth implemented
- [ ] Cloud submit implemented
- [ ] Cloud progress handling implemented
- [ ] Cloud output retrieval implemented

## Auto support

- [ ] Local-first preflight implemented
- [ ] Cloud fallback implemented
- [ ] Retry-on-connection-failure implemented
- [ ] Provider-used reporting implemented
- [ ] Fallback-reason reporting implemented

## WandGx integration support

- [ ] UI switcher payload documented
- [ ] API payload documented
- [ ] Runtime metadata documented
- [ ] Integration example added to README

## Release readiness

- [ ] Test plan executed
- [ ] Docs updated
- [ ] No repo-specific WandGx business logic leaked into bridge core
