# Changelog

All notable changes to Imagina Signatures are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.25] — 2026-05-02

A full audit pass identified and fixed sixteen latent bugs across the editor, the REST backend, the admin app, the build pipeline, and the uninstaller. Three categories:

### Security & data integrity

1. **XSS via Tiptap content (CRITICAL).** `TextBlock.tsx` renderer and `compileText.ts` were both interpolating `block.content` into HTML without sanitisation. The `sanitizeEmailHtml()` helper existed in `core/compiler/sanitize.ts` but was never called. A corrupted JSON row, a tampered template, or a Tiptap regression that let through `<script>` / `onerror` / `javascript:` would have shipped in every export and executed inside the editor (which holds the WP REST nonce). Both call sites now sanitise; `TextBlock` memoises by `block.content`. Defence in depth — Tiptap is one trust layer, the canvas + compiler are now two more.

2. **Attribute-context injection in every block compiler (HIGH).** Image / Banner / Avatar / Button / Social Icons / Contact Row / vCard / banner campaigns all interpolated user-controlled URLs / alt text / labels / colours into HTML attributes without escaping `&`, `<`, `>`, or `"`. Local helpers escaped only `"`. A user with `imgsig_use_signatures` could enter `" onerror="alert(1)" foo="` as alt text and break out of the attribute. Centralised `escapeAttr()` exported from `core/compiler/compile.ts`; every block compiler now uses it for every interpolated attribute.

3. **`SignatureService::create` filter ordering let `data_before_save` hijack ownership (CRITICAL).** `$prepared['user_id'] = $user_id` ran BEFORE `apply_filters('imgsig/signature/data_before_save', …)`, so a third-party plugin (or a future internal bug) could overwrite `user_id` and silently re-assign ownership of a fresh row to another user. Now sets `user_id` AFTER the filter, with an `unset()` to strip any listener-injected value first.

4. **`RateLimitStore::increment` was non-atomic (CRITICAL on hosts with persistent object cache).** Read-modify-write through `get_transient` → `+1` → `set_transient`. Two concurrent requests both observed `count=N` and both wrote `N+1`, advancing the counter by 1 instead of 2. Defeats `upload` (10/min) and `signatures_create` (30/hr) limits. Fixed for hosts with a persistent object cache via atomic `wp_cache_incr()` (Redis Object Cache, Memcached, APCu); transient mirror still written for back-compat with code paths that use `get()`. Documented limitation: hosts WITHOUT an external object cache still race — separate hardening exercise.

5. **`UploadController::finalize` lacked rate-limit + trusted client metadata (HIGH).** The `init` and `direct` paths were rate-limited (10/min), but `finalize` was wide open — an attacker could spam thousands of HEAD + DB-INSERT cycles. Added the same `RL_ACTION` check. Also added a positive `size_bytes` validation (reject 0 or > max).

6. **`S3Driver::verify_object_exists` accepted 3xx as "exists" (HIGH).** S3 misconfiguration / hostile DNS / redirect to an error page would still register the row. Now restricted to 200 / 204 only — combined with `redirection => 0` in the request layer, 3xx is meaningless.

7. **`JsonSchemaValidator` had no block-type allowlist (HIGH).** A block with `type:"system_command"` would persist successfully, polluting the DB and possibly being trusted by third-party renderers. Added `KNOWN_BLOCK_TYPES` covering all 14 shipped block types, with new `imgsig/schema/allowed_block_types` filter for extensions.

8. **Storage credentials option was autoloaded (HIGH).** `update_option(OPTION_CONFIG, $encoded)` used the default `autoload = true`, loading the encrypted S3 credentials blob into the `alloptions` cache on every page load. Now passes `false`.

### Editor correctness

9. **`block.visible === false` was ignored at compile time (CRITICAL).** The Layers panel "eye" toggle visually faded the block but the export still included it. User reports flagged this as "I hid my disclaimer and the recipient still saw it". `compile.ts` and `container/definition.tsx` both now skip blocks where `visible === false`. Hidden children inside a Container are filtered before the half-split so the layout doesn't reflow with empty cells. SortableBlock canvas opacity also drops to 0.35 when hidden.

10. **Undo / redo collapsed to single-step (CRITICAL).** Topbar Undo/Redo and the Cmd-Z keyboard shortcut both called `setSchema(previous)`, which clears the history stack — so one Undo wiped the redo stack and Redo became permanently disabled. New `replaceSchemaForHistory()` action preserves both history stacks AND `hasUserEdited` (undo IS a user edit, autosave should persist it). Topbar + keyboard shortcut both updated.

11. **`moveBlock` corrupted the schema for nested blocks (CRITICAL).** Only walked top-level `state.schema.blocks`. Dragging a block from inside a Container produced one of: silent no-op (source not found), or `splice(-1, 1)` removing the LAST top-level block. `insertBlockBefore` / `insertBlockAfter` / `duplicateBlock` had the same flat-only bug. All four now use `findParentAndIndex` to walk container children.

12. **Container clone re-used child ids (HIGH).** Duplicating a container produced children with ids identical to the original's children, breaking React keys, dnd-kit, and selection. New `reidNestedBlocks()` helper recursively re-stamps every nested id during duplication.

13. **Campaign banner re-rolled on every keystroke (HIGH).** `Math.random()` inside `appendBannerCampaign()` was called from a `useMemo` keyed on `[modal, schema]`, so any edit produced a fresh banner pick. The user clicked "Copy HTML", then "Copy HTML" again, and silently got a different banner. Now picks once per page-load and reuses; rotation still happens between sessions / reloads.

14. **`useSelectionStore()` non-selector destructure caused whole-canvas re-renders (HIGH).** `SortableBlock` and `LayersPanel` both destructured the whole store instead of using granular selectors; every selection / hover change re-rendered every SortableBlock + LayerRow on the canvas, making drag stutter and Tiptap typing feel laggy. Both files now use individual selectors per CLAUDE.md §6.4.

