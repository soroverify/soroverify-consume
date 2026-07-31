/**
 * <soroverify-badge> — a framework-agnostic source-verification badge.
 *
 * Usage (works in plain HTML with no build step):
 *
 *   <script type="module" src=".../element.js"></script>
 *   <soroverify-badge
 *     contract-id="C..."
 *     api-base-url="https://verifier.example"
 *     trusted-verifiers="id1,id2"   <!-- optional, comma-separated -->
 *   ></soroverify-badge>
 *
 * On mount it calls resolveContract() from @soroverify/sdk and reduces the
 * result through resolveTrust(). It renders exactly one of:
 *
 *   green  — "verified" from the trusted set; muted with an explicit age once
 *            older than STALENESS_THRESHOLD_MS (90 days)
 *   red    — any trusted verifier reports "mismatch"; never softened, and a
 *            single credible mismatch outranks any number of agreeing
 *            verified results
 *   grey   — unverified / inconclusive / disagreement / unknown, unreachable
 *            API, missing attributes, or loading
 *
 * Clicking toggles a detail panel: per-verifier status, source repo + commit,
 * timestamp/age, and — when any mismatch exists — a plain-language warning
 * suitable to show before a user signs a transaction. If the verifier could
 * not resolve the contract (400/404/502), the panel says so plainly and never
 * implies "unverified".
 *
 * Honest degradation is non-negotiable: a failed fetch, a timeout, or a
 * malformed contract ID renders neutral/unknown — never a fabricated
 * "verified".
 *
 * No framework lock-in: this module depends only on the SDK and runs
 * standalone in any browser.
 */
import {
  resolveContract,
  resolveTrust,
  SoroverifyApiError,
  type SignedVerificationRecord,
  type TrustSummary,
  type VerificationResponse,
} from '@soroverify/sdk';

/** Registered tag name. */
export const SOROVERIFY_BADGE_TAG = 'soroverify-badge';

/**
 * Staleness threshold for verified results: a verification older than 90 days
 * is rendered with muted green and an explicit age label, never with the same
 * visual weight as a fresh one.
 */
export const STALENESS_THRESHOLD_MS = 90 * 24 * 60 * 60 * 1000;

/** Per-lookup timeout; a hung verifier must degrade to neutral, not spin. */
const LOOKUP_TIMEOUT_MS = 8_000;

const ATTR_CONTRACT_ID = 'contract-id';
const ATTR_API_BASE_URL = 'api-base-url';
const ATTR_TRUSTED_VERIFIERS = 'trusted-verifiers';

const STYLES = `
  :host {
    display: inline-block;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    line-height: 1.4;
  }
  button.badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 11px;
    border-radius: 999px;
    border: 1px solid #d1d5db;
    background: #f9fafb;
    color: #6b7280;
    font: inherit;
    cursor: pointer;
    transition: box-shadow 0.15s ease, transform 0.05s ease;
  }
  button.badge:hover { box-shadow: 0 1px 5px rgb(0 0 0 / 0.18); }
  button.badge:active { transform: translateY(1px); }
  button.badge:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; flex: none; }
  .state-verified { color: #0a7d3c; border-color: #9fd3b2; background: #eefaf1; }
  .state-stale { color: #6f8f7a; border-color: #ccd8d0; background: #f4f8f5; }
  .state-mismatch { color: #b91c1c; border-color: #e6a3a3; background: #fdf1f1; font-weight: 600; }
  .state-neutral { color: #6b7280; border-color: #d1d5db; background: #f9fafb; }
  .panel {
    margin-top: 8px;
    max-width: 440px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    padding: 10px 12px;
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.12);
    font-size: 12px;
    color: #374151;
  }
  .panel[hidden] { display: none; }
  .warn {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #991b1b;
    border-radius: 8px;
    padding: 8px 10px;
    margin-bottom: 8px;
  }
  .row { padding: 6px 0; border-bottom: 1px solid #f3f4f6; }
  .row:last-child { border-bottom: none; }
  .row-head { display: flex; align-items: center; gap: 6px; }
  .status {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    padding: 1px 7px;
    border-radius: 999px;
    flex: none;
  }
  .status.verified { background: #d1fae5; color: #065f46; }
  .status.mismatch { background: #fee2e2; color: #991b1b; }
  .status.inconclusive { background: #fef3c7; color: #92400e; }
  .verifier {
    color: #6b7280;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .age { margin-left: auto; color: #9ca3af; flex: none; }
  .repo { color: #374151; margin-top: 2px; word-break: break-all; }
  .empty { color: #6b7280; margin: 4px 0; }
  ul { margin: 4px 0; padding-left: 18px; }
  a { color: #2563eb; }
`;

