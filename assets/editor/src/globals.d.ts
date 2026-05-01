/**
 * Build-time globals injected by Vite's `define` config.
 *
 * `__BUNDLE_VERSION__` is the plugin version pulled from
 * `imagina-signatures.php`'s `IMGSIG_VERSION` constant. Baked
 * into the bundle at build time so the editor can compare its
 * compile-time version against the runtime
 * `IMGSIG_EDITOR_CONFIG.pluginVersion` and warn the user when
 * their browser is serving cached editor.js after a plugin
 * upgrade.
 */
declare const __BUNDLE_VERSION__: string;
