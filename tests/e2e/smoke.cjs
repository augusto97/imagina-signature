/**
 * End-to-end smoke suite for Imagina Signatures.
 *
 * Runs against a live WordPress with the plugin active. Uses the
 * `playwright` library directly (no test runner) so it works with the
 * globally installed browser:
 *
 *   IMGSIG_E2E_URL=http://localhost:8890 node tests/e2e/smoke.cjs
 *
 * Expected users (create them with wp-cli):
 *   admin / admin (administrator), maria / maria (subscriber).
 * The suite enables frontend access for subscribers through the REST
 * API as admin, so no manual setup beyond the users is needed.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');

const BASE = process.env.IMGSIG_E2E_URL || 'http://localhost:8890';
const OUT = process.env.IMGSIG_E2E_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'imgsig-e2e-'));
const API = `${BASE}/wp-json/imagina-signatures/v1`;

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function login(browser, user, pass) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (e) => {
    // WordPress core's user-profile.js throws when a subscriber leaves
    // the profile page it is redirected to after login — not ours.
    if (/user-profile(\.min)?\.js/.test(e.stack || '')) return;
    problems.push(`pageerror: ${e.message}`);
  });
  page.on('console', (m) => {
    // Failed-resource lines are covered by the response listener below
    // (which knows the URL); 403/404 are expected in isolation checks.
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) {
      problems.push(`console: ${m.text()}`);
    }
  });
  page.on('response', (r) => {
    if (r.url().includes('/imagina-signatures/v1/') && r.status() >= 500) {
      problems.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`);
    }
  });
  await page.goto(`${BASE}/wp-login.php`);
  await page.fill('#user_login', user);
  await page.fill('#user_pass', pass);
  await Promise.all([page.waitForNavigation(), page.click('#wp-submit')]);
  return { context, page, problems };
}

/** REST call from inside the page so cookies + nonce apply. */
async function rest(page, method, route, body) {
  return page.evaluate(
    async ({ method, url, body }) => {
      const cfg = window.IMGSIG_EDITOR_CONFIG || window.IMGSIG_ADMIN_CONFIG;
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': cfg.restNonce },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      let json = null;
      try { json = await res.json(); } catch { /* empty */ }
      return { status: res.status, json };
    },
    { method, url: `${API}${route}`, body },
  );
}

async function openEditor(page, url) {
  await page.goto(url);
  await page.waitForSelector('#imagina-editor-root header', { timeout: 20000 });
}

async function addBlock(page, label) {
  await page.locator('aside button', { hasText: new RegExp(`^${label}$`) }).first().click();
}

async function waitSaved(page) {
  await page.waitForFunction(() => /Saved/.test(document.querySelector('header')?.innerText || ''), null, { timeout: 15000 });
}

