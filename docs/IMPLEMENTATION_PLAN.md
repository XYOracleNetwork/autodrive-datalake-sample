# Auto Drive datalake sample implementation plan

Status: implementation in progress. This document specifies target behavior and
qualification gates; it does not claim that every command or integration below
is implemented. README records the current executable surface and remaining
gates. Real Auto Drive, Chrome Wallet, and deployment qualification remain
separate outcomes. Research and plan-review baseline: September 9, 2026.

## Implementation checkpoint — September 9, 2026

See [STOPPING_POINT.md](STOPPING_POINT.md) for the latest checkpoint, exact
verification limits, and ordered resume steps.

Implemented: four executable workspaces; strict payload/profile rules; the shared
browser/test transaction workflow; authentic wallet-JWT and transaction admission;
an Aries HTTP adapter; persistent PGlite budgets and upload identity; React wallet
UI; explicit `local-xl1` functional tests; and a root compile-and-start entry.
The initialization no-tests allowance has been removed.

The local functional flow has demonstrated finalized inclusion after one
controlled-storage upload, fresh retrieval, and restart/recovery without another
upload. This qualifies M1/M1a's local execution path. It does not close M0's live
wallet compatibility gate or M2–M4's external backend, authorization-boundary,
provisioning, archival, or live acceptance gates. Local startup now selects a
direct published XYO Auto Drive adapter when the three Aries settings are blank;
it needs only the provider key for storage. This removes the local Aries-server
distribution dependency without changing required Auto Drive storage. Official
Aries-image composition and hosted deployment remain unimplemented.

## 1. Outcome and fixed decisions

Build a small demonstration of the Aries Auto Drive datalake backed by the
published XYO SDK S3 archivist. A user composes one payload, presses
**Perma-Store**, and approves the resulting authentication, transaction-signing,
and broadcast prompts in the XL1 Chrome Wallet. The result exposes the payload's
XYO hash, transaction hash,
retrieval status, and chain finality. A provider CID may be displayed when a
qualified receipt endpoint is available.

| Decision | Initial implementation |
| --- | --- |
| Repository | `XYOracleNetwork/autodrive-datalake-sample`, **private** until explicitly changed by its owner |
| Chain | Sequence first, selected explicitly; mainnet requires deliberate configuration and qualification |
| Wallet | XL1 Chrome Wallet through the public XL1 React/client SDK APIs |
| Payload limit | **4,096 bytes**, measured as UTF-8 of the complete normalized payload, before compression |
| Admitted schema | `com.example.message` only |
| Payload form | `{ "schema": "com.example.message", "salt": "<64 lowercase hex characters>", "data": { ... } }` |
| On-chain application payloads | None; no elevated application content or application script |
| Off-chain application payloads | Exactly one: the composed payload |
| Durable payload backend | Local: published XYO Auto Drive adapter; public profiles: existing Aries Auto Drive plane, using XYO SDK 7.4.1 or a subsequently qualified release |
| Website | Private React/Vite application workspace; no hosted platform dependency in v1 |
| Application framework | `@xyo-network/dapp-kit` for shared definition/configuration and enforced profile validation |
| Functional test | `pnpm test:sample`, using the public dapp-kit Vitest `local-xl1` installer and the shared application runtime |
| Local entry point | `pnpm start:local`, `pnpm start:sequence`, and `pnpm start:mainnet` select XL1 configuration; `pnpm start` aliases Sequence |
| Provider credentials | Only the server owning Auto Drive storage receives `AUTODRIVE_API_KEY`: sample server for direct local mode, separate plane for Aries mode |
| Initial hosting | Local services first, then a single controlled deployment; no deployment in this planning milestone |

The repository being private is independent of stored content privacy. The UI
must explain before signing that the payload will be publicly readable plaintext
and that logical deletion cannot undo permanent storage. The fixed wrapper allows
arbitrary JSON object data while keeping a strict top-level schema allowlist; it
does not permit arbitrary XYO protocol schemas.

The sample demonstrates required Auto Drive storage. It does not need the broader
multi-target "store everything in S3" setup. It also cannot promise that peers,
wallet software, or other participants never retain another copy of public data.
The enforceable invariant concerns this transaction's application content and
the sample's own storage calls.

## 2. Repository and package boundaries

```text
autodrive-datalake-sample/
  docs/IMPLEMENTATION_PLAN.md
  PRD.md
  packages/
    protocol/       # neutral payload rules and dapp-kit definition/configuration
    client/         # browser-compatible shared transaction and HTTP orchestration
    web/            # React/Vite website and Chrome Wallet orchestration
    server/         # Node admission, budgets, receipt/read proxy, Aries HTTP client
  test/            # future explicit provider and wallet acceptance harnesses
  deploy/          # future local service composition and deployment instructions
```

Add application manifests, source, and dependencies as these workspaces are
implemented. No dummy Perma-Store button or passing mock demonstration should be
shipped as a working feature. Keep local-chain functional specs inside the
package `src/**/spec/local-xl1/` tree so the public preset discovers them.

Use pnpm, ESM, Node 24, the active `@ariestools` toolchain/config packages, and a
single committed lockfile. Run every `xy` command from the repository root.
Maintain these distinct package profiles:

- **protocol:** private neutral library, `@ariestools/tsconfig`, no Node/DOM
  globals. Export the payload schema, byte accounting/normalization contract,
  dapp-kit documents, and transport request/response types.
- **web:** private browser React app with `@ariestools/tsconfig-react`, React
  ESLint configuration, and Vite-owned production output. The package compile
  hook invokes its actual application build; it must not substitute a library
  bundle for the website.
- **client:** private browser-compatible library with `@ariestools/tsconfig-dom`,
  consumed through its package export by both the website and the Node-hosted
  functional test. Keep browser UI, Node APIs, and test installers out of runtime
  exports. Test imports must not cross another package's source `rootDir`.
- **server:** private Node service with explicit Node types, service dependency
  policy, an actual start entry, and `xy`-owned Node compilation. Runtime packages
  belong in `dependencies` so a production-only install works.

Keep toolchain versions aligned, check peer ranges, and install dependencies with
pnpm. Do not vendor SDK snapshots, introduce `file:` dependencies, or copy the
S3/Auto Drive implementation into this repository.

### One runtime for tests and startup

Keep application construction importable and free of startup side effects.
Configuration loading, binding HTTP listeners, selecting adapters, and process
signal handling belong in the executable entry point. Shared constructors own
payload/profile rules, evidence validation, admission, storage confirmation,
reconciliation, and the transaction workflow. They accept explicit wallet,
storage transport, ledger, chain viewer, and time dependencies and return
explicit readiness and idempotent disposal operations.

