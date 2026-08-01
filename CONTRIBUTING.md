# Contributing to soroverify-consume

Thanks for contributing. This document covers local dev setup, the gate to
pass before opening a PR, and the git workflow. It assumes you are picking up
a task in one or more of the workspace packages, so it also explains how the
packages relate.

## Local dev setup

Prerequisites: Node ≥ 22 and pnpm (the repo pins `pnpm@11.18.0` in the root
`packageManager` field).

```sh
pnpm install
```

There is **no lint script configured in this repo yet**. Do not run or
reference one; the gate is typecheck, test, and build only.

## Build order (required)

`@soroverify/widget` imports from `@soroverify/sdk`, whose `exports` map
points at its built `dist/`. On a fresh clone there is no `dist`, so building
the widget before the SDK fails with `Cannot find module '@soroverify/sdk'`.
Build the SDK first:

```sh
pnpm --filter @soroverify/sdk build     # first
pnpm --filter @soroverify/widget build  # after
```

`pnpm build` from the repo root runs both in dependency order and is the
safest way to build everything.

## The gate before a PR

Run all of these from the repo root before opening a PR:

```sh
pnpm typecheck   # tsc --noEmit for both packages
pnpm test        # vitest for both packages
pnpm build       # sdk then widget, as above
```

The reference integration is a separate app and is not covered by the root
scripts, so also run:

```sh
pnpm --filter @soroverify/reference-integration typecheck
pnpm --filter @soroverify/reference-integration build
```

All of the above must pass.

## Git workflow

- **One commit per logical unit.** A fix and its test go together; unrelated
  changes do not ride along.
- **Conventional commit format.** Use `type(scope): summary`, e.g.
  `feat(sdk): ...`, `fix(widget): ...`, `refactor(examples): ...`,
  `docs: ...`, `chore(workspace): ...`.
- **Never `git add .`.** Stage files explicitly with `git add <path>` so a
  commit contains exactly the files it claims to contain.

## How the packages relate

```
@<soroverify/sdk>                no internal dependencies
@<soroverify/widget>  depends on sdk
@<soroverify/reference-integration>  depends on both
```

If you change the SDK's public API, update the widget and the reference
integration in the same PR, then rebuild in order (sdk → widget) and re-run
the gate. If you only touch one package, you still need `@soroverify/sdk`
built first for anything that consumes it.
