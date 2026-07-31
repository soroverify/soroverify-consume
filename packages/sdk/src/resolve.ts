/**
 * Contract ID -> wasm hash -> verification lookup.
 *
 * resolveContract() lets a consumer pass a plain contract ID ("C...") without
 * knowing anything about wasm hashes. The current deployed wasm hash is read
 * directly from a Soroban RPC endpoint (never from the verifier), and that
 * hash is then looked up against soroverify-verifier's public API.
 *
 * The RPC read needs no network passphrase: getContractInstance() is a plain
 * ledger read, not a transaction. allowHttp is enabled so local RPC endpoints
 * (http://localhost:...) work during development.
 */
import { StrKey } from '@stellar/stellar-sdk/base';
import { Server } from '@stellar/stellar-sdk/rpc';
import { getVerifications, type VerificationResponse } from './client.js';

export interface ResolveContractOptions {
  /** Base URL of a soroverify-verifier deployment (SOROVERIFY_API_URL). Required. */
  apiBaseUrl: string;
  /** Per-request timeout in milliseconds for both the RPC read and the verification lookup. */
  timeoutMs?: number;
}

export interface ResolvedContract {
  contractId: string;
  /** Current deployed wasm hash, lowercase 64-char hex. */
  wasmHash: string;
  verifications: VerificationResponse;
}

function bufferToHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Resolve a contract ID to the wasm hash currently deployed on the network,
 * reading the contract's executable directly from Soroban RPC.
 */
export async function resolveContractWasmHash(
  rpcUrl: string,
  contractId: string,
  options: { timeoutMs?: number } = {},
): Promise<string> {
  if (rpcUrl.trim().length === 0) {
    throw new TypeError('rpcUrl must not be empty');
  }
  if (!StrKey.isValidContract(contractId)) {
    throw new TypeError(`invalid contract ID: ${contractId}`);
  }

  const server = new Server(rpcUrl, { allowHttp: true, timeout: options.timeoutMs ?? 0 });
  let instance: Awaited<ReturnType<Server['getContractInstance']>>;
  try {
    instance = await server.getContractInstance(contractId);
  } catch (err) {
    throw new Error(
      `could not resolve wasm hash for ${contractId} via ${rpcUrl}: ${errMsg(err)}`,
      { cause: err },
    );
  }

  let wasmHashBytes: Uint8Array;
  try {
    wasmHashBytes = instance.executable().wasmHash();
  } catch {
    throw new Error(
      `contract ${contractId} is not backed by wasm bytecode (e.g. a Stellar Asset Contract); nothing to verify`,
    );
  }

  return bufferToHex(wasmHashBytes);
}

/**
 * Resolve a contract ID to its current deployed wasm hash via Soroban RPC and
 * look up the signed verification results for that hash.
 */
export async function resolveContract(
  rpcUrl: string,
  contractId: string,
  options: ResolveContractOptions,
): Promise<ResolvedContract> {
  if (options.apiBaseUrl.trim().length === 0) {
    throw new TypeError('options.apiBaseUrl must not be empty (set SOROVERIFY_API_URL)');
  }
  const wasmHash = await resolveContractWasmHash(rpcUrl, contractId, options);
  const verifications = await getVerifications(options.apiBaseUrl, wasmHash, {
    timeoutMs: options.timeoutMs,
  });
  return { contractId, wasmHash, verifications };
}
