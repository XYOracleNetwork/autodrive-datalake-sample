# Historical qualification record

The single-package CLI supersedes the browser/server designs below. These are
historical results. See [STOPPING_POINT.md](STOPPING_POINT.md) for current CLI evidence.

# REST datalake qualification update — September 10, 2026

The current architecture exposes XL1 REST insert/get through the Node service.
The browser and tests use `createRestDataLakeRunner`; the provider key stays in
Node and no storage JWT is requested. Client signing and broadcast still use the
existing wallet gateway. Earlier authenticated-admission results below describe
historical implementations, not the current storage API.

Current results and live artifacts are recorded in [STOPPING_POINT.md](STOPPING_POINT.md).

# Stateless-server qualification update — September 10, 2026

The ledger removal supersedes references below to PGlite, writer locks, upload
intents, persistent budgets, and server recovery directories. Those paragraphs
record historical implementations and their original test evidence, not current
runtime requirements. Current architecture is in IMPLEMENTATION_PLAN.md;
current verification is in STOPPING_POINT.md. Existing historical evidence and
databases were preserved. The server now validates signed payload requests and
recovers by remote reads, without persistent application state.

Current gates passed: check, build, 105 offline tests, four controlled local-chain
tests, and one real-provider e2e. The new live run is `.sample/live/run-PzUjiU`:
176 canonical bytes, one logical insert, one local broadcast, finalized inclusion,
and authenticated read-only recovery of a lost confirmation after server restart.
The chain was disposed and provider archival remains unverified. Exact hashes
and remaining wallet/public-chain qualification are in STOPPING_POINT.md.

---

# Local implementation qualification

Latest qualification: September 10, 2026. Runtime: Node 24.14.1, pnpm 12.3.4.
Earlier sections below retain the September 9 evidence history and superseded
launcher behavior. The current command surface is documented in README and
[STOPPING_POINT.md](STOPPING_POINT.md).

## September 10: public-network selector and real Auto Drive e2e

The launcher now serves Sequence/Mainnet with direct Auto Drive, using only the
provider API key as required configuration. Named startup scripts and website
local mode are removed. Each network has separate HTTP admission, ledger,
provider namespace, wallet provider, and tab draft/recovery state. Default
loopback admission accepts authenticated wallets within explicit bounded code
defaults; optional signer restrictions, write-disable, and budget overrides remain.

Repository checks, strict build, and **108 offline tests** pass. All **four**
controlled-storage local-chain tests pass. The new compiled-CLI test is offline:
it verifies SDK-defined public network configuration, real emitted assets,
separate retained intents after restart, write-disable, and rejection of Local.
The old port-8080 startup tests no longer apply.

The explicit **`pnpm test:live` passed one real-provider scenario**. It uploaded
one 176-byte normalized application payload through the published XYO Auto Drive
adapter, verified fresh bytes/hash, broadcast once to a dapp-kit-owned local XL1
chain, observed finalized inclusion, then reopened the ledger and recovered
without another insert or broadcast. It also checked that the transaction
identity was absent from the application's provider payload store. There were
no provider transport mocks in this run and no public-chain transaction.

The payload hash is
`7a9a3189e9b72d2b59fa3ad6dc718279f67ae82c6163297fc3e34793a3ba1468`;
transaction hash is
`15201194d54193ca3b1d08dc603dd97c75190a3a2b60ee85b2a827bf3849749e`.
Nonsecret artifacts and ledger remain under `.sample/live/run-yQkb00`; the
installer has disposed the local chain. The one-insert count is the application's
logical payload insert, not a claim about the SDK's number of physical S3 writes.
Provider archival confirmation remains unqualified.

Actual `pnpm start` reached readiness with the existing `.env` containing only
`AUTODRIVE_API_KEY`, validating both public chain identities and real read-only
provider probes. Browser QA exercised both dropdown choices and preserved each
network's independent edited draft and salt. At 390 pixels the page has no
horizontal overflow; browser warning/error logs were empty. The QA browser has
no Chrome Wallet extension, so actual wallet approval/signing remains open.

