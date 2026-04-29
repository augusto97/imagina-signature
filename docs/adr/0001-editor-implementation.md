# ADR-0001: Editor implementation per CLAUDE.md §12

**Status:** Accepted (rebuild)
**Date:** 2026-04-29
**Sprint:** 4 (rebuild)

## Context

Sprint 4 of the roadmap requires a drag-and-drop signature editor.
CLAUDE.md §1.2 lists the locked tech choice:

> Editor | GrapesJS 0.21+ con `grapesjs-preset-newsletter` | Decidido

CLAUDE.md §12 details the integration: GrapesJS init with the preset, 9
custom blocks under `assets/editor/src/editor/blocks/`, panels under
`editor/panels/`, toolbar under `editor/toolbar/`, and a bidirectional
JSON ↔ GrapesJS bridge under `compiler/{grapes-to-json,json-to-grapes}.ts`.

In the prior 1.0.x cycle, the editor was implemented as a click-to-add
palette plus a side properties panel — **not** drag-and-drop and **not**
GrapesJS. This deviated from CLAUDE.md without an ADR, was justified
internally as "pragmatism", and produced an editor the project owner
explicitly rejected ("no es drag and drop, no hay columnas, no guarda
nada, no es muy intuitivo, no es clickeable").

## Decision

Rebuild the editor exactly per CLAUDE.md §12:

- `editor/grapes-config.ts` — `grapesjs.init()` with the
  `grapesjs-preset-newsletter` plugin, scoped to wp-admin and writing
  to no external storage.
- `editor/GrapesEditor.tsx` — Preact wrapper that mounts GrapesJS into
  a host element, owns the lifecycle (init, destroy, on-change), and
  exposes save/load callbacks to the surrounding page.
- `editor/blocks/{avatar,text-stack,social-row,contact-row,divider,
  spacer,button-cta,disclaimer,image-block}.ts` — one file per block.
  Each registers a `blockManager.add()` entry plus a corresponding
  `domComponents.addType()` so the block's traits drive the properties
  panel automatically.
- `editor/panels/{BlocksPanel,PropertiesPanel,LayersPanel,VariablesPanel}.tsx`
  and `editor/toolbar/{DeviceSwitcher,UndoRedo,PreviewToggle}.tsx` —
  thin Preact components that mount under the GrapesJS panel containers.
- `compiler/grapes-to-json.ts` and `compiler/json-to-grapes.ts` — the
  bidirectional bridge between GrapesJS's component tree and our
  `SignatureSchema` JSON. The schema remains the source of truth for
  persistence and compilation.

The previous click-to-add editor is removed (not deprecated, not
toggled — removed) so there is one editor in the codebase.

## Consequences

- The user gets the drag-and-drop UX the spec promised. Blocks click
  to select, drag to reorder, double-click to edit.
- GrapesJS adds ~340 KB gzipped. CLAUDE.md §1.2 already accepts this
  cost ("Decidido"). The dependency is loaded only on the editor
  page; signatures list and templates picker are unaffected.
- The bridge is a new attack surface: invalid GrapesJS components
  could produce invalid JSON. We keep the existing
  `JsonSchemaValidator` (PHP + TS) as the safety net before
  persistence.
- The old block-based UI files (`PropertiesPanel.tsx`, `BlocksPanel.tsx`
  shim, `LayersPanel.tsx`, `CanvasPanel.tsx`, `Preview.tsx`) are
  deleted. Their tests, if any, are deleted too.

## Acceptance criteria

The editor is considered complete when, on a clean WordPress install
with the plugin activated:

1. Opening `/wp-admin/admin.php?page=imagina-signatures-editor` mounts
   GrapesJS with the newsletter preset and the 9 custom blocks visible
   in the Blocks panel.
2. Each of the 9 blocks can be **dragged** from the Blocks panel onto
   the canvas and rendered live.
3. Selecting a block in the canvas opens its properties (traits) in
   the Properties panel.
4. The Layers panel reflects the canvas tree and supports
   show/hide/reorder.
5. The Variables panel lists `{{name}}`, `{{role}}`, … with editable
   values that propagate live to the canvas.
6. The toolbar Device switcher renders Desktop (600px) and Mobile
   (320px) widths.
7. The toolbar Undo/Redo work via GrapesJS's command stack.
8. The toolbar Preview toggle hides the editor chrome and shows the
   compiled signature.
9. Autosave persists the signature JSON via `PATCH /signatures/:id`
   within 1s of an edit.
10. `Copy HTML` and `Export .html` produce identical compiled HTML to
    `compileSignature(schema)` from §7.
11. Loading an existing signature reconstructs the GrapesJS canvas
    such that re-saving produces the same JSON it loaded (round-trip
    stability).
