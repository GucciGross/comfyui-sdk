# CLOUD ADAPTER SPEC

The cloud adapter handles ComfyUI Cloud.

## Responsibilities

- use cloud base URL
- use cloud authentication
- submit workflows
- upload files if supported by flow
- retrieve job status
- normalize outputs and errors

## Required cloud behavior

- independent from local adapter
- independent from external local sdk
- no hidden assumption that cloud behaves exactly like local forever
- all cloud-specific auth and endpoint differences stay inside this adapter

## Implementation goal

The cloud adapter should present the same contract as the local adapter so the router can switch cleanly between them.
