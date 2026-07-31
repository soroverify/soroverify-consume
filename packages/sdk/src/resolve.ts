/**
 * Contract ID -> verification lookup, resolved server-side.
 *
 * resolveContract() lets a consumer pass a plain contract ID ("C...") without
 * knowing anything about wasm hashes. The soroverify-verifier resolves the
 * deployed wasm hash itself via GET /verifications/by-contract/:contractId
 * and returns the same envelope as GET /verifications/:wasmHash, so the SDK
 * needs no Soroban RPC client: one fetch, and no duplicate resolution logic
 * that could drift from the server's.
 *
 * Failure signaling follows client.ts: any non-2xx response (400
 * validation_failed for a malformed ID, 404 for a well-formed ID with no
 * deployed contract, 502 rpc_error for an upstream RPC failure) or network
 * failure throws SoroverifyApiError.
 */
import {
  getVerificationsByContract,
  type GetVerificationsOptions,
  type VerificationResponse,
} from './client.js';

/**
 * Look up the signed verification results for a deployed contract ID. The
 * verifier resolves the contract's current wasm hash server-side; the
 * returned envelope is identical to what GET /verifications/:wasmHash serves.
 */
export async function resolveContract(
  apiBaseUrl: string,
  contractId: string,
  options: GetVerificationsOptions = {},
): Promise<VerificationResponse> {
  return getVerificationsByContract(apiBaseUrl, contractId, options);
}
