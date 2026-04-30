# Changelog

All notable changes to Imagina Signatures are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
