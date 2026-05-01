# Imagina Signatures — release branch

This branch hosts the installable plugin ZIPs. The `main` development branch and the active feature branches contain the source — this branch carries the built distribution artifacts only.

## Download

| Version | URL |
| ------- | --- |
| **Latest** | [imagina-signatures-latest.zip](imagina-signatures-latest.zip) |
| 1.0.16 | [imagina-signatures-1.0.16.zip](imagina-signatures-1.0.16.zip) |
| 1.0.15 | [imagina-signatures-1.0.15.zip](imagina-signatures-1.0.15.zip) |
| 1.0.14 | [imagina-signatures-1.0.14.zip](imagina-signatures-1.0.14.zip) |
| 1.0.13 | [imagina-signatures-1.0.13.zip](imagina-signatures-1.0.13.zip) |
| 1.0.12 | [imagina-signatures-1.0.12.zip](imagina-signatures-1.0.12.zip) |
| 1.0.11 | [imagina-signatures-1.0.11.zip](imagina-signatures-1.0.11.zip) |
| 1.0.10 | [imagina-signatures-1.0.10.zip](imagina-signatures-1.0.10.zip) |
| 1.0.9 | [imagina-signatures-1.0.9.zip](imagina-signatures-1.0.9.zip) |
| 1.0.8 | [imagina-signatures-1.0.8.zip](imagina-signatures-1.0.8.zip) |
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
https://github.com/augusto97/imagina-signature/raw/release/imagina-signatures-1.0.16.zip
https://github.com/augusto97/imagina-signature/raw/release/imagina-signatures-1.0.15.zip
https://github.com/augusto97/imagina-signature/raw/release/imagina-signatures-1.0.14.zip
https://github.com/augusto97/imagina-signature/raw/release/imagina-signatures-1.0.13.zip
https://github.com/augusto97/imagina-signature/raw/release/imagina-signatures-1.0.12.zip
https://github.com/augusto97/imagina-signature/raw/release/imagina-signatures-1.0.11.zip
https://github.com/augusto97/imagina-signature/raw/release/imagina-signatures-1.0.10.zip
https://github.com/augusto97/imagina-signature/raw/release/imagina-signatures-1.0.9.zip
https://github.com/augusto97/imagina-signature/raw/release/imagina-signatures-1.0.8.zip
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

### 1.0.16
Track 5 (alternative path) — install flow + GIF polish. Replaced OAuth deploy (C2) with a polished copy-and-install flow because OAuth requires every WP admin to register Google Cloud + Azure AD apps (~1h each) and end users' IT teams to whitelist for corporate accounts (often refused). Copy-and-install covers 95%+ of cases without that friction. ExportModal redesigned: three primary actions (Copy HTML / Send to my email / Download .html) + per-client install tabs (Gmail, Outlook Web, Outlook Desktop, Apple Mail, Thunderbird) with deep-links to each client's signature settings + 5 numbered paste-here steps. New `POST /signatures/test-send` endpoint dispatches the compiled HTML via `wp_mail` to the user's own `user_email` only (rate-limited 6/hour). GIF polish: optional `static_fallback_url` field on Image / Banner blocks (only surfaces when `src` is `.gif`); compile emits `<!--[if mso]>` conditional swap so Outlook 2007–2019 shows the static PNG while modern clients keep the animation. ImageCropperModal warns when cropping a GIF (cropper renders to canvas → kills animation).

### 1.0.15
Track 4 — banner campaigns con rotación + scheduling. Site-wide option `imgsig_banner_campaigns` storing up to 50 campaigns (name / image / link / alt / width / enabled / start_date / end_date). Compile pipeline picks one **currently-active** campaign at random per export (`Math.random()`) and inserts it as a new `<tr><td>` row inside the outer email-shell table — re-exporting cycles through active banners. "Active" = enabled + inside date window + has image; the editor bootstrap only receives the active slice (filtered server-side against `current_time('Y-m-d')`), so the compiler never has to know about scheduling. New admin Settings → **Campaigns** tab: per-campaign card with status pill (Active / Scheduled / Expired / Disabled), inline name + enabled toggle, image / link / alt / width fields, date pickers, and a live preview. Banners sit visually between the user content and the compliance footer.

### 1.0.14
Track 3 round 2. **Templates por rol**: each template gains a `visible_to_roles` field. Empty = visible to everyone with `imgsig_use_signatures` (existing behaviour); populated = only users with one of the matching WP roles see it in the editor's TemplatePicker. Admins always see every template. New schema migration `1.1.0` adds the column via dbDelta (idempotent, safe to re-run). **Bulk apply**: new `POST /admin/templates/:id/apply` endpoint with scope = `all` | `role:slug` | `users:1,2,3`. Creates a new signature per user in scope seeded from the template; doesn't touch existing signatures. `skip_existing` (default true) prevents duplicates when re-running. Admin Templates page gains per-card visibility chip + Edit modal (with role toggle chips) + Apply modal (radio scope picker + result summary).