## September 9 historical baseline

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


## Last REST datalake checkpoint before CLI rewrite

# Current implementation checkpoint

Updated September 10, 2026. This supersedes the named-startup, Aries-service, and
PGlite-ledger designs. Changes are uncommitted and have not been pushed.

## Delivered behavior

- `pnpm start` serves Sequence/Mainnet with a website dropdown and real Auto Drive.
  Local XL1 exists only in explicit tests. The only required setting is
  `AUTODRIVE_API_KEY`; public SDK presets supply XL1 endpoints and identities.
- The server is stateless: no PGlite dependency, application ledger, writer lock,
  state directory, intent challenge, reservations, or daily budgets. Old local
  state and audit evidence remain untouched. Write-disable and loopback origin
  configuration remain supported.
- The server exposes XL1 REST datalake `POST /dataLake/insert` and
  `GET /dataLake/get/:hash`, scoped under `/networks/<network>` for the website.
  Public SDK runner/viewer clients work directly against it. The server validates
  schema, salt, one payload, and 4,096-byte size before provider access, then
  verifies exact read-back. Enumeration and destructive methods are not exposed.
- The browser uses `createRestDataLakeRunner`, sends only application payloads,
  and needs no provider key or wallet JWT for storage. The Auto Drive key and
  Node-only adapter remain server-side. Origin/Host checks, JSON-only insertion,
  loopback binding, and request limits remain. Signer allowlists and audience
  configuration are removed; signed transaction validation stays in the client.
- The full payload is `{schema, salt, data}`, with `com.example.message` and a
  cryptographically random 256-bit salt. Preserving the complete payload preserves
  its hash. A new salt produces a distinct identity.
- Browser pending state retains signed evidence and whether storage was attempted,
  never a provider key. An ambiguous write resumes through datalake read-only
  retrieval by hash. Exact signed transaction bytes
  are retained for any explicit broadcast retry.
- Network admission, provider namespaces, and browser drafts/recovery remain
  separate. Switching does not trigger a write or broadcast.

## Identity limits

The adapter skips an existing primary payload in the same account/bucket/namespace,
including after reopening, and serializes concurrent calls through one adapter.
Its remote existence check and PUT are separate: atomic cross-process exactly-once
insertion is not proven. A generic Auto Drive PUT is not a deduplication guarantee.

An XL1 transaction hash covers transaction headers as well as payload references.
Creating a new transaction can anchor the same payload again without changing its
salt. Recovery instead queries and reuses the exact original signed transaction.
No claim is made that payload identity alone prevents every new chain transaction.

## Latest upstream index fix

Auto Drive now writes only the primary payload object. The SDK source fix is in
`sdk-xyo-client-js` on `codex/autodrive-primary-only`, uncommitted and unpublished.
This sample consumes the same compiled change through a tracked pnpm patch of
`@xyo-network/archivist-s3@7.4.1`. Existing empty index objects are not deleted.

The affected upstream package passes 59 offline tests and warning-free source
lint. Its strict build has zero errors but fails on a pre-existing peer-range
policy warning (`@ariestools/sdk` is `^8.1`, policy expects `^8.3`). The full SDK
suite reports 531 passed, 11 failed, 84 skipped; failures are outside the S3
package (HTTP bridge, pub-sub, resolver, and diviner tests). It is not a green
full SDK qualification. No SDK release was performed. This package evidence predates the REST datalake change.

The existing wallet-extension gateway remains unchanged. The browser-owned key
proposal is superseded: keep the Node server, expose it as the datalake, and keep
all Auto Drive credentials out of the page. No browser key form or provider CORS
change is needed. Wallet approval remains for transaction signing and broadcast.

## Current verification

Runtime: Node 24.14.1, pnpm 12.3.4.

