# ADR-0003: Use `zustand/vanilla` + a Preact-native hook

**Status:** Accepted
**Date:** 2026-04-29

## Context

CLAUDE.md §1.2 pins **Zustand 4+** as the state library. The default
`zustand` entrypoint imports `use-sync-external-store/shim/with-selector`,
which calls React 18's `useSyncExternalStore`. Preact 10's `compat`
shim re-exports `useSyncExternalStore` (since 10.11), but the
`with-selector` shim and Preact 10's hook scheduling combine into a
known crash:

```
Uncaught (in promise) TypeError: Cannot read properties of null (reading '__H')
  at <component render>
```

Reproduced on every install when any component reads from a Zustand
store via the React selector hook.

## Decision

Use `zustand/vanilla` (the pure store API; same package, no React
glue) and ship our own **2-hook** wrapper (`useState` + `useEffect`)
that subscribes to the store. Public surface mirrors `zustand`'s
`create()` so call-sites stay identical:

```ts
import { create } from './stores/createStore';
const useEditorStore = create<EditorState>((set) => ({ ... }));
const value = useEditorStore((s) => s.value);
```

The wrapper lives at `assets/editor/src/stores/createStore.ts`.

## Consequences

- We stay on Zustand 4 — same package, same store semantics, same
  middleware compatibility (devtools, persist, etc., all live in
  `zustand/middleware` and operate on the vanilla store).
- We avoid `use-sync-external-store` and its Preact-incompatible
  scheduling.
- The custom hook is tiny (~30 LoC) and is the only place that knows
  the editor uses Preact rather than React. CLAUDE.md §1.2 already
  says "Preact 10 (alias `react` → `preact/compat`)" — this ADR is
  consistent with that direction.
- If a future sprint switches to React, a 5-line edit to
  `createStore.ts` (re-export `create` from `zustand`) reverts the
  workaround.

## Acceptance criteria

- All existing stores (`editorStore`, `userStore`) compile against the
  new `create` import.
- The editor renders without `Cannot read properties of null` on a
  fresh page load.
- `tsc --noEmit` and `npm test` stay clean.
