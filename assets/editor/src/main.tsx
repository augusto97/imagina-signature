import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initAssetsBaseUrl } from './core/compiler/assets';
import './styles/globals.css';
import './styles/canvas.css';

// Hosted icons (social / contact blocks) resolve against the plugin URL.
initAssetsBaseUrl();

const container = document.getElementById('imagina-editor-root');
if (!container) {
  throw new Error('Mount point #imagina-editor-root not found in the iframe document.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
