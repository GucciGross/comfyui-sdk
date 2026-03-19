# MVP Build Plan

## Phase 1: Contracts and docs

Create and finalize:

- README.md
- public interface notes
- provider mode definitions
- routing logic definition
- error model definition

## Phase 2: Local provider support

Implement local provider support first:

- health check
- workflow submit
- upload
- progress watch
- output retrieval

## Phase 3: Cloud provider support

Implement cloud support with the same normalized contract:

- auth
- health check if applicable
- workflow submit
- progress watch
- output retrieval

## Phase 4: Auto routing

Implement:

- local-first preflight
- fallback to cloud
- retry-on-connection-failure
- job metadata reporting

## Phase 5: WandGx integration support

Document and validate:

- UI switcher payload contract
- backend payload contract
- provider-used reporting
- fallback reason reporting

## Phase 6: Hardening

Add:

- timeout handling
- error normalization cleanup
- test coverage
- docs updates

## MVP exit criteria

MVP is complete when:

- local mode works
- cloud mode works
- auto mode works
- fallback mode works
- errors are understandable
- README is usable
- WandGx can integrate without guessing
