import '@testing-library/jest-dom/vitest';

// Inject the editor config that PHP normally provides via wp_json_encode().
// Tests can override individual fields in their own setup if needed.
(globalThis as unknown as { IMGSIG_EDITOR_CONFIG: unknown }).IMGSIG_EDITOR_CONFIG = {
  signatureId: 0,
  userId: 1,
  apiBase: 'http://localhost/wp-json/imagina-signatures/v1',
  restNonce: 'test-nonce',
  locale: 'en_US',
  pluginUrl: 'http://localhost/wp-content/plugins/imagina-signatures',
};