const TEMPLATE = `<style>${STYLES}</style>
<button class="badge state-neutral" type="button" aria-expanded="false" aria-live="polite">
  <span class="dot" aria-hidden="true"></span><span class="label"></span>
</button>
<div class="panel" hidden></div>`;

type RenderState =
  | { phase: 'loading' }
  | { phase: 'config-error'; message: string }
  | { phase: 'lookup-error'; message: string }
  | { phase: 'ready'; summary: TrustSummary; response: VerificationResponse };

export class SoroverifyBadgeElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return [ATTR_CONTRACT_ID, ATTR_API_BASE_URL, ATTR_TRUSTED_VERIFIERS];
  }

  private readonly root: ShadowRoot;
  private readonly button: HTMLButtonElement;
  private readonly panel: HTMLDivElement;
  private readonly label: HTMLElement;
  private state: RenderState = { phase: 'loading' };
  private expanded = false;
  private lookupToken = 0;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    this.root.innerHTML = TEMPLATE;
    const button = this.root.querySelector<HTMLButtonElement>('button.badge');
    const panel = this.root.querySelector<HTMLDivElement>('.panel');
    const label = this.root.querySelector<HTMLElement>('.label');
    if (button === null || panel === null || label === null) {
      throw new Error('soroverify-badge internal template is broken');
    }
    this.button = button;
    this.panel = panel;
    this.label = label;
    this.button.addEventListener('click', () => {
      this.expanded = !this.expanded;
      this.render();
    });
    this.render();
  }

  connectedCallback(): void {
    this.lookupToken += 1;
    this.runLookup();
  }

  attributeChangedCallback(): void {
    if (this.isConnected) {
      this.lookupToken += 1;
      this.runLookup();
    }
  }

  private runLookup(): void {
    const token = ++this.lookupToken;
    const contractId = this.getAttribute(ATTR_CONTRACT_ID) ?? '';
    const apiBaseUrl = this.getAttribute(ATTR_API_BASE_URL) ?? '';
    const trustedVerifiers = parseTrustedVerifiers(this.getAttribute(ATTR_TRUSTED_VERIFIERS));

    if (contractId.trim() === '' || apiBaseUrl.trim() === '') {
      this.state = {
        phase: 'config-error',
        message: 'This badge needs both a contract-id and an api-base-url attribute.',
      };
      this.render();
      return;
    }

    this.state = { phase: 'loading' };
    this.render();

    void resolveContract(apiBaseUrl, contractId, { timeoutMs: LOOKUP_TIMEOUT_MS })
      .then((response) => {
        if (token !== this.lookupToken) {
          return;
        }
        const summary = resolveTrust(response.results, trustedVerifiers, {
          stalenessThresholdMs: STALENESS_THRESHOLD_MS,
        });
        this.state = { phase: 'ready', summary, response };
        this.render();
      })
      .catch((err: unknown) => {
        if (token !== this.lookupToken) {
          return;
        }
        this.state = { phase: 'lookup-error', message: describeLookupError(err) };
        this.render();
      });
  }

  private render(): void {
    const { stateClass, labelText } = this.describe();
    this.button.classList.remove(
      'state-verified',
      'state-stale',
      'state-mismatch',
      'state-neutral',
    );
    this.button.classList.add(stateClass);
    this.label.textContent = labelText;
    this.button.setAttribute('aria-expanded', String(this.expanded));
    this.panel.hidden = !this.expanded;
    if (this.expanded) {
      this.panel.innerHTML = this.renderPanel();
    }
  }

  private describe(): { stateClass: string; labelText: string } {
    switch (this.state.phase) {
      case 'loading':
        return { stateClass: 'state-neutral', labelText: 'checking…' };
      case 'config-error':
        return { stateClass: 'state-neutral', labelText: 'badge not configured' };
      case 'lookup-error':
        return { stateClass: 'state-neutral', labelText: 'verification unavailable' };
      case 'ready':
        return describeReady(this.state.summary);
    }
  }

  private renderPanel(): string {
    switch (this.state.phase) {
      case 'loading':
        return '<p class="empty">Checking verification status…</p>';
      case 'config-error':
        return `<p>${escapeHtml(this.state.message)}</p><p class="empty">The badge stays neutral until both attributes are set.</p>`;
      case 'lookup-error':
        return `<p>${escapeHtml(this.state.message)}</p><p class="empty">No verification status could be determined — this is not the same as “unverified”.</p>`;
      case 'ready':
        return this.renderReadyPanel(this.state.summary, this.state.response);
    }
  }

  private renderReadyPanel(summary: TrustSummary, response: VerificationResponse): string {
    const rows = response.results.map(renderRecordRow).join('');
    const warning = summary.hasMismatch ? renderMismatchWarning(summary.mismatchRecords) : '';
    const apiBaseUrl = this.getAttribute(ATTR_API_BASE_URL) ?? '';
    const sources = response.sources
      .map((source) => {
        const url = joinUrl(apiBaseUrl, source.url);
        return `<li><a href="${escapeHtml(url)}">source archive (sha256 ${escapeHtml(source.sha256.slice(0, 12))}…)</a></li>`;
      })
      .join('');
    return `
      ${warning}
      ${rows.length > 0 ? rows : '<p class="empty">No verification results have been published for this contract.</p>'}
      ${sources.length > 0 ? `<p class="empty">Stored source archives:</p><ul>${sources}</ul>` : ''}
    `;
  }
}

