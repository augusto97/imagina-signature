import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/globals.css';
import './styles/canvas.css';

const container = document.getElementById('imagina-editor-root');
if (!container) {
  throw new Error('Mount point #imagina-editor-root not found in the iframe document.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
