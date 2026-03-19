# Intent: Create the README.md

## Mission

Write a first-class `README.md` for the Comfy bridge repo so both humans and agents immediately understand how to use, integrate, extend, and test it.

The README is not optional.
It is a core deliverable.

## README goals

The README must explain:

- the purpose of the bridge
- why it exists separately from WandGx
- supported providers
- local vs cloud vs auto mode
- fallback behavior
- configuration approach
- expected UI integration pattern
- expected WandGx integration pattern
- agent usage expectations
- basic testing strategy
- known boundaries for v1

## README audience

The README must work for:

- WandGx developers
- AI coding agents
- future contributors
- operators setting up local ComfyUI
- platform admins configuring cloud fallback
- UI developers adding the provider switcher

## README sections required

The README should contain these sections:

1. Project overview
2. Why this exists
3. Supported provider modes
4. Auto fallback behavior
5. High-level architecture
6. Integration into WandGx
7. UI switcher guidance
8. Configuration model
9. Error handling model
10. Testing expectations
11. Roadmap / future ideas
12. Contribution notes for agents and developers

## Tone and quality

The README should be:

- direct
- technical
- implementation-friendly
- agent-readable
- not full of fluff
- clear about what is implemented vs planned

## Important note

The README should describe the intended public contract of the bridge even before full implementation is complete.
That way the build stays aligned with the docs.
