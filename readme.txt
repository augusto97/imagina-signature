=== Imagina Signatures ===
Contributors: imaginawp
Tags: email, signature, signatures, editor, email-signature
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.3
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

= 1.0.3 =
* Move the admin React app into a same-origin iframe (served from the new `/admin/app` REST endpoint with a signed token) so wp-admin's `forms.css` / `common.css` no longer leak into the React UI. Previously buttons inherited a heavy WP grey border + shadow that fought with the design tokens.

= 1.0.2 =
* Implemented Layers panel: the LeftSidebar gains a Blocks / Layers tab strip; Layers shows a tree of every block on the canvas with click-to-select, hover-to-highlight, and a per-row visibility toggle.
* Visual polish pass: lighter shadow tokens, softer 1px selection ring with a subtle outer glow, white-pill block toolbar with no heavy border, larger sidebar nav items and a roomier signatures table to match the Imagina Proposals reference, dropped the empty "Properties" wrap section so non-Text block panels render as a flat list of fields.

= 1.0.1 =
* Fix: load editor.js / admin.js as ES modules so the shared bundle chunk imports correctly. Without `type="module"` the Vite output triggered "Cannot use import statement outside a module" and the page rendered blank.

= 1.0.0 =
* Initial public release. See CHANGELOG.md for details.
