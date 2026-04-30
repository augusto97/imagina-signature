# Imagina Signatures — release branch

This branch hosts the installable plugin ZIPs. The `main` development branch and the active feature branches contain the source — this branch carries the built distribution artifacts only.

## Download

| Version | URL |
| ------- | --- |
| **Latest** | [imagina-signatures-latest.zip](imagina-signatures-latest.zip) |
| 1.0.7 | [imagina-signatures-1.0.7.zip](imagina-signatures-1.0.7.zip) |
| 1.0.6 | [imagina-signatures-1.0.6.zip](imagina-signatures-1.0.6.zip) |
| 1.0.5 | [imagina-signatures-1.0.5.zip](imagina-signatures-1.0.5.zip) |
| 1.0.4 | [imagina-signatures-1.0.4.zip](imagina-signatures-1.0.4.zip) |
| 1.0.3 | [imagina-signatures-1.0.3.zip](imagina-signatures-1.0.3.zip) |
| 1.0.2 | [imagina-signatures-1.0.2.zip](imagina-signatures-1.0.2.zip) |
| 1.0.1 | [imagina-signatures-1.0.1.zip](imagina-signatures-1.0.1.zip) |
| 1.0.0 | [imagina-signatures-1.0.0.zip](imagina-signatures-1.0.0.zip) |

