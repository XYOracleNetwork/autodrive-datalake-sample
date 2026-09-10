# Sample HTTP service

Node-only service exported through `startSampleApplication`. Root
`pnpm start:local`, `pnpm start:sequence`, and `pnpm start:mainnet` select XL1
configuration without chain settings in `.env`; `pnpm start` aliases Sequence.
The launcher loads storage/admission settings, constructs its storage client and XL1 viewer, and
serves the compiled React website and API on numeric loopback. See the root
README for configuration and external data-plane prerequisites. Local mode owns
a persistent CLI development chain on port 8080; public modes use the SDK
presets and validate the expected chain identity. Each profile has its own ledger.

With all three `ARIES_*` fields blank, local mode uses the published XYO Auto Drive
adapter directly and requires only `AUTODRIVE_API_KEY` for storage. Its endpoint,
bucket `autodrive-sample`, and namespace `local` are fixed. It makes real provider
uploads, with schema/byte admission and the same persistent budgets as Aries mode.
Readiness makes one read-only probe and no upload. The CLI closes the owned SDK
client on shutdown. A complete Aries connection overrides local mode; partial
connections fail. Sequence/Mainnet require the three Aries settings.
The executable selects the SDK's public lazy-start policy before construction;
the Auto Drive factory explicitly starts its owned archivist. Other hosts of the
importable adapter should use the same lifecycle policy to avoid delayed SDK
automatic-start timers after shutdown.

The importable constructor accepts explicit chain, storage, configuration, time,
state directory, and web-root dependencies. Tests and startup use the same routes
and PGlite ledger. Readiness checks do not upload data. Shutdown is idempotent,
drains owned requests, and preserves persistent state.

| Route | Behavior |
| --- | --- |
| `GET /api/config` | Nonsecret runtime identity and write policy |
| `POST /api/store-intents` | Bounded, expiring challenge; no provider write |
| `POST /api/store-intents/:id/confirm` | Verify transaction/JWT, reserve budget, insert one payload, verify fresh read-back |
| `POST /api/store-intents/:id/reconcile` | Re-authorize exact reserved evidence and read back without an upload; supports expiry and disabled writes |
| `GET /api/store-intents/:id` | Metadata for explicit recovery; no upload side effect |
| `GET /api/payloads/:hash` | Public retrieval with recomputed XYO identity |

All POST requests require the configured Origin. Confirmation additionally
requires an authentic wallet JWT bound to the signer, intent, nonce, payload,
origin, audience, and chain. Protocol validation and current transaction bounds
are checked before reserving count/byte capacity and dispatching storage.

The ledger atomically binds an intent to its signed transaction, reserves daily
budgets, and makes the payload hash unique before any upstream insert. Ambiguous
writes consume their reservation and can only be reconciled through reads;
ordinary retries never issue another upload for that hash. Persistent directory
ownership is exclusive. The ledger stores no payload bodies, JWTs, or private keys.

The Aries adapter uses the published `RestPayloadsClient`, validates exact
insert/rejection/duplicate results, restricts request methods/paths to the configured
lake, bounds responses, and redacts upstream errors. Its local request guard is
not a substitute for the external network boundary required by the deployment
plan: the configured plane credential can have broader server permissions.

The service never signs or broadcasts a user's transaction and never uploads the
transaction envelope. Only a successful exact-byte read-back produces
`storage-verified`; provider archival is not claimed.
