# Security policy

## Reporting a vulnerability

Please report security issues privately. Do not open a public issue.

- Preferred: [report a vulnerability](https://github.com/rolling7ho/benchmark-registry/security/advisories/new)
  through GitHub's private vulnerability reporting.
- Or email support@benchmarkregistry.org with "Security" in the subject.

Include the affected URL or file, steps to reproduce, and the impact you
expect. We will acknowledge the report, keep you updated while we look into
it, and credit you when the fix is published unless you ask us not to.

## Supported versions

Only the live site at [benchmarkregistry.org](https://benchmarkregistry.org)
and the `main` branch are supported. Fixes are not backported.

## Scope

The public site is static files served by Cloudflare. It has no accounts,
logins, forms or write endpoints, and it does not run server code per request.
Registry data is written only by maintainers through the ingestor.

In scope:

- the site and its static data files (for example cross-site scripting,
  content injection, or bypassing the Content-Security-Policy),
- this repository's code, build scripts and CI workflow,
- anything that could let someone change published Registry data without
  going through the ingestor.

Out of scope:

- `staging.benchmarkregistry.org`, which is private and access-controlled,
- denial of service or volume testing,
- missing security headers that have no demonstrated impact,
- issues in Cloudflare or GitHub themselves (report those to the vendor),
- wrong benchmark data; open a correction issue instead (see
  [CONTRIBUTING.md](CONTRIBUTING.md)).

Please do not access data that isn't yours, degrade the service, or test
against the staging site.
