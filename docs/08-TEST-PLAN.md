# Test Plan

## Local mode tests

- connect to healthy local instance
- fail clearly when local base URL is missing
- fail clearly when local instance is unreachable
- submit a workflow successfully
- watch progress successfully
- retrieve outputs successfully

## Cloud mode tests

- fail clearly when API key is missing
- connect with valid configuration
- submit a workflow successfully
- watch progress successfully
- retrieve outputs successfully

## Auto mode tests

- local healthy -> uses local
- local unhealthy + fallback enabled -> uses cloud
- local unhealthy + fallback disabled -> fails clearly
- local submission connection failure + retry enabled -> retries on cloud
- local submission connection failure + retry disabled -> fails clearly

## Metadata tests

Every job should correctly report:

- provider mode requested
- provider used
- fallback triggered
- fallback reason
- status progression

## UI integration tests

- UI payload maps cleanly to routing behavior
- status badge has enough data
- provider-used field is populated
- fallback reason is available when relevant

## Documentation tests

Before release, verify that README and docs still match actual behavior.
