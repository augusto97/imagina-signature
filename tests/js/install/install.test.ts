import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * assets/install/install.js — the vanilla script of the public install
 * page (src/Deployment/Install/InstallPage.php). The fixture below
 * mirrors the markup contract the PHP page renders.
 */

const SCRIPT = readFileSync(resolve(__dirname, '../../../assets/install/install.js'), 'utf8');

/** FileReader.readAsText() may keep the BOM: drop it before parsing. */
const LEADING_BOM = new RegExp('^' + String.fromCharCode(0xfeff));

const FRAGMENT =
  '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="color:#111111">Jane Doe &amp; Co</td></tr></table>';
const TEXT = 'Jane Doe & Co\nCEO';
const INSTALLED_URL =
  'https://example.com/wp-json/imagina-signatures/v1/install/' + 'a'.repeat(64) + '/installed';

const I18N = {
  copied: 'Copied!',
  copyFailed: 'Could not copy',
  saving: 'Saving…',
  installedOk: 'Thanks!',
  installedFailed: 'Could not save',
  installedLabel: 'Installed',
  newTabTitle: 'Signature — press Cmd + A, then Cmd + C',
  fileName: 'Signature',
};

function mount(data: Record<string, unknown> | null = {}): void {
  const payload =
    data === null
      ? ''
      : JSON.stringify({
          fragment: FRAGMENT,
          text: TEXT,
          name: 'Jane Doe / Sales',
          lang: 'es-ES',
          dir: 'ltr',
          installedUrl: INSTALLED_URL,
          i18n: I18N,
          ...data,
        });
  const clients = ['gmail', 'outlook-web', 'outlook-desktop', 'apple-mail', 'mobile'];
  document.documentElement.className = 'no-js';
  document.body.innerHTML = `
    <div class="actions">
      <button type="button" data-imgsig-action="copy-rich">Copy signature</button>
      <button type="button" data-imgsig-action="copy-html">Copy HTML</button>
      <button type="button" data-imgsig-action="download-html">Download .html</button>
    </div>
    <p id="imgsig-install-status" class="status" role="status"></p>
    <div role="tablist">
      ${clients
        .map(
          (c, i) =>
            `<button type="button" role="tab" id="imgsig-tab-${c}" aria-selected="${i === 0}" data-imgsig-tab="${c}">${c}</button>`,
        )
        .join('')}
    </div>
    ${clients
      .map(
        (c) =>
          `<section role="tabpanel" id="imgsig-panel-${c}" data-imgsig-panel="${c}"></section>`,
      )
      .join('')}
    <div id="imgsig-panel-extra">
      <button type="button" data-imgsig-action="download-htm">Download for Outlook (.htm)</button>
      <button type="button" data-imgsig-action="download-txt">Download plain text (.txt)</button>
      <button type="button" data-imgsig-action="copy-folder">Copy folder path</button>
      <button type="button" data-imgsig-action="open-tab">Open signature in a new tab</button>
      <button type="button" data-imgsig-action="installed">I've installed it</button>
    </div>
    <script type="application/json" id="imgsig-install-data">${payload}</script>`;
  new Function(SCRIPT)();
}

function button(action: string): HTMLButtonElement {
  return document.querySelector(`[data-imgsig-action="${action}"]`) as HTMLButtonElement;
}

function status(): HTMLElement {
  return document.getElementById('imgsig-install-status')!;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((done) => {
    const reader = new FileReader();
    reader.onload = () => done(String(reader.result));
    reader.readAsText(blob);
  });
}

function readBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((done) => {
    const reader = new FileReader();
    reader.onload = () => done(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(blob);
  });
}

const urlApi = URL as unknown as { createObjectURL?: unknown; revokeObjectURL?: unknown };
let blobs: Blob[] = [];
let clicked: HTMLAnchorElement[] = [];

beforeEach(() => {
  blobs = [];
  clicked = [];
  urlApi.createObjectURL = vi.fn((b: Blob) => {
    blobs.push(b);
    return `blob:test/${blobs.length}`;
  });
  urlApi.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this);
  });
});