The browser imports the same browser-compatible orchestration exercised by the
functional test. The server entry and test harness construct the same admission
service and HTTP routes. Do not maintain a simplified test implementation of the
sample. Test-only adapters provide a local funded signer and an instrumented
storage boundary; production selects Chrome Wallet and the configured Aries
client. Production configuration must not enable test adapters through a missing
key or a failed connection.

### Root startup contract

The clean-clone path is `pnpm install --frozen-lockfile`, configure the
documented storage settings in `.env.example`, then select `pnpm start:local`,
`pnpm start:sequence`, or `pnpm start:mainnet`. `pnpm start` aliases Sequence. The root command must build missing
application output or document an explicit build prerequisite, start the web
and sample service together, wait for dependency readiness, and report the
numeric-loopback URL. `pnpm dev` may provide hot reload separately. The test and
start paths must not require workspace source aliases or another local checkout.

For local mode, blank `ARIES_PLANE_URL`, `ARIES_DATALAKE_ID`, and
`ARIES_PLANE_TOKEN` select the published `@xyo-network/archivist-s3/auto-drive`
factory inside the sample service. Only `AUTODRIVE_API_KEY` is needed for storage.
Use the SDK's fixed endpoint, bucket `autodrive-sample`, and namespace `local`;
Auto Drive buckets are implicit namespaces created by the first admitted write.
There is no local-disk fallback and no fabricated Aries token or HTTP endpoint.
Readiness performs a bounded read-only request, never a test upload or full listing.
Partial Aries settings are rejected. All three explicitly configured Aries values
override local mode to use that external service. Public profiles always require
the complete Aries connection. Keep write enablement, signer authorization, and
count/byte budgets explicit for real provider writes in every mode.

Document prerequisites separately from `.env`: Node 24, the pinned pnpm, Chrome
with the qualified wallet for interactive signing, and access to the configured
Sequence network. The first implementation may use an already provisioned Aries
endpoint and an owned embedded PostgreSQL ledger through PGlite. Its small
`.env.example` must identify the required endpoint/lake identity, server
credential, persistent base directory, allowed signers, and
positive write/byte budgets; keep fixed schema, byte ceiling,
and safe loopback defaults in code. List credential renewal responsibilities. Public network profiles take endpoint and
expected chain identity from the installed SDK presets and fail on an identity
mismatch. The Local profile owns a persistent public CLI development chain on
port 8080 and discovers its retained identity. Legacy XL1 environment settings
must not redirect a named profile. Each profile has a separate ledger directory.
Only the selected server-side storage owner receives the Auto Drive provider key.

Self-contained composition of an actual Aries service additionally needs a qualified official Aries image
pinned by digest, an accessible distribution/authentication path, and a local
database/service composition. Docker is a prerequisite for that composition,
not for ordinary offline tests. Building a private checkout manually is an
operator fallback with explicit steps, not evidence that a sample clone starts
the full stack. Until artifact distribution and composition are qualified,
describe the configured-endpoint path honestly and keep the self-contained
acceptance gate open.

Startup validates configuration before enabling writes, runs versioned ledger
migrations, validates or idempotently provisions the descriptor/ACL, retains the
same datalake ID and namespace, and verifies service authentication and an
authorized read without uploading. A foreign or incompatible existing descriptor
is an error, not permission to replace it. Expose HTTP liveness separately from
dependency readiness and write availability. On partial failure or interrupt,
stop owned listeners, workers, clients, and database pools without deleting
persistent state; an externally configured Aries endpoint remains externally
owned. Repeated startup and shutdown must work without manual cleanup.

## 3. Verified APIs and the transaction constraint

The straightforward convenience call is **not** the correct integration point
for this selective store. `SimpleXyoGatewayRunner.addPayloadsToChain` optionally
calls `writeXl1TransactionContent`, which writes all signed evidence content. That
content includes both the application payload and the transaction bound witness.
Its acknowledgment contract requires all of them. A datalake admitting only the
sample schema will intentionally exclude the transaction envelope and fail that
contract. Widening the Auto Drive allowlist would violate this sample's intent.
[Sources: convenience runner][runner], [transaction phases][phases].

Use the **public phased transaction functions** from `@xyo-network/xl1-sdk`:

```text
buildXl1Transaction(wallet viewer, wallet signer, [], [payload], options)
  -> signXl1Transaction(wallet signer, unsigned transaction)
  -> sample server validates signed evidence and admission
  -> Aries Auto Drive datalake inserts only payload
  -> read payload back and verify bytes/hash
  -> broadcastXl1Transaction(wallet runner, signed evidence)
  -> reconcile and observe finalized inclusion
```

The exact function arguments/types must be imported from the installed release,
not recreated. The sequence above is architectural pseudocode. The public
`broadcastXl1Transaction` function sends the transaction through the supplied
runner and validates its returned hash; it does not call a datalake. In the
wallet-backed runner, signing and broadcast remain Chrome Wallet operations.
This is application orchestration around wallet capabilities, **not** a hidden
wallet datalake override. [Source: phased API][phases].

The storage response must bind the intent, signer, normalized payload hash,
signed transaction hash, chain identity, normalized byte count, verification
time, and read-back state. The browser compares
all of them with its frozen signed evidence before allowing broadcast; it must
not broadcast solely because a server returned a generic success flag.

For this flow, build with an empty on-chain array and a one-element off-chain
array. The inspected 5.5.3 SDK produces one payload hash, one schema, one hydrated
application payload, and no elevate script for that input. Protocol transaction
headers, signatures, and bound-witness fields are necessary chain structure; they
are not additional application payloads and are never inserted into Auto Drive.

Do not call `writeXl1TransactionContent` against the selective datalake. Do not use
the whole-content verification helper as its acceptance condition either. Verify
the one admitted payload explicitly through the Aries HTTP contract.

No automatic-signing permission, backend user signer, raw XL1 RPC method strings,
Ethereum RPC, or private `xyoDataLakes_*` wallet methods are needed.

### Network connection

Use `WalletGatewayProvider`, `useProvidedGateway`, and the SDK's public account
and permission hooks. Pin the configured network explicitly at every connection
boundary and verify its actual chain identity before signing and before broadcast.

