# Auto Drive datalake sample

A private XYO sample that composes one JSON payload, stores it in Auto Drive,
verifies the retrieved bytes, and anchors its hash with
the XL1 Chrome Wallet. The application and functional test share the transaction
workflow, HTTP service, validation, and PostgreSQL ledger.

Implementation and qualification are tracked in [PRD.md](PRD.md) and the
[implementation plan](docs/IMPLEMENTATION_PLAN.md). The direct local and configured-Aries
runtimes are implemented. Live Auto Drive writes, Chrome Wallet interaction, and
an independently distributable Aries service image remain qualification gates.
A storage read-back or finalized transaction does not confirm completed Auto
Drive network archival.

The [current stopping point](docs/STOPPING_POINT.md) records implemented behavior,
latest checks, and the next steps when development resumes.

## Run the sample

Use **Node 24.14.1** and **pnpm 12.3.4**. From the repository root:

```sh
pnpm install --frozen-lockfile
cp .env.example .env
# Local: set AUTODRIVE_API_KEY; leave the three ARIES_* settings blank.
pnpm start:local       # managed persistent local XL1 chain
# Or: pnpm start:sequence
# Or: pnpm start:mainnet
```

The startup commands select XL1 configuration in code; no chain ID, RPC URL, or
wallet network setting is required in `.env`:

| Command | XL1 network |
| --- | --- |
| `pnpm start:local` | Starts and owns a persistent local development chain on port 8080 |
| `pnpm start:sequence` | Uses the SDK's public Sequence endpoint and expected chain ID |
| `pnpm start:mainnet` | Uses the SDK's public Mainnet endpoint and expected chain ID |
| `pnpm start` | Alias for `pnpm start:sequence` |

Each command compiles the workspaces and website, checks its selected chain and
storage service, opens the profile's persistent ledger, and serves the website/API together
at **http://127.0.0.1:5173**. Open that exact numeric-loopback origin; the wallet's
JWT policy does not accept `http://localhost`. Stop with Ctrl-C. The command
uses real Auto Drive in every profile. Local mode embeds the published XYO
Auto Drive adapter in the sample server. Sequence and Mainnet connect to an
existing Aries service.
Local mode also stops its owned chain on shutdown and retains chain data across
restarts. Port 8080 must be free; the launcher refuses to adopt an existing listener.
The wallet's Local network uses this fixed port. Local mode uses the CLI's public
development genesis account and simplified development consensus.

Required external prerequisites:

- An XL1 Chrome Wallet supporting the public JWT signing capability and the
  selected network, with a funded account on that network for transaction fees.
- Network access to the selected public RPC for Sequence/Mainnet. Local mode
  starts its own chain and needs no public-chain connection.
- For local mode, an Auto Drive API key. Local refers to XL1; uploads still go
  to real Auto Drive and consume the provider account's allowance.
- For Sequence/Mainnet (or a local override), an operator-provisioned Aries data plane configured for Auto Drive, a stable
  dedicated datalake ID, and a server credential. The lake and plane must both
  allow only `com.example.message`, with a 4,096-byte ceiling.
  The plan records the required backend, descriptor, ACL, and network restrictions.