Direct raw URLs (suitable for `wget` / WP-CLI / pasting into WP's Plugins → Upload Plugin):

```
https://github.com/augusto97/imagina-signature/raw/release/imagina-signatures-latest.zip
https://github.com/augusto97/imagina-signature/raw/release/imagina-signatures-1.0.7.zip
https://github.com/augusto97/imagina-signature/raw/release/imagina-signatures-1.0.6.zip
https://github.com/augusto97/imagina-signature/raw/release/imagina-signatures-1.0.5.zip
https://github.com/augusto97/imagina-signature/raw/release/imagina-signatures-1.0.4.zip
https://github.com/augusto97/imagina-signature/raw/release/imagina-signatures-1.0.3.zip
https://github.com/augusto97/imagina-signature/raw/release/imagina-signatures-1.0.2.zip
https://github.com/augusto97/imagina-signature/raw/release/imagina-signatures-1.0.1.zip
https://github.com/augusto97/imagina-signature/raw/release/imagina-signatures-1.0.0.zip
```

## Install

1. WordPress admin → **Plugins → Add New → Upload Plugin**.
2. Pick the ZIP, click **Install Now**, then **Activate**.
3. Find **Imagina Signatures** in the left sidebar.

The ZIP's top-level folder is always `imagina-signatures/` (no version suffix) so the WordPress plugin slug, text-domain, hooks, and options stay consistent across upgrades. Older WP installs that already have an `imagina-signatures/` folder will be cleanly overwritten on upload.

## Versioning

Strict [semver](https://semver.org/):

- **Major** (`x.0.0`) — breaking changes (DB schema rewrite, REST API contract change, hook signature change).
- **Minor** (`1.x.0`) — new features, no breaking changes.
- **Patch** (`1.0.x`) — bug fixes only.

Each release is committed here as `imagina-signatures-<x.y.z>.zip`, and `imagina-signatures-latest.zip` is updated to point at the most recent build.

## Building locally

If you want to rebuild from source instead of downloading:

```bash
git clone https://github.com/augusto97/imagina-signature.git
cd imagina-signature
npm install
npm run build
composer install --no-dev
bash scripts/build-zip.sh
# Output: dist/imagina-signatures-<version>.zip
```

## Changelog

See [CHANGELOG.md](https://github.com/augusto97/imagina-signature/blob/main/CHANGELOG.md) on the development branch for the full per-release history.

### 1.0.7
Persistence actually persists. Two paired bugs fixed: (1) the editor never fetched an existing signature on open, so reloading `?id=42` started fresh empty — new `useLoadSignature` hook GETs `/signatures/:id` on mount and replays the schema. (2) For a brand-new signature, autosave POSTed and got back the new id but the URL still said no id, so a reload created yet another fresh draft and the user's first edits were unreachable — autosave now writes `?id=N` into the URL via `history.replaceState` after the first POST. Autosave gates on a new `persistenceStore.isLoaded` flag so the load itself doesn't trigger a redundant PATCH. Also: restored the 1px border on block library cards (1.0.6's `button { border: 0 }` shorthand was clobbering preflight's `border-style: solid`; switched to longhand `border-width: 0`).

### 1.0.6
Drop the editor iframe — the React editor now mounts directly on the wp-admin page (same pattern as the admin app shipped in 1.0.5). Side effects: the Cloudflare beacon CSP block goes away, the `?token=...` URL in the address bar goes away, and the favicon.ico 404 goes away — all three were caused by the editor iframe being a separate document with its own CSP. Native `<button>` border bug fixed defensively: explicit reset on the element selector itself (`button, [type='button'], ... { border: 0 }`) so there's no specificity ambiguity against UA `button { border: 2px outset }`. Container (2-column) block actually works now: children are real Blocks rendered through the registry, click-selectable for property editing, and `compile()` recursively emits each child's email-safe HTML inside the right cell. Removed `EditorIframeController` + its `/editor/iframe` REST route + dead `postMessageBridge.ts`. Editor topbar icons bumped from 12–14px to 14–16px.

### 1.0.5
Drop the admin iframe — the wp-admin React app now mounts directly on the page (`#imagina-admin-root`, `position: fixed; inset: 0;`) so it matches how the rest of the Imagina plugins ship. Native form controls keep paint integrity via explicit higher-specificity resets in `globals.css` instead of through CSS isolation. Editor back-arrow now actually navigates (reads `signaturesUrl` from config and sets `window.parent.location` instead of posting a `request-close` message no parent listened to). Templates "New template" button opens a working modal that POSTs to `/templates`. Removed dead `templates` tab in the editor's left sidebar, dead `force-save` / `request-close` postMessage types, and the now-superseded `AdminAppController` REST endpoint.

### 1.0.4
Re-enable Tailwind preflight (CSS reset) on both bundles. The reset was off because the admin bundle used to load directly inside wp-admin; that constraint went away in 1.0.3 when the admin app moved into its own iframe. Without the reset, native `<button>` elements inherited the browser's default `border-width: 2px outset`, which produced the heavy grey stamp seen on hover toolbars and admin buttons. Other UA quirks (heading default sizes, image inline-block, list bullets) were also leaking. The full preflight is now safe and the source of every native control's baseline.

### 1.0.3
Move the admin React app into a same-origin iframe (served from a new token-protected `/admin/app` REST endpoint), mirroring the editor's pattern. wp-admin's `forms.css` / `common.css` were leaking into the React UI and styling native `<button>` / `<input>` elements with grey WP borders that fought the design tokens. The iframe document loads only `admin.css`, so the React app paints clean.

### 1.0.2
Layers panel inside the editor's left sidebar (Blocks / Layers tab strip), with click-to-select, hover-to-highlight, and a per-row visibility toggle. Visual polish: lighter shadow tokens, softer 1px selection ring with subtle outer glow, white-pill block toolbar without the heavy border, larger admin sidebar nav rows + roomier signatures table to match the Imagina Proposals reference, removed the empty "Properties" wrap section so non-Text block panels render as a flat list of fields.

### 1.0.1
Hotfix: load `editor.js` / `admin.js` as ES modules so Vite's per-entry shared chunk imports correctly. Without `type="module"` the bundles failed with "Cannot use import statement outside a module" and the editor / admin pages rendered blank.

### 1.0.0
First public release. Visual signature editor (React 18 iframe, dnd-kit, Tiptap), full wp-admin React app for the listing / templates / storage settings, S3-compatible storage with custom SigV4 + HKDF-encrypted credentials, REST CRUD for signatures / templates / uploads / assets, ten seeded templates, bullet-proof Outlook VML buttons.
