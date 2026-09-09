# Auto Drive datalake sample

Status: implementation planned. This repository contains the monorepo foundation
and [implementation plan](docs/IMPLEMENTATION_PLAN.md), not a completed dapp.

## Product

A small website lets a user compose one XYO payload of at most 4,096 UTF-8 bytes
and press **Perma-Store**. The XL1 Chrome Wallet approves and signs an XL1
transaction. The sample stores the sole application payload in the existing
Aries Auto Drive datalake, verifies retrieval, and then uses the wallet to
broadcast the signed transaction. The page reports storage and chain finality
separately and can retrieve the payload again by its XYO hash.

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
4. **Required storage:** Before broadcast, the existing Aries Auto Drive backend
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
8. **Reproducible qualification:** Root build, strict policy/lint/dependency
   checks, and offline tests pass. Real Auto Drive tests require an explicit
   separate command and are excluded from ordinary test discovery and CI. A
   documented Chrome Wallet acceptance run proves the end-to-end path; headless
   signing tests alone do not satisfy criterion 1.

The initialization commit can satisfy repository checks without application
tests. It does not claim these product acceptance criteria are implemented.
