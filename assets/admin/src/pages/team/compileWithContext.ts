import type { SignatureSchema } from '@/core/schema/signature';
import type { CompileResult } from '@/core/compiler/compile';
import type { AppConfig } from '@/bridge/types';
import { __ } from '@admin/i18n';
import type { RenderContext } from './types';

/** The editor's compiler entry point. */
export type Compiler = (schema: SignatureSchema) => CompileResult;

/**
 * Loads the editor's compiler and block registry on demand (a separate
 * chunk: the admin bundle only pays for it when someone recompiles), as
 * the Exchange rule generator does.
 */
export async function loadCompiler(): Promise<Compiler> {
  const [{ compileSignature }] = await Promise.all([
    import('@/core/compiler/compile'),
    import('@/core/blocks'),
  ]);
  return compileSignature;
}

function isSchemaLike(value: unknown): value is SignatureSchema {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Array.isArray((value as { blocks?: unknown }).blocks) &&
    typeof (value as { canvas?: unknown }).canvas === 'object'
  );
}

type ConfigHost = { IMGSIG_EDITOR_CONFIG?: Partial<AppConfig> };

/**
 * Compiles another user's signature exactly as THEIR editor would: the
 * compiler reads its system variables, compliance footer, campaigns,
 * profile field keys, output language and icon base URL from
 * `window.IMGSIG_EDITOR_CONFIG`, so for the duration of the (synchronous)
 * compile that global holds the owner's render context, then whatever
 * was there before is put back.
 *
 * Returns the fragment and plain text the editor stores on save
 * (`compileForServer`). Throws when the context has no usable schema
 * or the compiler throws.
 */
export function compileWithContext(
  compile: Compiler,
  context: RenderContext,
): { html: string; text: string } {
  if (!isSchemaLike(context.json_content)) {
    throw new Error(__('This signature has no readable content.'));
  }

  const host = window as unknown as ConfigHost;
  const hadConfig = Object.prototype.hasOwnProperty.call(host, 'IMGSIG_EDITOR_CONFIG');
  const previous = host.IMGSIG_EDITOR_CONFIG;

  host.IMGSIG_EDITOR_CONFIG = {
    ...(previous ?? {}),
    locale: context.locale,
    signatureLocale: context.locale,
    systemVariables: context.systemVariables ?? {},
    complianceFooter: context.complianceFooter ?? { enabled: false, html: '' },
    bannerCampaigns: context.bannerCampaigns ?? [],
    profileFields: context.profileFields ?? [],
    pluginUrl: context.pluginUrl ?? previous?.pluginUrl ?? '',
  };

  try {
    const result = compile(context.json_content);
    return { html: result.fragment, text: result.text };
  } finally {
    if (hadConfig) {
      host.IMGSIG_EDITOR_CONFIG = previous;
    } else {
      delete host.IMGSIG_EDITOR_CONFIG;
    }
  }
}