### 1.0.13
Track 3 round 1 — three WP-native team primitives that don't exist in any SaaS competitor because they piggyback on WP's user model directly. **Auto-merge from `wp_users` / `wp_user_meta`**: read-only `wp_*` system variables (display_name, email, first_name, last_name, url) auto-populate from the current user's record, surface in the Variables editor as locked rows, compile pipeline merges them with user-defined variables; new `imgsig/editor/system_variables` filter lets host plugins expose custom user_meta keys. **Brand palette**: site-wide list of up to 12 hex colours edited in admin Settings → Branding, surfaces in every editor ColorInput as quick-pick swatches. **Compliance footer**: admin-only HTML disclaimer (kses-sanitised) appended to every signature on compile, edited in admin Settings → Compliance with toggle + textarea + live preview + GDPR / CAN-SPAM starter templates. Settings page now tabbed (Storage / Branding / Compliance); storage form unchanged, just moved into the first tab.

### 1.0.12
Track 2 — visual polish round. **Image cropper** wired into Image and Avatar property panels via a Crop button (Avatar locked to 1:1 round, Image free-aspect rectangular); output is a cropped data URI written to `block.src`. **Template picker filtering** in the editor — search field + horizontal category-chip strip derived from loaded templates, plus per-card category badges. **Multi-device preview** — PreviewModal exposes Desktop / Tablet / Mobile width presets that lock the iframe so the user can verify reflow at each breakpoint, plus a payload-size pill that turns amber past Gmail's 102KB clipping threshold and a collapsible compile-warnings panel listing every issue (missing alt / width / href, undefined `{{variables}}`, oversized images). Bundle 631KB → 663KB (gzip 207KB), under target.

### 1.0.11
Track 1 — premium feature parity round 1. Five additions that close the basic-capability gap with HiHello / WiseStamp / Newoldstamp without a SaaS dependency: **QR Code block** (encodes any URL / mailto: / tel: / vCard string, rendered as base64 PNG with custom fg/bg colours, fully self-contained — no external CDN), **Banner block** (promotional image with click-through link, full canvas-width default), **vCard block** (renders "Save my contact" link with `data:text/vcard;base64,…` href; recipients click → contact opens in their address book; strict RFC 6350 vCard 3.0 output), **Save signature as template** (admin-only topbar button, POSTs current schema to /templates so admins seed real content instead of empty shells), and **Variables editor** (right-sidebar panel below Typography — add / rename / remove pairs, copy `{{token}}` to clipboard; compiler substitutes `{{varname}}` → HTML-escaped value at end of pipeline; missing names ship as literal text + compile warning, no silent data loss). Editor bundle 587KB → 631KB (gzip 184 → 198KB), under target.

### 1.0.10
Container columns no longer locked at 50/50. New `left_width` field on `ContainerBlock` (percentage 10–90, optional, defaults to 50 for back-compat). Renderer + email-safe `compile()` both honour it. Properties panel gets a Column-widths control with a live preview bar, a 10–90% range slider, and quick-preset buttons (1/4, 1/3, 1/2, 2/3, 3/4) for common ratios like a logo cell + content cell.

### 1.0.9
Layers panel is a real tree. Container children render indented under their parent — previously the panel only walked the top-level array, so column contents were invisible. Each row gets up / down chevrons (swap with sibling within the same parent: top-level reorders among top-level, nested children reorder within their column array), eye toggle, and trash. New `moveBlockUp` / `moveBlockDown` schemaStore actions back the chevrons via a `findParentAndIndex` helper that locates a block whether it lives at the top level or inside a Container.

### 1.0.8
Real persistence engine. The 1.0.7 autosave looked saved (`Saved` status flashed) but work was lost when returning to the listing — the 1500ms debounce raced page navigation. Now: the very first save fires eagerly (no debounce) so the new row + URL update happen immediately; the back-arrow `await persistenceEngine.flushNow()` before navigating, so any pending / in-flight save lands first; `beforeunload` warns on tab close while anything is unsaved; concurrent edits during an in-flight save coalesce instead of double-POSTing. Plus: `Cmd/Ctrl + S` triggers a manual flush, the topbar shows "Save failed — click Save to retry" in red on errors instead of bouncing back to "Saved", and stale `?id=` (signature was deleted) recovers to "new" instead of PATCH-looping a 404.

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
