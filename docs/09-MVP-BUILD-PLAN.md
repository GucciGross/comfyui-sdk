# MVP BUILD PLAN

## Phase 1: foundation
- package setup
- tsconfig
- build config
- public exports
- shared types
- shared errors

## Phase 2: adapters
- implement local adapter contract
- implement cloud adapter contract
- keep local internals isolated from public exports

## Phase 3: routing
- implement bridge client
- implement mode selection
- implement local-preferred fallback
- attach provider usage metadata

## Phase 4: README and examples
- write README
- add basic usage examples for local, cloud, auto

## Phase 5: tests
- routing tests
- fallback tests
- error normalization tests

## MVP restraint
Do not derail into advanced billing, analytics, or product-specific WandGx storage systems.
