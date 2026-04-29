// End-to-end compilation pipeline.

import type { SignatureSchema } from '@shared/types';
import { compileToMjml } from './json-to-mjml';
import { compileMjml } from './mjml-to-html';
import { inlineCss } from './html-inliner';
import { minifyHtml } from './html-minifier';
import { validateEmailHtml } from './html-validator';

export interface CompileResult {
  mjml: string;
  html: string;
  errors: string[];
  warnings: string[];
  size: number;
}

export async function compileSignature(schema: SignatureSchema): Promise<CompileResult> {
  const mjml = compileToMjml(schema);
  const { html: rawHtml, errors } = await compileMjml(mjml);

  if (rawHtml === '') {
    return { mjml, html: '', errors, warnings: [], size: 0 };
  }

  const inlined = await inlineCss(rawHtml);
  const final = minifyHtml(inlined);

  return {
    mjml,
    html: final,
    errors,
    warnings: validateEmailHtml(final),
    size: new Blob([final]).size,
  };
}

export { compileToMjml, validateEmailHtml };
