'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { SOROVERIFY_API_URL } from '../lib/config';

/**
 * Landing page: paste a contract ID and jump to the contract detail page.
 * This is what makes the example demoable without a hardcoded URL.
 */
export default function HomePage() {
  const router = useRouter();
  const [contractId, setContractId] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = contractId.trim();
    if (id.length === 0) {
      return;
    }
    router.push(`/contract/${encodeURIComponent(id)}`);
  }

  return (
    <main>
      <h1>Soroverify reference integration</h1>
      <p>
        This page stands in for a Stellar-Lab-style contract detail page. Paste
        a contract ID and the next page will embed the{' '}
        <code>&lt;soroverify-badge&gt;</code> widget, which looks up signed
        verification results from a live soroverify-verifier deployment —
        exactly how a block explorer or Stellar Lab would integrate it.
      </p>

      <form onSubmit={submit}>
        <label htmlFor="contract-id">Contract ID (C…)</label>
        <input
          id="contract-id"
          type="text"
          value={contractId}
          onChange={(event) => setContractId(event.target.value)}
          placeholder="C…"
          spellCheck={false}
          autoComplete="off"
        />
        <button type="submit">Open contract page</button>
      </form>

      <p className="muted" style={{ marginTop: 24 }}>
        Verifier: <code>{SOROVERIFY_API_URL}</code> (override with{' '}
        <code>NEXT_PUBLIC_SOROVERIFY_API_URL</code>).
      </p>
    </main>
  );
}