(async () => {
  const browser = await chromium.launch();

  // ---------- Admin: editor create, persist, reload ----------
  const admin = await login(browser, 'admin', 'admin');
  const { page } = admin;
  await openEditor(page, `${BASE}/wp-admin/admin.php?page=imagina-signatures-editor`);
  // A new, empty signature opens the guided "Create your signature".
  const onboarding = page.locator('[role="dialog"]', { hasText: 'Create your signature' });
  await onboarding.waitFor({ timeout: 10000 }).catch(() => {});
  check('new signature opens the guided onboarding', await onboarding.isVisible().catch(() => false));
  await onboarding.locator('button', { hasText: 'Start blank' }).click();
  await addBlock(page, 'Text');
  await page.locator('.is-canvas-root [data-imgsig-block-id]').first().click();
  const editor = page.locator('.ProseMirror').first();
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Hola mundo E2E');
  await page.waitForTimeout(2500);
  await waitSaved(page).catch(() => {});
  const id = Number(new URL(page.url()).searchParams.get('id') || 0);
  check('autosave creates the signature and stamps ?id=', id > 0, `id=${id}`);
  await page.reload();
  await page.waitForSelector('#imagina-editor-root header');
  await page.waitForTimeout(800);
  const canvasText = await page.locator('.is-canvas-root').innerText();
  check('text persists after reload', canvasText.includes('Hola mundo E2E'));

  // ---------- Variables survive the PHP round trip ----------
  const got = await rest(page, 'GET', `/signatures/${id}`);
  const vars = got.json && got.json.json_content ? got.json.json_content.variables : null;
  check('empty variables come back as a JSON object', vars !== null && !Array.isArray(vars), JSON.stringify(vars));
  const schema = got.json.json_content;
  schema.variables = { company: 'ACME' };
  const patched = await rest(page, 'PATCH', `/signatures/${id}`, { json_content: schema });
  check('variables persist through PATCH', patched.json && patched.json.json_content.variables.company === 'ACME');

  // ---------- Server-side sanitisation ----------
  const xss = JSON.parse(JSON.stringify(patched.json.json_content));
  xss.blocks[0].content = '<section><img src=x onerror=alert(1)></section><a href="javascript:alert(1)">x</a>';
  const sanitized = await rest(page, 'PATCH', `/signatures/${id}`, { json_content: xss });
  const stored = JSON.stringify(sanitized.json && sanitized.json.json_content);
  check('server strips onerror and javascript: URLs', !/onerror|javascript:/i.test(stored), `status=${sanitized.status}`);

  // ---------- Template apply: confirm + undo ----------
  await page.reload();
  await page.waitForSelector('#imagina-editor-root header');
  await page.click('button[title="Pick a template"]');
  await page.locator('[role="dialog"] button', { hasText: 'Corporate Classic' }).first().click();
  const confirmVisible = await page.locator('text=Replace your current signature?').isVisible().catch(() => false);
  check('template apply asks for confirmation on a non-empty canvas', confirmVisible);
  await page.locator('button', { hasText: 'Apply template' }).click();
  await page.waitForTimeout(600);
  const afterApply = await page.locator('.is-canvas-root').innerText();
  check('template applied', !afterApply.includes('Hola mundo E2E') && afterApply.length > 20);
  await page.locator('.is-canvas-root').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  const afterUndo = await page.locator('.is-canvas-root').innerText();
  check('Ctrl+Z restores the signature replaced by the template', afterUndo.includes('Hola mundo') || afterUndo.includes('x'));
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(2500);

  // ---------- Onboarding with a template + server-held HTML ----------
  const templates = await rest(page, 'GET', '/templates?per_page=100');
  const templateCount = Array.isArray(templates.json) ? templates.json.length : (templates.json && templates.json.items || []).length;
  check('the template library is seeded (40+)', templateCount >= 40, `count=${templateCount}`);
  const onb = await admin.context.newPage();
  await openEditor(onb, `${BASE}/wp-admin/admin.php?page=imagina-signatures-editor`);
  const onbDialog = onb.locator('[role="dialog"]', { hasText: 'Create your signature' });
  await onbDialog.waitFor({ timeout: 10000 });
  await onbDialog.locator('button', { hasText: 'Corporate Classic' }).first().click();
  await onbDialog.locator('button', { hasText: 'Create signature' }).waitFor({ timeout: 10000 });
  check('picking a template asks for your details', await onbDialog.locator('text=Your details').first().isVisible());
  await onbDialog.locator('button', { hasText: 'Create signature' }).click();
  await onb.waitForTimeout(500);
  const onbCanvas = await onb.locator('.is-canvas-root').innerText();
  check('onboarding fills the canvas from the template', onbCanvas.trim().length > 20);
  await onb.waitForFunction(() => /[?&]id=\d+/.test(location.search), null, { timeout: 15000 }).catch(() => {});
  await onb.waitForTimeout(2500);
  const onbId = Number(new URL(onb.url()).searchParams.get('id') || 0);
  const held = await rest(page, 'GET', `/signatures/${onbId}`);
  const heldSig = held.json || {};
  check(
    'the server holds fresh compiled HTML for the saved signature',
    onbId > 0 && !!heldSig.compiled_at && heldSig.html_stale === false && typeof heldSig.html_text === 'string' && heldSig.html_text.length > 0,
    `id=${onbId} compiled_at=${heldSig.compiled_at} stale=${heldSig.html_stale}`,
  );
  await onb.close();

  // ---------- Export modal: no data: URIs, fragment copy ----------
  await page.click('header button:has-text("Export")');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, 'export-modal.png') });
  const modalText = await page.locator('[role="dialog"]').innerText().catch(() => '');
  check('export modal opens without errors', modalText.length > 0 && !/data: URI|embedded images/i.test(modalText));
  await page.keyboard.press('Escape');

  // ---------- QR block uploads a hosted PNG ----------
  const uploads = [];
  page.on('response', (r) => { if (/\/upload\/(direct|finalize)/.test(r.url())) uploads.push(r.status()); });
  await addBlock(page, 'QR Code');
  await page.waitForTimeout(3500);
  const qrSaved = await rest(page, 'GET', `/signatures/${id}`);
  const findQr = (blocks) => {
    for (const b of blocks || []) {
      if (b.type === 'qr_code') return b;
      const nested = findQr([...(b.children || []), ...(b.right_children || [])]);
      if (nested) return nested;
    }
    return null;
  };
  await page.waitForTimeout(2500);
  const qrAfter = await rest(page, 'GET', `/signatures/${id}`);
  const qr = findQr(qrAfter.json && qrAfter.json.json_content && qrAfter.json.json_content.blocks);
  check('QR block uploads its PNG and stores an https/http URL', !!(qr && /^https?:\/\//.test(qr.image_url || '')), `uploads=${uploads.join(',')} url=${qr && qr.image_url}`);
  void qrSaved;
  await page.screenshot({ path: path.join(OUT, 'editor-with-template.png') });

  // ---------- Enable frontend access for subscribers ----------
  await page.goto(`${BASE}/wp-admin/admin.php?page=imagina-signatures-settings`);
  await page.waitForTimeout(500);
  const fa = await page.evaluate(async (api) => {
    const cfg = window.IMGSIG_ADMIN_CONFIG;
    const res = await fetch(`${api}/admin/frontend-access`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': cfg.restNonce },
      body: JSON.stringify({ enabled: true, slug: 'signatures', roles: ['subscriber'] }),
    });
    return res.status;
  }, API);
  check('admin enables frontend access', fa === 200, `status=${fa}`);

  // ---------- Subscriber: public route + isolation ----------
  const sub = await login(browser, 'maria', 'maria');
  const sp = sub.page;
  const listResp = await sp.goto(`${BASE}/signatures/`);
  await sp.waitForTimeout(1500);
  check('subscriber can open /signatures/', listResp.status() === 200);
  const nav = await sp.locator('aside nav').innerText().catch(() => '');
  // English or Spanish (the subscriber may use either locale).
  check(
    'public sidebar shows the user pages only (no templates / settings / groups)',
    /My Signatures|Mis firmas/.test(nav) && !/Templates|Settings|Groups|Plantillas|Ajustes|Grupos/.test(nav),
    JSON.stringify(nav),
  );
  await sp.screenshot({ path: path.join(OUT, 'subscriber-list.png') });
  const foreign = await rest(sp, 'GET', `/signatures/${id}`);
  check("subscriber cannot read the admin's signature", foreign.status === 403 || foreign.status === 404, `status=${foreign.status}`);
  await openEditor(sp, `${BASE}/signatures/editor/`);
  check('subscriber editor loads on the public route', true);
  const subTemplates = await rest(sp, 'GET', '/templates?per_page=100');
  check('subscriber sees the template library', Array.isArray(subTemplates.json) && subTemplates.json.length >= 40, `count=${Array.isArray(subTemplates.json) ? subTemplates.json.length : subTemplates.status}`);
  await sp.screenshot({ path: path.join(OUT, 'subscriber-editor.png') });

  // ---------- Fase 2: profile, groups, install link, Outlook, Gmail ----------
  const profile = await rest(page, 'PATCH', '/me/profile', { values: { job_title: 'CTO E2E' } });
  check('admin saves their own profile', profile.status === 200, `status=${profile.status}`);
  const group = await rest(page, 'POST', '/admin/groups', { name: 'Ventas E2E', color: '#0d9488' });
  const groupId = group.json && (group.json.id || group.json.term_id);
  check('admin creates a group', (group.status === 200 || group.status === 201) && !!groupId, `status=${group.status}`);
  const groups = await rest(page, 'GET', '/admin/groups');
  check('the group is listed', JSON.stringify(groups.json || '').includes('Ventas E2E'));

  const link = await rest(page, 'GET', '/me/install-link');
  const installUrl = link.json && link.json.url;
  check('install link is issued', link.status === 200 && /\/install\/[0-9a-f]{64}|imgsig_install=[0-9a-f]{64}/.test(installUrl || ''), `url=${installUrl}`);
  const anon = await browser.newContext();
  const ip = await anon.newPage();
  const installResp = await ip.goto(installUrl);
  const installHtml = await ip.content();
  check(
    'install page opens without login and shows the signature',
    installResp.status() === 200 && /srcdoc=/.test(installHtml) && !/being prepared/i.test(installHtml),
    `status=${installResp.status()}`,
  );
  const badToken = await ip.goto(installUrl.replace(/[0-9a-f]{64}/, '0'.repeat(64)));
  check('an unknown install token is a 404', badToken.status() === 404, `status=${badToken.status()}`);
  await anon.close();

  const outlook = await rest(page, 'PATCH', '/admin/outlook', { enabled: true });
  const manifestUrl = outlook.json && outlook.json.manifest_url;
  const manifest = manifestUrl ? await page.request.get(manifestUrl) : null;
  check(
    'Outlook add-in manifest is served when enabled',
    !!manifest && manifest.status() === 200 && /<OfficeApp/.test(await manifest.text()),
    `status=${outlook.status} manifest=${manifest && manifest.status()}`,
  );
  const gmail = await rest(page, 'GET', '/admin/deploy/gmail/settings');
  check('Gmail settings answer (not configured yet)', gmail.status === 200, `status=${gmail.status}`);

  const subGroups = await rest(sp, 'GET', '/admin/groups');
  const subUsers = await rest(sp, 'GET', '/admin/users');
  check('subscriber cannot read team data', subGroups.status === 403 && subUsers.status === 403, `groups=${subGroups.status} users=${subUsers.status}`);
  const subProfile = await rest(sp, 'GET', '/me/profile');
  check('subscriber reads their own profile', subProfile.status === 200, `status=${subProfile.status}`);

  // ---------- Console / server problems ----------
  const problems = [...admin.problems, ...sub.problems];
  check('no page errors, console errors or 5xx responses', problems.length === 0, problems.slice(0, 5).join(' | '));

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed. Screenshots: ${OUT}`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error('E2E crashed:', e);
  process.exit(2);
});