15. **Cmd-S in a focused input fell through to the browser's Save Page As (MEDIUM).** The early-bail on input focus ran BEFORE the Cmd-S handler, so typing in the Name input and pressing Cmd-S triggered the browser's native dialog instead of `persistence.saveNow()`. Cmd-S now handled before the input-focus bail.

16. **Toaster timer leak on manual dismiss (LOW).** Auto-dismiss `setTimeout` ids were not tracked; clicking the X to dismiss a toast left the timer pending, which fired later and called `dismiss(id)` on a missing entry. Per-toast timer Map cleared on manual dismiss.

### Build / lifecycle / housekeeping

17. **Uninstaller leaked three options (HIGH).** `imgsig_brand_palette`, `imgsig_compliance_footer`, `imgsig_banner_campaigns` (all added in 1.0.13 / 1.0.15) were never on the `OPTIONS` constant, so they survived plugin removal. Added to the explicit list AND added a safety-net SQL sweep that DELETEs every remaining `imgsig_*` row from `wp_options` so any future option a patch forgets to declare gets cleaned up.

18. **`.gitignore` swallowed the Vite manifest (HIGH).** `.vite/` matched `build/.vite/` anywhere in the tree, so `build/.vite/manifest.json` (the source of truth for `ManifestReader`) could not be committed. The `ManifestReader` fallback to `editor.js` / `admin.js` was a dead path because Vite always emits hashed filenames — a build without a committed manifest 404'd in production. Added `!build/.vite/` and `!build/.vite/manifest.json` exceptions.

19. **`ManifestReader` fallback was a lie (HIGH).** Returned `editor.js` / `admin.js` when manifest was missing — those URLs don't exist in the build output. Now returns empty string and queues an admin notice ("build manifest missing — re-build the plugin or re-install from a fresh ZIP"). Asset enqueuers refuse to emit a dead `<script>` URL when the manifest can't resolve the entry.

### Defensive UX

20. **Admin pages didn't validate API response shape (MEDIUM).** `SignaturesPage` and `TemplatesPage` cast the response to an array. If the server ever returned a different shape (proxy mangling, future paginated envelope), `items.filter(...)` would throw a confusing "filter is not a function". Both pages now `Array.isArray()`-check and surface a flash banner asking the user to reload.

### Tests added

- `tests/js/compiler/visibility.test.ts` — three regression tests for `block.visible === false` skipping at the top level and inside Containers, plus default-visible behaviour.
- `tests/js/stores/nested-move.test.ts` — four regression tests for `insertBlockAfter`, `moveBlock`, missing-target safety, and `duplicateBlock` on nested blocks.

### Internal

- Editor bundle: 681 KB → 683 KB (gzip 213 KB → 213.47 KB). Negligible — the new escapeAttr helper + sanitise call sites add only a few hundred bytes against the 600 KB target.
- All 30 vitest cases pass (was 23). All TypeScript compiles cleanly under strict mode.
- Plugin version bumped to 1.0.25. After upgrading, hard-refresh the editor to invalidate any cached `editor.[hash].js` — the version pill in the topbar will tell you if the bundle and plugin agree.

## [1.0.24] — 2026-05-02

### Fixed — The `Saved · HH:MM` lie (the headline 1.0.23 bug)

User reported: "no guarda nada ni signatures ni colores del menu de branding en settings". Root cause for the signature half:

The persistence engine's autosave loop was calling `markSaved()` even when no network call had happened. Concretely, on a brand-new signature the user typed something in the topbar Name field. That fired `persistence.scheduleSave()` which set `dirty = true` and armed the 1500ms debounce timer. When the timer fired, `performSave(false)` ran. Inside the loop:

1. `this.dirty = false` (drain at the top of the iteration).
2. `markSaving()` fired → topbar shows "Saving…".
3. `signatureId === 0` AND `schema.blocks.length === 0` → empty-blocks guard hit → `continue`.
4. Loop checked `while (this.dirty)` — now false because of step 1 — and exited.
5. `markSaved()` fired unconditionally on loop exit → topbar showed "Saved · HH:MM" with a fresh timestamp.

The user thought the signature had been saved (the topbar said so), navigated back to the listing, and found nothing. **No POST ever went out.** This had been latent since 1.0.20 and the 1.0.22 / 1.0.23 fixes added more layers around it without addressing the false-positive `markSaved()`.

Three complementary changes:

1. **`wroteAtLeastOnce` flag in `performSave()`.** Tracks whether the loop body actually completed a POST or PATCH. `markSaved()` only fires when the flag is true. When the loop drains via the empty-blocks guard with no network call, we instead call the new `markDrainedNoOp()` action that flips `isSaving` / `isDirty` to false WITHOUT updating `lastSavedAt`. The Save button shows "Save" (idle) instead of the misleading "Saved · HH:MM".

2. **Empty-blocks guard moved ahead of the dirty drain.** The guard now runs BEFORE `dirty = false` and BEFORE `markSaving()`, so a "save attempt with nothing to save" doesn't even flash the spinner. The next real schema mutation will set `dirty = true` again and the next iteration POSTs the whole thing.

