/**
 * Thin React wrapper over <soroverify-badge>.
 *
 * This is a pure pass-through: it renders the custom element and maps props
 * to its attributes. There is no rendering logic here, so the element and the
 * wrapper can never drift apart — all state, styling, and behavior live in
 * element.ts.
 *
 * Importing this module registers the custom element (via element.ts), which
 * React then mounts as a regular host element.
 */
import * as React from 'react';

export interface SoroverifyBadgeProps {
  /** Contract ID ("C...") to look up. */
  contractId: string;
  /** Base URL of a soroverify-verifier deployment (SOROVERIFY_API_URL). */
  apiBaseUrl: string;
  /** Optional verifier IDs to trust; records from other verifiers are surfaced but not counted. */
  trustedVerifiers?: readonly string[];
  className?: string;
  style?: React.CSSProperties;
}

type BadgeAttributes = React.DetailedHTMLProps<
  React.HTMLAttributes<HTMLElement>,
  HTMLElement
> & {
  'contract-id'?: string;
  'api-base-url'?: string;
  'trusted-verifiers'?: string;
};

/** Render the <soroverify-badge> element with props mapped to attributes. */
export function SoroverifyBadge(props: SoroverifyBadgeProps): React.ReactElement {
  const { contractId, apiBaseUrl, trustedVerifiers, ...rest } = props;
  const attrs: BadgeAttributes = {
    'contract-id': contractId,
    'api-base-url': apiBaseUrl,
    ...rest,
  };
  if (trustedVerifiers !== undefined && trustedVerifiers.length > 0) {
    attrs['trusted-verifiers'] = trustedVerifiers.join(',');
  }
  return React.createElement('soroverify-badge', attrs);
}
