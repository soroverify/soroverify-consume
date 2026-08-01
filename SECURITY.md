# Security

## Reporting a vulnerability

There is **no dedicated security contact set up for this project yet**. Until
one exists, use the placeholder below — do not assume it is a real address:

```
[SECURITY CONTACT EMAIL]
```

Until a contact is published, report vulnerabilities through GitHub's private
vulnerability reporting on this repository (Security tab → Report a
vulnerability) so they reach the maintainers without being public. Do not open
a public issue for an actively exploitable vulnerability.

## Scope

The parts of this repo that handle untrusted input are:

- **`@soroverify/sdk`** — processes responses from soroverify-verifier API
  deployments. The verifier is a third party as far as a consumer is
  concerned: the SDK validates the response envelope shape and throws on any
  unexpected status or malformed body instead of trusting it.
- **`@soroverify/widget`** — renders dynamic values (verifier IDs, statuses,
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
