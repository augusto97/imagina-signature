// Inlines `<style>` rules into element `style=""` attributes via `juice`.
// Loaded lazily for the same reason as `mjml-browser`.

type JuiceFn = (html: string, options?: Record<string, unknown>) => string;

let cached: JuiceFn | null = null;

async function loadJuice(): Promise<JuiceFn> {
  if (cached) return cached;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore — juice is loaded lazily.
  const mod = await import(/* @vite-ignore */ 'juice/client');
  const fn = (mod.default ?? mod) as JuiceFn;
  cached = fn;
  return fn;
}

export async function inlineCss(html: string): Promise<string> {
  try {
    const juice = await loadJuice();
    return juice(html, {
      removeStyleTags: true,
      preserveMediaQueries: true,
      preserveImportant: true,
      applyAttributesTableElements: true,
      applyWidthAttributes: true,
    });
  } catch {
    return html;
  }
}
