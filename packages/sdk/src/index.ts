/**
 * @soroverify/sdk — read-only integration layer for soroverify-verifier.
 *
 * client.ts  — thin fetch client for the verifier's public API
 * resolve.ts — contract ID -> wasm hash -> verification lookup via Soroban RPC
 * trust.ts   — multi-verifier quorum resolution for signed result records
 */
export * from './client.js';
export * from './resolve.js';
export * from './trust.js';
