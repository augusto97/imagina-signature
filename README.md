# Imagina Signatures

Professional email signatures for WordPress with a drag-and-drop editor,
multi-user plans, and dual storage (Media Library or S3-compatible).

> Sprints 1–10 are now in: bootstrap, schema, roles, encryption, storage
> drivers (Media Library + S3 SigV4), full data layer, REST API, JSON→MJML
> compilation pipeline, 10 bundled templates, multi-client preview
> emulators, UI polish primitives, i18n script, build/release scripts, and
> a static documentation site. The GrapesJS editor UI is scaffolded; the
> visual block UI lands in a follow-up release. See `CLAUDE.md` for the
> full roadmap.

## Requirements

- WordPress 6.0+
- PHP 7.4+ (tested on 7.4, 8.0, 8.1, 8.2, 8.3)
- MySQL 5.7+ / MariaDB 10.3+

## Status (Sprints 1–10)

| Subsystem | Status |
|-----------|--------|
| Plugin bootstrap | ready |
| PSR-4 autoloader (no Composer at runtime) | ready |
| DI container + ServiceProvider | ready |
| Activator / Deactivator / Uninstaller | ready |
| Versioned schema migrator | ready (1.0.0, 1.1.0) |
| Roles & capabilities + UserHardening | ready |
| Encryption (AES-256-CBC, AUTH_KEY-derived) | ready |
| Storage drivers: Media Library + S3 SigV4 | ready |
| Models + Repositories + Services | ready |
| Quota enforcer + DefaultPlansSeeder | ready |
| REST API (signatures, templates, assets, upload, plans, users, storage, setup, me) | ready |
| Compilation pipeline (JSON → MJML → inlined HTML) | ready |
| 10 bundled templates + DefaultTemplatesSeeder | ready |
| Multi-client preview emulators (Gmail/Outlook/Apple Mail) | ready |
| UI polish (toasts, empty/loading states, error boundary) | ready |
| Integration skeletons (PMP, WC Memberships, MemberPress) | ready |
| Tooling: phpcs, phpunit, eslint, prettier, vitest, vite, ts | ready |
| CI: lint + test on PHP 7.4–8.3 and Node 20 | ready |
| Build / release / version / pot scripts | ready |
| Static docs site under `docs/` | ready |
| GrapesJS visual editor UI | scaffolded — full UI in follow-up release |

## Local development

### PHP

```bash
composer install
composer run lint
composer run test
```

### JavaScript / TypeScript

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run build   # outputs /build (committed for distribution)
```

## Layout

The repository follows the structure documented in `CLAUDE.md` §2. A few
highlights:

- `imagina-signatures.php` — plugin main file (WordPress header + bootstrap).
- `uninstall.php` — delegates to `ImaginaSignatures\Core\Uninstaller`.
- `src/` — PSR-4 source under the `ImaginaSignatures\` namespace.
- `assets/` — TypeScript / Preact source for the editor and admin views.
- `build/` — Vite output, committed so the distributed ZIP doesn't need Node.
- `tests/php`, `tests/js` — unit / integration suites.
- `.github/workflows/ci.yml` — lint + test matrix.

## Contributing

Read `CLAUDE.md` for the full design specification, then `CONTRIBUTING.md` for
the workflow.

## License

GPL v2 or later. See `LICENSE`.
