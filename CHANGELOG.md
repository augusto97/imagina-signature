# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-04-29

### Fixed
- **Vite ESM bundles** are now enqueued with `type="module"` via the
  `script_loader_tag` filter. Without this, the browser raised
  `Uncaught SyntaxError: Cannot use import statement outside a module`
  on the editor and admin pages, leaving wp-admin blank.
- **DI container key mismatch** in `ServiceProvider`: bindings were
  registered with leading-backslash strings while consumers used
  `::class` constants. Resolution failed silently and any REST request
  ended in a PHP fatal ("There has been a critical error on this
  website" / HTTP 500). All bindings now use `::class` keys.
- **REST endpoints** accept `manage_options` as a fallback capability
  so site administrators always pass authentication, even on installs
  where activation didn't fully populate the `imgsig_*` capabilities.
- **Setup wizard** is registered as a visible (highlighted) submenu
  while incomplete instead of a hidden page only reachable by URL.
  Auto-redirect on first admin load after activation; the dashboard
  SPA also redirects when setup hasn't been completed.
- **Setup-required notice** rendered as a prominent banner with a
  primary "Run the setup wizard" button (was an inline anchor that
  was easy to miss).

### Added
- **Robust REST registration**: each controller is constructed inside
  its own try/catch in `RestRouter`, so a single failure no longer
  brings down the entire REST surface. The `SetupController` is
  registered first and has zero dependencies, ensuring users can
  always finish setup.
- **`/wp-json/imgsig/v1/health`** diagnostic endpoint, dependency-free,
  returns the running version, schema version, PHP version, and a
  current timestamp.
- **`admin-post.php` setup fallback**: the setup wizard renders an
  HTML-only form alongside the SPA. If the SPA can't load (bundle
  missing) or if REST is blocked by a security plugin, the fallback
  form posts to `admin-post.php?action=imgsig_setup_save` and still
  completes setup.
- **Boot-phase isolation**: every step inside `Plugin::boot()` is
  wrapped in `safe()` so a single broken phase logs to PHP error log
  and degrades gracefully instead of cascading into a white screen.
- **`maybe_run_upgrade()`** re-asserts roles and seeds default plans
  on every version change, so upgrades self-heal capability and plan
  data without requiring a manual reactivation.
- **Silenced** the "Could not load your account info." toast — the
  SPA now degrades silently when `/me` is unavailable.
- **Verbose error reporting** in the setup wizard: surface the real
  REST error message (e.g. `rest_forbidden (HTTP 403)`) instead of
  swallowing it under a generic toast.

## [1.0.0] - 2026-04-29

### Added
- Plugin bootstrap, PSR-4 autoloader (no Composer at runtime), DI
  container, activator/deactivator/uninstaller lifecycle.
- Versioned schema migrator with the 1.0.0 (`signatures`, `templates`)
  and 1.1.0 (`assets`, `plans`, `user_plans`, `usage`, `logs`)
  migrations.
- Roles + capabilities install, default plans seeder, default
  templates seeder.
- AES-256-CBC encryption helper (key derived from `AUTH_KEY` with
  random fallback).
- Storage drivers: Media Library + S3 (custom SigV4 signer, no SDK)
  with provider presets for Cloudflare R2, Bunny, Amazon S3, Backblaze
  B2, DigitalOcean Spaces, Wasabi, MinIO, custom.
- Models, repositories, services (SignatureService, TemplateService,
  PlanService, QuotaEnforcer, JsonSchemaValidator, HtmlSanitizer,
  RateLimiter, Logger).
- REST API namespace `imgsig/v1` with controllers for signatures,
  templates, assets, upload, plans, users, storage, setup, me.
- Block-based visual editor (Preact + Tailwind, prefix `is-`):
  9 block types (text, text_stack, image, divider, spacer,
  social_icons, contact_row, button_cta, disclaimer), live preview
  with Gmail/Outlook/Apple Mail emulators, autosave, copy/export HTML.
- 10 bundled signature templates (corporate-classic, minimal-modern,
  sales-active, medical, legal, creative, developer, tech-startup,
  consultant, e-commerce).
- Admin UIs: dashboard with search/filter/duplicate/archive/delete,
  setup wizard, plans CRUD, users CRUD, storage settings with
  per-provider forms and connection test.
- Build pipeline (Vite + Preact + Tailwind), CI workflows
  (PHP 7.4-8.3 matrix + Node 20), build/release scripts, static docs
  site, language POT.
