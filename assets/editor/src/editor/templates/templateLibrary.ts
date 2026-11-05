import type { SignatureSchema } from '@/core/schema/signature';
import type { TemplateRow } from '@/stores/templateLibraryStore';
import { templateCategoryLabel } from '@shared/templateCategories';

/** Whether a row's `json_content` can be applied (an object with a blocks array). */
export function isUsableTemplate(schema: unknown): schema is SignatureSchema {
  return (
    schema !== null &&
    typeof schema === 'object' &&
    !Array.isArray(schema) &&
    Array.isArray((schema as { blocks?: unknown }).blocks)
  );
}

/** Categories present in `templates`, sorted by their translated label. */
export function templateCategories(templates: readonly TemplateRow[]): string[] {
  const set = new Set<string>();
  for (const t of templates) if (t.category) set.add(t.category);
  return Array.from(set).sort((a, b) =>
    templateCategoryLabel(a).localeCompare(templateCategoryLabel(b)),
  );
}

/**
 * Templates in `category` (`all` = every one) whose name, description
 * or category — slug or translated label — contains `search`, ignoring
 * case and accents.
 */
export function filterTemplates(
  templates: readonly TemplateRow[],
  category: string,
  search: string,
): TemplateRow[] {
  const needle = fold(search.trim());
  return templates.filter((t) => {
    if (category !== 'all' && t.category !== category) return false;
    if (needle === '') return true;
    return [t.name, t.description ?? '', t.category, templateCategoryLabel(t.category ?? '')].some(
      (field) => fold(field).includes(needle),
    );
  });
}

function fold(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
