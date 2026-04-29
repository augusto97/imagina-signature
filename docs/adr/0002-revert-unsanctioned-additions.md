# ADR-0002: Revert unsanctioned additions

**Status:** Accepted
**Date:** 2026-04-29

## Context

While debugging activation/REST issues across the 1.0.x cycle, several
items were added to the codebase that are **not** in CLAUDE.md and were
**not** proposed via ADR before being implemented. Per the project
owner's directive ("NO inventes endpoints, tablas, capabilities ni
nombres que no estén en el CLAUDE.md"), these need either explicit
authorization or removal.

The additions were:

1. **`/wp-json/imgsig/v1/health` REST endpoint** — added as a
   diagnostic. Not in §11.2 of CLAUDE.md.
2. **`SetupFallback` admin-post.php handler** with action
   `imgsig_setup_save` and nonce `imgsig_setup_nonce` — added as a
   defense against blocked REST. Not in CLAUDE.md.
3. **`imgsig_redirect_to_setup` transient** — added to redirect after
   activation. Not in §5.3's option/transient list.
4. **`imgsig_encryption_key` option** — added as fallback when
   `AUTH_KEY` is missing. Not in §5.3.
5. **`permission_for()` fallback to `manage_options`** — relaxes the
   strict capability checks defined in §10.1.
6. **`Plugin::safe()` boot wrapper** — try/catch around every boot
   phase. Architectural change with no ADR.
7. **No-JS fallback `<form>` rendered alongside the SPA in the setup
   page** — visual change with no ADR.
8. **`Plugin::maybe_redirect_to_setup()`** — admin redirect mechanism
   not in CLAUDE.md.

## Decision

Remove all eight. The project owner has not explicitly approved any of
them and CLAUDE.md is the source of truth.

Specifically:

1. Remove the `/health` route.
2. Remove `src/Admin/SetupFallback.php` and the no-JS form in
   `AdminMenu::render_setup`. The setup wizard goes through the REST
   endpoint defined in §11.2 (`POST /admin/setup`) only. If REST is
   blocked, the failure surfaces through the toast — diagnosis is the
   user's job, not our workaround.
3. Remove the `imgsig_redirect_to_setup` transient and its consumer.
   The setup notice in `Notices.php` already directs the user to the
   wizard.
4. Keep the `imgsig_encryption_key` fallback BUT propose adding it to
   CLAUDE.md §5.3 in a separate PR; without it, sites whose
   `wp-config.php` lost their salts cannot save S3 credentials. If the
   project owner rejects the proposal, remove it.
5. Remove the `manage_options` fallback in `BaseController::permission_for`.
   Restore the strict capability check. Activation already grants every
   `imgsig_*` cap to administrator; if a site gets into a state where
   the cap is missing, the right fix is to deactivate + reactivate the
   plugin, not silently weaken authentication.
6. Remove `Plugin::safe()`. CLAUDE.md doesn't ask for boot-time
   try/catch, and silently swallowing exceptions hides the very bugs
   we want to find. Let exceptions propagate; WordPress's fatal-error
   handler already deals with it.
7. Remove the no-JS fallback form from `render_setup`. SPA only.
8. Remove `maybe_redirect_to_setup`. The setup notice + visible
   submenu already provide a discoverable path.

## Consequences

- The plugin matches CLAUDE.md as written. No surprise endpoints, no
  surprise capabilities, no invented options.
- Diagnostic affordances (the `/health` endpoint, the no-JS fallback)
  go away. If we want them back, we add them to CLAUDE.md first.
- The plugin is more brittle in the face of partial installations —
  but partial installations are not a supported state anyway.

## Open proposals (require project owner approval before re-adding)

- Add `imgsig_encryption_key` to §5.3 as a documented fallback option.
- Add `/wp-json/imgsig/v1/health` as a documented diagnostic endpoint.
