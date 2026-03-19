# Milady runtime background

Milady is a local-first AI agent runtime built on top of elizaOS.

## Foundation

- The project reuses elizaOS runtime primitives for agent boot, plugins, tasks, memory, connectors, and autonomous execution.
- Milady layers its own API server, dashboard UI, desktop shell, mobile surfaces, and deployment workflows on top of that runtime.
- The goal is one shared agent core that can run locally, in containers, and across desktop/mobile/web entry points.

## What this repo adds

- A Milady-branded onboarding and control surface.
- A local API and dashboard experience for managing agents, plugins, tasks, wallets, and cloud settings.
- Packaging targets for Docker, desktop releases, and mobile builds.
- Production-oriented scripts and workflows for building, publishing, and smoke-checking the agent image.

## Operational expectations

- The production container should be able to boot from a clean checkout after the runtime and app UI are prebuilt.
- The API should expose health and status endpoints used by deployment smoke tests.
- Changes that affect runtime boot, the bundled UI, or Docker packaging should keep the clean-build path healthy.
