![Soroverify](assets/soroverify-consume.svg)

[![CI](https://github.com/soroverify/soroverify-consume/actions/workflows/ci.yml/badge.svg)](https://github.com/soroverify/soroverify-consume/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

**Status:** working implementation, 17 tests passing, CI configured to run
build order (sdk → widget → reference integration) plus tests.

soroverify-consume is the read-only integration layer for
[soroverify-verifier](https://github.com/soroverify/soroverify-verifier): an
SDK, an embeddable verification-badge widget, and a reference integration that
lets explorers, wallets, and dApps show Soroban contract source-verification
status without running their own rebuild pipeline. It only reads: the SDK
issues GET requests to the verifier's public API and never signs or writes
anything; the widget renders exactly one of verified, mismatch, or a neutral
state, and never fabricates a result.

**Related work.** This is the consumer-facing half of a two-repo project;
[soroverify-verifier](https://github.com/soroverify/soroverify-verifier) does
the actual rebuild-and-compare work this SDK and widget read from. For how
that differs from StellarExpert's SEP-55 attestation and SoroSeal's
deploy-time certification, see the verifier repo's README.

## Repository layout

This is a pnpm workspace with three packages, and the dependency direction is
one-way:

```
packages/sdk/                    @soroverify/sdk
  read-only client for the verifier's public API: verification lookup,
  contract resolution, and multi-verifier trust resolution.
  No internal dependencies.

packages/widget/                 @soroverify/widget
  the <soroverify-badge> custom element plus a thin React wrapper.
  Depends on @soroverify/sdk.

examples/reference-integration/  @soroverify/reference-integration
  a runnable Next.js contract-detail page that embeds the badge against a
  live verifier deployment, cross-origin from the browser.
  Depends on both @soroverify/sdk and @soroverify/widget.
```

`sdk` has no internal dependencies, `widget` depends on `sdk`, and the
reference integration depends on both. Nothing depends on the reference
integration.

## Quick start

Prerequisites: Node ≥ 22 and pnpm (the repo pins `pnpm@11.18.0` in
`packageManager`).

```sh
pnpm install
pnpm build   # builds both packages, in dependency order
```

**Build order matters.** `@soroverify/widget`'s source imports from
`@soroverify/sdk`, and that package's `exports` map points at its built
`dist/`. On a fresh clone there is no `dist` yet, so building the widget
before the SDK fails with:

```
Cannot find module '@soroverify/sdk'
```

If you build the packages individually instead of using the root `pnpm
build`, keep this order:

```sh
pnpm --filter @soroverify/sdk build     # build this first
pnpm --filter @soroverify/widget build  # requires @soroverify/sdk's dist
```

## Environment variables

These are the variables the shipped code actually reads. The original env
spec listed `SOROBAN_RPC_URL` and `NETWORK_PASSPHRASE` for client-side RPC
resolution; nothing in this repo reads them anymore: contract resolution
moved server-side to the verifier's `GET /verifications/by-contract/:contractId`
endpoint, so the SDK has no Soroban RPC client. Do not set them expecting
them to be used.

| Variable | Read by | Default | Notes |
| --- | --- | --- | --- |
| `SOROVERIFY_API_URL` | `@soroverify/sdk` (`apiBaseUrlFromEnv()`) | none | Base URL of a soroverify-verifier deployment. The SDK helper reads it only where `process.env` exists (Node/bundler); in the browser the widget takes the URL from its `api-base-url` attribute instead. |
| `NEXT_PUBLIC_SOROVERIFY_API_URL` | `examples/reference-integration` (`lib/config.ts`) | `http://localhost:8080` | Inlined into the browser bundle by Next.js at build time. Set this to point the example at a different verifier deployment. |
| `SOROBAN_RPC_URL` | — | — | In the original spec, not read anywhere in this repo. Resolution is server-side (see above). |
| `NETWORK_PASSPHRASE` | — | — | Same as `SOROBAN_RPC_URL`. |

The root `.env.example` documents the two live variables; the example has its
own `.env.example` under `examples/reference-integration/`.

## Embedding the widget

### Vanilla (no framework)

Load the built element module, then drop the tag in. Importing the module
registers the `soroverify-badge` custom element.

```html
<script type="module" src="/path/to/@soroverify/widget/dist/element.js"></script>

<soroverify-badge
  contract-id="C..."
  api-base-url="http://localhost:8080"
  trusted-verifiers="id1,id2"
></soroverify-badge>
```

`contract-id` and `api-base-url` are required. `trusted-verifiers` is an
optional comma-separated list of verifier IDs; see the trust model below.

### React

`@soroverify/widget/react` exports a pass-through wrapper that maps props to
the element's attributes. Importing it registers the custom element.

```tsx
import { SoroverifyBadge } from '@soroverify/widget/react';

<SoroverifyBadge
  contractId="C..."
  apiBaseUrl="http://localhost:8080"
  trustedVerifiers={['id1', 'id2']}
/>;
```

### Next.js (and any SSR framework): client-side-only loading is a hard requirement

`element.ts` defines a class that extends `HTMLElement`, a browser-only
global. Importing the widget during server-side rendering throws
`ReferenceError: HTMLElement is not defined` and crashes the render. This is
not a tip: the repo's own reference integration hit this exact bug and fixed
it the same way. Any Next.js or other SSR consumer must load the widget with
`ssr: false`, e.g. via `next/dynamic`:

```tsx
'use client';

import dynamic from 'next/dynamic';

const SoroverifyBadge = dynamic(
  () =>
    import('@soroverify/widget').then(() =>
      import('@soroverify/widget/react').then((m) => m.SoroverifyBadge),
    ),
  { ssr: false },
);

export function Page({ contractId }: { contractId: string }) {
  return <SoroverifyBadge contractId={contractId} apiBaseUrl="http://localhost:8080" />;
}
```

The side-effect `import('@soroverify/widget')` must come first: it registers
the custom element. If you use the React wrapper without that, the element
class is never defined.

## Trust model

The verifier's API can return one signed record per independent verifier, and
those records can disagree. `resolveTrust()` in the SDK reduces the array to a
single display-ready verdict:

- A `mismatch` from a verifier inside the trusted set wins immediately. It is
  never averaged away or outvoted by agreeing `verified` reports.
- Mismatches from verifiers *outside* the trusted set are never hidden — they
  surface in `hasMismatch`/`mismatchRecords` — but they do not by themselves
  override the trusted-set verdict.
- Otherwise: all `verified` → `verified`; all `inconclusive` → `inconclusive`;
  a mix → `disagreement`; no records at all → `unverified`; records only from
  untrusted verifiers → `unknown`.
- The most recent trusted `verified` result carries its age, and is marked
  stale once older than the threshold (default 90 days) so a months-old
  verification never gets the visual weight of a fresh one.

The **trusted verifier set** is the set of verifier IDs you explicitly vouch
for (the widget's `trusted-verifiers` attribute / React `trustedVerifiers`
prop). Only their records count toward the verdict; everyone else's records
are still shown.

**Honest degradation is guaranteed:** an unreachable API, a timeout, a
malformed contract ID, or an ambiguous result always renders a neutral state,
never a fabricated `verified`. The `unverified` label is reserved for a
verifier response with status `unverified` (a wasm hash with no results), not
for a failed lookup.

## Running the reference integration locally

The example is a real consumer: it calls the verifier's public read endpoints
cross-origin from the browser. **It requires a running soroverify-verifier
instance**, local (follow the [verifier repo's Quick start](https://github.com/soroverify/soroverify-verifier#quick-start); a bare `npm run dev` fails because the verifier does not auto-load `.env`: run `node --env-file=.env node_modules/.bin/tsx watch src/index.ts` instead; the service serves `http://localhost:8080` by default) or deployed, reachable at `SOROVERIFY_API_URL` /
`NEXT_PUBLIC_SOROVERIFY_API_URL`. Without a reachable verifier the badge
renders neutral and the detail panel says the contract could not be resolved.

```sh
pnpm install
pnpm build   # sdk then widget, as above

# optionally point at a different verifier deployment
cp examples/reference-integration/.env.example examples/reference-integration/.env.local
# edit NEXT_PUBLIC_SOROVERIFY_API_URL in .env.local if needed

pnpm --filter @soroverify/reference-integration dev
```

Then open http://localhost:3000, paste a contract ID (e.g.
`CDNA2XPXQ5XEVG4J5S4CFD5XJ7RI7O5G3HBU3TALYXUMVA3KVMFW3RCE`), and open the
contract page. The badge appears next to the contract ID.

That contract is a real hello-world contract deployed to Stellar testnet (wasm
hash `ae93c5657badf39e151ce54a5bd163127c6590785d40f0d6f28c25d45b37af9e`). No
source has been submitted for it yet, so the verifier returns `unverified` and
the badge correctly renders its neutral state, a genuine working first
experience rather than an error. For it to resolve, the verifier must be
pointed at a testnet RPC endpoint (e.g. `STELLAR_RPC_URL=https://soroban-testnet.stellar.org`).

## Contributing and security

- [CONTRIBUTING.md](CONTRIBUTING.md): local dev setup, the pre-PR gate, and git workflow.
- [SECURITY.md](SECURITY.md): responsible disclosure and scope.
- [LICENSE](LICENSE): Apache License 2.0.


## Maintainers

| Name | GitHub |
|---|---|
| Hollujay | [@Hollujay](https://github.com/Hollujay) |
| emarkees | [@emarkees](https://github.com/emarkees) |


## Contributors

<a href="https://github.com/soroverify/soroverify-consume/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=soroverify/soroverify-consume" />
</a>