For `pnpm start:local`, set `AUTODRIVE_API_KEY` and leave `ARIES_PLANE_URL`,
`ARIES_DATALAKE_ID`, and `ARIES_PLANE_TOKEN` blank. The server uses the SDK's fixed
Auto Drive endpoint, bucket `autodrive-sample`, and namespace `local`. No separate
Aries listener, datalake provisioning, or service token is needed for this path.
Auto Drive creates bucket namespaces on first write; startup creates no objects.
[Provider S3 contract](https://develop.autonomys.xyz/sdk/auto-drive/s3_layer).

For Sequence/Mainnet, fill all three `ARIES_*` values instead. Supplying all three
also overrides local mode to use that Aries service. A partial Aries connection
is rejected; it cannot silently select the direct provider path.
Legacy `SAMPLE_CHAIN_ID`, `SAMPLE_RPC_URL`, and `SAMPLE_NETWORK_ID` values are
ignored; they cannot redirect an explicitly selected profile. The Auto Drive API key belongs
only to the server process that owns storage: this sample server in direct local
mode, or the separate Aries plane when configured. Never expose it to browser code.
The operator owns provisioning and renewal of the plane credential; replace an
expired credential in `.env` and restart.

Keep the direct Auto Drive key on the same provider account when rotating it:
bucket contents are account-scoped. The retained ledger stays bound to its fixed
storage namespace, and every confirmation still requires fresh matching content.
If a provider operation times out, the client stops to prevent late writes.
Restart the sample with its retained state before read-only reconciliation;
do not clear the ledger or repeat an uncertain upload.

The app starts with writes disabled. To enable uploads, set
`SAMPLE_WRITE_ENABLED=true` and `SAMPLE_ALLOWED_SIGNERS` to the
comma-separated XYO addresses allowed to pay for uploads. Keep explicit positive
per-account/global daily count and byte budgets. The example permits two writes
and 8 KiB per account, five writes and 20 KiB globally. Limits measure normalized
application bytes, not provider charges. Restart with writes disabled to leave
retrieval available while stopping new uploads.

Startup checks the chain ID and a read-only provider probe (direct local mode)
or authenticated Aries usage response without uploading anything. A missing
probe object is normal; authentication and transport failures prevent readiness.
Aries checks cannot independently attest the plane's backend selection,
schema policy, public access, or deployment restrictions; these remain operator prerequisites. Invalid
configuration or unavailable dependencies fail startup. There is no implicit
fallback to local fake storage.

## Use the website

Connect the wallet to the configured network and edit the complete JSON payload.
The editor includes `schema: "com.example.message"`, a random 64-character hex
`salt`, and the `data` object. Schema, salt, and data all count toward the byte
limit. A new draft starts with a cryptographically random salt; **New salt**
changes it explicitly before signing. Parsing, signing, storage, retries, and
reload recovery retain that exact salt and payload identity. Acknowledge that it is public
plaintext and may be retained permanently, then select **Perma-Store**. The flow
requests transaction signing and a short-lived wallet authorization, stores only
the application payload, verifies a fresh read-back, then requests broadcast and
observes finalized inclusion. The transaction envelope and authorization JWT are
never uploaded as application payloads.

The page displays separate storage and chain states. Rejected or uncertain
broadcast leaves a stored but unanchored payload. Pending payload and public
signed evidence are retained in session storage for explicit recovery; JWTs are
not retained. An unknown broadcast is observed by its existing hash without
automatic resubmission. Read-only reconciliation remains available after transaction
expiry or write-disable. To replace an expired transaction, reset the operation
(the current draft is retained), approve that same payload again, and let the
server reuse its existing upload record. Retrieval by payload hash works without connecting a wallet.

The service ledger lives under `.sample/state/<profile>/ledger` by default.
Local chain data lives under `.sample/state/local/chain`. `SAMPLE_STATE_DIR` changes
the base directory; profile subdirectories keep each network's ledger and budgets separate. It retains intent
metadata, upload reservations, and daily usage across restarts, without archiving
payload bodies. Keep that directory to preserve duplicate-write protection and
budgets. One process owns it at a time. Normal shutdown releases its writer lock;
a crash leaves a lock deliberately. If startup reports an existing lock, first
verify the owning process has stopped, then remove only `writer.lock` from the
profile's ledger directory. Never delete the ledger to retry an uncertain upload.
An older ledger directly under the base directory blocks profile startup. With
its process stopped, move that retained ledger into the appropriate original
network's `ledger` directory; do not replace it with an empty database.

## Tests and repository gates

```sh
pnpm check
pnpm build
pnpm test
pnpm test:sample
```

`pnpm test` runs ordinary offline tests with the published
`@xyo-network/dapp-kit-vitest-config` preset. These validate real payload hashing,
cryptographic authorization, server admission, Aries HTTP contracts, budgets,
and recovery using isolated controlled dependencies. They do not start a chain
or contact Auto Drive.

`pnpm test:sample` compiles the workspaces and explicitly selects the preset's
`local-xl1` project. The public installer starts and stops a disposable funded
XL1 chain. The test runs the same exported client workflow against the real HTTP
service and PGlite ledger, using a controlled storage boundary, then verifies
actual chain inclusion/finality and read-back. It requires no wallet extension,
Docker, `.env`, provider key, public-chain funds, or another source checkout.
The local chain is real; its controlled storage is not Auto Drive qualification.

See [the local qualification report](docs/LOCAL_QUALIFICATION.md) for the exercised
paths, defects found through execution, and remaining live acceptance gates.

Live provider and wallet acceptance commands are still planned. Default discovery
excludes `spec/live` and `.live.ts` files. No deployment or package publication
workflow is configured.

## Workspaces

| Package | Runtime and responsibility |
| --- | --- |
| `packages/protocol` | Neutral schema, canonical bytes, XYO identity, dapp-kit profile |
| `packages/client` | Shared browser-compatible signing, storage, broadcast, recovery workflow |
| `packages/web` | React website and public XL1 Chrome Wallet SDK integration |
| `packages/server` | Node HTTP service, authentication, admission, persistent budgets, Aries client |

All packages have explicit runtime configuration. The website uses Vite output;
the libraries and server use the Aries toolchain. Run all `xy` commands from the
repository root.

## License

[MIT](LICENSE). Repository visibility remains private.
