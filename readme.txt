=== Imagina Signatures ===
Contributors: imaginawp
Tags: email, signature, signatures, editor, email-signature
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.6
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