3. **Defensive `setSchema` validation in `useLoadSignature`.** The previous `typeof === 'object'` check let through arrays (`Signature::to_array()` falls back to `[]` when the stored `json_content` blob can't be decoded — a bare `[]` would crash the canvas because `schema.blocks` and `schema.canvas` are undefined). The check now requires an object that has a `schema_version` field AND a `blocks` array, with an info-level toast surfaced when the row is unusable so the user knows to start fresh.

### Fixed — Branding palette save: WAF-stripped PATCH + array-key normalisation

User reported branding colours in Settings were not persisting either. Three complementary defences:

1. **`PATCH` accepted via `WP_REST_Server::EDITABLE`.** The `/admin/site-settings`, `/signatures/:id`, `/templates/:id`, and `/admin/storage` routes now register `WP_REST_Server::EDITABLE` (= `POST | PUT | PATCH`) instead of just `'PATCH'`. Some shared-hosting WAFs (LiteSpeed default profile, mod_security CRS, certain Cloudflare configs) silently strip PATCH at the proxy layer — the request never reached WordPress and "Save" silently noopped. The frontend keeps using PATCH; the broader allowlist is a safety net so hosts that block PATCH can still receive the same logical edit via POST.

2. **Array-key-normalised round-trip comparison.** The brand-palette persist verification was using strict `!==` between arrays. Some object-cache backends (Redis Object Cache with igbinary, certain msgpack adapters) coerce numeric array keys to strings during serialise / deserialise, so a strict comparison between `[0=>'#fff']` and `['0'=>'#fff']` would report "persistence failed" even though the data round-tripped. Switched to `array_values($expected) !== array_values($current)` — same correctness guarantee, no false negatives.

3. **`BrandingTab` validates the response shape.** If the server returns a 200 without a `brand_palette` array (proxy mangled the response, alternative response shape from a filter), the UI now surfaces an error banner instead of silently overwriting `palette` with `undefined`. Length-mismatch between sent vs. readback (sanitisation rejected an entry) also surfaces an error so the user knows which colours actually landed.

### Added

- **`tests/js/services/persistence.test.ts`** — three regression tests pinning the contract: autosave on an empty signature drains dirty without setting `lastSavedAt`, a non-empty schema POSTs and updates `lastSavedAt`, and `saveNow()` POSTs even on an empty schema (manual-save path).
- New `markDrainedNoOp()` action on `persistenceStore` for the no-op drain semantics. Documented in the store's interface so future callers don't reach for `markSaved()` by accident.

### Internal

- Editor bundle: 681 KB → 681 KB (gzip 213 KB → 212.62 KB). One new conditional path in the engine; the `markSaved` call is just guarded.
- Plugin version bumped to 1.0.24. After upgrading, hard-refresh the editor (`Ctrl/Cmd + Shift + R`) to invalidate any cached `editor.[hash].js` — the version pill will tell you if the bundle and plugin agree.

## [1.0.23] — 2026-05-02

### Fixed — Manual Save rejecting non-empty canvases

User reported: "no deja guardar ahora, coloco y edito contenido y sale 'Nothing to save yet — add a block first.'"

The empty-blocks guard added in 1.0.22 to stop autosave from POSTing empty rows was also firing on the manual Save button. The two callers — debounced autosave and explicit Save click — were going through the same code path with the same guard, so a Save click that arrived while the engine's `dirty` flag was momentarily `false` (e.g. just after the in-flight autosave's POST returned but before the next mutation flipped it back) would short-circuit and surface "Nothing to save yet" even though the canvas had content.

Two complementary changes:

1. **`performSave(allowEmpty: boolean)` parameter.** The save loop's empty-blocks guard now reads:
   ```ts
   if (!allowEmpty && schema.blocks.length === 0) continue;
   ```
   Autosave (`scheduleSave`) calls `performSave(false)` — guard active, refuses to POST when there's nothing on the canvas, drains the dirty flag without creating a row. Manual save (`saveNow`) calls `performSave(true)` — guard bypassed, always POSTs. The user explicitly clicked Save: that's a deliberate choice, and the engine's job is to honour it, not to second-guess.

2. **`saveNow()` rewritten to handle overlapping saves correctly.** Previous logic could short-circuit on the intermediate `!dirty` state in the middle of an in-flight save:
   - Old: if a user clicked Save during the autosave's POST round trip, `saveNow()` would await the in-flight promise, see `!dirty` (the autosave had already drained it), and return `signatureId=0`.
   - New: await any in-flight save first; if it fully committed (`signatureId > 0 && !dirty`), return immediately with the assigned id; otherwise force `dirty = true` and run another iteration. The engine reads the latest schema/name/status inside the new iteration so any edits made during the in-flight POST land on disk.

3. **Topbar manual-save handler simplified.** The previous version checked the returned `signatureId` and conditionally showed "Nothing to save yet" when it came back as 0. That second-guessing is gone — the handler now shows a "Saved" toast unconditionally on completion (unless the engine surfaced its own error toast). The engine is the source of truth about whether a save happened; the UI shouldn't second-guess.

### Hardened — Branding palette persistence verification

User reported (still): "y en branding no guarda todavía colores, revisa todo tu proceso y vase de datos a ver por qué algo tan sencillo como guardar no te funciona". The 1.0.20 round-trip verification was already in place but the user was still seeing failures. Two reinforcements that should make the next debug session conclusive:

1. **Object-cache invalidation before readback.** `PATCH /admin/site-settings` now calls `wp_cache_delete` for each option key plus the `alloptions` cache before re-reading. Without this, an aggressive object cache (Redis, Memcached) could hand back the value our own `update_option` just primed in the cache layer — a tautology that would mask a real database write failure. Forcing a cache miss makes the readback an actual round trip to disk, which is what verification requires.

2. **`WP_DEBUG`-gated diagnostic log lines.** New `log_update()` helper records each `update_option` call with: option name, whether the value actually changed against the previous stored value, and `update_option`'s raw return value. This produces three distinct log statuses:
   - `WRITTEN` — value changed and DB write succeeded.
   - `NOOP`    — value identical to stored; `update_option` returned false but that's expected.
   - `FAILED`  — value changed but DB write returned false. Bug to find.

   The next time a user reports "the colours don't save", checking the WordPress error log will tell us which option got which status, which categorically distinguishes "the user is on a stale browser cache" from "WP rejected the write" from "the cache layer is hiding a write failure".

### Internal

