/*!
 * Imagina Signatures — install page script (GPL-2.0-or-later).
 *
 * Served as-is from the plugin (no build step) to the public page that
 * src/Deployment/Install/InstallPage.php renders for /<slug>/install/<token>/.
 * Reads its data from <script type="application/json" id="imgsig-install-data">
 * and wires the [data-imgsig-action] buttons and the client tabs.
 *
 * The file builders mirror assets/editor/src/core/compiler/export-documents.ts
 * and the clipboard helpers assets/editor/src/utils/clipboard.ts — keep them
 * in step.
 */
(function () {
  'use strict';

  var BOM = String.fromCharCode(0xfeff); // UTF-8 BOM: Outlook / Notepad detect the encoding.
  var OUTLOOK_FOLDER = '%APPDATA%\\Microsoft\\Signatures';

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function languageAttrs(lang, dir) {
    var l = lang && /^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(lang) ? ' lang="' + escapeHtml(lang) + '"' : '';
    var d = dir === 'rtl' || dir === 'ltr' ? ' dir="' + dir + '"' : '';
    return l + d;
  }

  /** Classic Outlook for Windows signature file (Word HTML). */
  function outlookDocument(fragment, lang, dir, title) {
    var bodyLang = lang ? ' lang="' + escapeHtml(lang) + '"' : '';
    return '<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns:m="http://schemas.microsoft.com/office/2004/12/omml" xmlns="http://www.w3.org/TR/REC-html40"' + languageAttrs(lang, dir) + '>\n' +
      '<head>\n<meta charset="utf-8">\n<meta http-equiv="Content-Type" content="text/html; charset=utf-8">\n' +
      '<meta name="ProgId" content="Word.Document">\n<meta name="Generator" content="Microsoft Word 15">\n<meta name="Originator" content="Microsoft Word 15">\n' +
      '<title>' + escapeHtml(title) + '</title>\n' +
      '<!--[if gte mso 9]><xml>\n<o:OfficeDocumentSettings>\n<o:AllowPNG/>\n<o:PixelsPerInch>96</o:PixelsPerInch>\n</o:OfficeDocumentSettings>\n</xml><![endif]-->\n' +
      '<!--[if gte mso 9]><xml>\n<w:WordDocument>\n<w:View>Normal</w:View>\n<w:Zoom>0</w:Zoom>\n<w:DoNotOptimizeForBrowser/>\n</w:WordDocument>\n</xml><![endif]-->\n' +
      '<style>\np.MsoNormal, li.MsoNormal, div.MsoNormal { margin: 0; }\ntable { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }\n' +
      'td { mso-line-height-rule: exactly; }\nimg { border: 0; -ms-interpolation-mode: bicubic; }\ndiv.WordSection1 { page: WordSection1; }\n</style>\n' +
      '</head>\n<body' + bodyLang + ' style="margin:0;padding:0">\n<div class="WordSection1">\n' + fragment + '\n</div>\n</body>\n</html>\n';
  }

  /** Plain-text signature file: Windows line endings. */
  function plainTextFile(text) {
    return String(text).replace(/\r\n?/g, '\n').replace(/\n/g, '\r\n').replace(/\s+$/, '') + '\r\n';
  }

  /** A page holding ONLY the signature (select all → copy). */
  function standalonePage(fragment, lang, dir, title) {
    return '<!DOCTYPE html>\n<html' + languageAttrs(lang, dir) + '>\n<head>\n<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>' + escapeHtml(title) + '</title>\n' +
      '</head>\n<body style="margin:24px;background:#ffffff">\n' + fragment + '\n</body>\n</html>\n';
  }

  /** Windows-safe file base name, at most 60 characters. */
  function fileBaseName(name, fallback) {
    var cleaned = String(name || '')
      // eslint-disable-next-line no-control-regex
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60)
      .replace(/[. ]+$/, '');
    if (cleaned === '' || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(cleaned)) return fallback;
    return cleaned;
  }

  function legacyTextCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  function legacyRichCopy(html) {
    try {
      var box = document.createElement('div');
      box.setAttribute('contenteditable', 'true');
      box.innerHTML = html;
      box.style.position = 'fixed';
      box.style.top = '-10000px';
      box.style.left = '0';
      box.style.opacity = '0';
      box.setAttribute('aria-hidden', 'true');
      document.body.appendChild(box);
      var range = document.createRange();
      range.selectNodeContents(box);
      var selection = window.getSelection();
      if (!selection) {
        document.body.removeChild(box);
        return false;
      }
      selection.removeAllRanges();
      selection.addRange(range);
      var ok = document.execCommand('copy');
      selection.removeAllRanges();
      document.body.removeChild(box);
      return ok;
    } catch (e) {
      return false;
    }
  }

  /** Plain text to the clipboard. Resolves true on success. */
  function copyText(text) {
    var clip = navigator.clipboard;
    if (clip && clip.writeText) {
      return clip.writeText(text).then(
        function () { return true; },
        function () { return legacyTextCopy(text); }
      );
    }
    return Promise.resolve(legacyTextCopy(text));
  }

  /** text/html (renders on paste) + text/plain. Resolves true on success. */
  function copyRich(html, text) {
    var clip = navigator.clipboard;
    if (typeof ClipboardItem !== 'undefined' && clip && clip.write) {
      try {
        var item = new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' })
        });
        return clip.write([item]).then(
          function () { return true; },
          function () { return legacyRichCopy(html); }
        );
      } catch (e) {
        // Fall through to the legacy path.
      }
    }
    return Promise.resolve(legacyRichCopy(html));
  }

  function saveFile(content, filename, type) {
    var url = URL.createObjectURL(new Blob([content], { type: type }));
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  }

  function openPage(content) {
    var url = URL.createObjectURL(new Blob([content], { type: 'text/html;charset=utf-8' }));
    var a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // The new tab needs the URL while it loads; free it a minute later.
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  function init() {
    var node = document.getElementById('imgsig-install-data');
    var data = null;
    try {
      data = node ? JSON.parse(node.textContent || '') : null;
    } catch (e) {
      data = null;
    }
    if (!data || typeof data.fragment !== 'string') return;

    var root = document.documentElement;
    root.classList.remove('no-js');
    root.classList.add('js');

    var t = data.i18n || {};
    var fragment = data.fragment;
    var text = typeof data.text === 'string' ? data.text : '';
    var base = fileBaseName(data.name, t.fileName || 'Signature');
    var status = document.getElementById('imgsig-install-status');
    var client = 'gmail';

    function say(message, kind) {
      if (!status) return;
      status.textContent = message || '';
      status.className = 'status' + (kind ? ' ' + kind : '');
    }

    function flash(button, ok) {
      if (!ok) {
        say(t.copyFailed, 'err');
        return;
      }
      say(t.copied, 'ok');
      if (!button.getAttribute('data-label')) button.setAttribute('data-label', button.textContent);
      button.textContent = t.copied;
      window.setTimeout(function () {
        button.textContent = button.getAttribute('data-label');
      }, 2000);
    }

    // Tabs.
    var tabs = Array.prototype.slice.call(document.querySelectorAll('[data-imgsig-tab]'));
    var panels = Array.prototype.slice.call(document.querySelectorAll('[data-imgsig-panel]'));
    function select(id, focus) {
      client = id;
      tabs.forEach(function (tab) {
        var on = tab.getAttribute('data-imgsig-tab') === id;
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
        tab.tabIndex = on ? 0 : -1;
        if (on && focus) tab.focus();
      });
      panels.forEach(function (panel) {
        panel.hidden = panel.getAttribute('data-imgsig-panel') !== id;
      });
    }
    tabs.forEach(function (tab, index) {
      tab.addEventListener('click', function () {
        select(tab.getAttribute('data-imgsig-tab'), false);
      });
      tab.addEventListener('keydown', function (event) {
        var step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (!step) return;
        event.preventDefault();
        var next = tabs[(index + step + tabs.length) % tabs.length];
        select(next.getAttribute('data-imgsig-tab'), true);
      });
    });
    if (tabs.length) {
      var wanted = (window.location.hash || '').replace('#', '');
      var initial = tabs.filter(function (tab) { return tab.getAttribute('data-imgsig-tab') === wanted; })[0] || tabs[0];
      select(initial.getAttribute('data-imgsig-tab'), false);
    }

    function markInstalled(button) {
      button.disabled = true;
      say(t.saving, '');
      var done = function (ok) {
        if (ok) {
          say(t.installedOk, 'ok');
          button.textContent = t.installedLabel || button.textContent;
        } else {
          button.disabled = false;
          say(t.installedFailed, 'err');
        }
      };
      if (typeof fetch !== 'function' || !data.installedUrl) {
        done(false);
        return Promise.resolve(false);
      }
      return fetch(data.installedUrl, {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ client: client })
      }).then(
        function (response) { done(!!response.ok); return !!response.ok; },
        function () { done(false); return false; }
      );
    }

    var actions = {
      'copy-rich': function (button) {
        return copyRich(fragment, text).then(function (ok) { flash(button, ok); });
      },
      'copy-html': function (button) {
        return copyText(fragment).then(function (ok) { flash(button, ok); });
      },
      'copy-folder': function (button) {
        return copyText(OUTLOOK_FOLDER).then(function (ok) { flash(button, ok); });
      },
      'download-htm': function () {
        saveFile(BOM + outlookDocument(fragment, data.lang, data.dir, base), base + '.htm', 'text/html;charset=utf-8');
      },
      'download-txt': function () {
        saveFile(BOM + plainTextFile(text), base + '.txt', 'text/plain;charset=utf-8');
      },
      'download-html': function () {
        saveFile(standalonePage(fragment, data.lang, data.dir, base), base + '.html', 'text/html;charset=utf-8');
      },
      'open-tab': function () {
        openPage(standalonePage(fragment, data.lang, data.dir, t.newTabTitle || base));
      },
      installed: markInstalled
    };

    Array.prototype.forEach.call(document.querySelectorAll('[data-imgsig-action]'), function (button) {
      button.addEventListener('click', function () {
        var run = actions[button.getAttribute('data-imgsig-action')];
        if (run) run(button);
      });
    });

    // Preview: fit the frame to the signature, open its links outside it.
    var frame = document.getElementById('imgsig-install-preview');
    if (frame) {
      var fit = function () {
        try {
          var doc = frame.contentDocument;
          if (!doc || !doc.documentElement) return;
          Array.prototype.forEach.call(doc.querySelectorAll('a[href]'), function (link) {
            link.setAttribute('target', '_blank');
            link.setAttribute('rel', 'noopener noreferrer');
          });
          // body height + its 16px top/bottom margins (the html element
          // is never shorter than the frame, so it can't shrink it).
          var height = doc.body ? Math.ceil(doc.body.getBoundingClientRect().height) + 32 : 0;
          if (height > 32) frame.style.height = height + 'px';
        } catch (e) {
          // Cross-origin or not loaded yet: keep the default height.
        }
      };
      frame.addEventListener('load', fit);
      fit();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
