// GrapesJS bootstrap (per CLAUDE.md §12.1).
//
// Initializes GrapesJS with the `grapesjs-preset-newsletter` plugin, scoped
// to the host element provided by the Preact wrapper. We disable GrapesJS'
// own storage manager because the signature JSON schema (CLAUDE.md §6) is
// the source of truth — persistence is handled by the surrounding page via
// the bridge (compiler/grapes-to-json.ts and json-to-grapes.ts).

import grapesjs, { type Editor, type EditorConfig } from 'grapesjs';
import grapesjsNewsletter from 'grapesjs-preset-newsletter';
import 'grapesjs/dist/css/grapes.min.css';
import { __ } from '../i18n/helpers';
import { registerCustomBlocks } from './blocks';

export interface InitOptions {
  /** Host element. Must be in the DOM at call time. */
  container: HTMLElement;
  /** Container for the Blocks panel. */
  blocksContainer: HTMLElement;
  /** Container for the Layers panel. */
  layersContainer: HTMLElement;
  /** Container for the Properties panel (traits + style). */
  propertiesContainer: HTMLElement;
}

export function initGrapesEditor(options: InitOptions): Editor {
  const config: EditorConfig = {
    container: options.container,
    height: '100%',
    width: 'auto',
    fromElement: false,
    storageManager: false, // schema persistence is owned by the SPA
    // Reduce GrapesJS' chrome — we render our own panels around it.
    panels: { defaults: [] },
    blockManager: { appendTo: options.blocksContainer },
    layerManager: { appendTo: options.layersContainer },
    traitManager: { appendTo: options.propertiesContainer },
    selectorManager: { componentFirst: true },
    plugins: [grapesjsNewsletter],
    pluginsOpts: {
      [grapesjsNewsletter as unknown as string]: {
        modalLabelImport: __('Paste your HTML code here'),
        modalLabelExport: __('Copy or download HTML'),
        codeViewerTheme: 'hopscotch',
      },
    },
    canvas: {
      // No external CDNs (CLAUDE.md §1.3). Inline placeholder styles only.
      styles: [],
      scripts: [],
    },
    deviceManager: {
      devices: [
        { id: 'desktop', name: __('Desktop'), width: '600px' },
        { id: 'mobile', name: __('Mobile'), width: '320px', widthMedia: '480px' },
      ],
    },
  };

  const editor = grapesjs.init(config);

  // The newsletter preset registers a stock palette; replace it with our
  // 9 custom blocks (CLAUDE.md §12.2). We keep the preset's component
  // definitions because they handle Outlook-friendly rendering for free.
  editor.BlockManager.getAll().reset();
  registerCustomBlocks(editor);

  return editor;
}