- New private `log_update()` helper in `SiteSettingsController`. Static, only fires when `WP_DEBUG` is on, no performance impact in production.
- `performSave()` signature changed from `()` to `(allowEmpty: boolean)`. All call sites updated (`scheduleSave` passes `false`, `saveNow` passes `true`).
- `saveNow()` rewritten — no longer has the `dirty=false && id=0 → return 0` short-circuit that produced the false "Nothing to save yet".
- Editor bundle: 681 KB → 681 KB (gzip 213 KB). Identical size; only call-site changes inside the engine.

## [1.0.22] — 2026-05-02

### Fixed — Empty-row creation

User reported (with the cache-bust fix from 1.0.21 already in place): "deleted everything, created one signature, ended up with two empty rows in the listing". Two complementary guards now make it impossible for an empty signature to be POSTed by accident:

1. **`hasUserEdited` flag on the schemaStore.** Every mutation action (`addBlock`, `insertBlockBefore`, `updateBlock`, `deleteBlock`, `duplicateBlock`, `addChildToContainer`, `moveBlock`, `moveBlockUp`, `moveBlockDown`, `moveBlock`, `updateCanvas`, `setVariable`, `removeVariable`, `renameVariable`) flips it to `true` via the new `markEdited(state)` helper that subsumes the old `bumpUpdatedAt`. `setSchema()` clears it because loading is not editing. `useAutosave` gates its `persistence.scheduleSave()` call on this flag, so any indirect schema reference change (template apply, undo replay, useLoadSignature setSchema, future side-effects we haven't predicted) doesn't translate into a POST.

2. **Engine-side guard in `performSave()`.** Even with `hasUserEdited` working, the topbar Name input legitimately calls `persistence.scheduleSave()` directly — a name tweak is a real edit. But it shouldn't create a row whose `json_content.blocks` is empty. The save loop now `continue`s out of the iteration when `signatureId === 0` AND `schema.blocks.length === 0`, draining `dirty` without making the POST. The first time the user adds an actual block, the next iteration goes through normally.

### Added — Name + Status in the editor topbar

Reported as: "no tiene donde editar el nombre de la firma ni cambiar el estado". The static "Imagina Signatures" label is replaced with two inline controls:

- **Name input** — text field, max 120 chars, inherits the topbar's heading typography. Default placeholder "Untitled signature". On focus it gets a subtle border so the user knows it's editable. On change, writes to `persistenceStore.signatureName` + calls `persistence.scheduleSave()`.
- **Status dropdown** — three options (Draft amber, Ready emerald, Archived grey), rendered as a colour-coded pill that visually doubles as a status badge. Same write-through autosave path as the name input.

Loaded signatures populate both fields from the server response (`useLoadSignature` calls a new `hydrateRowMeta({name, status})` action). The save engine reads both at every PATCH/POST, so changes to either are persisted on the next autosave.

### Internal

- New `markEdited(state)` helper in schemaStore replaces the old `bumpUpdatedAt(schema)` helper. Single touchpoint that bumps the timestamp AND flips the dirty flag.
- `persistenceStore` gained `signatureName`, `signatureStatus`, `setSignatureName`, `setSignatureStatus`, `hydrateRowMeta`. Type `SignatureStatus` exported.
- Editor bundle: 679 KB → 681 KB (gzip 212 KB → 213 KB).

## [1.0.21] — 2026-05-01

### Fixed — The reason past fixes appeared not to land

User reported that several fixes shipped over the prior weeks "didn't seem to do anything" after upgrading the plugin. Root cause investigated: the build pipeline emitted entry files without content hashes in the filename (`editor.js`, `admin.js`). Browser, CDN, and page-cache layers cached those URLs aggressively and ignored WordPress's `?ver=` query parameter. Result: the plugin's PHP files updated correctly on disk, but the browser kept executing the previous release's JavaScript.

Two complementary fixes:

- **Hashed filenames + Vite manifest.** `vite.config.ts` now uses `entryFileNames: '[name].[hash].js'` and emits `build/.vite/manifest.json`. The hash is content-derived — every release with a non-trivial code change ships completely different URLs. New `src/Admin/ManifestReader.php` resolves the entry's source-tree path (`assets/editor/src/main.tsx` etc.) to its current hashed output. Both `AdminAssetEnqueuer` and `EditorAssetEnqueuer` ask the reader for the JS + CSS filenames at request time. No cache layer keying on URL can serve a stale bundle, because the URL itself is brand new.

- **Build-time / runtime version reconciliation.** Vite reads `IMGSIG_VERSION` from `imagina-signatures.php` at build time (small regex inside `vite.config.ts`) and exposes it as `__BUNDLE_VERSION__` via the `define` config. The PHP bootstrap injects the request-time `IMGSIG_VERSION` as `IMGSIG_EDITOR_CONFIG.pluginVersion`. The topbar's version pill now compares both:
  - Match → quiet grey `v1.0.21`.
  - Mismatch → red **clickable** "stale bundle" pill: `v1.0.20 → 1.0.21 ↻`. Click hard-refreshes with a unique `imgsig_cache_bust=<timestamp>` query string. The next time the user thinks an upgrade didn't take, the editor tells them directly instead of leaving them guessing.

### Internal

- `scripts/build-zip.sh` had `--exclude='.vite'` which would have excluded the manifest from the distribution ZIP. Removed.
- Editor bundle: 678 KB → 679 KB (gzip 212 KB). Slightly different filename encoding, same content size.

## [1.0.20] — 2026-05-01

### Changed — Persistence engine rewritten from scratch

After multiple iterative bug fixes (1.0.7, 1.0.8, 1.0.19), the `persistenceEngine.ts` design — which coalesced saves via a chain of `.finally(scheduleAutosave)` callbacks — kept producing edge-case races. Symptoms reported by the user: a single new signature would create two empty rows in the listing; edits made during a quick navigation would silently drop. The old engine is **deleted**.

The new `assets/editor/src/services/persistence.ts` uses a different model that's correct by construction:

- **One save at a time.** A single `inFlight: Promise<void> | null`. While a save is running, no other save can start.
- **Self-coalescing internal loop.** The save body is `while (dirty) { dirty = false; await save(); }`. Any change that lands during a save iteration sets `dirty = true` and is picked up on the next iteration of the SAME loop. No promise chains.
- **`saveNow()` is just `clearTimeout + performSave + await`.** If `performSave` is already running, `saveNow` awaits it. The in-flight loop will see `dirty = true` and run another iteration before exiting.
- **Empty-schema POST refused.** If the user clicks Save with nothing edited and no signature id yet, `saveNow` returns `0` without POSTing. That path is what produced the "two empty rows" symptom in earlier versions.

Same public surface as before (`initialize`, `resetToNew`, `scheduleSave`, `saveNow`, `hasPending`) — only the internals changed. `useAutosave`, `useLoadSignature`, `Topbar`, `useKeyboardShortcuts`, and the back-arrow click handler were all updated to import from `'@/services/persistence'`.

### Fixed — Branding palette save not persisting

Reported as: "tampoco en los ajustes del plugin guarda los cambios de color en branding". Two changes:

1. **Storage format**. Brand palette + banner campaigns were being stored as JSON-encoded strings (`update_option(OPT, wp_json_encode($value), false)`). That detour adds an encode/decode layer for no benefit and made silent corruption invisible. Switched to native PHP arrays — `update_option` runs `maybe_serialize` automatically. Compliance footer was always stored as a native array; this aligns the three options. Readers stay back-compat with legacy JSON-string values from 1.0.13–1.0.19, and the next write normalises to native.
2. **Round-trip verification**. After `update_option` runs in `PATCH /admin/site-settings`, the controller re-reads the option and compares it against what the client sent. If they differ (silent `update_option` failure, conflicting filter, broken object cache), the endpoint returns a 500 with `{sent, readback}` payload instead of the misleading "Saved" toast — so the next time something silently fails, the user sees an actionable error.

### Internal

- Editor bundle: 679 KB → 678 KB (gzip 211 KB) — slightly smaller because the new engine has less code than the old one.
- Plugin version pill in the topbar bumped to `v1.0.20`. After upgrading, hard-refresh (Ctrl/Cmd + Shift + R) to invalidate cached `editor.js`.

## [1.0.19] — 2026-05-01

### Fixed

- **Persistence race that ate the user's most recent edits.** Reported as: "guardé una de las firmas y me generó otra cuando regresé al listado, y cuando volví a entrar estaba vacía". Reproducible flow:
  1. User opens a fresh signature (`?id=0`).
  2. Adds Block A → eager-first POST goes out and starts returning (200–500 ms latency).
  3. **While that POST is in flight**, adds Block B → `runSave()` hits the `inFlight !== null` guard and chains `this.inFlight.finally(() => this.scheduleAutosave())` — so the second save is queued to fire AFTER the POST settles.
  4. User clicks the back-arrow → `flushNow()` awaits the in-flight POST, then exits.
  5. The promise settles in this order: IIFE's internal `finally` clears `this.inFlight = null` → externally-attached `.finally(scheduleAutosave)` runs → schedules a 1500 ms timer for Block B's PATCH → `flushNow`'s `while (this.inFlight)` loop sees `null` and exits → page navigates → 1500 ms timer is cancelled by page unload → **Block B is never written**.
  6. User returns to listing, sees signature #42 with only Block A. Re-enters → looks empty (or close to it, depending on which edits were in flight when they navigated).

  Fix: `flushNow()` now loops until both `pendingTimer` AND `inFlight` are clear, with a 5-iteration safety cap. After each `await this.inFlight`, the externally-attached `.finally` callbacks have already run and may have set a new `pendingTimer` — the loop catches it, fires the save immediately, awaits, and re-checks.

### Added

- **Manual Save button** in the topbar (right side, next to the back-arrow status was previously). Five visual states picked in priority order:
  1. `Saving…` with a spinning loader, disabled.
  2. `Retry save` in red when the last save errored.
  3. `Save` in accent blue when the document is dirty.
  4. `Saved · 14:32` in subtle emerald with a checkmark + last-save timestamp.
  5. `Save` in outline when the document has never been saved yet.

  Click runs `persistenceEngine.saveNow()` — a new public method that forces `markDirty` + `flushNow` + (if no save fired) one more pass + awaits the whole chain. Resolves with the assigned signature ID so the topbar can show a "Saved" toast for confirmation. `Cmd/Ctrl + S` already triggered this path since 1.0.8 — now it's also a visible button.

- **First-save toast announces the assigned signature ID.** When a brand-new signature's first POST returns successfully, the engine fires a `Saved as signature #42` success toast. Concrete confirmation that a row was created — eliminates the "did the autosave actually fire?" anxiety.

- **Plugin version pill** in the topbar's brand area (`v1.0.19` as a small uppercase chip). If the editor displays the wrong version after a plugin upgrade, the browser is serving cached JS / CSS — hard-refresh (`Ctrl/Cmd + Shift + R`) to invalidate. Worth keeping permanently as a debugging aid.

### Changed

- Editor bundle: 676 KB → 679 KB (gzip 210 KB → 212 KB) — under the 600 KB gzip target.

## [1.0.18] — 2026-05-01

### Fixed

- **Button block invisible in non-Outlook clients.** Reported as "no se ve el bloque de botón en algunas vistas previas." The Button block compiles to a downlevel-revealed conditional comment for non-Outlook clients:

  ```html
  <!--[if !mso]><!--><a href="…">Book</a><!--<![endif]-->
  ```

  The pair `<!--[if !mso]><!-->` … `<!--<![endif]-->` is mandatory: the inner `<!-->` ends the comment in non-Outlook so the `<a>` becomes visible, and the closing `<!--<![endif]-->` re-opens a comment in non-Outlook just to terminate the Outlook conditional. The minifier in `core/compiler/minify.ts` only protected comments that **opened** with `<!--[if`, so it stripped the `<!--<![endif]-->` closer (which opens with `<!--<`), leaving an orphaned `<!--[if !mso]>` that swallowed everything after it as one long unterminated comment in non-Outlook clients. The button — and anything that came after it — disappeared from the multi-device preview, "Copy visual" paste, and any non-Outlook email client.

  Same root cause hit the `static_fallback_url` `<img>` swap shipped in 1.0.16 (Image / Banner blocks with GIF fallback for old Outlook).

  Fix: minifier now extracts every conditional comment block (matched from `<!--[if …]>` to the corresponding `<![endif]-->`) into a placeholder before stripping plain comments, then restores the blocks verbatim. Both downlevel-hidden (`<!--[if mso]>…<![endif]-->`) and downlevel-revealed forms survive intact.

### Added

- `tests/js/compiler/minify.test.ts` — seven regression tests covering plain-comment stripping, both conditional comment forms, the full Button compile-output roundtrip, whitespace collapse rules, and the two-siblings-must-not-merge case.

## [1.0.17] — 2026-05-01

### Added

- **"Copy visual" button** in the Export modal. Copies the rendered signature with a `text/html` MIME type so the OS clipboard carries rich content — pasting into a rich-text composer (Gmail compose, Outlook signature box, Apple Mail compose, Word, anywhere with a `contenteditable`) renders the signature visually instead of dumping the source. The use case is the inverse of "Copy HTML": a lot of webmail platforms don't expose an HTML / source-code mode in their signature settings, only a rich-text editor — those refuse a raw HTML paste and would render `<table>...` as literal text. "Copy visual" works there.
- New `assets/editor/src/utils/clipboard.ts` with two helpers:
  - `copyText(text)` — `navigator.clipboard.writeText` with a textarea + `execCommand('copy')` fallback for old browsers / restricted iframe contexts. Used by "Copy HTML".
  - `copyRichHtml(html)` — `navigator.clipboard.write([new ClipboardItem({ 'text/html': blob, 'text/plain': blob })])` for the modern path; falls back to rendering the HTML into a hidden `contenteditable`, selecting it, and `execCommand('copy')` so the OS captures the rich selection. Both MIME types are written so a recipient who pastes into a plain-text field still gets readable content (a stripped-tags fallback derived from the HTML).

### Changed

- Per-client install tabs now flag which copy mode the steps assume via a small uppercase pill next to the deep-link button (`Use Copy visual` for Gmail / Outlook / Apple Mail; `Use Download .html` for Thunderbird, whose file-attached signature flow needs the raw HTML on disk). Each step list was rewritten so the first step explicitly says "Press Copy visual above" / "Press Download .html above" — no ambiguity about which of the four header buttons to start with.
- Editor bundle: 674 KB → 676 KB (gzip 210 KB) — under the 600 KB gzip target.

## [1.0.16] — 2026-05-01

### Added — Track 5 (alternative path): install flow + GIF polish

OAuth deploy (Track 5.C2 in the original roadmap) was reconsidered and replaced with a polished copy-and-install flow. OAuth requires every WP admin to register a Google Cloud project + an Azure AD app (≈1h each), then their end users' IT departments to whitelist those apps for corporate accounts — which most enterprise IT departments simply refuse. Google's "sensitive scopes" verification adds 4–8 weeks before unverified-app warnings disappear. Copy-and-install covers 95%+ of installations (per HiHello / MySignature usage data) without any of that overhead, so we're doing that path right instead.

- **ExportModal redesigned**. Three primary actions in a single header row: **Copy HTML** (the existing flow, now with bigger affordance + green "Copied!" state), **Send to my email** (new), **Download .html** (existing). Below: per-client install tabs.
- **Send to my email**. New `POST /signatures/test-send` REST endpoint that takes the compiled HTML in the request body and dispatches via `wp_mail` to the current WP user's own `user_email` only — never accepts an arbitrary `to` address, so the endpoint can't be turned into a spam channel by a compromised account. Rate-limited at 6 sends per hour per user. The body wraps the signature in a tiny intro shell that explains what the recipient is looking at.
- **Per-client install tabs** (Gmail / Outlook Web / Outlook Desktop / Apple Mail / Thunderbird). Each tab shows a deep-link button — `https://mail.google.com/mail/u/0/#settings/general` for Gmail, `https://outlook.live.com/mail/0/options/mail/messageContent` for Outlook Web — that opens the client's signature settings screen directly so the user doesn't have to dig through menus. Below the deep-link, 5 numbered paste-here steps tuned per client (the Apple Mail steps mention the "Always match my default message font" gotcha; the Thunderbird steps explain the "attach signature from a file" workflow because Thunderbird's HTML signature support is awkward).

### Added — GIF polish

GIFs already worked as image URLs in any image-accepting block (Image, Avatar, Banner, banner campaigns) because they're just `<img src="…">`. This release adds the polish around them:

- **`static_fallback_url`** field on `ImageBlock` and `BannerBlock`. Only surfaces in the property panel when the current `src` looks like a GIF (extension sniff after stripping query string). When set, the compile pipeline emits the standard `<!--[if mso]>` conditional swap so Outlook 2007–2019 — which freezes animated GIFs on the first frame, often a transparent placeholder — shows the static PNG instead, while every modern client (Gmail, Apple Mail, Outlook 365) keeps the animated original.
- **Cropper warning**. `ImageCropperModal` now detects a GIF source and shows an amber warning above the apply button: cropping renders the chosen region onto a canvas and exports as PNG, which silently kills the animation. The warning gives the user a chance to cancel and resize the GIF in another tool first.
- New exported helpers `isAnimatedGif(src)` and `withOutlookFallback(...)` from `core/blocks/image/definition.tsx` so the Banner block reuses the same conditional-swap markup as Image. (Future: extend banner campaigns and Avatar with the same fallback, deferred until a user actually files for it.)

### Changed

- Editor bundle: 664 KB → 674 KB (gzip 207 → 210 KB) — under the 600 KB gzip target.

## [1.0.15] — 2026-05-01

### Added — Track 4: banner campaigns with rotation + scheduling

- **Site-wide banner campaigns**. New option `imgsig_banner_campaigns` storing up to 50 campaigns. Each campaign is a strict shape: `id` / `name` / `enabled` / `image_url` / `link_url` / `alt` / `width` / `start_date` / `end_date`. URLs are `esc_url_raw`'d, dates accept `YYYY-MM-DD` only (regex-validated to keep date arithmetic simple), width is clamped to 100–800px.
- **Random rotation in the compile pipeline**. `appendBannerCampaign()` reads the editor bootstrap's `bannerCampaigns` (already filtered to active by the server), picks one at random with `Math.random()`, and inserts it as a new `<tr><td>` row inside the outer email-shell table — so the banner inherits the canvas width and centring without breaking the existing layout. Re-running `compileSignature()` re-runs the pick, so each export cycles through active banners. Position: between the user's signature content and the compliance footer (the footer always wants to be the last thing the recipient sees).
- **Server-side scheduling**. New static `SiteSettingsController::active_banner_campaigns()` returns only campaigns that are enabled AND inside their date window (or have no window) AND have a non-empty image URL. Compared against `current_time( 'Y-m-d' )` so the timezone matches the site's. The compiler never has to know about scheduling — the editor bootstrap pre-filters.
- **Admin Settings → Campaigns tab**. Fourth tab in the Settings page. Per-campaign card with: status pill (Active green / Scheduled amber / Expired grey / Disabled grey), inline name + enabled toggle, image URL / link URL / alt / width fields, start / end date pickers, and a live preview of the banner. Add / remove / save-all in bulk via a single "Save campaigns" button — admins can tune multiple entries without one PATCH per keystroke.

### Changed

- `SiteSettingsController::current_settings()` now returns `banner_campaigns` (full list, for admin) alongside the existing `brand_palette` and `compliance_footer`.
- `EditorAssetEnqueuer` injects only the `active_banner_campaigns()` slice; `AdminAssetEnqueuer` injects the full list (admin needs disabled / scheduled / expired entries to edit them).
- Editor `compileSignature()` runs `appendBannerCampaign()` BEFORE `appendComplianceFooter()` so visually banner sits above the disclaimer.

## [1.0.14] — 2026-05-01

### Added — Track 3 (round 2): role-scoped templates + bulk apply

- **Templates por rol**. New `visible_to_roles` column on `imgsig_templates` (`VARCHAR(500) NULL`, comma-separated WP role slugs). Empty / NULL = visible to everyone with `imgsig_use_signatures`; populated = only users with at least one matching role see the template in the editor's TemplatePicker. Admins with `imgsig_manage_templates` always see every template regardless of their own role membership. New schema migration `1.1.0` adds the column via dbDelta (idempotent — safe to re-run on already-migrated installs because dbDelta diffs against the live schema).
- **Bulk apply**. New `POST /admin/templates/:id/apply` endpoint accepting `scope` = `all` | `role:slug` | `users:1,2,3` and `skip_existing` (default `true`). Creates a new signature for each user in scope, seeded with the template's `json_content` and stamped with `template_id`. Does not modify existing signatures. `skip_existing` suppresses creating a duplicate row for any user that already has a signature with that `template_id` — re-running the same apply is safe and idempotent. New action `imgsig/template/bulk_applied` fires with the counts so other plugins can audit / notify.
- **Admin Templates UI**. Each card now shows a visibility chip (green "All roles" badge or up to 3 per-role accent chips, "+N" overflow) plus per-card **Edit** and **Apply** buttons (admin-only). The Edit modal exposes a Visible-to-roles field as a row of toggle chips (Administrator / Editor / Author / Contributor / Subscriber). The Apply modal walks the admin through scope selection (radio + dependent input) and shows a created / skipped / failed summary after the request lands.

### Changed

- `TemplatesController` constructor now also takes `SignatureService` + `SignatureRepository` (needed for bulk-apply's per-user signature creation + dedupe). DI wiring updated.
- `TemplatesController::index` filters by current user's roles for non-admins via the new `visible_to_roles` query arg on `TemplateRepository::list()`.
- `Template` model gains a `visible_to_roles: string[]` field that round-trips through the comma-separated DB column. Repository's `insert` / `update` write the new column; the service's `prepare_for_save` sanitises each slug with `sanitize_key` and dedupes.
- `SignatureRepository::user_has_signature_from_template(user_id, template_id)` — fast `COUNT(*)` used by bulk-apply to detect dupes without round-tripping all rows.

## [1.0.13] — 2026-05-01

### Added — Track 3 (round 1): WordPress-native team primitives

These three features rely on WP's native user / option model — none of them require a SaaS dependency or external directory sync, which is what Exclaimer / Newoldstamp charge for.

- **Auto-merge from `wp_users` / `wp_user_meta`**. Read-only `wp_*` system variables auto-populate from the current user's record (`display_name`, `user_email`, `first_name`, `last_name`, `user_url`). Injected into the editor bootstrap via a new `IMGSIG_EDITOR_CONFIG.systemVariables` field; the right-sidebar Variables editor surfaces them as locked rows above the user-defined ones (with a small lock icon and a copy-token affordance). The compile pipeline merges system variables with `schema.variables` at substitution time — user-defined variables win on key collision so anything the user types takes precedence. New filter `imgsig/editor/system_variables` lets host plugins expose custom `user_meta` keys (departments, employee IDs, internal phone extensions) without touching the core code.
- **Brand palette**. New site-wide option `imgsig_brand_palette`: up to 12 hex colours, normalised + deduped. Surfaces in every editor `ColorInput` as a row of small clickable swatches below the picker — single-click to apply. Edited in the admin Settings page's new Branding tab (live preview, hex input + native colour picker, "Use starter palette" shortcut for fresh installs).
- **Compliance footer**. New site-wide option `imgsig_compliance_footer` = `{ enabled: bool, html: string }`. When enabled, the compile pipeline appends the HTML inside the outer email-shell `<table>` so it inherits the same width / centring as the signature body. HTML is `wp_kses_post`-sanitised server-side (admin-only write cap, but defence-in-depth). Edited in the admin Settings page's new Compliance tab, with toggle + textarea + live preview + GDPR / CAN-SPAM starter templates.

### Changed

- New `SiteSettingsController` with `GET/PATCH /admin/site-settings`. Read access gated on `imgsig_use_signatures` (so the editor can fetch its own bootstrap), write gated on `imgsig_manage_storage`.
- Settings page is now tabbed (Storage / Branding / Compliance). The original Storage form moved into the first tab unchanged. Each tab owns its own data round-trip so a slow storage probe never blocks the branding tab.
- `EditorAssetEnqueuer` and `AdminAssetEnqueuer` now inject the site settings (palette + footer) into their respective bootstrap configs.
- Editor `compileSignature()` reads `getConfig().complianceFooter` and `getConfig().systemVariables` defensively (falls back gracefully when the bootstrap is missing — matters for tests / standalone preview).

## [1.0.12] — 2026-05-01

### Added — Track 2: visual polish

- **Image cropper**. New `ImageCropperModal` (wraps `react-easy-crop`, ~30KB) wired into both Image and Avatar property panels via a "Crop image" button. Avatar opens it locked to 1:1 with a round crop overlay; Image opens it free-aspect rectangular. The cropper renders the chosen region onto an offscreen canvas and writes a data URI back to the block's `src`. Old Outlook builds may strip data URIs — admins can still upload an external URL and paste it instead.
- **Template picker filtering**. The editor's `TemplatePicker` modal grew a search field that matches against name + description and a horizontal category-chip strip derived from the loaded templates so admin-added categories surface automatically. Templates carry a small uppercase category badge in their card. Per-row hover styling tightened.
- **Multi-device preview**. `PreviewModal` now exposes Desktop (720px) / Tablet (480px) / Mobile (360px) device presets that lock the iframe width so the user can see how the signature reflows at each breakpoint. The header gains: a payload-size pill that turns amber when the compiled HTML crosses Gmail's 102KB clipping threshold, and a collapsible compile-warnings panel that lists every issue the compiler flagged — missing alt / width / href, undefined `{{variables}}`, oversized images, etc.

### Changed

- Added `react-easy-crop` as a runtime dependency.
- Editor bundle: 631 KB → 663 KB (gzip 198 KB → 207 KB) — under the 600 KB gzip target.

## [1.0.11] — 2026-05-01

### Added — Track 1: premium feature parity round 1

Five additions that close the gap with HiHello / WiseStamp / Newoldstamp on the basic capability surface — none of them require a third-party SaaS or new external service.

- **QR Code block** (`type: 'qr_code'`). Encodes any string — URL, mailto:, tel:, full vCard — and renders as a base64 PNG `<img>` so the email payload is fully self-contained, no external CDN, no upload-on-save round trip. Custom foreground / background colours via an offscreen `<canvas>` because `qrcode-generator`'s built-in `createDataURL` is mono-colour only. ~5KB gzipped from the `qrcode-generator` dependency.
- **Banner block** (`type: 'banner'`). Promotional image with a click-through link. Different from the existing Image block in defaults (600px wide to match the canvas, 8px vertical padding, lives in the same Content category but with its own Megaphone icon) — gives admins a clear marketing surface without overloading Image.
- **vCard block** (`type: 'vcard'`). Renders a "Save my contact" link whose `href` is a `data:text/vcard;charset=utf-8;base64,…` URI built from the block's name / organization / title / email / phone / website fields. Strict RFC 6350 vCard 3.0 output (CRLF line endings, escaped delimiters, structured `N:` line). Recipients click → contact opens in Apple Contacts / Outlook / Google Contacts. data: URIs in `href` are widely supported (Gmail web/app, Apple Mail, Outlook 365, Thunderbird); old Outlook may strip them so admins can pair with a QR Code block carrying the same vCard string for full coverage.
- **"Save signature as template"** (admin-only). New topbar button visible to users holding `imgsig_manage_templates`. POSTs the current schema to `/templates` with user-supplied name / category / description. Closes the loop — admins can now seed real templates from the editor instead of creating empty shells from the admin Templates page.
- **Variables editor**. The schema's `variables: Record<string, string>` bag finally has a UI: sits in the right sidebar below Typography when nothing is selected. Add / rename / remove pairs, copy the `{{token}}` to clipboard, and the compiler substitutes `{{varname}}` → HTML-escaped value at the very end of the pipeline (post block-compile, before minify, so any string field — content, alt, href, label — gets resolved). Missing names ship as literal text and surface as compile warnings, so a typo can't silently delete content.

### Changed

- Added `qrcode-generator` (~5KB) as a runtime dependency. No external CDN; the lib is bundled into `editor.js`.
- Editor bundle: `editor.js` 587 KB → 631 KB (gzip 184 KB → 198 KB) — well under the 600 KB gzip target in CLAUDE.md §2.3.
- `schemaStore` gained `removeVariable(key)` and `renameVariable(old, new)` actions.

## [1.0.10] — 2026-05-01

### Added

- Container column widths are tunable. `ContainerBlock` gained an optional `left_width` field (percentage of the left column when `columns === 2`; right column is `100 - left_width`). Range 10–90, default 50, optional for back-compat — rows saved before this field default to an even split at render / compile time. Both the canvas Renderer and the email-safe `compile()` honour the value, so the WYSIWYG promise holds for nested columns too.
- Properties panel gets a Column-widths control with three modalities: a live preview bar (two strips sized to match the cells), a 10–90% range slider, and a row of preset buttons (1/4, 1/3, 1/2, 2/3, 3/4) for the common cases like a logo cell on the left + a content cell on the right.

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
