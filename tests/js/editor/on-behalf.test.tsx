import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { OnBehalfBanner } from '@/editor/OnBehalfBanner';
import { onBehalfOf } from '@/services/onBehalf';
import { compileSignature } from '@/core/compiler/compile';
import { createEmptySchema } from '@/core/schema/signature';
import '@/core/blocks';

type Config = Record<string, unknown>;
const globalConfig = (): Config =>
  (globalThis as unknown as { IMGSIG_EDITOR_CONFIG: Config }).IMGSIG_EDITOR_CONFIG;
let saved: Config;

beforeEach(() => {
  saved = { ...globalConfig() };
});

afterEach(() => {
  cleanup();
  (globalThis as unknown as { IMGSIG_EDITOR_CONFIG: Config }).IMGSIG_EDITOR_CONFIG = saved;
});

describe('editing a signature on behalf of its owner', () => {
  it('shows whose signature it is and links back to the Team page', () => {
    Object.assign(globalConfig(), {
      signaturesUrl: 'http://localhost/wp-admin/admin.php?page=imagina-signatures-team',
      onBehalfOf: { userId: 5, displayName: 'María López', email: 'maria@acme.test' },
    });

    render(<OnBehalfBanner />);

    expect(screen.getByRole('status')).toHaveTextContent('Editing María López’s signature');
    expect(screen.getByRole('status')).toHaveTextContent('compiled with their details');
    expect(screen.getByRole('link', { name: /Back to Team/ })).toHaveAttribute(
      'href',
      'http://localhost/wp-admin/admin.php?page=imagina-signatures-team',
    );
  });

  it('shows nothing for the user’s own signature', () => {
    Object.assign(globalConfig(), { onBehalfOf: null });
    const { container } = render(<OnBehalfBanner />);
    expect(container).toBeEmptyDOMElement();
    expect(onBehalfOf()).toBeNull();
  });

  it('compiles in the owner’s language, not the manager’s UI language', () => {
    Object.assign(globalConfig(), { locale: 'en_US', signatureLocale: 'pt_BR' });
    expect(compileSignature(createEmptySchema()).lang).toBe('pt-BR');

    Object.assign(globalConfig(), { signatureLocale: undefined });
    expect(compileSignature(createEmptySchema()).lang).toBe('en-US');
  });
});
