import { useMemo } from 'react';
import { resolvedVariables } from '@/core/compiler/variables';
import { useSchemaStore } from '@/stores/schemaStore';

/**
 * The variable map the canvas resolves tokens with in "Show data"
 * mode — the compiler's own merge (system `wp_*` / `company_*`
 * variables overlaid with the signature's), recomputed only when the
 * signature's variables change.
 */
export function useCanvasVariables(): Record<string, string> {
  const own = useSchemaStore((s) => s.schema.variables);
  return useMemo(() => resolvedVariables(own ?? {}), [own]);
}