afterEach(() => {
  delete urlApi.createObjectURL;
  delete urlApi.revokeObjectURL;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('install.js — clipboard', () => {
  it('"Copy for Gmail" writes text/html AND text/plain to the clipboard', async () => {
    const write = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { write, writeText: vi.fn() } });
    vi.stubGlobal(
      'ClipboardItem',
      class {
        constructor(public items: Record<string, Blob>) {}
      },
    );
    mount();

    button('copy-rich').click();
    await flush();

    expect(write).toHaveBeenCalledTimes(1);
    const [items] = write.mock.calls[0] as unknown as [Array<{ items: Record<string, Blob> }>];
    const item = items[0]!.items;
    expect(Object.keys(item).sort()).toEqual(['text/html', 'text/plain']);
    expect(item['text/html']!.type).toBe('text/html');
    expect(await readBlob(item['text/html']!)).toBe(FRAGMENT);
    expect(await readBlob(item['text/plain']!)).toBe(TEXT);
    expect(status().textContent).toBe('Copied!');
    expect(button('copy-rich').textContent).toBe('Copied!');
  });

  it('falls back to a rich selection + execCommand when ClipboardItem is missing', async () => {
    vi.stubGlobal('navigator', { clipboard: undefined });
    const exec = vi.fn(() => true);
    document.execCommand = exec as unknown as typeof document.execCommand;
    mount();

    let copiedHtml = '';
    exec.mockImplementation(() => {
      copiedHtml = (document.querySelector('[contenteditable="true"]') as HTMLElement).innerHTML;
      return true;
    });
    button('copy-rich').click();
    await flush();

    expect(exec).toHaveBeenCalledWith('copy');
    expect(copiedHtml).toContain('Jane Doe');
    expect(document.querySelector('[contenteditable="true"]')).toBeNull();
    expect(status().textContent).toBe('Copied!');
  });

  it('"Copy HTML" writes the raw HTML source as text; the folder button copies the Outlook path', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    mount();

    button('copy-html').click();
    button('copy-folder').click();
    await flush();

    expect(writeText).toHaveBeenNthCalledWith(1, FRAGMENT);
    expect(writeText).toHaveBeenNthCalledWith(2, '%APPDATA%\\Microsoft\\Signatures');
  });

  it('reports a blocked clipboard instead of claiming success', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) },
    });
    document.execCommand = vi.fn(() => false) as unknown as typeof document.execCommand;
    mount();

    button('copy-html').click();
    await flush();

    expect(status().textContent).toBe('Could not copy');
    expect(status().className).toContain('err');
    expect(button('copy-html').textContent).toBe('Copy HTML');
  });
});