The inspected `ConnectAccountsStack` calls `useConnectAccount(undefined, ...)`,
which defaults to mainnet. For Sequence, implement a small connection control
using `useConnectAccount(SequenceNetwork.id, timeout)`; alternatively consume a
qualified upstream fix exposing the network choice. Do not silently inherit the
component's default. This is a source-backed exception to the current skill's
generic connection-component recommendation. Request only account and signer
address permissions; transaction approval remains the ordinary wallet prompt.
[Sources: connection hook][connect], [connection component][connect-stack],
[wallet provider][wallet-provider].

## 4. Meaningful dapp-kit integration

The shared protocol workspace defines an actual `DappDefinition` and builds a
`DappConfiguration` from the selected network and expected chain identity.
Keep service endpoints in a separately validated sample configuration; do not
invent top-level endpoint fields in the dapp-kit schema. Parse and validate both documents, then call
`validateDappProfile(definition, configuration)` before enabling writes in the
website or starting the service's write routes.

Use the published exports `DappDefinitionZod`, `DappConfigurationZod`,
`validateDappDefinition`, `validateDappConfiguration`, and `validateDappProfile`.
There is no `defineDapp` export in the inspected release. `createDappPlan` can
provide a reproducible local profile report if useful; it does not create another
on-chain or Auto Drive payload. [Sources: definition][definition],
[configuration][configuration], [profile validation][profile-validation].

Definition durability:

```ts
{
  contentMode: 'datalake-backed',
  datalake: {
    mode: 'required',
    allowedReadAccess: ['public-read'],
    allowedContentProtection: ['plaintext'],
    minimumCopies: 1,
    minimumRetentionSeconds: 0,
    unavailableBehavior: 'fail-closed',
  },
  projection: { profile: 'none' },
  auxiliaryStores: [],
  consistency: 'finalized',
}
```

Runtime datalake policy:

```ts
{
  mode: 'required',
  readAccess: 'public-read',
  contentProtection: 'plaintext',
  writeBeforeBroadcast: true,
  requiredCopies: 1,
  retentionSeconds: 0,
  unavailableBehavior: 'fail-closed',
}
```

The zero retention value means no additional numerical minimum in this profile;
it is not an expiration, deletion promise, or proof of permanent archival. Auto
Drive's provider behavior is documented separately. Declare finalized XL1 as the
canonical source and a finalized-consuming relationship. Coordination and
external interaction profiles can remain `none`; list only actors/ports actually
hosted by dapp-kit. Empty inventories are appropriate here because the website
and Node HTTP adapter are not being presented as a dapp-kit actor host.

This declaration does not itself implement write ordering, validation, or
finality. The subsequent runtime gates and tests enforce those behaviors. The
browser host package currently disallows effectful application ports and does
not integrate the Chrome Wallet/React flow, so v1 does not depend on
`@xyo-network/dapp-kit-browser` or invent an effectful browser session.
[Source: browser host limitations][browser-host].

Dapp-kit document hashing is distinct from XYO payload hashing. Never put a
configuration digest in the payload-hash field or upload the definition/config
as an extra payload to make framework participation visible.

## 5. Composer, normalized bytes, and identity

Provide an editor showing the complete `{ schema, salt, data }` JSON, a read-only
normalized preview, and a live **bytes / 4,096** counter. The schema is fixed.
Generate the public salt from 32 cryptographically random bytes when a draft is
created. An explicit **New salt** action changes its identity before signing;
normalization, edits to data, retries, and reload recovery retain the same salt.
Reject a missing salt or anything except 64 lowercase hex characters. Use simple formatted JSON;
binary files, compression, attachments, multiple payloads, and user-defined root
schemas are outside v1.

Define one deterministic normalization routine in the neutral protocol package:

1. Parse with dapp-kit's public `parseStrictJsonText`, using `maximumDepth: 16`
   and `requireTopLevelObject: true`. It rejects duplicate keys, nonfinite or
   unsafe numeric literals, unpaired surrogates, and excessive nesting before
   normalization can silently alter them. Require an object at `data`, and reject unsupported structures and
   extra top-level fields. Reject rather than strip supplied `_hash`, `_dataHash`,
   `_sequence`, client metadata, signatures, or protocol envelope fields.
2. Validate the complete `{ schema, salt, data }` object and serialize it with dapp-kit's
   public `canonicalizeIJson`. It sorts object keys recursively, preserves array
   order and Unicode code points, and rejects unsupported values. Use this same
   routine in the browser and server; do not write a second generic serializer.
   The UI shows the normalized value being approved.
3. Capture that canonical JSON text and its corresponding payload object once.
   Count UTF-8 bytes with the imported `utf8ToBytes` utility from
   `@noble/hashes/utils.js` in the neutral shared package. Browser `TextEncoder`
   can be used for a parity test, not as an undeclared neutral-package global. Whitespace typed
   into the editor is not part of the stored encoding. The fixed wrapper counts.
4. Require `byteLength <= 4096`; freeze/capture this snapshot before asynchronous
   wallet calls so editing cannot change the payload being approved or persisted.
5. Compute the XYO identity with `PayloadBuilder.hash` and verify it against the
   signed transaction's corresponding payload hash. Use the XYO SDK's identity
   logic, never a hand-written SHA hash as a substitute.

On retrieval, omit SDK storage metadata with the public XYO helper, reapply the
same normalization, compare UTF-8 bytes with the approved snapshot, and recompute
the XYO hash. Present both a copyable hash and a fresh **Retrieve again** action.
The SDK primary object includes storage metadata and separate indexes; the 4 KiB
ceiling bounds the application payload, not total provider object bytes or a
promise of a particular provider price.
[Sources: dapp-kit strict JSON parser][strict-json],
[dapp-kit encoding utilities][canonical-document].

`canonicalizeIJson` supplies deterministic payload bytes without a document
prefix. Do not substitute `encodeDappDocument` or `hashDappDocument`, whose domain
separation serves dapp-kit document identities; XYO identity still comes from
`PayloadBuilder.hash`.

## 6. Service and existing Aries data plane

Use the actual Aries data-plane service containing the integration at commit
`65537a81d87642bc58d5588393530817f7d6e9af` or a later qualified release. Its
`@ariestools/aries-datalake-plane` package is **private** and the npm registry
returns 404. Do not add a nonexistent public package dependency to the sample.
The published `@ariestools/aries-datalake-client@0.1.20` exposes HTTP clients; the
sample Node service uses that public client to reach the separately deployed
plane. The public Aries CLI bundles a local dev server, but that server only
selects memory/file storage; it cannot satisfy required Auto Drive storage.
Local startup therefore uses the published XYO Auto Drive factory directly;
the following external-plane provisioning details apply to Aries mode.
[Sources: plane manifest][plane-package], [plane implementation][plane],
[HTTP client][client].

