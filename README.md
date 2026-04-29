# Imagina Signatures

Visual email signature editor for WordPress. A modern editor that lives inside an isolated `<iframe>` in `wp-admin`, built with React 18, dnd-kit, and Tiptap. Each WordPress user sees only their own signatures. Storage is pluggable: native Media Library or any S3-compatible bucket (R2, Bunny, Spaces, B2, S3, Wasabi, MinIO).

> **Status:** in early development. Sprint 1 (foundation) is in progress on `claude/wp-plugin-setup-sprint1-CsBP4`. The editor itself ships in Sprints 4–11. See [`CLAUDE.md`](CLAUDE.md) §28 for the full roadmap.

## Highlights

- **Isolated editor.** A real `<iframe>` rendered from our own REST endpoint — zero leakage from `wp-admin` jQuery / CSS into the editor app.
- **Email-safe output.** WYSIWYG canvas renders the same `<table>` + inline-style HTML the compiler emits. What you see is what you send.
- **No CDNs at runtime.** Everything is bundled. After install the plugin only talks to the storage you configured.
- **WordPress-native auth.** Users, capabilities, nonces, and REST cookies — no custom login, no licensing, no custom roles.
- **Hostable anywhere.** PHP 7.4+, MySQL 5.7+, no `exec`, no Node on the server.

## Stack

| Layer    | Tech                                                           |
| -------- | -------------------------------------------------------------- |
| Backend  | PHP 7.4+ (target 8.0–8.3), WordPress 6.0+                       |
| Frontend | React 18 + TypeScript 5 strict, Vite 5, Tailwind 3              |
| Editor   | dnd-kit (drag-and-drop), Tiptap (text), Zustand (+ immer)       |
| Storage  | Native Media Library or S3-compatible (custom SigV4, no SDK)    |
| Tests    | PHPUnit 9 + Brain Monkey, Vitest + Testing Library              |

Full architecture, schema, and conventions live in [`CLAUDE.md`](CLAUDE.md).

## Repository layout

```
imagina-signatures.php   Plugin entry (header, constants, bootstrap)
uninstall.php            WP uninstall hook (delegates to Uninstaller)
src/                     PHP source (PSR-4 — ImaginaSignatures\ → src/)
assets/editor/           React 18 iframe editor (TS, Tailwind)
assets/admin/            WP admin views (settings, dashboard)
build/                   Compiled JS/CSS — committed, ships in the ZIP
templates/               Pre-built signature templates (JSON)
languages/               .po / .mo / .pot
tests/php/               PHPUnit tests
tests/js/                Vitest tests
docs/                    Static HTML user docs
```

See [`CLAUDE.md`](CLAUDE.md) §4 for the full tree.

## Development

Requirements: PHP ≥ 7.4 with `openssl`/`mbstring`/`json`, Composer 2, Node ≥ 20, npm.

```bash
# Install dev dependencies
composer install
npm install

# Lint
composer run lint     # PHPCS / WPCS
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit

# Test
composer run test     # PHPUnit
npm test              # Vitest

# Build (bundles to /build, used by the plugin at runtime)
npm run build

# Watch the editor with HMR during development
npm run dev
```

CI (`.github/workflows/ci.yml`) runs lint + tests for PHP 7.4 / 8.0 / 8.1 / 8.2 / 8.3 and Node 20 on every PR.

## Documentation

- [`CLAUDE.md`](CLAUDE.md) — canonical project document. Architecture, conventions, schema, security model, roadmap. Read this first.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — branching, commits, PR process.

## License

GPL v2 or later. See `LICENSE` (added before first public release).
