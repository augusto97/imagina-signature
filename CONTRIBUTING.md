# Contributing

Thanks for your interest in Imagina Signatures. This document covers the workflow for sending changes; the architectural and stylistic conventions live in [`CLAUDE.md`](CLAUDE.md), which is the source of truth.

If something here conflicts with `CLAUDE.md`, `CLAUDE.md` wins — please open an issue or PR to fix this file.

## Setup

```bash
composer install
npm install
```

You'll need PHP ≥ 7.4 (with `openssl`, `mbstring`, `json`), Composer 2, and Node ≥ 20.

## Branching

We follow a lightweight Git Flow (CLAUDE.md §25.1):

- `main` — production. Releases are tagged here.
- `develop` — integration. PRs merge here first.
- `feature/<short-slug>` — new functionality.
- `fix/<short-slug>` — bug fixes.
- `release/<x.y.z>` — release prep.

Open PRs against `develop` unless you're shipping a hotfix.

## Commits — Conventional Commits

CLAUDE.md §25.2. Format:

```
<type>(<scope>): <subject>

<optional body>

<optional footer>
```

Types we use:

| Type        | When                                   |
| ----------- | -------------------------------------- |
| `feat`      | New user-visible functionality          |
| `fix`       | Bug fix                                |
| `refactor`  | Internal change, no behaviour delta    |
| `chore`     | Tooling / repo maintenance             |
| `docs`      | Documentation only                     |
| `test`      | Tests only                             |
| `ci`        | CI / pipeline config                   |
| `perf`      | Performance improvement                |

Examples:

```
feat(editor): add social icons block
fix(storage): handle s3 connection timeout
refactor(compiler): extract table-builder
docs(api): document signatures endpoints
```

One commit = one logical change. Keep the subject line under ~72 chars; put detail in the body.

## Versioning

Strict semver (CLAUDE.md §25.3):

- **Major** — breaking changes (DB schema, REST API, hook signatures).
- **Minor** — new features.
- **Patch** — bug fixes.

When a PR changes the schema, bump `imgsig_schema_version` and ship the migration in the same PR (CLAUDE.md §29 rule 5).

## PR checklist

Before requesting review, please confirm:

- [ ] Code follows the conventions in CLAUDE.md §5 (PHP) and §6 (TypeScript)
- [ ] `composer run lint` is clean
- [ ] `composer run test` passes
- [ ] `npm run lint` is clean
- [ ] `npm run typecheck` is clean
- [ ] `npm test` passes
- [ ] New / changed behaviour has tests
- [ ] User-visible strings go through `__()` / TS `__()` helper (CLAUDE.md §6.5)
- [ ] New REST endpoints have a `permission_callback` and ownership check
- [ ] New hooks are documented in `src/Hooks/Actions.php` or `Filters.php` and CLAUDE.md §26
- [ ] No new external runtime dependencies (no CDNs, no third-party HTTP calls in runtime)
- [ ] No usage of `eval`, `exec`, `shell_exec`, sessions, or similar (CLAUDE.md §2.4)

## Reporting bugs

Open an issue with:

- WordPress version, PHP version, browser
- Active plugins / theme
- Steps to reproduce
- Expected vs. actual behaviour
- Console output and `WP_DEBUG` log if relevant

Security issues: please email the maintainer privately rather than opening a public issue. (Address will be added to this file before the first public release.)

## Asking before improvising

If you find an ambiguity or conflict in `CLAUDE.md`, or you need to introduce a new pattern that isn't covered, **open an issue first**. CLAUDE.md §29 rule 10 applies to humans too.

## Forbidden by design

CLAUDE.md §29 rule 11 — please don't add any of the following without explicit confirmation from the maintainer:

- Plans, quotas, licensing, or external license verification
- Custom user roles
- jQuery, Backbone, GrapesJS, MJML browser, juice, or similar inside the iframe editor
- Sessions PHP nativas (`session_start()`)
- HTTP requests to domains other than the user's configured storage
- Modifications to WP core tables

Thanks for keeping the project boring and predictable.
