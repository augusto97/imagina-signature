# Imagina Signatures — release branch

This branch hosts the installable plugin ZIPs. The `main` development branch and the active feature branches contain the source — this branch carries the built distribution artifacts only.

## Download

| Version | URL |
| ------- | --- |
| **Latest** | [imagina-signatures-latest.zip](imagina-signatures-latest.zip) |
| 1.0.1 | [imagina-signatures-1.0.1.zip](imagina-signatures-1.0.1.zip) |
| 1.0.0 | [imagina-signatures-1.0.0.zip](imagina-signatures-1.0.0.zip) |

Direct raw URLs (suitable for `wget` / WP-CLI / pasting into WP's Plugins → Upload Plugin):

```
https://github.com/augusto97/imagina-signature/raw/release/imagina-signatures-latest.zip
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

### 1.0.1
Hotfix: load `editor.js` / `admin.js` as ES modules so Vite's per-entry shared chunk imports correctly. Without `type="module"` the bundles failed with "Cannot use import statement outside a module" and the editor / admin pages rendered blank.

### 1.0.0
First public release. Visual signature editor (React 18 iframe, dnd-kit, Tiptap), full wp-admin React app for the listing / templates / storage settings, S3-compatible storage with custom SigV4 + HKDF-encrypted credentials, REST CRUD for signatures / templates / uploads / assets, ten seeded templates, bullet-proof Outlook VML buttons.
