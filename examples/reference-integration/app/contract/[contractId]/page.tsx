'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import '@soroverify/widget';
import { SoroverifyBadge } from '@soroverify/widget/react';
import { SOROVERIFY_API_URL } from '../../../lib/config';

/**
 * Contract detail page — the minimal furniture of a Stellar-Lab-style page,
 * with the verification badge placed where a real explorer would put it:
 * next to the contract ID, near the top.
 *
 * The badge is the real @soroverify/widget custom element (registered by the
 * `@soroverify/widget` import above; the React wrapper renders it). All
 * lookup, trust resolution, and honest-degradation behavior live in the
 * widget — nothing here reimplements any of it.
 */
export default function ContractPage() {
  // useParams already returns the URL-decoded segment value.
  const params = useParams<{ contractId: string }>();
  const contractId = params.contractId;

  return (
    <main>
      <p className="muted">
        <Link href="/">← Back to lookup</Link>
      </p>
      <h1>Contract detail</h1>
      <div className="contract-head">
        <code>{contractId}</code>
        <SoroverifyBadge contractId={contractId} apiBaseUrl={SOROVERIFY_API_URL} />
      </div>

      <p className="muted">
        Placeholder for whatever else a contract page shows — balance, metadata,
        operations. The point of this example is the badge above: it queries the
        live verifier cross-origin from the browser and renders one of{' '}
        <em>verified</em>, <em>mismatch</em>, or a neutral state, and never
        fabricates a result.
      </p>
    </main>
  );
}
