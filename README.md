# Auto Drive + XL1 CLI sample

This single Node package takes a message, stores it in **real Auto Drive**, verifies
its read-back, and anchors the payload on **XL1** using the **AriesTools CLI wallet**.
A successful run ends with a link to the transaction in XYO Explore.

```sh
pnpm start "Hello, permanent world"
```

You need an Auto Drive API key and an Aries wallet with a funded account on the
selected XL1 network. The default network is **Sequence testnet**. There is no
website, server to launch, browser wallet requirement, or XL1 configuration in
`.env`. The sample delegates password input, signing, and broadcast to Aries.

## 1. Install the sample

Use **Node 24.14.1** and **pnpm 12.3.4**. Run the following commands from the
repository root:

```sh
git clone https://github.com/XYOracleNetwork/autodrive-datalake-sample.git
cd autodrive-datalake-sample
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm build
```

If you already have a checkout, start with `cd` into that directory. This is a
private repository, so cloning requires access through your GitHub account.

The development dependencies include **AriesTools CLI 0.1.20**. Use the project's
CLI for wallet setup so setup and the sample use the same version:

```sh
pnpm exec aries --version
pnpm exec aries wallet --help
```

Run wallet commands and the sample in an **interactive terminal**. Aries needs a
terminal for its password prompt, and the sample needs terminal input for menus.

## 2. Configure Auto Drive

