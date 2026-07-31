// @vitest-environment happy-dom
/**
 * Rendering tests for <soroverify-badge>.
 *
 * The badge talks to the SDK's resolveContract(), which performs one fetch.
 * These tests stub the global fetch (never an RPC client) and assert on the
 * shadow-DOM classes and text, covering all four render states, honest
 * degradation, the unresolvable-contract wording, and the click-to-expand
 * panel.
 *
 * Note: the SDK is imported through its published entry (@soroverify/sdk ->
 * dist), so run the workspace build before these tests.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SignedVerificationRecord, VerificationResponse } from '@soroverify/sdk';
import { SOROVERIFY_BADGE_TAG, SoroverifyBadgeElement } from './element.js';

const API = 'http://verifier.test';
const CONTRACT = 'CCJZ5DGASBWQXR5MPFCJXMBI333XE5U3FSJTNQU7RIKE3P5GN2K2WYD5';

function record(
  status: 'verified' | 'mismatch' | 'inconclusive',
  verifierId: string,
  daysAgo: number,
): SignedVerificationRecord {
  return {
    wasm_hash: 'a'.repeat(64),
    source_repo: 'https://github.com/example/contract.git',
    source_rev: 'main',
    status,
    build_meta: null,
    verifier_id: verifierId,
    public_key: 'base64-key',
    timestamp: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
    signature: 'base64-signature',
    tarball_sha256: null,
  };
}

function envelope(
  results: SignedVerificationRecord[],
  status: VerificationResponse['status'] = 'verified',
): VerificationResponse {
  return { wasmHash: 'a'.repeat(64), status, results, sources: [] };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function mountBadge(attrs: Record<string, string>): Promise<SoroverifyBadgeElement> {
  const el = document.createElement(SOROVERIFY_BADGE_TAG) as SoroverifyBadgeElement;
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  document.body.appendChild(el);
  await flush();
  await flush();
  return el;
}

function buttonOf(el: SoroverifyBadgeElement): HTMLButtonElement {
  const button = el.shadowRoot?.querySelector<HTMLButtonElement>('button.badge');
  if (button === null || button === undefined) {
    throw new Error('badge button missing');
  }
  return button;
}

function panelOf(el: SoroverifyBadgeElement): HTMLDivElement {
  const panel = el.shadowRoot?.querySelector<HTMLDivElement>('.panel');
  if (panel === null || panel === undefined) {
    throw new Error('badge panel missing');
  }
  return panel;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('soroverify-badge render states', () => {
  it('renders a fresh trusted verified result as green', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, envelope([record('verified', 'v1', 5)]))),
    );
    const el = await mountBadge({ 'contract-id': CONTRACT, 'api-base-url': API });
    const button = buttonOf(el);
    expect(button.classList.contains('state-verified')).toBe(true);
    expect(button.classList.contains('state-stale')).toBe(false);
    expect(button.classList.contains('state-mismatch')).toBe(false);
    expect(button.textContent).toMatch(/verified · 5 days ago/);
  });

  it('renders a stale verified result muted with an explicit age', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, envelope([record('verified', 'v1', 200)]))),
    );
    const el = await mountBadge({ 'contract-id': CONTRACT, 'api-base-url': API });
    const button = buttonOf(el);
    expect(button.classList.contains('state-stale')).toBe(true);
    expect(button.classList.contains('state-verified')).toBe(false);
    expect(button.textContent).toMatch(/verified · .*ago/);
  });

  it('renders a trusted mismatch unmistakably red, outranking agreeing verified results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, envelope([record('verified', 'v1', 5), record('mismatch', 'v2', 1)])),
      ),
    );
    const el = await mountBadge({ 'contract-id': CONTRACT, 'api-base-url': API });
    const button = buttonOf(el);
    expect(button.classList.contains('state-mismatch')).toBe(true);
    expect(button.classList.contains('state-verified')).toBe(false);
    // The panel carries a plain-language pre-sign warning.
    button.click();
    const panel = panelOf(el);
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toMatch(/do not sign/i);
  });

  it('renders unverified as neutral — never green or red', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, envelope([], 'unverified'))),
    );
    const el = await mountBadge({ 'contract-id': CONTRACT, 'api-base-url': API });
    const button = buttonOf(el);
    expect(button.classList.contains('state-neutral')).toBe(true);
    expect(button.classList.contains('state-verified')).toBe(false);
    expect(button.classList.contains('state-mismatch')).toBe(false);
    expect(button.textContent).toMatch(/unverified/);
  });

  it('renders disagreement among trusted verifiers as neutral', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, envelope([record('verified', 'v1', 5), record('inconclusive', 'v1', 2)])),
      ),
    );
    const el = await mountBadge({ 'contract-id': CONTRACT, 'api-base-url': API });
    const button = buttonOf(el);
    expect(button.classList.contains('state-neutral')).toBe(true);
    expect(button.classList.contains('state-verified')).toBe(false);
    expect(button.textContent).toMatch(/disagreement/);
  });

  it('honest degradation: a failed fetch never renders green or red', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const el = await mountBadge({ 'contract-id': CONTRACT, 'api-base-url': API });
    const button = buttonOf(el);
    expect(button.classList.contains('state-verified')).toBe(false);
    expect(button.classList.contains('state-mismatch')).toBe(false);
    expect(button.classList.contains('state-neutral')).toBe(true);
    expect(button.textContent).toMatch(/unavailable/i);
  });

  it('says plainly that the contract could not be resolved — never "unverified"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(502, { error: { code: 'rpc_error' } })),
    );
    const el = await mountBadge({ 'contract-id': CONTRACT, 'api-base-url': API });
    const button = buttonOf(el);
    expect(button.textContent).not.toMatch(/unverified/i);
    button.click();
    const panel = panelOf(el);
    expect(panel.textContent).toMatch(/could not be resolved/i);
  });

  it('renders a neutral error state when required attributes are missing', async () => {
    const el = document.createElement(SOROVERIFY_BADGE_TAG) as SoroverifyBadgeElement;
    document.body.appendChild(el);
    await flush();
    const button = buttonOf(el);
    expect(button.classList.contains('state-neutral')).toBe(true);
    expect(button.classList.contains('state-verified')).toBe(false);
    expect(button.textContent).toMatch(/not configured/i);
  });

  it('expands a detail panel on click with source repo, revision, verifier, and age; collapses again', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, envelope([record('verified', 'a1b2c3d4e5f60718', 5)])),
      ),
    );
    const el = await mountBadge({ 'contract-id': CONTRACT, 'api-base-url': API });
    const button = buttonOf(el);
    const panel = panelOf(el);
    expect(panel.hidden).toBe(true);
    button.click();
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain('https://github.com/example/contract.git');
    expect(panel.textContent).toContain('@ main');
    expect(panel.textContent).toContain('a1b2c3d4e5f60718');
    expect(panel.textContent).toMatch(/days ago/);
    button.click();
    expect(panel.hidden).toBe(true);
  });

  it('escapes malicious verifier-record values so markup cannot be injected into the panel', async () => {
    // The SDK validates the envelope shape but not individual record fields,
    // so the widget must escape everything it renders back into HTML — in
    // both the per-record rows and the pre-sign mismatch warning.
    const evil = { ...record('inconclusive', 'v2', 1) } as SignedVerificationRecord;
    Object.assign(evil, {
      status: '"><img src=x onerror=alert(1)>',
      source_repo: 'https://evil.example/<script>alert(1)</script>',
      verifier_id: '<b>v2</b>',
    });
    const evilMismatch = { ...record('mismatch', 'v3', 1) } as SignedVerificationRecord;
    Object.assign(evilMismatch, {
      source_repo: 'https://evil.example/<img src=x onerror=alert(2)>',
      source_rev: '<script>alert(3)</script>',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, envelope([record('verified', 'v1', 5), evil, evilMismatch])),
      ),
    );
    const el = await mountBadge({ 'contract-id': CONTRACT, 'api-base-url': API });
    const button = buttonOf(el);
    // A trusted mismatch is present, so the badge is red and the warning
    // block renders — both surfaces must be injection-safe.
    expect(button.classList.contains('state-mismatch')).toBe(true);
    button.click();
    const panel = panelOf(el);
    // Hostile values arrive as text, never as live markup.
    expect(panel.querySelector('img')).toBeNull();
    expect(panel.querySelector('script')).toBeNull();
    expect(panel.querySelector('b')).toBeNull();
    expect(panel.textContent).toContain('<b>v2</b>');
    expect(panel.textContent).toContain('<script>alert(1)</script>');
    expect(panel.textContent).toContain('<img src=x onerror=alert(2)>');
  });

  it('keeps a mismatch outside the trusted set out of the verdict but surfaces it in the panel', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          200,
          envelope([record('verified', 'v1', 5), record('mismatch', 'untrusted', 1)]),
        ),
      ),
    );
    const el = await mountBadge({
      'contract-id': CONTRACT,
      'api-base-url': API,
      'trusted-verifiers': 'v1',
    });
    const button = buttonOf(el);
    expect(button.classList.contains('state-verified')).toBe(true);
    expect(button.classList.contains('state-mismatch')).toBe(false);
    // ...but the mismatch is surfaced in the panel, never hidden.
    button.click();
    const panel = panelOf(el);
    expect(panel.textContent).toMatch(/do not sign/i);
  });
});
