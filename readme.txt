=== Imagina Signatures ===
Contributors: imaginawp
Tags: email, signatures, signature, drag-and-drop, mjml
Requires at least: 6.0
Tested up to: 6.6
Requires PHP: 7.4
Stable tag: 1.0.1
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Professional email signatures for WordPress with a drag-and-drop editor, multi-user plans, and dual storage (Media Library or S3-compatible).

== Description ==

Imagina Signatures lets WordPress site owners and their users design email
signatures with a visual drag-and-drop editor. Signatures are compiled to
table-based, inline-styled HTML compatible with Gmail, Outlook, Apple Mail,
and other major clients.

Includes a block-based visual editor (9 block types), 10 ready-made templates,
multi-client preview (Gmail / Outlook / Apple Mail), full plans + users
admin, and dual image storage (Media Library or any S3-compatible bucket
including Cloudflare R2, Bunny, Amazon S3, Backblaze B2, DigitalOcean Spaces,
Wasabi, MinIO).

== Installation ==

1. Upload the `imagina-signatures` directory to `/wp-content/plugins/`.
2. Activate the plugin through the *Plugins* screen in WordPress.
3. Follow the 3-step setup wizard you will be redirected to.

== Changelog ==

= 1.0.1 =
* Fix: Vite ESM bundles are now enqueued with `type="module"` so the SPA
  no longer fails with `Uncaught SyntaxError: Cannot use import statement
  outside a module`, which previously left wp-admin blank.
* Fix: ServiceProvider container key mismatch caused an HTTP 500 fatal
  during the setup wizard's final save and any other REST call. All
  bindings now use `::class` keys; the resolver finds them correctly.
* Fix: REST endpoints accept `manage_options` as a fallback capability so
  network super admins and half-completed activations can still use the
  plugin without manual cap fixing.
* Fix: Setup wizard now visible as a sub-menu (highlighted) until it has
  been completed, instead of being a hidden page only reachable by URL.
* Fix: Auto-redirect to the setup wizard on the first admin load after
  activation; the dashboard SPA also redirects if setup hasn't been
  completed, so users no longer see a half-broken loading state.
* Fix: Setup notice rendered as a prominent banner with a primary button
  (was an inline link some users didn't see).
* Fix: Setup wizard surfaces the underlying API error message in toasts
  so any future failure is diagnosable.
* UX: Suppressed the "Could not load your account info." toast — when
  /me fails the SPA degrades silently.

= 1.0.0 =
* Initial release: plugin bootstrap, schema migrator, roles, capabilities,
  encryption, storage drivers (Media Library + S3 SigV4), block-based
  editor with live preview, 10 templates, REST API, plans and users
  admin, build pipeline.
