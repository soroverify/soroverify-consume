# Soroverify reference integration

A small, runnable [Next.js](https://nextjs.org) app that demonstrates the
SDK + widget working wired into a realistic consumer, a Stellar-Lab-style
contract detail page with the `<soroverify-badge>` verification indicator
embedded where a block explorer or Stellar Lab would put it.

This is one of the RFP's explicitly required deliverables: proof that
`@soroverify/sdk` and `@soroverify/widget` work in a real page, calling the
real verifier cross-origin from the browser, not mocked, not reimplemented.

## What it demonstrates

- **Real integration, real packages.** The app depends on
  `@soroverify/sdk` and `@soroverify/widget` through the pnpm workspace
  (`workspace:*`); the badge is the actual published custom element + React
  wrapper, not a copy.
- **Cross-origin calls from the browser.** The widget fetches the verifier's
  public read endpoints directly (`GET /verifications/by-contract/:contractId`,
  which the verifier's CORS support allows). No server-side proxy needed.
- **Honest states with real data.** The badge renders only what the live
  verifier says:
  - A clearly nonexistent contract renders **neutral** (unresolvable by the
    verifier).
  - A well-formed but undeployed contract ID renders **neutral** and the
    detail panel says the contract *could not be resolved*: it never claims
    "unverified" (the "unverified" label is reserved for a verifier response
    with status `unverified`, i.e. a contract whose wasm hash has no results).
  - **No real verified or mismatched contract exists yet** in the current
    deployment, so no green/red state can be shown with real data. This is
    deliberate: the integration demonstrates honest behavior, and faking a
    verified result would defeat the point.

## Running it

Prerequisites: Node ≥ 22, pnpm, and a running soroverify-verifier at
`http://localhost:8080` (see the soroverify-verifier repo: `npm run dev`).

```sh
# from the repo root
pnpm install
pnpm build          # builds @soroverify/sdk and @soroverify/widget (dist)

# start the example (option A — from the root)
pnpm --filter @soroverify/reference-integration dev

# option B — from inside the example directory
cd examples/reference-integration
pnpm dev
```

Then open http://localhost:3000, paste a contract ID (e.g.
`CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4`), and hit **Open
contract page**. The badge appears next to the contract ID.

To point at a different verifier deployment, set
`NEXT_PUBLIC_SOROVERIFY_API_URL` (see `.env.example`; it defaults to
`http://localhost:8080`).

## Layout

```
app/page.tsx                    landing page: paste a contract ID → navigate
app/contract/[contractId]/page.tsx   the contract detail page with the badge
lib/config.ts                   NEXT_PUBLIC_SOROVERIFY_API_URL (default localhost:8080)
```

Gates: `pnpm --filter @soroverify/reference-integration typecheck` and
`... build`.
