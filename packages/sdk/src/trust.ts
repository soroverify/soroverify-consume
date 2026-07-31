/**
 * Multi-verifier trust resolution.
 *
 * soroverify-verifier's GET /verifications/:wasmHash can return one signed
 * record per independent verifier, and those records can disagree. This module
 * reduces the array to a single display-ready summary:
 *
 * - A `mismatch` reported by a verifier inside the trusted set immediately
 *   yields verdict "mismatch". It is never averaged away or outvoted by
 *   agreeing `verified` reports — a single credible mismatch protects users.
 * - Mismatches from verifiers OUTSIDE the trusted set are never hidden: they
 *   are surfaced in `hasMismatch` / `mismatchRecords` so a caller can warn,
 *   but they do not by themselves override the trusted-set verdict.
 * - Otherwise the verdict reflects agreement/disagreement across the trusted
 *   set: all `verified` -> verified, all `inconclusive` -> inconclusive, a mix
 *   of verified and inconclusive -> disagreement, no records at all ->
 *   unverified, and records only from untrusted verifiers -> unknown.
 *
 * The most recent trusted `verified` result is reported with its age, and is
 * marked stale once it is older than a configurable threshold (default 90
 * days) so callers never present a months-old verification with the same
 * visual weight as a fresh one.
 */
import type { SignedVerificationRecord } from './client.js';

export type TrustVerdict =
  | 'verified'
  | 'mismatch'
  | 'disagreement'
  | 'inconclusive'
  | 'unverified'
  | 'unknown';

/** Default staleness threshold: 90 days. */
export const DEFAULT_STALENESS_THRESHOLD_MS = 90 * 24 * 60 * 60 * 1000;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface MostRecentVerified {
  record: SignedVerificationRecord;
  timestampMs: number;
  ageMs: number;
  ageDays: number;
  /** True when the verification is older than the staleness threshold. */
  isStale: boolean;
}

export interface ResolveTrustOptions {
  /** Age after which a verified result counts as stale. Default: 90 days. */
  stalenessThresholdMs?: number;
  /** Clock override for tests. Default: Date.now(). */
  nowMs?: number;
}

export interface TrustSummary {
  verdict: TrustVerdict;
  /** Total number of records passed in. */
  total: number;
  trustedCount: number;
  untrustedCount: number;
  trusted: SignedVerificationRecord[];
  untrusted: SignedVerificationRecord[];
  /** True when ANY record (trusted or not) reports mismatch. Always surfaced. */
  hasMismatch: boolean;
  mismatchRecords: SignedVerificationRecord[];
  mismatchInTrustedSet: boolean;
  /** Most recent verified result from the trusted set, with its age. */
  mostRecentVerified: MostRecentVerified | null;
  stalenessThresholdMs: number;
}

function parseTimestampMs(timestamp: string): number | null {
  const ms = Date.parse(timestamp);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Reduce an array of per-verifier signed records to a single display-ready
 * summary. Pass `trustedVerifierIds` to restrict which verifiers count toward
 * the verdict; records from other verifiers are still surfaced, never dropped.
 */
export function resolveTrust(
  records: readonly SignedVerificationRecord[],
  trustedVerifierIds: readonly string[] | undefined = undefined,
  options: ResolveTrustOptions = {},
): TrustSummary {
  const stalenessThresholdMs =
    options.stalenessThresholdMs ?? DEFAULT_STALENESS_THRESHOLD_MS;
  const nowMs = options.nowMs ?? Date.now();

  const trustedSet =
    trustedVerifierIds === undefined || trustedVerifierIds.length === 0
      ? null
      : new Set(trustedVerifierIds);
  const trusted =
    trustedSet === null ? [...records] : records.filter((r) => trustedSet.has(r.verifier_id));
  const untrusted = trustedSet === null ? [] : records.filter((r) => !trustedSet.has(r.verifier_id));

  const mismatchRecords = records.filter((r) => r.status === 'mismatch');
  const hasMismatch = mismatchRecords.length > 0;
  const mismatchInTrustedSet = trusted.some((r) => r.status === 'mismatch');

  let verdict: TrustVerdict;
  if (mismatchInTrustedSet) {
    verdict = 'mismatch';
  } else if (trusted.length === 0) {
    verdict = records.length === 0 ? 'unverified' : 'unknown';
  } else {
    const statuses = new Set(trusted.map((r) => r.status));
    const hasVerified = statuses.has('verified');
    const hasInconclusive = statuses.has('inconclusive');
    if (hasVerified && hasInconclusive) {
      verdict = 'disagreement';
    } else if (hasVerified) {
      verdict = 'verified';
    } else if (hasInconclusive) {
      verdict = 'inconclusive';
    } else {
      verdict = 'disagreement';
    }
  }

  let mostRecentVerified: MostRecentVerified | null = null;
  const verifiedRecords = trusted.filter((r) => r.status === 'verified');
  if (verifiedRecords.length > 0) {
    let best: SignedVerificationRecord | null = null;
    let bestMs = -1;
    for (const record of verifiedRecords) {
      const ms = parseTimestampMs(record.timestamp);
      if (ms !== null && ms > bestMs) {
        bestMs = ms;
        best = record;
      }
    }
    if (best !== null) {
      const ageMs = Math.max(0, nowMs - bestMs);
      mostRecentVerified = {
        record: best,
        timestampMs: bestMs,
        ageMs,
        ageDays: Math.floor(ageMs / MS_PER_DAY),
        isStale: ageMs > stalenessThresholdMs,
      };
    }
  }

  return {
    verdict,
    total: records.length,
    trustedCount: trusted.length,
    untrustedCount: untrusted.length,
    trusted,
    untrusted,
    hasMismatch,
    mismatchRecords,
    mismatchInTrustedSet,
    mostRecentVerified,
    stalenessThresholdMs,
  };
}
