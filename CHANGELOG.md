# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.3] - 2026-04-29

### Fixed
- **Browser-locking infinite loop** when dragging a block onto the
  canvas. The cycle was:
  1. GrapesJS fires `component:add` → bridge emits the new schema
     via `onChange`.
  2. Parent calls `setSchema(next)` → re-renders `<GrapesEditor>` with
     a new `schema` prop reference.
  3. The `useEffect([schema])` saw `schema !== baseSchemaRef.current`
     and called `setComponents(...)` to "reload".
  4. `setComponents` fires more `component:add` events → loop.

  Fixes:
  - Track the schema reference *we just emitted* in a `lastEmittedRef`.
    Skip the reload when the parent re-passes that exact reference.
  - Guard the bridge with a `loadingRef` flag so events fired during
    programmatic loads (`setComponents`) don't bubble back as edits.
  - Coalesce consecutive editor events (drag-and-drop fires dozens
    of `component:update` for trait edits) through a 60 ms debounce.
  - Remove the `component:styleUpdate` listener; style changes
    triggered by trait handlers also fire `component:update`, so the
    extra subscription only multiplied the spam.
  - Forward `onChange` through a ref so the bridge always calls the
    parent's current closure (avoids stale `name` values when the
    user renames the signature mid-edit).

  Net effect: dragging a block now fires exactly one `onChange`
  (debounced 60 ms after the drop), not thousands.

## [1.1.2] - 2026-04-29

### Fixed
- **`Cannot read properties of null (reading '__H')`** crash on the
  signatures dashboard. Zustand 4's React entrypoint imports
  `use-sync-external-store/shim/with-selector`, which is incompatible
  with Preact 10's hook scheduling. CLAUDE.md §1.2 still pins
  Zustand 4 — we now use `zustand/vanilla` (the framework-free store
  API; same package, same semantics) and ship a 30-line
  `useState` + `useEffect` selector hook on top so all call-sites
  (`useEditorStore((s) => s.x)`) keep working unchanged.
  Documented in `docs/adr/0003-zustand-preact-compat.md`.

## [1.1.1] - 2026-04-29

### Fixed
- **Lazy-loaded chunks 404'd** on every install. Vite emits the
  dynamic `import()` map with paths like `chunks/X.js` (no leading
  `./`); the browser then resolves them against the page URL
  (`/wp-admin/admin.php`) instead of the bundle URL, so the network
  panel showed `https://site/wp-admin/chunks/X.js — 404`. Vite is now
  configured with `base: './'` and `experimental.renderBuiltUrl =>
  { relative: true }`, which produces `./chunks/X.js` paths that
  resolve relative to the importing module.
- **`/wp-json/imgsig/v1me`** instead of `/wp-json/imgsig/v1/me`.
  `@wordpress/api-fetch`'s `createRootURLMiddleware` concatenates
  `apiUrl + path` literally; the localized `apiUrl` now ends with a
  trailing slash so `/me` becomes `…/imgsig/v1/me` correctly.

## [1.1.0] - 2026-04-29

### Changed
- **Editor rebuilt with GrapesJS** as CLAUDE.md §1.2 / §12 originally
  required. The prior 1.0.x click-to-add palette is removed completely.
  The new editor is a real drag-and-drop surface backed by
  `grapesjs-preset-newsletter`, with the 9 custom blocks (avatar,
  text-stack, social-row, contact-row, divider, spacer, button-cta,
  disclaimer, image-block) registered via `domComponents.addType` and
  surfaced in the Blocks panel. Selecting a block on the canvas opens
  its traits in the Properties panel; the Layers panel mirrors the
  component tree. Documented in `docs/adr/0001-editor-implementation.md`
  with explicit acceptance criteria.

### Added
- **`compiler/grapes-to-json.ts`** and **`compiler/json-to-grapes.ts`**:
  bidirectional bridge between the GrapesJS component tree and the
  `SignatureSchema` (CLAUDE.md §6.1). The schema remains the source of
  truth for persistence and HTML compilation.
- **Toolbar**: `DeviceSwitcher` (Desktop 600 px / Mobile 320 px),
  `UndoRedo` (wired to `editor.UndoManager`), `PreviewToggle` (runs
  `preview` command).
- **Variables panel**: edit `{{name}}` / `{{email}}` / etc. live;
  changes propagate through the schema to the preview.

### Removed (per `docs/adr/0002-revert-unsanctioned-additions.md`)
- The `/wp-json/imgsig/v1/health` diagnostic endpoint (not in
  CLAUDE.md §11.2).
- The `SetupFallback` `admin-post.php` handler and the no-JS
  fallback form rendered alongside the SPA setup wizard (not in
  CLAUDE.md).
- The `imgsig_redirect_to_setup` transient and
  `Plugin::maybe_redirect_to_setup()` (not in CLAUDE.md).
- `BaseController::permission_for()`'s fallback to `manage_options`.
  Strict `imgsig_*` capability checks per CLAUDE.md §10.1 are
  restored.
- `Plugin::safe()` boot try/catch wrapper. Boot exceptions propagate
  to WordPress's fatal handler as designed.
- The redirect-to-setup short-circuit in `assets/editor/src/main.tsx`.

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
