# Shared sample client

Private browser library consumed by the React website and the explicit local XL1
functional test. Its public barrel exports `createSampleApi`, `storeAndAnchor`,
`resumeAnchor`, recovery validation, and the typed HTTP/wallet contracts.

Both consumers execute the same transaction construction, wallet signing,
detached JWT authentication, single-payload storage confirmation, independent
read-back, broadcast, and finalized-chain observation. Signing and chain I/O are
provided through public XL1 SDK capabilities. The library does not create a
signer, provision a chain, import Vitest at runtime, or contain provider secrets.

Recovery captures the approved payload and public signed transaction. It never
captures a JWT. An uncertain broadcast is queried by its existing transaction
hash without automatic resubmission. Storage read-back and chain finality remain
separate outcomes; neither confirms completed Auto Drive network archival.

An explicit retry action rechecks retrieval and finality before resending the
same signed transaction, without another upload. Reserved ambiguous uploads can
be reconciled with fresh authentication even after the signed transaction expires
or the operator disables writes. That recovery endpoint performs reads only;
expiration still prevents broadcast.

Build from the repository root using `pnpm build`. The emitted public entry is
`dist/browser/index.mjs`; all source consumers use the workspace package export.
