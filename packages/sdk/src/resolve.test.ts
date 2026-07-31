/**
 * Tests for resolveContract()'s server-side resolution path.
 *
 * resolveContract delegates the contract -> wasm resolution to the verifier's
 * GET /verifications/by-contract/:contractId endpoint and parses the returned
 * envelope, exactly like client.ts. These tests use a mocked global fetch (not
 * a mocked RPC client) to pin down the URL, the parsing, and the error mapping
 * for the response cases the live server returns: 200 envelope, 400
 * validation_failed, 404 not deployed, 502 rpc_error, and network failure.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SoroverifyApiError, type VerificationResponse } from './client.js';
import { resolveContract } from './resolve.js';

const API = 'http://localhost:8080';
const CONTRACT = 'CCJZ5DGASBWQXR5MPFCJXMBI333XE5U3FSJTNQU7RIKE3P5GN2K2WYD5';
const WASM_HASH = 'a'.repeat(64);

const ENVELOPE: VerificationResponse = {
  wasmHash: WASM_HASH,
  status: 'unverified',
  results: [],
  sources: [],
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveContract', () => {
  it('calls the verifier by-contract endpoint with the given base URL and contract ID', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, ENVELOPE));
    vi.stubGlobal('fetch', fetchMock);

    await resolveContract(API, CONTRACT);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe(`${API}/verifications/by-contract/${CONTRACT}`);
    expect((init?.headers as Record<string, string>)['accept']).toBe('application/json');
  });

  it('returns the parsed envelope from a successful response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, ENVELOPE)));
    await expect(resolveContract(API, CONTRACT)).resolves.toEqual(ENVELOPE);
  });

  it('maps a 400 validation_failed response to SoroverifyApiError with status 400', async () => {
    const body = {
      error: {
        code: 'validation_failed',
        message: 'contractId must be a valid C-address (StrKey contract id)',
      },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(400, body)));
    const failure = resolveContract(API, CONTRACT);
    await expect(failure).rejects.toBeInstanceOf(SoroverifyApiError);
    await expect(failure).rejects.toMatchObject({ status: 400 });
  });

  it('maps a 404 (well-formed but not deployed) response to SoroverifyApiError with status 404', async () => {
    const body = { error: { code: 'not_found', message: 'contract is not deployed on the network' } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(404, body)));
    const failure = resolveContract(API, CONTRACT);
    await expect(failure).rejects.toBeInstanceOf(SoroverifyApiError);
    await expect(failure).rejects.toMatchObject({ status: 404 });
  });

  it('maps a 502 rpc_error response to SoroverifyApiError with status 502', async () => {
    const body = { error: { code: 'rpc_error', message: 'could not resolve contract via Soroban RPC' } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(502, body)));
    const failure = resolveContract(API, CONTRACT);
    await expect(failure).rejects.toBeInstanceOf(SoroverifyApiError);
    await expect(failure).rejects.toMatchObject({ status: 502 });
  });

  it('rejects with SoroverifyApiError status 0 on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const failure = resolveContract(API, CONTRACT);
    await expect(failure).rejects.toBeInstanceOf(SoroverifyApiError);
    await expect(failure).rejects.toMatchObject({ status: 0 });
  });
});
