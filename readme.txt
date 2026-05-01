=== Imagina Signatures ===
Contributors: imaginawp
Tags: email, signature, signatures, editor, email-signature
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.20
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Visual email signature editor for WordPress with a modern React 18 iframe editor and S3-compatible storage.

== Description ==

Imagina Signatures adds a Framer / Webflow-grade visual editor for HTML email signatures inside wp-admin. Each WordPress user manages only their own signatures. Storage is pluggable — the default Media Library driver works on any host, and the S3-compatible driver supports Cloudflare R2, Bunny Storage, Amazon S3, Backblaze B2, DigitalOcean Spaces, Wasabi, and any custom endpoint.

= Highlights =

* Isolated React 18 + Tiptap editor running in a controlled iframe — zero leakage from wp-admin styles.
* Email-safe HTML output: tables + inline CSS, validated for Gmail clipping, missing alt / width / href.
* Web-safe font set + restricted formatting whitelist matches what real email clients render.
* No CDNs at runtime, no Composer install on the server. The plugin only talks to the storage you configured.
* Each user sees only their signatures. Capabilities are added to the existing native WordPress roles — no custom roles, no plans, no licensing.

== Installation ==

1. Upload the plugin ZIP via Plugins → Add New → Upload Plugin, or extract into wp-content/plugins/.
2. Activate.
3. Configure storage under Imagina Signatures → Settings (optional — Media Library works out of the box).
4. Open Imagina Signatures → My Signatures and click "Add New".

== Frequently Asked Questions ==

= Does it work on shared hosting? =

Yes. PHP 7.4+, MySQL 5.7+, no exec() or shell_exec(), no Node on the server.

= Can I use my own S3-compatible backend? =

Yes. Pick "Custom S3-compatible" under Settings and supply your endpoint URL.

== Changelog ==

