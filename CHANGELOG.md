# Changelog

All notable changes to Imagina Signatures are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.9] — 2026-05-01

### Changed

- Layers panel is a real tree now. Top-level blocks render flat as before; Container children render indented under their parent. The previous flat-list version was walking only `schema.blocks`, which made column contents invisible there — you could see a Container row but had no way to inspect / reorder the blocks inside.
- Each row gets a small toolbar that fades in on hover: up / down chevrons (swap with sibling within the same parent — top-level reorders among top-level, container children reorder within their own column array), eye toggle for `block.visible`, trash for delete. Selection + hover behaviour is unchanged (click selects, hover highlights the canvas via `selectionStore`).
- `schemaStore` gained `moveBlockUp(id)` / `moveBlockDown(id)` actions that swap a block with its previous / next sibling. Backed by a new `findParentAndIndex` helper that locates a block whether it lives at the top level or inside a Container, so nested reorders just work without the caller knowing about parents.

## [1.0.8] — 2026-05-01

### Fixed

- Real persistence. The 1.0.7 autosave appeared to save (`Saved` status flashed) but work was lost when returning to the listing. The bug wasn't the request itself — it was timing. Two failure modes:
  1. **First-save race**: when the user added a block and clicked the back-arrow inside the 1500ms debounce window, the page navigated before the debounce fired. The POST never went out, no row was created.
  2. **In-flight abort**: if the user clicked back while the POST was in flight, the browser canceled the request as the page unloaded. Server may or may not have committed depending on how far the request got.

  Both are fixed by promoting the autosave into a real engine (`assets/editor/src/services/persistenceEngine.ts`) with three guarantees:
  - The very **first save fires eagerly**, not on debounce. The moment the user makes any edit on a brand-new signature, the POST goes out immediately. The row + URL update land before any navigation can race.
  - The **back-arrow now `await persistenceEngine.flushNow()`** before calling `window.location.href = ...`. Cancels the debounce timer, runs the pending save, and awaits any in-flight save. Navigation only happens after the server has acknowledged.
  - **`beforeunload`** triggers the browser's "leave / stay" dialog if anything is dirty / saving / pending — covers tab close, address-bar nav, browser back button.

  Subsequent saves still debounce 1500ms (unchanged). Concurrent edits during an in-flight save are coalesced via a `.finally(() => scheduleAutosave())` chain — never two parallel POSTs for the same draft.

- Stale `?id=` recovery. Opening the editor with `?id=N` for a deleted / non-existent signature would 404 the load and then PATCH-loop the same 404 on every autosave. `useLoadSignature` now calls `persistenceEngine.resetToNew()` on 404, which drops `?id=` from the URL and zeroes the in-memory id so the user's first edit creates a fresh row instead.

- Topbar surfaces save errors. Used to bounce back to "Saved" / "Unsaved" even when a save had failed — only the toast carried the error. Now shows red `Save failed — click Save to retry` until the next successful save.

### Added

- **Cmd/Ctrl + S** triggers a manual flush of any pending save. Useful when the user wants to confirm the current state is committed before navigating.

## [1.0.7] — 2026-04-30

### Fixed

- Persistence actually persists. The editor used to show "Saved" in the topbar after autosave but reloading the page brought back an empty editor. Two paired bugs were responsible:
  1. The editor never fetched an existing signature on open — `signatureId` from the bootstrap config was kept in `idRef` for autosave routing only, with no GET round-trip to populate the schema. New `useLoadSignature` hook fetches `/signatures/:id` on mount and replays `json_content` through `setSchema`.
  2. For a brand-new signature, the autosave POSTed and got back the new id, but the URL still said no id, so a reload created yet another fresh draft and the user's first edits were unreachable. Autosave now writes `?id=N` into the URL via `history.replaceState` after the first POST.
  Autosave gates on `persistenceStore.isLoaded` (new flag) so the load itself doesn't trigger a redundant PATCH round-trip; a `skipNextSave` ref handles the React effect-batching edge where `schema` and `isLoaded` change together.
- Restored the 1px border on the block library cards. The 1.0.6 button reset used the shorthand `border: 0`, which expands to `border-width: 0; border-style: none; border-color: medium`. Tailwind's `.border` utility only declares `border-width: 1px` and relies on preflight's universal `border-style: solid`, so the `border-style: none` from our shorthand made the cards' explicit borders invisible. Switched to longhand `border-width: 0` so `.border` (specificity 0,1,0 > our 0,0,1) can re-introduce a 1px width while preflight's solid style survives.

## [1.0.6] — 2026-04-30

### Changed

- The React editor no longer renders inside an iframe. Same migration we did for the admin in 1.0.5: a fixed-position `#imagina-editor-root` covers the viewport (`position: fixed; inset: 0; z-index: 99999;`), a new `EditorAssetEnqueuer` loads `editor.js` (with `type="module"`) only on the editor page hook suffix, and the editor's bootstrap `IMGSIG_EDITOR_CONFIG` is injected inline. Side effects of dropping the iframe: the Cloudflare beacon CSP block goes away (no per-iframe CSP), the `?token=...` URL in the browser address bar goes away (the iframe's REST route is gone), and the favicon.ico 404 goes away (no separate iframe document fetching one). Removed `EditorIframeController` + its container binding + its `/editor/iframe` REST route.
- Editor topbar icons bumped from 12–14px to 14–16px; tap targets from 24px to 28–32px. The brand pill, status text, Preview/Export buttons all picked up a tier of size to match.

### Fixed

- Native `<button>` border. Tailwind preflight ships `*, ::before, ::after { border-width: 0 }` (specificity 0,0,0). On some Chromium / Firefox builds the UA default `button { border: 2px outset buttonborder }` (specificity 0,0,1) keeps painting through even after the author universal rule lands. Defensive belt-and-suspenders: explicit reset declared on the element selector itself (`button, [type='button'], [type='submit'], [type='reset'] { border: 0; ... }`) so there's no specificity ambiguity. Confirmed in the built `editor.css` and `admin.css`.
- Container (2-column) block. Was a placeholder: children rendered as `[type]` text strings, `compile()` ignored children entirely, no UI to add or remove children. Now: children are real Blocks rendered through the registry, click-selectable for property editing (recursive `findBlockByIdDeep` in `schemaStore` so the right-sidebar `RightSidebar` finds nested blocks), the property panel exposes Add / Remove + a column-count toggle, and `compile()` recursively emits each child's email-safe HTML inside the right cell. Schema unchanged (flat `children: Block[]`, split visually for 2 columns).

### Removed

- `assets/editor/src/bridge/postMessageBridge.ts` — dead now that the editor isn't iframed and doesn't need a host bridge. The bridge file's `IncomingMessage` / `OutgoingMessage` types are gone with it; `AppConfig` stays in `bridge/types.ts` because that's still the bootstrap config shape.

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
