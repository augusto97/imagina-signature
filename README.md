# Imagina Signatures

Professional email signatures for WordPress with a drag-and-drop editor,
multi-user plans, and dual storage (Media Library or S3-compatible).

> Sprint 1 (Foundations) is the only sprint shipped at the moment. The plugin
> bootstraps cleanly, installs its database schema and capabilities, and is
> ready for subsequent sprints to plug in admin pages, the editor, the REST
> API, and the storage drivers. See `CLAUDE.md` for the full roadmap.

## Requirements

- WordPress 6.0+
- PHP 7.4+ (tested on 7.4, 8.0, 8.1, 8.2, 8.3)
- MySQL 5.7+ / MariaDB 10.3+

## Status (post-Sprint 1)

| Subsystem | Status |
|-----------|--------|
| Plugin bootstrap | ready |
| PSR-4 autoloader (no Composer at runtime) | ready |
| DI container | ready |
| Activator / Deactivator / Uninstaller | ready |
| Versioned schema migrator | ready (`signatures`, `templates`) |
| Roles & capabilities | ready |
| Tooling: phpcs, phpunit, eslint, prettier, vitest, vite, ts | ready |
| CI: lint + test on PHP 7.4–8.3 and Node 20 | ready |
| Admin pages, REST API, editor, storage drivers | upcoming sprints |

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
