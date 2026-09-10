# Auto Drive datalake sample

Status: implementation in progress. The [implementation plan](docs/IMPLEMENTATION_PLAN.md)
defines the target behavior; it is not evidence of a completed or provider-qualified
dapp. README documents the commands and behavior currently implemented.

## Product

A small website lets a user compose one XYO payload of at most 4,096 UTF-8 bytes
and press **Perma-Store**. The XL1 Chrome Wallet approves and signs an XL1
transaction. The sample stores the sole application payload in Auto Drive,
verifies retrieval, and then uses the wallet to
broadcast the signed transaction. The page reports storage and chain finality
separately and can retrieve the payload again by its XYO hash.

The editor shows the complete `{ schema, salt, data }` payload. The fixed schema
is `com.example.message`. Each new draft receives a cryptographically random
32-byte salt encoded as 64 lowercase hexadecimal characters; the approved salt
is retained through signing, storage, retries, and recovery, and counts toward
the 4,096-byte limit.

The same importable application runtime must support two entry points: a
headless functional Vitest run using dapp-kit's local XL1 installer, and a real
browser application started with `pnpm start:local`, `pnpm start:sequence`, or
`pnpm start:mainnet` (`pnpm start` defaults to Sequence). The test replaces wallet
approval and external storage transports at explicit boundaries; it uses real
payload validation, authentication, transaction orchestration, and local-chain
finality. Passing it establishes local functional behavior, not Chrome Wallet
or Auto Drive qualification.

Local startup uses the published XYO Auto Drive adapter directly inside the
sample server, requiring only `AUTODRIVE_API_KEY` for storage. Sequence/Mainnet
use the existing Aries Auto Drive plane. A complete explicit Aries connection
can also override local mode. Local selects the chain, not a mock storage backend.

The GitHub repository stays private until its owner explicitly requests a
transition to public. The initial chain target is Sequence, with explicit network
selection and no automatic mainnet fallback. Repository privacy does not make
Auto Drive payloads private: this demonstration stores plaintext content.

## Acceptance criteria

1. **Real wallet flow:** In Chrome with the XL1 Chrome Wallet, the user explicitly
   connects on the configured network, approves signing, and broadcasts a real
   transaction through the wallet. The sample never handles the user's private
   key, grants automatic signing, or substitutes a backend signer.
2. **Exactly one application payload:** The transaction has exactly one
   `payload_hashes` entry and matching schema, no application payload elevated
   on-chain, and no additional manifest, receipt, schema declaration, or wrapper
   payload. Only that payload reaches the Auto Drive write path; the protocol
   transaction envelope and bound-witness metadata do not. Detached wallet JWTs
   authorize HTTP requests and never enter the transaction payload array or
   Auto Drive storage.
3. **Bounded admission:** The full finalized payload, including its fixed schema
   and data wrapper, must serialize to at most 4,096 UTF-8 bytes. The UI and server
   agree at the boundary, including non-ASCII input. Invalid JSON, wrong schemas,
   extra top-level fields, unsigned/invalid evidence, and oversized payloads
   cause zero Auto Drive writes.
4. **Required storage:** Before broadcast, the selected real Auto Drive backend
   stores the payload, and a fresh lookup returns the same normalized bytes and
   recomputed XYO hash. A rejection, incomplete acknowledgment, unavailable
   provider, or failed read-back prevents broadcast. No alternate store silently
   satisfies this requirement.
5. **Accurate outcomes:** The UI distinguishes rejected signing, storing,
   storage verified, broadcast unknown, pending, finalized, and stored but
   unanchored. Success requires both verified retrieval and finalized chain
   inclusion. A CID or mempool acknowledgment alone is never presented as finality
   or proof of completed Auto Drive network archival.
6. **Controlled permanent writes:** Only the configured sample schema can be
   stored. Authenticated admission, durable upload reservations, byte/count
   budgets, duplicate reconciliation, and an operator write-disable switch bound
   spending. Secrets stay server-side. The public UI exposes no delete/clear or
   generic upload capability.
7. **Meaningful framework integration:** Both website and service validate the
   same dapp-kit definition/configuration before enabling writes. Required
   datalake availability, write-before-broadcast, expected chain identity, and
   finalized consistency are enforced by runtime checks as well as declared in
   configuration.
8. **Runnable sample:** After a clean clone, installation with the pinned pnpm,
   and the documented prerequisites and small server-side `.env` configuration,
   the three named startup commands select XL1 settings without `.env` chain
   configuration, start the website and sample service together, and reach
   dependency readiness. In local mode, all three `ARIES_*` fields may be blank:
   `AUTODRIVE_API_KEY` selects the published XYO provider adapter, fixed provider
   endpoint, bucket, and namespace without a separate Aries service or token.
   Public profiles require the complete Aries connection. Partial Aries settings
   fail rather than mixing credentials; missing configuration cannot select memory
   storage. Startup makes no paid writes, preserves storage identity and ledger
   across restarts, and shuts down owned resources cleanly. Running an actual
   Aries server from this sample remains a separate artifact/composition gate.
9. **Functional Vitest sample:** `pnpm test:sample` uses
   `@xyo-network/dapp-kit-vitest-config`'s opt-in `local-xl1` project to exercise
   the same runtime through build/sign, authenticated admission, one-payload
   storage/read-back, broadcast, finalized inclusion, and retrieval. It boots and
   stops its own local chain and needs no external provider or wallet secrets.
   Wrong network, failed read-back, duplicate confirmation, and restart recovery
   are tested at the relevant boundaries. Headless signing remains test-only.
10. **Reproducible qualification:** Root build, strict policy/lint/dependency
    checks, and offline tests pass. Ordinary `pnpm test` starts no chain and makes
    no external provider requests. Real Auto Drive tests require an explicit
    separate command and are excluded from ordinary test discovery and CI. A
    documented Chrome Wallet acceptance run proves the real end-to-end path;
    local functional tests alone do not satisfy criterion 1 or 4.

Remove the initialization `passWithNoTests` allowance when the first application
behavior supplies tests. Track local, real-provider, Chrome Wallet, and hosted
acceptance independently; an implemented command alone does not satisfy these
product acceptance criteria.
