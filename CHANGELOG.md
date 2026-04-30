# Changelog

All notable changes to Imagina Signatures are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.5] — 2026-04-30

### Changed

- The wp-admin React app no longer renders inside an iframe. The 1.0.3 iframe was an attempt to firewall wp-admin's `forms.css` / `common.css` from bleeding into our React UI, but it was inconsistent with the rest of the Imagina plugin family — none of which use iframes for their admin surface. We now mount the React tree directly into a fixed-position `#imagina-admin-root` container that covers the viewport, and beat wp-admin's specificity with explicit higher-specificity resets in `assets/admin/src/styles/globals.css` (`#imagina-admin-root button` is 1,0,1 vs WP's `button` at 0,0,1). Asset loading is handled by a new `AdminAssetEnqueuer` that hooks `admin_enqueue_scripts`, only loads on our page hook suffixes, and rewrites the script tag to `type="module"` so the Vite ESM bundle resolves its shared chunk.
- Removed the now-unused `AdminAppController` REST endpoint and its container binding.

### Fixed

- Editor back-arrow actually navigates. It used to post a `request-close` message that no parent window listened for. The arrow now reads `signaturesUrl` from the bootstrap config (added on the PHP side) and sets `window.parent.location.href`, escaping the editor iframe back to the wp-admin signatures listing.
- "New template" button on the Templates page works. Previously it rendered with no `onClick`. Admins now get a modal (Name / Category / Description) that POSTs to `/templates` with an empty signature schema seed and prepends the created row to the list.

### Removed

- Dead `templates` tab branch in the editor's left sidebar — the `TABS` array only contained `blocks` and `layers`, so the conditional render was unreachable.
- `force-save` and `request-close` from the editor postMessage types — neither was produced or consumed end-to-end. `IncomingMessage` is left as a discriminated union with a placeholder so future signals (e.g., `force-save` on tab close) stay type-safe.

## [1.0.4] — 2026-04-30

### Fixed

- Native `<button>` elements rendered with the browser's default `border-width: 2px outset` because Tailwind's preflight (CSS reset) was disabled at the config level. The reset had been turned off back when the admin bundle was loaded directly inside wp-admin (preflight would have clobbered wp-admin's own UI). Now that 1.0.3 isolates the admin app inside its own iframe and the editor was always isolated, both bundles can ship the full preflight safely. Re-enabling it normalises every native control: buttons (`border: 0; background: transparent`), inputs / headings / lists / images / tables now read against a clean reset before our design tokens layer on top.

## [1.0.3] — 2026-04-30

### Changed

- Admin React app now mounts inside a same-origin iframe (served from a new token-protected `/admin/app` REST endpoint), mirroring the editor's iframe pattern. wp-admin's `forms.css` / `common.css` were applying default styles to native `<button>` and `<input>` elements that bled through Tailwind's scoped utilities and produced the heavy grey-bordered "WP buttons" inside our React UI. The iframe document loads only `admin.css`, so the React app paints clean.

### Added

- `AdminAppController` REST endpoint (`GET /imagina-signatures/v1/admin/app?token=...`) that mints / verifies short-lived tokens carrying `(user_id, page, expires)` and serves the bare HTML the iframe loads. Capability is enforced both at the wp-admin gate and at token verification, defense-in-depth same as the editor controller.

## [1.0.2] — 2026-04-30

### Added

- Layers panel inside the editor's left sidebar. Tab strip at the top toggles between Blocks (the library) and Layers (a flat tree of every block on the canvas). Each layer row shows the block icon + label + a short auto-derived snippet (first words of the text, image alt, etc.); clicking selects, hovering highlights, the eye icon flips `block.visible`.

### Changed

- Lighter shadow tokens on both the editor and admin bundles so cards / toolbars / panels read as floating rather than stamped.
- Softer block selection treatment: 1px solid accent ring with a subtle outer glow instead of the previous heavy 2px ring.
- BlockToolbar redesigned as a white pill with a soft drop shadow, no border, so it overlays the canvas without fighting the selection outline.
- Sidebar navigation items in the admin app are larger / more padded; signatures table rows have more breathing room (px-5 py-4) to match the Imagina Proposals reference.
- PropertyPanel no longer wraps non-Text block panels in an empty "Properties" collapsible section — the controls render as a flat list with consistent padding instead.

## [1.0.1] — 2026-04-30

### Fixed

- Editor and admin pages rendered blank because `<script src="...">` tags were missing `type="module"`. With Vite's per-entry chunk splitting, `editor.js` and `admin.js` import a shared bundle, which only works when the script tag is loaded as an ES module. Both PHP hosts now emit `type="module"`.

## [Unreleased]

### Added

- Initial public release scaffolding (Sprints 1–12).
- Core: PSR-4 autoloader, DI container, lifecycle (Activator / Deactivator / Uninstaller), schema migrator, capability installer.
- Storage: pluggable `StorageDriverInterface` with Media Library and S3-compatible drivers; SigV4 signer + S3Client + presigned URL builder; provider presets (Cloudflare R2, Bunny, S3, B2, Spaces, Wasabi, custom). Encryption service for credential storage.
- REST API: signatures CRUD, templates (open read / admin write), uploads (init / direct / finalize), storage admin, `/me`. Capability + ownership middleware, rate limiter.
- Editor: React 18 iframe app with dnd-kit drag-and-drop, Tiptap-based text editing on the email-safe whitelist, eleven block types (text, heading, image, avatar, divider, spacer, social_icons, contact_row, button_cta, disclaimer, container), undo/redo (50-deep), debounced autosave.
- Compiler: JSON → email-safe HTML pipeline (shell + Outlook fixes + minification + validation warnings).
- Templates: two seeded templates (`minimal-modern`, `corporate-classic`).
- Polish: error boundary, toast notifications, multi-client preview modal, export modal (Copy + Download).

### Known limitations

- Eight of ten templates from the spec roadmap still need to be authored before public release.
- Bullet-proof VML buttons for Outlook 2007–2019 are stubbed; the standard CSS button works in most clients.
- Nested drag-and-drop into containers ships in a follow-up.
- `POST /admin/storage/migrate` (cross-driver asset migration) is intentionally deferred — it needs a long-running task scheduler.
- Cross-client visual QA (real Outlook / Gmail / Apple Mail) is manual and pending.
