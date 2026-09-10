# Local implementation qualification

Date: September 9, 2026. Runtime: Node 24.14.1, pnpm 12.3.4. This report concerns
this checkout's implemented sample. It is not a live Auto Drive, Chrome Wallet,
public-chain, hosted, or container qualification report.

## Implemented application path

Four executable workspaces share the production implementation: neutral payload
rules and dapp-kit profile; browser-compatible transaction workflow; React wallet
website; Node admission service and persistent PGlite ledger. Root `pnpm start`
compiles these workspaces and starts the compiled service, which serves the
website and API together. `.env.example` describes direct local Auto Drive
storage and the configured Aries connection for public profiles.

The flow captures one canonical payload and signs its transaction through the
public SDK, authenticates the storage intent with a detached wallet JWT, reserves
persistent count/byte capacity, uploads only the payload, checks fresh read-back,
and only then permits wallet broadcast. Recovery preserves unknown outcomes,
reconciles reserved storage without another upload, and checks real finalized
inclusion rather than trusting a returned transaction hash.

## Local evidence

Named-profile baseline: frozen installation, repository checks, strict build, all 105 offline
tests, and all five local-chain tests passed. Build validation reported
zero lint/dependency errors or warnings. The original configured launcher failed clearly when XL1 configuration was
missing. Named startup profiles now select those values in code, as described
below. The subsequent local storage defaults are recorded separately below.

- `pnpm install --frozen-lockfile` resolves all five workspace manifests. Direct
  dependency links were checked after peer alignment; no other checkout, source
  alias, patched SDK, or unpublished package is needed.
- `pnpm check` checks repository, package-manager, manifest, and skill policy.
- `pnpm build` checks TypeScript, emitted packages, dependency policy, ESLint, and
  the production Vite website. Vite reports an SDK-heavy main bundle of roughly
  439 KiB compressed; bundle-size optimization remains separate work.
- `pnpm test` runs 105 offline tests across seven files using the public dapp-kit
  Vitest configuration. The preset reports `local-xl1` skipped unless explicitly
  selected. Tests cover payload/profile rules, real signatures and JWT claims,
  schema/count/expiry refusals before writes, Aries HTTP acknowledgments, SQL
  budget persistence, concurrent/ambiguous duplicate handling, and client ordering.
- `pnpm test:sample` compiles, then selects the preset's `local-xl1` installer.
  Five tests run across two installer-owned fixtures. Two integration tests share
  one disposable chain. One executes real signing,
  authenticated HTTP admission, one controlled storage write, verified retrieval,
  actual finalized inclusion, ledger reopen, and duplicate/recovery suppression.
  The other launches the exact compiled CLI used by `pnpm start`, verifies the
  site/configuration/emitted JavaScript assets and Aries HTTP retrieval, checks
  disabled writes, stops with SIGTERM, and restarts with the same owned local
  chain, ledger, and origin. Three lifecycle tests additionally exercise persistent
  finalized history, ownership/collision refusal, startup abort, and idempotent stop.
- The actual compiled page was inspected in the in-app Chromium browser at its
  desktop viewport and at 390 CSS pixels. JSON normalization, multibyte byte
  accounting, duplicate-key rejection, no-wallet/disabled-write states, and
  failed-retrieval feedback worked. The 390-pixel page had no horizontal overflow,
  its JSON editor used 16-pixel text, and browser warning/error logs were empty.

The controlled storage and Aries HTTP fixtures contain only synthetic data. They
cannot prove that an external plane selected Auto Drive or completed archival.
The functional tests use the public local development account only inside the
explicit local-chain project. No live provider upload or public-chain transaction
was performed.

## Defects found through execution

The SDK's default mempool rejects transaction expirations more than 1,000 blocks
beyond the head, but its runner can still return a transaction hash. The sample
now caps configuration and admission using the public `DEFAULT_MAX_EXP_AHEAD` and
requires independently observed finalized inclusion. The functional fixture uses
a supported 500-block window; the configurable app default is 120 blocks.

An ambiguous upload originally could not reconcile once its signed transaction
expired. The dedicated read-only reconciliation route now verifies fresh wallet
authorization and exact reserved evidence while permitting expired transactions
and disabled writes. It never reserves capacity or invokes insert. Broadcast
still requires an unexpired transaction and verified storage.

The compiled launcher now owns the SDK gateway session, handles interrupts during
startup, drains requests, closes the ledger, and releases the session. Static
serving includes Vite's emitted `.mjs` hashing workers. These paths are exercised
through the real compiled entry, beyond calling its importable constructor.

## Remaining qualification gates

1. Provision or select the real dedicated Aries Auto Drive plane and datalake;
   verify its descriptor, schema/byte ceiling, public read ACL, backend selection,
   restricted network path, and service credential renewal procedure.
2. Measure provider latency against the configured transaction validity window,
   then run a separately authorized, bounded real upload/read-back scenario.
3. Exercise the installed XL1 Chrome Wallet on Sequence: origin-stamped JWT,
   network/account changes, approval rejection, broadcast, and finalized inclusion.
4. Add the explicit live-provider and wallet acceptance harnesses. Qualify an
   accessible official Aries image and composition before claiming self-contained
   startup. Hosted deployment and provider archival confirmation remain separate.