= 1.0.20 =
* **Persistence engine rewritten from scratch.** Old `persistenceEngine.ts` deleted. The previous version used a chain of `.finally(scheduleAutosave)` callbacks to coalesce saves arriving during an in-flight POST — that chain raced with `flushNow()` in subtle ways (visible to the user as duplicate empty signatures + edits dropped). New `assets/editor/src/services/persistence.ts` uses a different model: one save at a time, a self-coalescing `while (dirty) { dirty = false; await save(); }` loop, no promise chains. Concurrency reduces to a single `inFlight` reference. `saveNow()` is just `clearTimeout + performSave + await` — if a save is already running, await it, the loop will pick up new edits via the dirty flag.
* **Empty-schema POST refused.** If the user clicks Save / Cmd-S with no edits and no signature id yet, the engine returns `0` without POSTing. That's the path that was creating empty rows in earlier versions whenever the engine disagreed with itself about whether `signatureId` was set.
* **Branding palette + Banner campaigns** now stored as native PHP arrays (WP's `update_option` serializes them automatically) instead of being JSON-encoded into a string first. The JSON-string roundtrip was the suspected cause of palette saves not persisting. Reads are back-compat: legacy JSON-string values from 1.0.13–1.0.19 still decode correctly, and the next write normalises to a native array.
* **Round-trip verification** in `PATCH /admin/site-settings`. After `update_option` runs, the controller re-reads the option and compares against what the client sent. Mismatch → returns a 500 with `{sent, readback}` payload instead of the misleading "Saved" toast.

= 1.0.19 =
* **Fix the persistence race that was eating the user's last edits.** When the user added a block on a brand-new signature, the eager-first POST went out and started returning. If the user added MORE blocks during that POST and then clicked the back-arrow, `flushNow()` awaited the original POST but exited before the coalesce-finally could re-schedule the second save. The page navigated, the timer was cancelled, the second batch of edits was lost. Symptom: returning to the listing showed a duplicate signature with only the first edits, and re-entering it looked empty. Fix: `flushNow()` now loops until both `pendingTimer` and `inFlight` are clear (re-checks after each await; capped at 5 iterations).
* **Manual Save button in the topbar.** No more guessing whether the autosave fired — there's now a clearly-clickable Save button next to the back-arrow with five visual states (Save / Saving… spinner / Retry save red / Saved · 14:32 timestamp / never-saved outline). Click runs `persistenceEngine.saveNow()` which forces a flush and awaits the round-trip. `Cmd/Ctrl + S` already triggered this since 1.0.8 — now it's also a visible button.
* **First-save toast announces the signature ID.** When a brand-new signature gets its first POST, a "Saved as signature #42" toast confirms the row was actually created. Useful confidence check after a quick navigation.
* **Plugin version pill** next to the Imagina Signatures brand label in the topbar. If the editor still says `v1.0.18` after upgrading, the browser is serving cached JS — hard-refresh (Ctrl/Cmd + Shift + R) to invalidate.

= 1.0.18 =
* **Fix: Button block invisible in non-Outlook clients** (Gmail, Apple Mail, Outlook Web, multi-device preview, "Copy visual" paste). The minifier was stripping the closing half of the Button's downlevel-revealed conditional comment (`<!--<![endif]-->`), which left the opener `<!--[if !mso]>` orphaned. Browsers then read everything after the opener as one long unterminated comment and the `<a>` got swallowed. Same root cause for the GIF static-fallback `<img>` shipped in 1.0.16. Minifier now extracts every conditional comment block (`<!--[if …]>` … `<![endif]-->`) into a placeholder before stripping plain comments, then restores them verbatim. Seven regression tests added in `tests/js/compiler/minify.test.ts`.

= 1.0.17 =
* New **"Copy visual"** button in the Export modal — copies the rendered signature so it pastes visually into rich-text composers (Gmail compose, Outlook signature box, Apple Mail, Word). For platforms whose signature settings only accept rich text and refuse a raw HTML paste. Modern path uses `navigator.clipboard.write([new ClipboardItem({ 'text/html': …, 'text/plain': … })])`; falls back to a hidden contenteditable + `execCommand('copy')` for older browsers and locked-down iframe contexts.
* "Copy HTML" button kept for HTML-mode signature settings (Thunderbird's file-attached signature, Gmail Labs HTML view, etc.).
* Per-client install tabs now flag which copy mode they assume — a small "Use Copy visual" / "Use Download .html" pill next to the deep-link button. Steps were rewritten to start with "Press Copy visual / Download .html above…" so the user knows exactly which button to use first.

= 1.0.16 =
* Track 5 (alternative path) — install flow + GIF polish.
* **ExportModal redesigned**. Big "Copy HTML" + "Send to my email" + "Download .html" buttons in a single action row. The send-to-email button POSTs to a new `/signatures/test-send` REST endpoint, which uses `wp_mail` to deliver the compiled HTML to the WP user's own email so they can copy it from their real client without touching raw markup. Rate-limited at 6 sends/hour to stop abuse.
* **Per-client install tabs**: Gmail / Outlook Web / Outlook Desktop / Apple Mail / Thunderbird. Each tab shows a deep-link button that opens the right settings screen (`https://mail.google.com/mail/u/0/#settings/general` for Gmail, etc.) plus 5 numbered steps. Skipped OAuth deploy entirely — it requires every WP admin to register Google Cloud + Azure apps (~1h each), the user's IT team to whitelist the app for corporate accounts (often blocked), and Google's "sensitive scope" verification (4-8 weeks). Copy-and-install covers 95% of cases without any of that.
* **GIF polish.** Optional `static_fallback_url` field on Image and Banner blocks (only surfaces when the `src` is a `.gif`); compile pipeline emits a `<!--[if mso]>` conditional swap so Outlook 2007–2019 (which freezes GIFs on the first frame) shows the static PNG instead of a frozen frame, while modern clients keep the animation. ImageCropperModal now warns when cropping a GIF — the cropper renders to canvas and produces a static frame, so the warning gives the user a chance to cancel.

= 1.0.15 =
* Track 4 — banner campaigns with random rotation + scheduling.
* New site-wide option `imgsig_banner_campaigns`. Each campaign carries: name, image URL, link URL, alt text, width, enabled flag, and an optional date window (start_date / end_date in `YYYY-MM-DD`). Up to 50 campaigns per site.
* The compile pipeline picks one currently-active campaign at random each export and inserts it as a new `<tr><td>` row inside the outer email-shell table — so the banner inherits the canvas width / centring and lives between the user content and the compliance footer. Re-exporting picks again, so successive copies cycle through active campaigns.
* "Active" = enabled AND inside the date window AND has a non-empty image URL. The editor bootstrap only receives ALREADY-ACTIVE campaigns (filtered server-side via `current_time( 'Y-m-d' )`), so the compiler never has to know about scheduling.
* Admin Settings → new **Campaigns** tab. Per-campaign card with status pill (Active / Scheduled / Expired / Disabled), inline name + enabled toggle, image / link / alt / width fields, date pickers, and a live preview of the banner. Add / remove / save in bulk via "Save campaigns".

= 1.0.14 =
* Track 3 (round 2) — templates por rol + bulk apply.
* **Templates por rol**: each template now carries a `visible_to_roles` field. Empty = visible to everyone with `imgsig_use_signatures` (existing behaviour); populated = only users with one of the matching WP roles see it in the editor's TemplatePicker. Admins (`imgsig_manage_templates`) always see every template regardless of their own role. New schema migration 1.1.0 adds the column via dbDelta (idempotent and safe to re-run).
* **Bulk apply**: new `POST /admin/templates/:id/apply` endpoint. Scope: `all` | `role:slug` | `users:1,2,3`. Creates a new signature seeded from the template for each user in scope; does NOT modify their existing signatures. `skip_existing=true` (default) suppresses creating a duplicate row for any user that already has a signature stamped with that `template_id` — re-running the same apply doesn't multiply rows.
* Admin Templates page gets per-template **Edit** (name / category / description / role visibility chips) and **Apply** (scope picker with All / Role / Specific users + skip-existing toggle + result summary) buttons. Each card displays its visibility scope as a chip (`All roles` in green, or per-role chips in accent blue).

= 1.0.13 =
* Track 3 (round 1) — WordPress-native team management primitives that don't exist in any SaaS competitor because they piggyback on WP's user model directly.
* **Auto-merge from `wp_users` / `wp_user_meta`** — read-only `wp_*` system variables (display_name, email, first_name, last_name, url) auto-populate from the current user's record. Surface in the right-sidebar Variables panel as locked rows; the compiler merges them into substitution at export time (user-defined variables win on key conflict). New `imgsig/editor/system_variables` filter lets host plugins expose custom user_meta keys (departments, employee IDs, etc.).
* **Brand palette** — site-wide list of up to 12 hex colours, edited in admin Settings → Branding. Surfaces under every editor ColorInput as quick-pick swatches.
* **Compliance footer** — admin-only HTML disclaimer (kses-sanitized) appended to every signature on compile. Useful for GDPR / CAN-SPAM at the org level. Toggle + textarea + live preview in admin Settings → Compliance, with GDPR / CAN-SPAM starter templates.
* The Settings page is now tabbed (Storage / Branding / Compliance) — the storage form is unchanged, just moved into the first tab.

= 1.0.12 =
* Track 2 — visual polish round. **Image cropper**: a Crop button on Image and Avatar property panels opens a modal with `react-easy-crop`. Avatar uses a 1:1 round crop, Image uses free-aspect rectangular. Output is a cropped data-URI written back to the block's `src`. **TemplatePicker filtering**: search input + horizontal category chips derived from the loaded templates so admin-added categories show automatically. **Multi-device preview**: PreviewModal gains Desktop (720px) / Tablet (480px) / Mobile (360px) tabs that lock the iframe width, plus an HTML payload-size pill that turns amber when over the 102KB Gmail clipping threshold, and a collapsible compile-warnings section that lists missing variables / alt / width / clip warnings.

= 1.0.11 =
* Track 1 — Premium feature parity round 1. Five additions that close the gap with HiHello / WiseStamp / Newoldstamp on basic capability surface:
* New **QR Code** block. Encodes any URL / mailto: / tel: / vCard string and renders as a base64 PNG `<img>` (no external CDN, fully email-portable). Custom fg / bg colours via an offscreen canvas. ~5KB gzipped from `qrcode-generator`.
* New **Banner** block. Promotional image with a click-through link. Defaults to 600px wide (matches canvas), supports border-radius.
* New **vCard** block. Renders a "Save my contact" button whose `href` is a `data:text/vcard;base64,…` URI built from name / org / title / email / phone / website. Recipients click → contact opens in their address book. Strict RFC 6350 vCard 3.0 output.
* **Save signature as template** (admin-only). New topbar button visible to users with `imgsig_manage_templates`. POSTs the current schema to `/templates` so admins can seed templates from real content instead of an empty schema.
* **Variables UI**. The schema's `variables` bag finally has an editor — sits below Typography in the right sidebar (when nothing is selected). Add / rename / remove / copy `{{token}}` to clipboard. Compiler substitutes `{{varname}}` → escaped value at the very end of the pipeline; missing names ship as literal text and surface as compile warnings (no silent data loss).

= 1.0.10 =
* Container columns are no longer locked to a 50/50 split. New `left_width` field on `ContainerBlock` (percentage 10–90, optional, defaults to 50 for back-compat with rows saved before this field). Renderer + email-safe `compile()` both honour the value, so what you see on the canvas matches what the signature ships. Properties panel gains a Column-widths control: a live preview bar, a 10–90% range slider, and quick-preset buttons (1/4, 1/3, 1/2, 2/3, 3/4) for common ratios like a logo cell + content cell.

= 1.0.9 =
* Layers panel is a real tree now. Container children render indented under their parent — previously the panel only walked the top-level array, so column contents were invisible there. Each row gets up / down chevrons that swap with siblings within the same parent (top-level rows reorder among top-level, nested children reorder within their column array), an eye toggle for visibility, and a trash icon for delete. New `moveBlockUp` / `moveBlockDown` schemaStore actions back the chevrons and use a `findParentAndIndex` helper that locates a block whether it lives at the top level or inside a Container.

= 1.0.8 =
* Real persistence engine. The 1.0.7 autosave still lost work when the user clicked the back-arrow during the 1500ms debounce window — the browser navigates away and aborts the in-flight POST before the server commits the row. Refactored into a module-level `persistenceEngine` singleton: (a) the very first save (when `signatureId === 0`) fires immediately, not on debounce, so the new row + URL update happen ASAP; (b) the back-arrow now `await persistenceEngine.flushNow()` before navigating, so any pending / in-flight save lands first; (c) `Cmd/Ctrl + S` triggers a manual flush; (d) `beforeunload` warns if anything is unsaved when the user tries to close the tab. Coalesces concurrent edits (saves during in-flight POST get re-scheduled, never doubled).
* Stale `?id=` recovery. If the editor is opened with `?id=N` for a deleted / non-existent signature, the load 404s and the engine `resetToNew()`s — the URL drops `?id=`, so the user's first edit creates a fresh row instead of PATCH-looping a 404.
* Topbar status now shows save errors. Red "Save failed — click Save to retry" instead of just bouncing back to "Saved" / "Unsaved" on failure.

= 1.0.7 =
* Persistence actually persists. Two paired bugs fixed: (1) the editor never fetched an existing signature on open, so reloading `?id=42` started fresh empty — now `useLoadSignature` GETs `/signatures/:id` on mount and replays the schema. (2) For a brand-new signature, the autosave POSTed and got back the new id, but the URL still said no id, so a reload created yet another fresh draft and the user's first edits were unreachable — now the autosave writes `?id=N` into the URL via `history.replaceState` after the first POST. Autosave gates on `persistenceStore.isLoaded` so the load itself doesn't trigger a redundant round-trip.
* Restored the 1px border on the block library cards. The 1.0.6 button reset used the shorthand `border: 0` which also clobbers `border-style` (sets it to `none`); Tailwind's `.border` utility only declares `border-width: 1px` and relies on preflight's `border-style: solid`, so the cards rendered borderless. Switching to longhand `border-width: 0` lets `.border` re-introduce a 1px width while preflight's solid style stays applied.

= 1.0.6 =
* Drop the editor iframe — the React editor now mounts directly on the wp-admin page, same pattern as the admin app shipped in 1.0.5. The Cloudflare beacon CSP block, the `?token=` URL in the address bar, and the `/favicon.ico` 404 all go away because there's no longer a separate iframe document with its own CSP. Removed `EditorIframeController` + its REST route + its container binding.
* Native `<button>` elements get an explicit, higher-specificity reset (`button, [type='button'], [type='submit'], [type='reset'] { border: 0 }`) declared on the element selector instead of relying on the universal `*` reset. Belt-and-suspenders against UA `button { border: 2px outset }` that some Chromium / Firefox builds keep painting even after the universal author rule lands.
* Container block actually works: children are real Blocks rendered through the registry (no more `[type]` placeholders), `compile()` recursively compiles each child's email-safe HTML, and the property panel exposes Add / Remove + a 1-or-2 column toggle. Nested blocks are click-to-select and editable from the same right-sidebar property panel as top-level blocks (recursive `findBlockByIdDeep` in `schemaStore`).
* Editor topbar icons + back-arrow bumped from 12-14px to 14-16px and tap targets from 24px to 28-32px.

= 1.0.5 =
* Drop the admin iframe — the wp-admin React app now mounts directly on the page (`#imagina-admin-root`, `position: fixed; inset: 0;`) so it matches how the rest of the Imagina plugins ship. Native form elements get explicit, higher-specificity resets in `globals.css` to win against wp-admin's `forms.css`, and a new `AdminAssetEnqueuer` loads the bundle (with `type="module"`) only on our admin page hooks.
* Editor back-arrow now actually navigates: it reads `signaturesUrl` from the bootstrap config and sets `window.parent.location` instead of posting a `request-close` message no parent listened to.
* Templates: "New template" button is functional — opens a modal (Name / Category / Description), POSTs to `/templates`, and the new row is prepended to the list.
* Drop dead code: unreachable `templates` tab in the editor's left sidebar; unused `force-save` / `request-close` postMessage types; the now-superseded `AdminAppController` REST endpoint.

= 1.0.4 =
* Re-enable Tailwind preflight on both bundles. Now that the editor and admin both render inside isolated iframes, the global CSS reset is safe to ship — and necessary, because without it browser defaults (notably `button { border-width: 2px }`) leak through and stamp every native control with a UA-default heavy border. Buttons, inputs, headings, images, lists, and tables now read against a clean reset.

= 1.0.3 =
* Move the admin React app into a same-origin iframe (served from the new `/admin/app` REST endpoint with a signed token) so wp-admin's `forms.css` / `common.css` no longer leak into the React UI. Previously buttons inherited a heavy WP grey border + shadow that fought with the design tokens.

= 1.0.2 =
* Implemented Layers panel: the LeftSidebar gains a Blocks / Layers tab strip; Layers shows a tree of every block on the canvas with click-to-select, hover-to-highlight, and a per-row visibility toggle.
* Visual polish pass: lighter shadow tokens, softer 1px selection ring with a subtle outer glow, white-pill block toolbar with no heavy border, larger sidebar nav items and a roomier signatures table to match the Imagina Proposals reference, dropped the empty "Properties" wrap section so non-Text block panels render as a flat list of fields.

= 1.0.1 =
* Fix: load editor.js / admin.js as ES modules so the shared bundle chunk imports correctly. Without `type="module"` the Vite output triggered "Cannot use import statement outside a module" and the page rendered blank.

= 1.0.0 =
* Initial public release. See CHANGELOG.md for details.