Sign in to the [Auto Drive dashboard](https://ai3.storage) and create an API key.
See the official [Auto Drive getting-started guide](https://academy.autonomys.xyz/auto-suite/auto-drive)
for account and API access instructions. Your account needs permission and
available capacity to upload and retrieve data.

For a new checkout, create the local configuration file:

```sh
cp .env.example .env
```

Edit `.env` and set:

```dotenv
AUTODRIVE_API_KEY=your-auto-drive-api-key
# Optional; omit to use autodrive-sample:
# AUTODRIVE_BUCKET=autodrive-sample
```

If `.env` already exists, edit it instead of copying over it. It is gitignored.
Do not put your wallet password, recovery phrase, private key, RPC URL, chain ID,
or Aries Plane settings in this file. **Only Auto Drive configuration is needed.**

Alternatively, supply the key for one invocation:

```sh
pnpm start "Hello, permanent world" --autoDriveKey '<your-api-key>'
```

The flag overrides `AUTODRIVE_API_KEY` in the process environment, which overrides
`.env`. The file is loaded from your current directory. Prefer `.env` if you do
not want the key in shell history or command arguments. The sample does not print
the key, save it in evidence, or forward it to Aries wallet subprocesses.

Sequence and Mainnet both use real Auto Drive. `--network sequence` selects the
XL1 testnet; it does not turn the upload into simulated storage.

## 3. Create, import, or select an Aries wallet

Check whether you already have a wallet:

```sh
pnpm exec aries wallet list
```

Choose **one** of the following paths.

### Create a new wallet

```sh
pnpm exec aries wallet create --label sample-sequence
```

Follow Aries' prompts to initialize or unlock its encrypted wallet store. On
first setup, choose and confirm a wallet password. Aries prints the new wallet's
recovery phrase; save it securely. The sample never needs that phrase.

Then explicitly select the wallet for the account setup commands below:

```sh
pnpm exec aries wallet use sample-sequence
```

### Import an existing wallet

```sh
pnpm exec aries wallet import --label sample-sequence
pnpm exec aries wallet use sample-sequence
```

Enter the recovery phrase at the Aries prompt, then follow its password prompts.
This keeps the phrase out of the command line and the sample's `.env`. Use the
wallet's actual signing algorithm when importing; Aries' default is `secp256k1`.
Run `pnpm exec aries wallet import --help` if your wallet uses another algorithm.

### Use a wallet already in Aries

```sh
pnpm exec aries wallet list
pnpm exec aries wallet use '<wallet-id-or-label>'
```

Replace `<wallet-id-or-label>` with a value from the list. A browser-extension
wallet is not automatically an Aries CLI wallet; it must be imported into Aries,
or you can create a separate Aries wallet and fund its address.

The examples below use the wallet selected with `wallet use`. You can select a
different wallet again in the sample's interactive menu.

## 4. Choose an account and fund it

A wallet can have several accounts. Each account has an **offset** such as `0`,
`1`, or `2`, and its own address and balance. Funding one account does not fund
the others.

Unlock the wallet for setup and list its accounts:

```sh
pnpm exec aries wallet unlock --ttl 900
pnpm exec aries wallet account list
pnpm exec aries wallet account show 0
```

For a first run, use account offset `0`. If you want to register or label that
account, use:

```sh
pnpm exec aries wallet account derive 0 --label sample-account
```

You can derive another offset similarly. The sample lists the wallet's saved
accounts; if there are none, it offers the default account at offset `0`.

### Fund the Sequence account

Select Sequence before checking its balance:

```sh
pnpm exec aries wallet network use xl1-sequence
pnpm exec aries wallet account show 0
pnpm exec aries wallet balance 0
```

Copy the address from `account show 0`. Obtain **XL1 Sequence test tokens** from
your project/team or another funded Sequence wallet and have them transferred to
that exact address on **Sequence**. See XYO's
[developer introduction](https://docs.xyo.network/developers/introduction) for
testnet onboarding. The sample does not obtain tokens, fund accounts, or bridge
funds automatically.

Check the balance again after funding:

```sh
pnpm exec aries wallet balance 0
```

The account needs enough XL1 on the selected network to pay the transaction fee.
A mainnet balance does not fund a Sequence transaction, and the Auto Drive API
key does not pay XL1 fees. If you fund offset `1` instead, use `balance 1` and
choose that same account when running the sample.

The manual `network use` above is for checking and funding the correct network.
Normal sample runs select their requested network automatically.

## 5. Run the sample interactively

With the Auto Drive key configured and your account funded:

```sh
pnpm start "Hello, permanent world"
```

`pnpm start` compiles current source before running. After an existing build,
you can run without recompiling:

```sh
pnpm sample-cli "Hello, permanent world"
```

The message is required. Keep it in quotes so the shell passes it as **one
argument**. Empty messages and multiple positional arguments are rejected. Use
single quotes if the message contains shell expressions you want preserved:

```sh
pnpm sample-cli 'This message contains $HOME literally.'
```

During the run:

1. The sample prints the evidence directory under `.sample/runs/run-*`.
2. Aries asks for the wallet password through its masked prompt. The sample
   requests a 15-minute unlock session.
3. A numbered wallet menu appears. Enter a number, or press Enter to choose the
   active wallet.
4. A numbered account menu shows labels, offsets, and addresses. Choose the
   funded account. Enter accepts the first displayed account.
5. The sample selects `xl1-sequence`, verifies the network, requests a signature,
   uploads to Auto Drive, and verifies the stored payload.
6. Aries broadcasts the signed transaction. The sample waits for finalized
   inclusion, verifies storage again, and prints the result and explorer link.

**Menu numbers and account offsets are different.** For example, menu item `2`
may display account offset `1`. Choose using the menu number, after checking the
shown address against the address you funded.

Your chosen wallet and network remain active in Aries after the run. The unlock
session can also remain usable for its TTL. To lock it immediately afterward:

```sh
pnpm exec aries wallet lock
```

Ctrl-C during a menu cancels before an upload or broadcast starts. Interrupting a
later stage can leave a completed upload or submitted transaction; see
[Interrupted runs](#interrupted-runs) before retrying. Redirecting stdin is not
supported.

### Mainnet

Use an account funded with XL1 on Mainnet, then run:

```sh
pnpm start "Hello from Mainnet" --network mainnet
```

To inspect that account's balance beforehand:

```sh
pnpm exec aries wallet use '<wallet-id-or-label>'
pnpm exec aries wallet network use xl1-mainnet
pnpm exec aries wallet balance 0
```

Replace `0` with the intended account offset. The sample automatically selects
`xl1-mainnet` for this run. There is no separate network-confirmation prompt;
`--network mainnet` selects it. Public endpoints and expected chain identities
come from the XL1 SDK. No XL1 `.env` settings are needed.

### Optional: use the executable name directly

The repository-local commands above are sufficient. If you want `sample-cli`
available as a shell command, build and link it:

```sh
pnpm build
pnpm link --global
```

Direct execution also needs `aries` on your shell's `PATH`. If necessary, install
the matching CLI globally:

```sh
pnpm add --global @ariestools/cli@0.1.20
aries --version
sample-cli "Hello, permanent world" --autoDriveKey '<your-api-key>'
```

If pnpm reports that its global bin directory is missing, run `pnpm setup` and
open a new terminal before repeating the global commands. Continue using the
same wallet environment for setup and execution. Running the linked executable
from another directory loads that directory's `.env` and writes evidence there.

## Options and useful commands

| Input | Meaning |
| --- | --- |
| `"<message>"` | Required nonempty string, preserved as supplied |
| `--autoDriveKey <key>` | Overrides `AUTODRIVE_API_KEY` |
| `--network sequence\|mainnet` | Defaults to Sequence; selects the network in Aries |
| `--help`, `-h` | Print usage without reading credentials or contacting services |
| `AUTODRIVE_API_KEY` | Process environment or current-directory `.env` fallback |
| `AUTODRIVE_BUCKET` | Optional environment/`.env` bucket; default `autodrive-sample` |

```sh
pnpm run sample-cli --help
pnpm exec aries wallet --help
pnpm exec aries wallet list
pnpm exec aries wallet account list
pnpm exec aries wallet network list
```

There are no `start:local`, `start:sequence`, or `start:mainnet` scripts. Local XL1
is used by the explicit test commands below, not the normal CLI.

## Output and verification

Success prints the result JSON to stdout, followed by the transaction's explorer
URL as the **last line**, after cleanup:

```text
https://explore.xyo.network/xl1/sequence/transaction/<transaction-hash>
```

Mainnet runs use `/xl1/mainnet/transaction/<transaction-hash>`. Open the URL from
your own run to inspect the transaction.

The result includes `status: "finalized"`, the network and chain ID, payload
information, transaction hash, inclusion details, and `archivalConfirmed: false`.
An exit code of **0** means fresh storage read-back and finalized XL1 inclusion
were verified. It does **not** mean Auto Drive has completed network archival.
A wallet, storage, broadcast, or finality failure exits **1**.

Progress goes to stderr. Stdout is JSON **plus a URL**, so do not pipe the entire
output directly into a JSON parser. The evidence directory printed at startup
contains a standalone `result.json` after a successful run.

## What gets written

The application payload is:

```json
{
  "schema": "com.example.message",
  "salt": "<64 lowercase hex characters>",
  "data": { "message": "Hello, permanent world" }
}
```

Every invocation generates a new 256-bit salt. Re-running the same message
therefore creates a **new payload**. Canonical JSON, including schema and salt,
is limited to **4,096 UTF-8 bytes**; the message itself must fit within the
remaining space. The sample does not encrypt the message before storing it.

The application payload is stored in Auto Drive; the signed transaction is
submitted separately to XL1. The unmodified published Auto Drive adapter also
writes a **zero-byte sequence index object**. That extra file is expected.
There is no local SDK patch.

Identical full payloads reuse their existing objects in the same
account/bucket/namespace, including after reopening the adapter. The SDK's remote
check and PUT are separate; cross-process atomic deduplication is not guaranteed.
The normal CLI's fresh salt means separate invocations do not exercise that
identical-payload case.

## Interrupted runs

Public evidence stays in `.sample/runs/run-*`:

| File | Purpose |
| --- | --- |
| `payload.json` | Salted payload, canonical representation, and hash |
| `unsigned-transaction.json` | Signing request sent to Aries |
| `signed-transaction.json` | Signed transaction returned by Aries |
| `evidence.json` | Validated signed transaction evidence |
| `write-dispatch.json` | Records that a provider insertion was about to be attempted |
| `broadcast-dispatch.json` | Records that a broadcast was about to be attempted |
| `result.json` | Final result, written only after successful verification |

Only files reached before the interruption will exist. Keys and wallet
credentials are excluded. These files are diagnostic evidence, not a ledger or
writer lock.

No failed command automatically repeats an upload or broadcast. A dispatch
marker does not establish success. Inspect the saved hashes and transaction
before recovering: an upload may already exist, or a transaction may already be
included even if the CLI did not observe finality. Re-running the message adds a
new salt. An expired transaction cannot be made valid by rebroadcasting it. The
sample does not provide an automatic resume command.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `Provide --autoDriveKey or set AUTODRIVE_API_KEY in .env` | Set a nonempty key in the current directory's `.env`, export it, or pass the flag. The key must not contain whitespace. |
| `No Aries wallets found` | Create or import a wallet with the project's `pnpm exec aries wallet` commands, then rerun. |
| Wallet password fails or the wallet command is cancelled | Test `pnpm exec aries wallet unlock` directly in the same terminal. Use the Aries wallet-store password, not the Auto Drive key. |
| `Could not run aries wallet` | Run `pnpm install --frozen-lockfile` and use `pnpm start` from the repository. For a globally linked executable, check `aries` is on `PATH`. |
| `Wallet selection requires an interactive terminal` or `/dev/tty` errors | Run directly in a terminal with stdin attached. Do not pipe input into the CLI or launch it from a terminal-less runner. |
| A password prompt is unexpectedly skipped or cannot appear | Check whether your shell exports `ARIES_WALLET_PASSWORD` or `ARIES_WALLET_NON_INTERACTIVE`. Those Aries settings can override normal prompting. They are not sample `.env` settings. |
| The expected wallet is missing | Check you are using the same Aries installation and wallet home. `XL1_WALLET_HOME` and `ARIES_WALLET_HOME` overrides in your shell can select another store. |
| The expected account is missing | Select the intended wallet with `wallet use`, inspect `account list`, and derive the required offset with `account derive`. |
| Signing/broadcast fails or funds appear missing | Check `wallet use`, `wallet network list`, and `wallet balance <offset>` for the exact account and network chosen in the menu. |
| Wallet or network changed during the run | Avoid changing the active Aries wallet/network in another terminal while the sample is running. Inspect retained evidence before retrying. |
| Aries network endpoint does not match the SDK | Inspect `pnpm exec aries wallet network list --json` and any custom network edits. The sample requires the SDK preset endpoint and verifies chain identity. |
| Auto Drive rejects authentication or an upload | Check the API key, account access/capacity, bucket setting, and network connectivity. Provider failures are redacted to avoid exposing credentials. |
| Two Auto Drive files appear, including a 0-byte file | Expected: the published adapter writes a payload object and a sequence index. |
| Storage verified but finality is unconfirmed | Keep the evidence. The CLI waits up to about 90 seconds for finality, bounded also by transaction expiry. Inspect the transaction before deciding whether to recover. |
| Old behavior after editing source | Use `pnpm start` to compile again, or run `pnpm build --no-incremental` before `pnpm sample-cli`. |

## Tests and development checks

```sh
pnpm check
pnpm build
pnpm lint
pnpm test
```

`pnpm test` is offline: argument handling, payload validation, wallet command
boundaries, workflow failures, and the Auto Drive adapter with a controlled
provider boundary. It does not need credentials or contact a chain.

Two explicit integration commands are available:

```sh
pnpm test:sample  # Disposable local XL1 + isolated real Aries wallet + controlled storage
pnpm test:live    # Disposable local XL1 + isolated real Aries wallet + real Auto Drive
```

Both use dapp-kit's Vitest local-chain installer, import the public local-chain
genesis mnemonic into a temporary isolated Aries wallet, and dispose the wallet
and chain afterward. They never use or change your wallet or contact a public
XL1 network. They do not require you to fund a test account.

`test:sample` requires no Auto Drive key and performs no provider uploads.
`test:live` reads the provider key from the environment or `.env`, uses the
`live-test` namespace, and retains evidence in `.sample/live/cli-*`. It inserts
one application payload through the real adapter, including the adapter's index
write, with no automatic retries. It is a real permanent-storage operation.
Ordinary tests and CI do not run the live-provider test.

See [PRD.md](PRD.md), the [implementation plan](docs/IMPLEMENTATION_PLAN.md), and
[current verification](docs/STOPPING_POINT.md). Historical web/server evidence is
retained in [LOCAL_QUALIFICATION.md](docs/LOCAL_QUALIFICATION.md).