`pnpm start` remains the configured-Aries Sequence launcher. Local mode now uses
the published XYO provider adapter directly, so its provider-key setup does not
depend on provisioning an Aries service. Neither command alone proves live
upload/read-back, Chrome Wallet compatibility, or completed provider archival.

## Named startup profiles

`start:local`, `start:sequence`, and `start:mainnet` select XL1 settings without
requiring chain configuration in `.env`. `start` aliases Sequence. Public profiles
use the installed SDK's endpoint and expected identity; old environment selectors
cannot redirect them. A read-only SDK check on September 9 returned the expected
identity from both actual public endpoints. No signing, upload, or broadcast was
performed on either public network.

Local mode uses the public CLI with persistent LMDB storage, owns its listener on
port 8080, discovers its chain identity, and stops the child during shutdown.
Each profile keeps a separate ledger under the configured state base; legacy
ledger layout is detected rather than silently replaced. Offline configuration
and opt-in real-process tests cover these contracts.

The final named-profile verification passed all 105 offline tests and five local
chain tests. The native LMDB tests ran outside the macOS agent sandbox after the
same isolated database probe succeeded there and aborted inside the sandbox.
Normal terminal startup needs no sandbox-specific configuration. Repository
checks, strict build, and frozen installation passed; no public-network writes
or Auto Drive uploads were performed.

## Local storage defaults

`pnpm start:local` now accepts blank `ARIES_PLANE_URL`, `ARIES_DATALAKE_ID`, and
`ARIES_PLANE_TOKEN`. Only `AUTODRIVE_API_KEY` is needed for storage. The sample
server owns the published XYO Auto Drive archivist, using its fixed provider
endpoint, bucket `autodrive-sample`, and namespace `local`. A complete Aries
connection overrides this mode; partial settings fail. Public profiles still
require all three Aries values. Write enablement, allowed signers, and budgets
remain explicit because local-chain mode still makes real Auto Drive uploads.

Eight adapter tests use the actual published factory and archivist with only the
AWS SDK request boundary controlled. They verify zero requests during construction,
one authenticated HEAD for readiness, exact normalized storage and fresh primary
read-back, duplicate handling after reopen, schema/size refusal, corruption,
authentication failure, no automatic retry after a failed write, cancellation,
and shutdown. An interrupted provider operation stops the client; the HTTP
response explains that the operator must restart and reconcile with the retained
ledger, rather than repeat an uncertain upload.

The new compiled-CLI test supplies only a synthetic Auto Drive key for storage,
leaves the three Aries settings blank, starts the real owned local chain, serves
the real website/assets, verifies the nonsecret configuration and missing-object
response, and shuts down cleanly with the local port released. Its test-only
preload intercepts the official SDK's HEAD/GET commands and blocks provider HTTPS
and every write. No production endpoint override or provider fallback was added.

That process test found the SDK's delayed automatic-start timer kept Node alive
after storage shutdown. The executable now selects the SDK's public lazy-start
policy before constructing modules; the Auto Drive factory explicitly starts its
owned archivist. No SDK internals were patched. The final opt-in run passes six
tests, including direct local startup, Aries override/restart, full transaction
finality, and persistent-chain lifecycle.

The provider endpoint, path-style authentication, and implicit bucket namespace
match the [current official S3 contract](https://develop.autonomys.xyz/sdk/auto-drive/s3_layer).
Live credentialed upload/read-back and provider archival remain unqualified.

Final local-defaults gates: frozen installation, `pnpm check`, strict
`pnpm build`, all **118 offline tests**, and all **six local-chain tests** pass.
Build validation reports zero lint/dependency errors or warnings. The local-chain
run uses the same documented macOS sandbox exception for native LMDB; all
provider transports in these tests are controlled and no Auto Drive upload occurred.

## Sample schema update

The shared payload schema is now `com.example.message`; runtime admission,
transaction schemas, storage policy, and documented Aries allowlists use it.
Checks, strict build, and all 118 offline tests pass. The local suite passes its
full signing/storage/finality flow and three chain lifecycle tests. Its two
compiled-CLI startup checks fail at port preflight because an existing Node
listener occupies `127.0.0.1:8080`; that listener was left running.

## Visible payload and random salt

The editor now displays the complete `{schema, salt, data}` payload, with
`com.example.message` first and a cryptographically random 32-byte salt encoded
as 64 lowercase hexadecimal characters. New drafts and the explicit **New salt**
action generate salts; normalization, editing data, signing, retries, and recovery
retain the existing salt. Protocol and server admission reject missing or malformed
salts, including in signed payloads.

`pnpm check`, strict `pnpm build`, and all **128 offline tests** pass. The selected
local-chain suite passes **four tests**, including the complete salted payload's
signing, storage, and finality flow and three owned-chain lifecycle checks. The two
compiled-CLI startup checks were excluded from this run because the existing
listener still occupies port 8080. Native LMDB ran outside the macOS sandbox;
no public-chain transaction or Auto Drive upload occurred.

Browser verification used the compiled website with a temporary local backend,
controlled storage/chain dependencies, and writes disabled. It confirmed that
the schema and salt are visible, **New salt** preserves data, ordinary editing
preserves salt, and missing salt is rejected. At 390 pixels, the editor uses
16-pixel text with no horizontal page overflow; browser warning/error logs are
empty. This verifies the UI locally, not live provider storage or archival.
