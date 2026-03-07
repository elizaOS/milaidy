# Milady Control UI

`apps/ui` is a standalone control surface for runtime/operator workflows.

## Wallet Dependencies

This UI includes Solana wallet adapter dependencies because it supports
wallet-connect/deep-link UX and client-side message signing flows that are
required by current operator workflows. Transaction execution and privileged
operations still run through backend APIs with server-side policy checks.

If wallet-connect is moved fully server-mediated later, these dependencies can
be reduced in a follow-up change.
