/**
 * Translation bundle accessor.
 *
 * The host PHP optionally injects a `translations` map onto
 * `IMGSIG_EDITOR_CONFIG`. We don't have one wired yet — until we do,
 * `__()` falls through to the source string. The .po -> JSON pipeline
 * lands in Sprint 12.
 */

interface TranslationConfig {
  translations?: Record<string, string>;
}

export function getTranslations(): Record<string, string> {
  const config = (window as unknown as { IMGSIG_EDITOR_CONFIG?: TranslationConfig })
    .IMGSIG_EDITOR_CONFIG;
  return config?.translations ?? {};
}