The initial configured-endpoint profile starts only the sample-owned website,
service, and ledger; it connects to an operator-provisioned official plane.
Endpoint, stable lake ID, credential, and qualified backend policy are required
configuration. Startup does not create, stop, or reconfigure that external plane.

The self-contained local composition milestone must consume an accessible,
verified official image pinned by digest. No image digest is assumed available
here. Building the official plane from its pinned private source with its
root-context Dockerfile is an explicit operator fallback requiring source access.
Confirm a clean build and runtime before documenting either route as working.
The inspected Dockerfile uses Node 22 while this sample standardizes on Node 24;
qualify that service independently and fix an upstream container incompatibility
if one appears. Do not assume source tests establish container readiness.
[Source: plane Dockerfile][plane-docker].

Configure one dedicated sample datalake with two matching admission boundaries:

```text
Data-plane process:
  PAYLOAD_STORE=auto-drive
  AUTODRIVE_ALLOWED_SCHEMAS=com.example.message
  AUTODRIVE_MAX_PAYLOAD_BYTES=4096
  AUTODRIVE_BUCKET=<operator-configured bucket>
  AUTODRIVE_PREFIX=<deployment-specific sample namespace>
  AUTODRIVE_API_KEY=<server-side secret>

Datalake descriptor:
  schemaPolicy: allowlist
  allowedSchemas: [com.example.message]
  maxPayloadBytes: 4096
```

Both the descriptor and SDK-backed service ceiling must reject excluded schemas.
Use a persistent control store and stable datalake ID. Never accept a lake ID,
bucket, endpoint, provider key, schema allowlist, or byte ceiling from the browser.
The sample exposes no unauthenticated append, delete, clear, or administration
route. The pinned plane cannot issue an origin-less append-only service
credential: both an HMAC runner role and an origin-less service wallet JWT permit
delete and clear as well as append/read/usage. Do not describe that credential as
operation-scoped. The initial deployment must restrict the sample's network path
to the exact configured lake's required insert, read, and usage methods/routes,
with the underlying plane inaccessible through that path. A small upstream
operation-scoped service-authentication change is an alternative qualification
gate. A client wrapper that merely omits delete methods is not the network
boundary. Keep the broader backend credential server-side and validate the
selected boundary before enabling writes.
[Sources: admission configuration][admission], [plane authorization][plane-auth].

In self-contained composition, bootstrap the control database, descriptor,
public viewer ACL, and service principal idempotently using supported APIs. Retain
the descriptor ID across restarts: Aries includes it in the provider key prefix.
Separate generated local control secrets from operator provider credentials and
persist them outside tracked files. Define token issuance and renewal instead of
requiring users to repeatedly paste expiring tokens. For a configured external
plane, document provisioning and renewal as operator prerequisites and fail with
an actionable error when they are absent. [Sources: control routes][control-routes],
[Aries storage prefix][s3-store].

The plane's existing `/v1/health` reports process liveness only; it neither
asserts Auto Drive selection nor checks credentials or descriptor existence.
`PAYLOAD_STORE` otherwise defaults to memory. Readiness must validate the trusted
deployment's explicit backend selection and admission policy, the intended
descriptor, authentication, and a non-writing read. The existing health response
alone cannot establish these facts. Unknown backend qualification disables writes;
never upload a synthetic payload automatically to make startup pass.
[Sources: plane entry point][plane], [plane health route][plane-health].

Run the sample service and web UI under the same origin. Use
`http://127.0.0.1:5173` locally with the Node service serving Vite output, and HTTPS
through a qualified proxy when deployed.
The inspected wallet JWT policy permits HTTP on numeric loopback but rejects
`http://localhost`; align the configured origin and browser address exactly.
The service keeps its
plane credential server-side and uses the supported origin-less service
authentication mode; an HMAC service token must never be exposed to the browser.
Use a separate bounded session/challenge protocol for browser admission. A signed
transaction alone does **not** authenticate an HTTP origin or challenge nonce.
The public wallet signer exposes `signJwt`, discovered with the SDK's
`isXyoJwtSignerMethods` capability guard. Request an ordinary wallet-approved JWT
for a dedicated sample-service audience, schema `network.xyo.auth.signin`, and a
lifetime no longer than 300 seconds. Bind custom claims to the purpose,
`payload:append` scope, single-use server nonce, intent ID, chain identity, and
normalized payload hash. The wallet stamps the actual calling origin; the page
must not supply its own `origin`, `iat`, or `exp` claims.

On the server, use the public account SDK JWT verification API with the configured
audience and current time, then explicitly check issuer/signer, origin, purpose,
schema, scope, nonce, intent, chain, payload hash, and bounded lifetime. Atomically consume
the nonce when associating a valid signed transaction with that intent. The JWT
is detached HTTP authentication control data: never append it as an application
payload or send it to Auto Drive. Keep it distinct from the server's Aries plane
credential. If the installed wallet lacks the public signing capability or its
audience policy rejects the request, M0 must resolve that compatibility before
enabling uploads; do not fall back to an unsigned challenge.
[Sources: public signer capability][jwt-signer],
[wallet JWT request and origin policy][jwt-policy].

### Proposed sample HTTP contract

