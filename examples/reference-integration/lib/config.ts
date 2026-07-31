/**
 * Shared config for the reference integration.
 *
 * NEXT_PUBLIC_* variables are inlined by Next.js at build time. Defaulting to
 * the local verifier keeps the example runnable with zero configuration, and
 * matches the env table in the original RFP (NEXT_PUBLIC_SOROVERIFY_API_URL).
 */
export const SOROVERIFY_API_URL =
  process.env.NEXT_PUBLIC_SOROVERIFY_API_URL ?? 'http://localhost:8080';
