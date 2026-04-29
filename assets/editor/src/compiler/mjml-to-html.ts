// Wraps `mjml-browser`. The library is loaded lazily so the editor can
// boot before the (~250 KB gzipped) MJML payload is fetched.

export interface MjmlCompileResult {
  html: string;
  errors: string[];
}

interface MjmlError {
  formattedMessage?: string;
  message?: string;
}

interface MjmlOutput {
  html: string;
  errors: MjmlError[];
}

type MjmlFn = (mjml: string, options?: Record<string, unknown>) => MjmlOutput;

let cachedFn: MjmlFn | null = null;

async function loadMjml(): Promise<MjmlFn> {
  if (cachedFn) return cachedFn;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore — mjml-browser is loaded lazily and may not be installed yet.
  const mod = await import(/* @vite-ignore */ 'mjml-browser');
  const fn = (mod.default ?? mod) as MjmlFn;
  cachedFn = fn;
  return fn;
}

export async function compileMjml(mjml: string): Promise<MjmlCompileResult> {
  try {
    const fn = await loadMjml();
    const result = fn(mjml, { validationLevel: 'soft', keepComments: false, minify: false });
    return {
      html: result.html,
      errors: (result.errors ?? []).map((e) => e.formattedMessage ?? e.message ?? 'Unknown MJML error'),
    };
  } catch (error) {
    return { html: '', errors: [(error as Error).message] };
  }
}
