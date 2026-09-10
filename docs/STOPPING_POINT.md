# Implementation stopping point

Date: September 9, 2026. This checkpoint captures the implemented sample and the
remaining qualification work. Development is paused here; the full product's
live acceptance criteria are not yet closed.

## Current behavior

- Four workspaces implement the neutral protocol, shared browser/test client,
  Node HTTP service with persistent PGlite admission ledger, and React website.
- `pnpm start:local`, `pnpm start:sequence`, and `pnpm start:mainnet` select XL1
  settings in code. `pnpm start` aliases Sequence. Local owns a persistent chain
  on port 8080 and stops that child on shutdown.
- Local storage uses real Auto Drive through the published XYO adapter. Set
  `AUTODRIVE_API_KEY`; the three `ARIES_*` connection values may remain blank.
  Sequence/Mainnet require an existing configured Aries Auto Drive plane. A
  complete Aries connection can also override local storage setup.
- Uploads require explicit write enablement, allowed signers, and count/byte
  budgets. Credentials remain server-side. `.env.example` documents the setup.
- The editor displays the entire `{schema, salt, data}` payload. The schema is
  `com.example.message`; salt is 32 cryptographically random bytes encoded as
  64 lowercase hex characters. **New salt** preserves data while changing payload
  identity. Editing, signing, retry, and recovery preserve the approved salt.
- The shared flow validates and signs one payload, authenticates admission with
  a wallet JWT, reserves persistent capacity, stores once, verifies fresh
  read-back, and then permits broadcast. Finality is independently checked;
  uncertain uploads are reconciled without blindly uploading again.

## Verified at this checkpoint

Runtime: Node 24.14.1 and pnpm 12.3.4.

| Check | Latest result |
| --- | --- |
| `pnpm check` | Passed |
| `pnpm build` | Passed, strict lint and dependency validation clean |
| `pnpm test` | 128 offline tests passed; no provider or chain calls |
| Selected `pnpm test:sample` tests | Four passed: salted signing/storage/finality flow and three owned-chain lifecycle tests |
| Compiled-CLI startup tests | Two excluded from the latest run because an existing listener occupied `127.0.0.1:8080`; both passed before the schema/salt changes |
| Browser | Complete schema/salt visible; salt regeneration, preservation, and rejection checked; 390-pixel layout has no horizontal page overflow or console warnings/errors |

The latest local-chain selection was:

```sh
pnpm test:sample --testNamePattern 'authenticates, stores|owned local XL1 process lifecycle'
```

Native LMDB required running the opt-in local-chain tests outside the macOS agent
sandbox. Ordinary terminal execution needs no such exception. Test storage and
provider transports were controlled. No real Auto Drive upload, public-chain
transaction, or provider archival confirmation was performed.

See [LOCAL_QUALIFICATION.md](LOCAL_QUALIFICATION.md) for the evidence history and
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for the remaining milestones.

## Resume here

1. Restart the development application to load the latest strict salted-payload
   contract. Previously signed unsalted payloads cannot be silently migrated;
   preserve state needed to reconcile any prior operation.
2. Once the existing port-8080 listener is intentionally stopped, run the complete
   `pnpm test:sample` suite to revalidate both compiled-CLI startup paths against
   this checkpoint. Do not adopt or terminate an unrelated listener automatically.
3. Configure a real provider account and explicitly bounded write settings, then
   qualify one authorized upload and fresh read-back. Measure latency against the
   transaction validity window. Keep provider acceptance and archival distinct.
4. Qualify the installed XL1 Chrome Wallet: connect, correct network/account,
   origin-bound JWT, approval rejection, signing, broadcast, finalized inclusion,
   and reload recovery. Local headless signing does not prove this browser flow.
5. Qualify the existing Aries plane for public profiles, including backend,
   schema/size policy, public-read access, and credential renewal. Official Aries
   image composition, live acceptance harnesses, and hosted deployment remain
   outstanding; Mainnet has not been live-qualified.

The temporary browser-verification server has been stopped. The pre-existing
development application was left running. Local `.env`, runtime ledgers, chain
data, logs, and generated build output are excluded from version control.
