/**
 * Thin, read-only HTTP client for soroverify-verifier's public API.
 *
 * Safe to call from a browser: it only performs GET requests and never signs
 * or writes anything. Verification records are self-authenticating (each
 * carries a public key and signature), so no credentials are ever needed.
 *
 * The read endpoint implemented by current soroverify-verifier deployments is
 * GET /verifications/:wasmHash, which returns an envelope of signed results:
 *
 *   { wasmHash, status, results: SignedVerificationRecord[], sources: Source[] }
 *
 * A hash with no result and no submission resolves to status "unverified"; a
 * submission that failed to build resolves to "inconclusive". See the
 * soroverify-verifier README for the full contract.
 */

export type VerificationStatus = 'verified' | 'mismatch' | 'inconclusive' | 'unverified';

/** Statuses that appear on individual signed records (never "unverified"). */
export type RecordStatus = Exclude<VerificationStatus, 'unverified'>;

/** One signed result record as served by GET /verifications/:wasmHash. */
export interface SignedVerificationRecord {
  wasm_hash: string;
  source_repo: string;
  source_rev: string;
  status: RecordStatus;
  build_meta: Record<string, string> | null;
  verifier_id: string;
  public_key: string;
  timestamp: string;
  signature: string;
  tarball_sha256: string | null;
}

/** A content-addressed source archive link. */
export interface VerificationSource {
  sha256: string;
  url: string;
}

/** Envelope returned by GET /verifications/:wasmHash. */
export interface VerificationResponse {
  wasmHash: string;
  status: VerificationStatus;
  results: SignedVerificationRecord[];
  sources: VerificationSource[];
}

export interface GetVerificationsOptions {
  /** Abort the request after this many milliseconds. Default: no timeout. */
  timeoutMs?: number;
}

/** Thrown when the verifier API is unreachable or returns an unexpected status or shape. */
export class SoroverifyApiError extends Error {
  /** HTTP status code, or 0 when the request failed before a response (network error or timeout). */
  readonly status: number;
  readonly url: string;
  readonly bodyText: string;

  constructor(message: string, status: number, url: string, bodyText: string) {
    super(message);
    this.name = 'SoroverifyApiError';
    this.status = status;
    this.url = url;
    this.bodyText = bodyText;
  }
}

function normalizeBaseUrl(apiBaseUrl: string): string {
  const trimmed = apiBaseUrl.trim().replace(/\/+$/, '');
  if (trimmed.length === 0) {
    throw new TypeError('apiBaseUrl must not be empty');
  }
  return trimmed;
}

/**
 * Read SOROVERIFY_API_URL from the environment where one exists (Node.js or a
 * bundler that injects process.env). Returns undefined in browsers or when the
 * variable is unset, so this stays safe to call from any runtime.
 */
export function apiBaseUrlFromEnv(): string | undefined {
  const processLike = (globalThis as {
    process?: { env?: Record<string, string | undefined> };
  }).process;
  return processLike?.env?.['SOROVERIFY_API_URL'];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function requestJson(url: string, options: GetVerificationsOptions = {}): Promise<unknown> {
  const signal = options.timeoutMs === undefined ? undefined : AbortSignal.timeout(options.timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal,
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    const detail = timedOut ? 'request timed out' : 'network error';
    throw new SoroverifyApiError(detail, 0, url, '');
  }
  const bodyText = await response.text();
  if (!response.ok) {
    throw new SoroverifyApiError(
      `soroverify-verifier responded with HTTP ${response.status}`,
      response.status,
      url,
      bodyText,
    );
  }
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new SoroverifyApiError(
      'soroverify-verifier returned a non-JSON response',
      response.status,
      url,
      bodyText,
    );
  }
  return body;
}

function assertVerificationResponse(body: unknown, url: string): VerificationResponse {
  if (
    !isRecord(body) ||
    typeof body.wasmHash !== 'string' ||
    typeof body.status !== 'string' ||
    !Array.isArray(body.results) ||
    !Array.isArray(body.sources)
  ) {
    throw new SoroverifyApiError(
      'soroverify-verifier returned an unexpected response shape',
      0,
      url,
      '',
    );
  }
  return body as unknown as VerificationResponse;
}

/**
 * Look up signed verification results for a wasm hash. The hash may be
 * lowercase 64-char hex or base64 — the verifier normalizes both to lowercase
 * hex. Returns the full envelope; disagreement between verifiers is expected
 * and resolved with resolveTrust() from trust.ts.
 */
export async function getVerifications(
  apiBaseUrl: string,
  wasmHash: string,
  options: GetVerificationsOptions = {},
): Promise<VerificationResponse> {
  const base = normalizeBaseUrl(apiBaseUrl);
  const url = `${base}/verifications/${encodeURIComponent(wasmHash)}`;
  const body = await requestJson(url, options);
  return assertVerificationResponse(body, url);
}

/**
 * Look up verification results for a contract ID via the verifier's
 * by-contract endpoint.
 *
 * Note: current soroverify-verifier deployments do not expose this route yet
 * (they answer 404), so against those deployments this throws
 * SoroverifyApiError with status 404. Consumers that only have a contract ID
 * should prefer resolveContract() from resolve.ts, which resolves the wasm
 * hash via Soroban RPC and then calls getVerifications().
 */
export async function getVerificationsByContract(
  apiBaseUrl: string,
  contractId: string,
  options: GetVerificationsOptions = {},
): Promise<VerificationResponse> {
  const base = normalizeBaseUrl(apiBaseUrl);
  const url = `${base}/verifications/by-contract/${encodeURIComponent(contractId)}`;
  const body = await requestJson(url, options);
  return assertVerificationResponse(body, url);
}
