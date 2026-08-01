# Security

## Reporting a vulnerability

There is **no dedicated security contact set up for this project yet**. Until
one exists, use the placeholder below — do not assume it is a real address:

    [SECURITY CONTACT EMAIL]

Please distinguish between two categories of report:

1. **Trust model feedback.** The widget renders exactly what the verifier API
   reports and never independently re-verifies a signature or re-runs a
   rebuild itself; the SDK does not check the wasm hash against the chain on
   its own. That is the intended division of labor between this repo and
   soroverify-verifier, not a security bug. Please file it as a public GitHub
   Issue or Discussion.
2. **Genuine security vulnerabilities.** If you found a way to get the widget
   to render unescaped HTML or execute script from a verifier ID, status,
   repo/commit string, or source URL, or found a case where the SDK accepts a
   malformed or malicious API response as if it were valid instead of
   throwing, report it privately via the GitHub Security Advisories tab
   (https://github.com/soroverify/soroverify-consume/security/advisories/new)
   rather than a public issue.

Until a contact email is published, report through GitHub's private
vulnerability reporting on this repository (Security tab, Report a
vulnerability) so it reaches the maintainers without being public. Do not open
a public issue for an actively exploitable vulnerability.

## Scope

The parts of this repo that handle untrusted input are:

- **@soroverify/sdk** processes responses from soroverify-verifier API
  deployments. The verifier is a third party as far as a consumer is
  concerned: the SDK validates the response envelope shape and throws on any
  unexpected status or malformed body instead of trusting it.
- **@soroverify/widget** renders dynamic values (verifier IDs, statuses,
  repo/commit strings, source URLs) into its detail panel. Every dynamic value
  is HTML-escaped before insertion. Two escaping gaps were caught in code
  review and fixed before they shipped; this is treated as a standing
  requirement, not a one-off fix.

## Audit status

Neither this repository nor soroverify-verifier has yet had a third-party
security audit. Per the RFP's Milestone 5, this is the honest current status.
Until an audit is performed, treat both codebases as pre-audit and apply the
usual review discipline before depending on them in security-sensitive
contexts.