describe('install.js — downloads', () => {
  it('builds a Word-friendly Outlook .htm (UTF-8 BOM) with the Windows-safe signature name', async () => {
    mount();
    button('download-htm').click();

    expect(clicked.map((a) => a.download)).toEqual(['Jane Doe Sales.htm']);
    expect(blobs[0]!.type).toBe('text/html;charset=utf-8');
    expect(Array.from((await readBytes(blobs[0]!)).slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);

    const htm = (await readBlob(blobs[0]!)).replace(LEADING_BOM, '');
    const doc = new DOMParser().parseFromString(htm, 'text/html');
    expect(doc.documentElement.getAttribute('xmlns:w')).toBe(
      'urn:schemas-microsoft-com:office:word',
    );
    expect(doc.documentElement.getAttribute('lang')).toBe('es-ES');
    expect(doc.querySelector('meta[name="ProgId"]')?.getAttribute('content')).toBe('Word.Document');
    expect(doc.querySelector('meta[charset]')?.getAttribute('charset')).toBe('utf-8');
    expect(doc.title).toBe('Jane Doe Sales');
    expect(doc.querySelector('.WordSection1 > table')).not.toBeNull();
    expect(htm).toContain(FRAGMENT);
    expect(htm).toContain('<o:PixelsPerInch>96</o:PixelsPerInch>');
  });

  it('builds the plain-text .txt with Windows line endings and a BOM', async () => {
    mount();
    button('download-txt').click();

    expect(clicked.map((a) => a.download)).toEqual(['Jane Doe Sales.txt']);
    expect(blobs[0]!.type).toBe('text/plain;charset=utf-8');
    expect(Array.from((await readBytes(blobs[0]!)).slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect((await readBlob(blobs[0]!)).replace(LEADING_BOM, '')).toBe('Jane Doe & Co\r\nCEO\r\n');
  });

  it('downloads a standalone .html holding only the signature', async () => {
    mount();
    button('download-html').click();

    expect(clicked[0]!.download).toBe('Jane Doe Sales.html');
    const page = await readBlob(blobs[0]!);
    expect(page.startsWith('<!DOCTYPE html>')).toBe(true);
    const doc = new DOMParser().parseFromString(page, 'text/html');
    expect(doc.body.children).toHaveLength(1);
    expect(doc.body.firstElementChild!.tagName).toBe('TABLE');
    expect(doc.documentElement.getAttribute('lang')).toBe('es-ES');
  });

  it('falls back to the translated file name for unusable signature names', () => {
    mount({ name: 'CON' });
    button('download-txt').click();
    expect(clicked[0]!.download).toBe('Signature.txt');
  });

  it('opens the signature-only page in a new tab for Apple Mail', async () => {
    mount();
    button('open-tab').click();

    expect(clicked[0]!.target).toBe('_blank');
    expect(clicked[0]!.rel).toBe('noopener');
    expect(clicked[0]!.hasAttribute('download')).toBe(false);
    const doc = new DOMParser().parseFromString(await readBlob(blobs[0]!), 'text/html');
    expect(doc.title).toBe(I18N.newTabTitle);
    expect(doc.body.children).toHaveLength(1);
  });
});

describe('install.js — tabs and "I\'ve installed it"', () => {
  it('shows one client panel at a time, with arrow-key navigation', () => {
    mount();
    expect(document.documentElement.classList.contains('js')).toBe(true);
    expect(document.documentElement.classList.contains('no-js')).toBe(false);

    const panel = (c: string): HTMLElement => document.getElementById(`imgsig-panel-${c}`)!;
    const tab = (c: string): HTMLElement => document.getElementById(`imgsig-tab-${c}`)!;
    expect(panel('gmail').hidden).toBe(false);
    expect(panel('apple-mail').hidden).toBe(true);

    tab('apple-mail').click();
    expect(panel('apple-mail').hidden).toBe(false);
    expect(panel('gmail').hidden).toBe(true);
    expect(tab('apple-mail').getAttribute('aria-selected')).toBe('true');
    expect(tab('gmail').getAttribute('aria-selected')).toBe('false');

    tab('apple-mail').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    expect(panel('mobile').hidden).toBe(false);
    expect(document.activeElement).toBe(tab('mobile'));
  });

  it('posts to the token endpoint with the selected client and confirms', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    mount();

    document.getElementById('imgsig-tab-outlook-desktop')!.click();
    button('installed').click();
    expect(button('installed').disabled).toBe(true);
    expect(status().textContent).toBe('Saving…');
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(INSTALLED_URL);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('omit');
    expect(JSON.parse(String(init.body))).toEqual({ client: 'outlook-desktop' });
    expect(status().textContent).toBe('Thanks!');
    expect(button('installed').textContent).toBe('Installed');
  });

  it('lets the user retry when saving fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 429 })),
    );
    mount();

    button('installed').click();
    await flush();

    expect(status().textContent).toBe('Could not save');
    expect(button('installed').disabled).toBe(false);
  });

  it('stays inert without its data block', () => {
    expect(() => mount(null)).not.toThrow();
    expect(document.documentElement.classList.contains('js')).toBe(false);
  });
});