These are sample-owned endpoints, not existing Aries routes:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/config` | Return nonsecret schema, byte ceiling, chain identity, service status, and write-enabled state |
| `POST /api/store-intents` | Validate the prospective payload, reserve bounded capacity, and issue a short-lived challenge; no provider write |
| `POST /api/store-intents/:id/confirm` | Receive signed evidence with the wallet-approved authentication JWT; verify both signatures, transaction shape, challenge/session, budgets, and exact payload; store only the payload and verify read-back |
| `POST /api/store-intents/:id/reconcile` | Fresh authorization and exact reserved evidence; read-only reconciliation even after transaction expiry or write-disable |
| `GET /api/store-intents/:id` | Return resumable storage state and associated known transaction hash; no provider retry as a side effect |
| `GET /api/payloads/:hash` | Public, rate-limited retrieval through the configured Aries datalake, with recomputed identity |

Do not forward signed evidence wholesale to `/v1/datalakes/:id/insert`. The
service extracts the single validated application payload and submits `[payload]`
using `RestPayloadsClient`. Check its inserted values **and** rejection/duplicate
summary. Duplicate responses may intentionally contain no inserted payloads;
resolve them by a fresh hash lookup and byte/hash verification. HTTP 200 alone
does not establish a successful required write. [Sources: payload routes][routes],
[client implementation][payload-client].

`AutoDrivePayloadStore.getObjectReceipt` can expose a provider CID internally,
but the current plane's public HTTP payload routes do not expose it. Treat a CID
display as conditional on a small upstream read-only receipt endpoint with
correct authorization and error redaction, or another separately qualified
operator receipt interface. Absence of that optional endpoint does not justify
inventing a CID or sending the provider key to the browser. Hash and exact-byte
read-back remain mandatory. [Sources: Auto Drive adapter][auto-drive],
[current HTTP routes][routes].

## 7. Validation before any paid write

`createSignedXl1TransactionEvidence` verifies parsing and content identities; it
is not by itself cryptographic signature verification. Use the XYO
`BoundWitnessValidator` and the appropriate public XL1 transaction validation
utilities, following the protocol validator, then enforce the sample-specific
constraints below. Avoid hand-implementing signature cryptography.
[Source: XL1 transaction validator][transaction-validator].

Before Auto Drive insertion, require all of the following:

- One authentic signed transaction on the configured chain, exactly the intended
  signer/account, valid current block bounds, and the declared transaction hash.
- Exactly one application payload/schema/hash, matching the approved normalized
  payload; no script, elevated content, extra payloads, substituted envelope, or
  unrelated transaction operation. Validate protocol-required headers and fees
  through their SDK contracts rather than accepting arbitrary transaction shapes.
- A valid unconsumed origin/session challenge bound to that signer and hash.
- Strict schema/size/nesting admission, a write-enabled operator policy, and an
  available durable budget reservation.
- No previous verified upload for this normalized XYO hash requiring another
  write. Reconcile existing bytes before treating any response as a duplicate.

Reject invalid requests before calling the provider. Do not acquire a broad
browser datalake runner token as a shortcut: the sample service is responsible
for enforcing these request and cost boundaries.

## 8. Ordering, recovery, and bounded cost

The basic sequence is prepare intent → wallet authenticates and signs → server validates → store →
fresh read-back → recheck chain/expiry → wallet broadcasts → observe finality.
Wallet signing rejection therefore causes zero provider writes. Signing approval
does not ensure later broadcast approval, available funds, or finality.

Permanent storage and chain inclusion cannot be one atomic transaction. If
storage succeeds and broadcast is rejected, expires, or fails, retain a truthful
**stored but unanchored** state. Never claim rollback or try to erase the bytes.
The initial SDK transaction expiry is only a short block window; the app must
choose a supported, bounded validity window after measuring the real storage
latency and recheck it immediately before broadcast. An expired transaction can
be rebuilt and signed explicitly while reusing a verified stored payload.

The inspected SDK's public `DEFAULT_MAX_EXP_AHEAD` is 1,000 blocks. Both runtime
configuration and server admission must enforce that ceiling before storage.
The local-chain test exposed that the current runner can return a transaction
hash after the mempool silently rejects an excessive expiration. A returned hash
therefore remains broadcast-attempt evidence, never inclusion evidence. The
configured default is 120 blocks; real provider latency still needs qualification.

Use a durable service ledger for intents, hash identity, reservations, and
outcomes. The initial local runtime uses embedded PostgreSQL through PGlite in a
stable, ignored data directory, with one writer process and SQL transactions and
uniqueness constraints. Its tests and `pnpm start` use the same SQL ledger
implementation; tests supply isolated temporary directories. Reject concurrent
ownership of a persistent directory and preserve the ledger across restarts.
External PostgreSQL can be added for deployment, using the same transactional
contract and qualified migrations; it may share the Aries control-plane process
with separate schemas/roles. Do not add Docker as a requirement merely to run
the ordinary suite or the initial sample service. A browser refresh
must not reset upload budgets or authorize a second upload. Operational ledger
records are not additional chain application payloads and are not written to
Auto Drive. Retain only needed hashes, byte counts, signer/session references,
and state; do not create a second durable body archive in the service.

Initial private-demo policy should require an operator-configured signer
allowlist plus explicit positive per-account/global daily write and byte caps.
Reject startup when write mode is enabled without these caps. Treat this as
bounded provider usage, not a dollar guarantee; provider index/metadata overhead
and pricing need separate operator review. Add a write-disable switch that leaves
retrieval working. Before a public demo, deliberately choose its abuse controls
and funded budget instead of removing authentication by accident.

Reserve capacity atomically before dispatch. After a timeout, keep the
reservation consumed or uncertain until reconciliation establishes the result;
never automatically free it and resubmit. Handle concurrent confirmations with a
unique intent/hash record and single dispatched write. Start with one writer
process; scaling requires explicit cross-process coordination because the
archivist's mutation serialization is per instance.

Auto Drive's SDK profile already uses a single request attempt. Keep application
upload retries off. On an ambiguous upload, query by the known XYO hash, compare
bytes, and allow only a deliberate reconciled continuation. On an ambiguous
broadcast, query the known signed transaction hash through the configured SDK
viewer. Wallet confirmation timeouts can occur after submission. Do not
automatically sign or broadcast a new transaction.

## 9. Website behavior

The main page contains network and wallet status, the complete JSON payload editor, normalized
payload preview, byte counter, permanence disclosure, and **Perma-Store**. The
button is disabled when the wallet/network is unavailable, the payload is invalid,
the service has disabled writes, or another operation is in progress.

Show states based on evidence:

| State | Evidence / available action |
| --- | --- |
| Draft / invalid | Editable data, concrete validation messages, current byte count |
| Awaiting wallet | Ordinary signing prompt; no provider write yet |
| Storing | Valid signed evidence accepted; upload may be in progress |
| Storage uncertain | Reconcile by known hash; no automatic new upload |
| Storage verified | Fresh retrieval and XYO hash/byte checks passed |
| Awaiting broadcast | Wallet broadcast approval or send result pending |
| Broadcast unknown | Known transaction hash; query before another action |
| Pending inclusion/finality | SDK viewer evidence; not yet complete |
| Complete | Verified payload retrieval plus finalized transaction containing its hash |
| Stored but unanchored | Storage remains; explain why chain anchoring did not finish and offer an explicit continuation |

Keep storage acceptance/read-back, transaction broadcast/inclusion/finality, and
provider network archival as separate fields. Do not make a CID or the word
"Perma-Store" imply completed archival. Provide copyable hashes and a fresh
retrieval preview; add a chain explorer link only after its URL/network mapping
is verified. Render stored JSON as text, never as executable HTML.

Use desktop Chrome for wallet acceptance. The responsive page can explain the
extension requirement on unsupported browsers without pretending signing works.
Explain that authentication, transaction signing, and broadcast can require
separate wallet approvals; the app must not assume a single prompt.
Handle wallet missing/locked, permission denial, account changes, network changes,
insufficient fees, session expiry, and page reload explicitly.

## 10. Implementation milestones

### M0 — Foundation and compatibility proof

- Initialize this private monorepo and keep root toolchain gates clean.
- Create real protocol/web/server workspace manifests with the profiles above.
- Resolve the published versions in the evidence table; install peers explicitly
  and qualify package imports without local source aliases or tarball patches.
- Install the public dapp-kit Vitest preset, keep its `local-xl1` installer
  opt-in, and prove that its real local chain boots and is disposed through
  `pnpm test:sample`. Keep ordinary `pnpm test` chain-free.
- Define the importable runtime, adapters, and lifecycle shared by the functional
  test and `pnpm start`; qualify the embedded SQL ledger and package imports.
- Document the configured external-plane prerequisites and verify the selected
  schema policy, service authorization boundary, and read path before enabling
  that runtime's real writes. Track official-image distribution, clean container
  qualification, and automated composition as a separate self-contained-start
  gate; do not invent an available image.
- Prove the phased API imports and one-payload construction with offline inputs,
  then verify the real wallet's network/capability/signing path without broadcasting.
  Capture the exact transaction shape and confirm the generic datalake writer
  is not invoked. Defer real broadcast to M4, after Auto Drive read-back is available.
- Prove origin-stamped `signJwt` authentication for the sample audience and server
  signature/claim validation, with no additional transaction payload.
- Resolve any public API/container/auth incompatibility upstream before claiming
  an end-to-end demo. Do not patch SDK internals in the sample.

Exit: package and runtime contracts are reproducible, the local test harness has
a proven lifecycle, network choice is explicit, and no unsupported wallet
override is required. A harness that only observes a chain head is not yet the
functional sample milestone below.

### M1 — Protocol and policy

- Implement fixed schema, normalization, UTF-8 byte limit, immutable snapshots,
  transaction-content assertions, and shared request/response validation.
- Implement the actual dapp-kit definition/configuration/profile gate.
- Add focused tests for multibyte boundary values, invalid roots, extra payloads,
  mutation while awaiting wallet, and incompatible profile configurations.

Exit: both process boundaries enforce the same one-payload policy.

### M1a — Shared runtime and complete local functional slice

- Implement the real admission service and importable transaction orchestration
  early enough that the first functional sample test uses production code.
- In `pnpm test:sample`, start that runtime with the same SQL ledger and a
  test-owned storage transport, use the installer's funded local account to
  authenticate/build/sign, confirm storage through the real service contract,
  broadcast through the public SDK, and wait for actual finalized inclusion.
- Assert the exact one-element storage input, detached authentication, normalized
  read-back bytes/hash, finalized transaction reference, and fresh retrieval.
  Do not replace finality or validation with a success stub.
- Cover read-back refusal before broadcast, changed chain identity, duplicate
  confirmation, and reopening the ledger without another upload; keep narrowly
  focused refusal cases in the offline suite when no chain is needed.
- Implement a root startup entry that constructs the same runtime with the
  selected real Auto Drive adapter, serves the browser application, reports readiness,
  and cleans up correctly. Missing external configuration keeps writes disabled
  or fails startup clearly; it cannot switch to the test storage adapter.
- Remove `passWithNoTests` when the first implementation tests land.

Exit: a single explicit Vitest command proves the full sample against a real
ephemeral local chain, and root startup exercises the same runtime. This is local
functional evidence; real provider and Chrome Wallet acceptance remain M4 gates.

### M2 — Guarded storage service

- Implement bounded request parsing, browser intents/sessions, signed evidence
  validation, operator policy, durable reservations, idempotency, and same-origin
  endpoints.
- Connect to the real Aries HTTP data plane. Confirm only the extracted payload
  crosses its insert boundary and all required read-back checks pass.
- Support local startup directly through the published XYO Auto Drive factory
  with only its provider key, fixed namespace, zero-write readiness, bounded
  operations, redacted errors, and owned-client shutdown. Verify SDK behavior
  using an offline provider boundary and prove the compiled local launcher works
  with all three Aries settings blank. Live uploads remain a separate M4 gate.
- Provision the dedicated allowlisted datalake and public read path. Add CID
  receipt support only through a qualified server-side endpoint.
- Implement non-writing readiness, persisted lake identity, ledger migrations,
  credential expiry handling, and restart-safe bootstrap for the owned profile.
  The configured-endpoint profile validates prerequisites and never provisions
  or replaces external resources implicitly.
- Test all refusal and ambiguous-outcome paths with an offline test store or
  fault-injected transport, without contacting Auto Drive.

Exit: invalid requests spend nothing; successful confirmations return evidence
for exactly one stored payload; restarts preserve budgets and upload identity.

### M3 — Wallet website

- Implement editor, preview, explicit-network connection, byte counter, and
  ordinary wallet approval flow.
- Orchestrate phased build/sign → storage verification → wallet broadcast.
- Implement status/finality checks and resumable stored-but-unanchored outcomes.
- Verify a production build in a real browser, including provider connection and
  clean console/network behavior. Do not substitute compiler success for this.
- Verify clean-clone `pnpm start` with the documented minimal configuration and
  configured external-plane prerequisites. Check loopback origin, readiness,
  unavailable dependencies, clean shutdown, and restart with retained state.

Exit: the page can perform and explain the complete path with test transports;
the real wallet integration remains visible and never uses a test signer.

### M4 — Real Auto Drive and Chrome Wallet qualification

- Add a separate explicit Auto Drive integration configuration, loading the
  appropriate server-only `.env` only for that command. Use one small synthetic
  payload, a unique namespace, no automatic upload retries, and an explicit
  configured write/byte allowance.
- Prove exclusion causes zero writes, actual storage succeeds, and reopening the
  service allows identical-byte retrieval and recomputed XYO identity.
- With Chrome Wallet on Sequence, prove the user signs/broadcasts the transaction,
  the finalized transaction references exactly that payload, and instrumentation
  observed no transaction envelope or second application payload being sent to
  Auto Drive.
- Exercise at least wallet rejection before upload, denied broadcast after
  upload, provider ambiguity, duplicate confirmation, restart, and wrong network.
- Reject unsupported JWT signing, denied authentication, replayed nonces, wrong
  signed origins/audiences, and substituted cross-intent storage responses. Assert
  zero provider writes for failed authorization and no broadcast for a mismatched
  confirmation. Assert detached JWTs are absent from `payload_hashes` and all
  Auto Drive insert arrays.
- Record package versions, network/chain identity, transaction/payload hashes,
  optional provider CID, observed finality, and exact commands; record no secrets
  or real private user data.

Exit: the product acceptance criteria in `PRD.md` have evidence. A prior Aries
live test is supporting evidence, not proof this new browser demo works.

### M5 — Controlled deployment and public-release review

- Deploy the qualified website, sample service, durable ledger, and pinned Aries
  plane under a documented origin with TLS, server secrets, persistent control
  state, and bounded operator budgets.
- Run a new hosted wallet/storage smoke test and document the recovery procedure.
- Review public demo funding/abuse controls and remove environment-specific
  fixtures or sensitive operational details.
- Keep the repository private until the owner explicitly requests public
  visibility. GitHub publication, website deployment, provider acceptance, and
  chain qualification are separate outcomes.

## 11. Test and CI strategy

Use the published `@xyo-network/dapp-kit-vitest-config` and
`defineDappKitVitestConfig` as the root test configuration. Keep
`installers: { localXl1: { optInOnly: true } }`: ordinary `pnpm test` runs
protocol, profile, service, SQL-ledger, and orchestration tests with no chain or
external provider calls. The initialization `passWithNoTests` allowance must be
removed with the first implemented behavior tests.

`pnpm test:sample` compiles all workspaces, then runs `vitest run --project local-xl1`. Put its specs under
`packages/<package>/src/**/spec/local-xl1/**/*.spec.ts`, matching the public
installer's include globs. The preset excludes those specs from ordinary node
discovery even when the installer is not selected. Its installer spawns the
published XL1 CLI with API, producer, and finalizer on loopback, one ephemeral
chain per spec file, and owns its teardown. Use `localXl1RpcUrl()` and the
installer's chain identity after setup; never hardcode a port or Sequence URL.
Use the public local development mnemonic only in this explicit test harness.

The functional test constructs the same application service and transaction
orchestration used by startup. It exercises real signing and validation against
the local chain and drives admission through the actual HTTP contract, while a
test-owned instrumented storage transport replaces the external Aries/provider
boundary. It must prove complete one-payload execution through finalized
inclusion and fresh retrieval, rather than merely that a chain can start.
Reopen the same temporary SQL ledger for restart/reconciliation checks. Dispose
the sample runtime before the installer's chain teardown, including on failure.

The `localDatalake`, `localSystem`, and `localBrowser` installers only isolate or
serialize test projects; they do not provision an Aries datalake, database,
application, Chrome Wallet, or browser environment. Enable them only with
sample-owned setup and matching discovery globs. A test placed under root
`test/` does not automatically enter the `local-xl1` project. Verify discovery
when adding suites so live or chain-dependent files cannot run in the offline
project. [Source: public dapp-kit Vitest preset][vitest-preset].

Target command contract (README and package scripts identify what is implemented):

```text
pnpm build                 # actual package and website production output
pnpm check                 # repository/configuration policy
pnpm lint                  # strict source/configuration lint
pnpm test                  # offline; no chain or external provider
pnpm test:sample           # opt-in full sample on preset-owned local XL1
pnpm start                 # configured real website and sample service
pnpm test:autodrive         # opt-in real storage suite, excluded above
pnpm test:wallet:chrome     # real extension acceptance harness/runbook
```

Do not represent planned commands as available until implemented. The normal CI
job runs offline; an explicit subsequent CI step runs `test:sample` with its
ephemeral, genesis-funded local chain. Neither job receives `AUTODRIVE_API_KEY`,
real wallet secrets, or signing access to funded external networks. Real storage
tests use a separate configuration and explicit opt-in marker, load only their
server-side environment, and have directories explicitly excluded from both the
offline and local-chain projects. A provider key appearing in the environment
must never activate them. Chrome Wallet acceptance remains separately explicit.

Test transaction sequencing through injected wallet/storage interfaces: signing
rejection means no upload; failed read-back means no broadcast; successful
read-back permits only the already-approved evidence; timeouts become ambiguous
states. Instrument the Auto Drive boundary and assert the exact insert array,
rather than merely checking that an upload function was called.

For real wallet verification, use an extension-capable Chrome profile and actual
wallet approvals. A seed-phrase signer can support a separate local protocol
test but never substitutes for the Chrome Wallet acceptance requirement.

Keep evidence separate: offline behavior tests, the full local-chain sample,
configured-endpoint startup, self-contained composition, actual Auto Drive
read-back, Chrome Wallet acceptance, and hosted qualification each have their
own pass conditions. A green result in one category does not close another.

## 12. Evidence, versions, and open gates

The source checkouts cited below were clean at inspection. Versions were checked
against the npm registry; future implementation must recheck the installed
contracts and lock the versions actually qualified.

| Component | Verified baseline | Qualification boundary |
| --- | --- | --- |
| XYO SDK / S3 archivist | `@xyo-network/sdk@7.4.1`, `@xyo-network/archivist-s3@7.4.1` | Published; earlier Aries adapter/live checks passed |
| dapp-kit | `@xyo-network/dapp-kit@2.0.0` | Published; sample profile implemented and covered by offline/local-chain tests |
| dapp-kit Vitest preset | `@xyo-network/dapp-kit-vitest-config@2.0.0` | Public `defineDappKitVitestConfig` and opt-in `local-xl1` lifecycle; shared sample flow implemented and locally qualified; latest startup-test limits recorded in STOPPING_POINT.md |
| XL1 SDK / React client | `@xyo-network/xl1-sdk@5.5.3`, `@xyo-network/xl1-react-client-sdk@5.5.3` | Public phased APIs available; real sample Chrome Wallet qualification pending |
| Chrome Wallet source | `1873d37443f7fb938a760b7c974b3b7ae8d1db0a`, manifest `1.24.1` | Source inspected; verify the installed extension version during acceptance |
| Aries HTTP client | `@ariestools/aries-datalake-client@0.1.20` | Published; qualify service use of insert/read and token handling |
| Aries data plane | Source commit `65537a81d87642bc58d5588393530817f7d6e9af` | Private workspace package; pinned service build/runtime required |
| Provider receipt | `AutoDrivePayloadStore.getObjectReceipt` | Internal API exists; public HTTP receipt endpoint not implemented |

The existing Aries work passed compilation, lint, dependency checks, 94 offline
tests, and three opt-in real Auto Drive tests against SDK 7.4.1. Its complete
data-plane suite still encountered the pre-existing LMDB native `SIGABRT`, and
the broader workspace had existing peer mismatches. Those limits must not be
copied into this new repository as unexplained skips or represented as a clean
container/browser qualification. [Source: Aries migration record][migration].

Confidence is high in the inspected public API boundaries and the need for the
phased flow. Real Chrome Wallet interaction, hosted service authentication,
container distribution and behavior, operation-restricted service access,
production ledger durability, measured storage latency versus transaction expiry,
and live-provider finalized end-to-end operation remain explicit qualification gates. Runtime
and provider confidence comes from their respective acceptance evidence, not
from this plan's source analysis.

[vitest-preset]: https://github.com/XYOracleNetwork/dapp-kit/blob/104f5ff794c5b1938550b5e922030788fc876688/packages/dapp-kit-vitest-config/README.md
[runner]: https://github.com/XYOracleNetwork/xl1-protocol/blob/79fe4ed14cfe57f09e88288ea8cb92071ce6349b/packages/sdk/src/modules/protocol-sdk/simple/gateway/SimpleXyoGatewayRunner.ts
[phases]: https://github.com/XYOracleNetwork/xl1-protocol/blob/79fe4ed14cfe57f09e88288ea8cb92071ce6349b/packages/sdk/src/modules/protocol-sdk/transaction/Xl1TransactionPhases.ts
[connect]: https://github.com/XYOracleNetwork/xl1-protocol/blob/79fe4ed14cfe57f09e88288ea8cb92071ce6349b/packages/react/packages/react-client-sdk/src/client/components/connected/hooks/useConnectAccount.ts
[connect-stack]: https://github.com/XYOracleNetwork/xl1-protocol/blob/79fe4ed14cfe57f09e88288ea8cb92071ce6349b/packages/react/packages/react-client-sdk/src/client/components/connected/ConnectAccountsStack.tsx
[wallet-provider]: https://github.com/XYOracleNetwork/xl1-protocol/blob/79fe4ed14cfe57f09e88288ea8cb92071ce6349b/packages/react/packages/react-client-sdk/src/client/context/providers/WalletGatewayProvider.tsx
[jwt-signer]: https://github.com/XYOracleNetwork/xl1-protocol/blob/79fe4ed14cfe57f09e88288ea8cb92071ce6349b/packages/protocol/src/modules/protocol-lib/providers/signer/XyoSigner.ts
[jwt-policy]: https://github.com/XYOracleNetwork/wallet-xl1-chrome/blob/1873d37443f7fb938a760b7c974b3b7ae8d1db0a/src/modules/rpc/jwt/jwtApprovalPolicy.ts
[definition]: https://github.com/XYOracleNetwork/dapp-kit/blob/104f5ff794c5b1938550b5e922030788fc876688/packages/dapp-kit/src/dappDefinition.ts
[configuration]: https://github.com/XYOracleNetwork/dapp-kit/blob/104f5ff794c5b1938550b5e922030788fc876688/packages/dapp-kit/src/dappConfiguration.ts
[profile-validation]: https://github.com/XYOracleNetwork/dapp-kit/blob/104f5ff794c5b1938550b5e922030788fc876688/packages/dapp-kit/src/validation.ts
[browser-host]: https://github.com/XYOracleNetwork/dapp-kit/blob/104f5ff794c5b1938550b5e922030788fc876688/packages/dapp-kit-browser/README.md
[strict-json]: https://github.com/XYOracleNetwork/dapp-kit/blob/104f5ff794c5b1938550b5e922030788fc876688/packages/dapp-kit/src/strictJson.ts
[canonical-document]: https://github.com/XYOracleNetwork/dapp-kit/blob/104f5ff794c5b1938550b5e922030788fc876688/packages/dapp-kit/src/canonicalDocument.ts
[transaction-validator]: https://github.com/XYOracleNetwork/xl1-protocol/blob/79fe4ed14cfe57f09e88288ea8cb92071ce6349b/packages/protocol/src/modules/validation/transaction/validators/TransactionBoundWitnessValidator.ts
[plane-package]: https://github.com/ariestools/ariestools/blob/65537a81d87642bc58d5588393530817f7d6e9af/packages/datalake-plane/package.json
[plane]: https://github.com/ariestools/ariestools/blob/65537a81d87642bc58d5588393530817f7d6e9af/packages/datalake-plane/src/bin/server.ts
[plane-docker]: https://github.com/ariestools/ariestools/blob/65537a81d87642bc58d5588393530817f7d6e9af/packages/datalake-plane/Dockerfile
[plane-health]: https://github.com/ariestools/ariestools/blob/65537a81d87642bc58d5588393530817f7d6e9af/packages/datalake-plane/src/routes/health.ts
[control-routes]: https://github.com/ariestools/ariestools/blob/65537a81d87642bc58d5588393530817f7d6e9af/packages/datalake-control/src/routes/datalakes.ts
[s3-store]: https://github.com/ariestools/ariestools/blob/65537a81d87642bc58d5588393530817f7d6e9af/packages/datalake-plane/src/store/S3PayloadStore.ts
[client]: https://github.com/ariestools/ariestools/blob/65537a81d87642bc58d5588393530817f7d6e9af/packages/datalake-client/src/index.ts
[payload-client]: https://github.com/ariestools/ariestools/blob/65537a81d87642bc58d5588393530817f7d6e9af/packages/datalake-client/src/PayloadsClient.ts
[admission]: https://github.com/ariestools/ariestools/blob/65537a81d87642bc58d5588393530817f7d6e9af/packages/datalake-core/src/types/DatalakeConfig.ts
[plane-auth]: https://github.com/ariestools/ariestools/blob/65537a81d87642bc58d5588393530817f7d6e9af/packages/datalake-plane/src/auth/accessContext.ts
[routes]: https://github.com/ariestools/ariestools/blob/65537a81d87642bc58d5588393530817f7d6e9af/packages/datalake-plane/src/routes/payloadRoutes.ts
[auto-drive]: https://github.com/ariestools/ariestools/blob/65537a81d87642bc58d5588393530817f7d6e9af/packages/datalake-plane/src/store/AutoDrivePayloadStore.ts
[migration]: https://github.com/ariestools/ariestools/blob/65537a81d87642bc58d5588393530817f7d6e9af/docs/architecture/xyo-sdk-s3-extraction.md