| Check | Result |
| --- | --- |
| `pnpm check` | Passed |
| `pnpm build` | Passed; zero strict lint/dependency errors or warnings; known Vite bundle-size advisory remains |
| `pnpm test` | 97 offline tests across eight files passed |
| `pnpm test:sample` | Four controlled-storage local-chain tests passed |
| `pnpm test:live` | One real Auto Drive/local XL1 REST datalake scenario passed; no storage JWT |
| Actual `pnpm start` | Ready with the existing provider key, writes disabled, and an ephemeral loopback port; both public network configurations and the website returned HTTP 200 |
| Compiled launcher | Both public routes and actual site assets served; restart succeeded with an old writer.lock left untouched |

Browser verification of the current build confirmed Sequence/Mainnet selection,
ready status, and SDK datalake retrieval of an absent hash with the expected
not-found message and no console errors/warnings. Writes were disabled and the
verification browser lacked the wallet extension. The temporary process and tab
were stopped after verification.

The actual SDK adapter tests now count all provider PUTs as well as primary PUTs for sequential duplicate
insertion after reopening, concurrent duplicate calls through one adapter, and a
new salt. HTTP fixture tests distinguish repeated adapter dispatch from new stored
objects; they do not claim to prove provider behavior. Client tests verify that
explicit broadcast retries reuse exact signed bytes without another upload.

## Current REST datalake real-provider evidence

The SDK REST flow stored one **176-byte** salted application payload, performed
one logical provider insert and one local XL1 broadcast, verified fresh exact
read-back and finalized inclusion, then recovered a lost storage confirmation
after server restart using reads only. The signer exposed transaction signing
without a JWT method. The Auto Drive key stayed in the server.

- Payload: `fc969c54f2d4c6441298d9cf4c817fc7325de4e0e51b163a3d99a35fc9ed1772`
- Transaction: `f0811cc9981a38d5a32cbf454c40e57a637ae19b5448b681b2efc4406f131fda`
- Disposable chain: `ea2f10034a982560881824ebaf258154c5342548`
- Evidence: `.sample/live/run-XCcDMb`
- Provider namespace: `autodrive-sample/live-test`

This run consumed the primary-only SDK patch. The live test counts logical
inserts; all physical PUTs are counted by offline adapter tests, which assert
one primary object and no secondary index writes. Provider archival remains
unconfirmed. Vitest stopped the disposable local chain. No public-chain
transaction was sent.

## Historical real-provider evidence before REST datalake

The ledger-free run stored one **176-byte** application payload, performed one
logical insert and one local-chain broadcast, verified fresh exact read-back and
finalized inclusion, then restarted the server and recovered with its confirmation
removed. Recovery used fresh authentication and read-only provider access, with
no second insert or broadcast.

- Payload: `6428a5ef346602305be6b551e82f65a4dc6f12c284c34f641933b39bb2f77b55`
- Transaction: `85d23a24cc55ca87ca20004a87ec0d60a381616c017e019d130fb3addc918c2e`
- Disposable chain: `ec71f82e7274370200197a2e6339efa63475821d`
- Evidence: `.sample/live/run-PzUjiU`
- Provider namespace: `autodrive-sample/live-test`

The local chain was stopped by Vitest. The artifacts contain no JWT or private key.
The byte count is canonical application size, not provider protocol/billing size.
No public-chain transaction was sent; provider archival completion is unverified.
Earlier `.sample/live/run-yQkb00` evidence used the old ledger design and remains
historical, rather than evidence for the new implementation.

The temporary startup-verification process was stopped after the route checks.
Run `pnpm start` in your terminal to own the website lifecycle.

## Remaining qualification

1. Actual Chrome Wallet transaction signing, approval/rejection, public
   Sequence broadcast/finality, account/network changes, and browser reload
   recovery still need a wallet-equipped browser. Prior browser QA established
   dropdown/draft behavior and 390-pixel layout, but not wallet execution.
2. Mainnet writes require a deliberate funded-wallet run. Read-only startup and
   dropdown checks do not establish Mainnet transaction acceptance.
3. Hosted operation, independent-process storage races, and provider archival
   observation remain separate qualification tasks.
4. A new `pnpm test:live` invocation generates a new salt and can permanently store
   another payload. Failed or uncertain runs need read-only evidence inspection
   before deciding to run another provider-writing scenario.