/** Map a TrustSummary verdict to the badge's visual state and label. */
function describeReady(summary: TrustSummary): { stateClass: string; labelText: string } {
  switch (summary.verdict) {
    case 'mismatch':
      return { stateClass: 'state-mismatch', labelText: 'verification mismatch' };
    case 'verified': {
      const mostRecent = summary.mostRecentVerified;
      if (mostRecent === null) {
        return { stateClass: 'state-neutral', labelText: 'verified' };
      }
      const label = `verified · ${humanizeAge(mostRecent.ageMs)}`;
      return mostRecent.isStale
        ? { stateClass: 'state-stale', labelText: label }
        : { stateClass: 'state-verified', labelText: label };
    }
    case 'disagreement':
      return { stateClass: 'state-neutral', labelText: 'disagreement' };
    case 'inconclusive':
      return { stateClass: 'state-neutral', labelText: 'inconclusive' };
    case 'unverified':
      return { stateClass: 'state-neutral', labelText: 'unverified' };
    case 'unknown':
      return { stateClass: 'state-neutral', labelText: 'no trusted verification' };
  }
}

function renderRecordRow(record: SignedVerificationRecord): string {
  const age = humanizeAge(ageMsOf(record.timestamp));
  return `
    <div class="row">
      <div class="row-head">
        <span class="status ${escapeHtml(record.status)}">${escapeHtml(record.status)}</span>
        <span class="verifier" title="${escapeHtml(record.verifier_id)}">${escapeHtml(record.verifier_id)}</span>
        <span class="age">${escapeHtml(age)}</span>
      </div>
      <div class="repo">${escapeHtml(record.source_repo)} @ ${escapeHtml(record.source_rev)}</div>
    </div>`;
}

/** Plain-language pre-sign warning for any mismatch (trusted or not). */
function renderMismatchWarning(mismatchRecords: readonly SignedVerificationRecord[]): string {
  const first = mismatchRecords[0];
  const where =
    first === undefined
      ? ''
      : ` (${escapeHtml(first.source_repo)} @ ${escapeHtml(first.source_rev)})`;
  return `<div class="warn" role="alert"><strong>⚠ Mismatch reported</strong> — at least one verifier reports that the bytecode deployed on-chain does not match the published source${where}. Do not sign a transaction for this contract without first understanding why.</div>`;
}

function parseTrustedVerifiers(raw: string | null): string[] | undefined {
  if (raw === null || raw.trim() === '') {
    return undefined;
  }
  const ids = raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  return ids.length > 0 ? ids : undefined;
}

function describeLookupError(err: unknown): string {
  if (err instanceof SoroverifyApiError) {
    if (err.status === 400) {
      return 'The contract ID was rejected as invalid by the verifier.';
    }
    if (err.status === 404 || err.status === 502) {
      return 'The contract could not be resolved by the verifier.';
    }
    return 'Could not reach the verifier API.';
  }
  return 'Verification is temporarily unavailable.';
}

function ageMsOf(timestamp: string): number {
  const ms = Date.parse(timestamp);
  return Number.isNaN(ms) ? Number.NaN : Date.now() - ms;
}

function humanizeAge(ageMs: number): string {
  if (!Number.isFinite(ageMs) || ageMs < 0) {
    return 'age unknown';
  }
  const days = Math.floor(ageMs / 86_400_000);
  if (days < 1) {
    return 'today';
  }
  if (days < 30) {
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    return `${months} month${months === 1 ? '' : 's'} ago`;
  }
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

/** Escape dynamic values before embedding them in panel HTML. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function joinUrl(base: string, path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base.replace(/\/+$/, '')}${normalized}`;
}

// Register once; the guard keeps double-imports harmless.
if (
  typeof customElements !== 'undefined' &&
  customElements.get(SOROVERIFY_BADGE_TAG) === undefined
) {
  customElements.define(SOROVERIFY_BADGE_TAG, SoroverifyBadgeElement);
}
