#!/usr/bin/env node
'use strict';
// Read-only visual audit of the real site with the QA account (jynloteste01).
// Visits every main page at phone and desktop width, takes full-page
// screenshots and runs layout checks (cut text, overflow, overlapping buttons,
// broken images, "undefined"/i18n keys on screen, console and HTTP errors).
// It never submits forms, sends messages or clicks anything that changes data:
// only links/tabs inside the page and the login button.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const SITE = process.env.JYNLO_SITE || 'https://jynlosports.com';
const API = SITE.includes('jynlosports.com') ? 'https://api.jynlosports.com' : 'https://api.d24sports.com';
const VISITOR = process.env.JYNLO_AUDIT_ACCOUNT === '0';
// Visitors browse signed out; the QA account is only used (API only) to find real IDs.
const ACCOUNT = process.env.JYNLO_AUDIT_ACCOUNT === '2' ? '2' : '1';
const USER = process.env['JYNLO_QA_USERNAME_' + ACCOUNT] || '';
const PASS = process.env['JYNLO_QA_PASSWORD_' + ACCOUNT] || '';
const LANG = process.env.JYNLO_AUDIT_LANG === 'en' ? 'en' : 'pt';
const OUT = path.resolve(process.env.AUDIT_OUT || 'visual-audit');
const VIEWPORTS = [
  { name: 'telemovel', width: 390, height: 844, mobile: true },
  { name: 'computador', width: 1366, height: 900, mobile: false }
];

fs.mkdirSync(path.join(OUT, 'screens'), { recursive: true });
const report = [];
const log = (...a) => console.log(...a);

async function api(p, token) {
  const r = await fetch(API + p, { headers: { Accept: 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw Error('HTTP ' + r.status + ' ' + p);
  return r.json();
}

async function login() {
  const r = await fetch(API + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }), signal: AbortSignal.timeout(60000)
  });
  if (!r.ok) throw Error('Login HTTP ' + r.status);
  const d = await r.json();
  if (d.mfaRequired || typeof d.token !== 'string') throw Error('Login sem token (MFA?)');
  return d.token;
}

async function discoverRoutes(token) {
  const routes = [
    ['feed', '/menu/feed'], ['explorar', '/menu/discover'], ['sessoes', '/menu/events'],
    ['minhas-sessoes', '/menu/my-sessions'], ['comunidades', '/menu/communities'],
    ['equipas', '/menu/teams'], ['competicoes-equipas', '/menu/teams/competitions'],
    ['mensagens', '/menu/messages'], ['grupos', '/menu/groups'], ['notificacoes', '/menu/notifications'],
    ['recintos', '/menu/venues'], ['pessoas', '/menu/perfis'], ['pesquisa', '/menu/search'],
    ['o-meu-perfil', '/menu/dadosPerfil'], ['editar-perfil', '/menu/alterardados'],
    ['criar', '/menu/create'], ['criar-sessao', '/menu/createEvents'],
    ['contacto', '/contact'], ['sobre', '/about'], ['privacidade', '/privacy'], ['termos', '/terms'],
    ['eliminar-conta', '/delete-account']
  ];
  const tabs = [];
  const safe = async (fn) => { try { await fn(); } catch (e) { log('descoberta:', e.message); } };
  await safe(async () => {
    const mine = await api('/api/communities/mine', token);
    for (const c of (mine || []).slice(0, 3)) {
      routes.push(['comunidade-' + c.id, '/menu/communities/' + c.id]);
      tabs.push('/menu/communities/' + c.id);
    }
  });
  await safe(async () => {
    const s = await api('/api/sessions/mine', token);
    const all = [...(s.created || []), ...(s.joined || []), ...(s.waitlisted || [])];
    for (const x of all.slice(0, 3)) routes.push(['jogo-' + x.id, '/menu/events/' + x.id]);
  });
  await safe(async () => {
    const t = await api('/api/teams/mine', token);
    for (const x of (t || []).slice(0, 2)) routes.push(['equipa-' + x.id, '/menu/teams/' + x.id]);
  });
  await safe(async () => {
    // One venue per "Reservar" variant: booking link/site, phone only, nothing known.
    const v = await api('/api/venues?page=0&size=60', token);
    const list = Array.isArray(v) ? v : (v?.content || []);
    const phone = x => /^\+?[\d\s().-]{9,}$/.test((x.contact || '').trim());
    const picks = [
      list.find(x => x.bookingUrl || x.website),
      list.find(x => !x.bookingUrl && !x.website && phone(x)),
      list.find(x => !x.bookingUrl && !x.website && !x.contact),
      list.find(x => x.freeAccess === true),
    ].filter(Boolean);
    if (!picks.length && list[0]) picks.push(list[0]);
    for (const x of [...new Map(picks.map(x => [x.id, x])).values()]) routes.push(['recinto-' + x.id, '/menu/venues/' + x.id]);
  });
  routes.push(['perfil-publico', '/menu/perfis/' + USER]);
  if (VISITOR) {
    const keep = routes.filter(([n]) => /^(jogo-|recinto-)/.test(n)).map(([n, r]) => [n, r.replace('/menu/events/', '/sessions/')]);
    return { routes: [
      ['inicio', '/'], ['entrar', '/login'], ['registar', '/login/registerNewUser'], ['recuperar', '/login/resetPassword'],
      ['explorar', '/menu/discover'], ['sessoes', '/menu/events'], ['recintos', '/menu/venues'], ['equipas', '/menu/teams'],
      ['sobre', '/about'], ['contacto', '/contact'], ['privacidade', '/privacy'], ['termos', '/terms'],
      ['eliminar-conta', '/delete-account'], ['pagina-inexistente', '/isto-nao-existe'], ...keep
    ], tabs: [] };
  }
  return { routes, tabs };
}

// Runs inside the page: returns layout problems a person would notice.
function inspect(isMobile) {
  const problems = [];
  const visible = (el) => {
    const s = getComputedStyle(el); const r = el.getBoundingClientRect();
    return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05 && r.width > 0 && r.height > 0;
  };
  const label = (el) => {
    const t = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('alt') || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const cls = typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.') : '';
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '') + (t ? ' "' + t + '"' : '');
  };
  const doc = document.documentElement;
  if (doc.scrollWidth > innerWidth + 2) problems.push({ tipo: 'scroll-horizontal', detalhe: 'página mais larga que o ecrã: ' + doc.scrollWidth + 'px vs ' + innerWidth + 'px' });
  const all = Array.from(document.querySelectorAll('body *')).filter(visible);
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.right > innerWidth + 2 && getComputedStyle(el).position !== 'fixed' && r.width < innerWidth * 3) {
      const parentClips = (() => { let p = el.parentElement; while (p) { const o = getComputedStyle(p).overflowX; if (o === 'hidden' || o === 'auto' || o === 'scroll' || o === 'clip') return true; p = p.parentElement; } return false; })();
      if (!parentClips) problems.push({ tipo: 'sai-do-ecra', detalhe: label(el) + ' termina em ' + Math.round(r.right) + 'px' });
    }
  }
  // Text cut off inside its box (ellipsis or hidden overflow) on buttons, badges, titles.
  for (const el of all) {
    if (!el.childNodes.length || el.children.length > 2) continue;
    const hasText = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!hasText) continue;
    const s = getComputedStyle(el);
    const clips = s.overflow !== 'visible' || s.textOverflow === 'ellipsis' || s.overflowX !== 'visible';
    if (clips && el.scrollWidth > el.clientWidth + 2) problems.push({ tipo: 'texto-cortado', detalhe: label(el) });
  }
  // Buttons/links overlapping each other.
  const ctrls = all.filter(el => el.matches('button, a[href], [role=button], [role=tab], input, select, textarea'));
  for (let i = 0; i < ctrls.length; i++) {
    const a = ctrls[i].getBoundingClientRect();
    for (let j = i + 1; j < Math.min(ctrls.length, i + 60); j++) {
      const b = ctrls[j].getBoundingClientRect();
      if (ctrls[i].contains(ctrls[j]) || ctrls[j].contains(ctrls[i])) continue;
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 6 && oy > 6) problems.push({ tipo: 'botoes-sobrepostos', detalhe: label(ctrls[i]) + ' × ' + label(ctrls[j]) });
    }
    if (isMobile) {
      if ((a.width < 30 || a.height < 30) && a.width > 0 && !ctrls[i].matches('input[type=checkbox], input[type=radio]') && ctrls[i].innerText?.trim())
        problems.push({ tipo: 'alvo-pequeno', detalhe: label(ctrls[i]) + ' ' + Math.round(a.width) + '×' + Math.round(a.height) });
    }
  }
  for (const img of Array.from(document.images).filter(visible)) {
    if (img.complete && img.naturalWidth === 0) problems.push({ tipo: 'imagem-partida', detalhe: (img.getAttribute('src') || '').slice(0, 80) });
  }
  const text = document.body.innerText;
  for (const [re, tipo] of [[/\bundefined\b/g, 'texto-undefined'], [/\bnull\b/g, 'texto-null'], [/\bNaN\b/g, 'texto-NaN'], [/\[object Object\]/g, 'texto-object'], [/\{\{?[a-zA-Z]+\}\}?/g, 'marcador-por-preencher'],
    [/\b[a-z]+(?:[A-Z][a-zA-Z]+)?\.[a-z][a-zA-Z]+\.[a-zA-Z.]+\b/g, 'chave-sem-traducao']]) {
    const m = text.match(re);
    if (m) problems.push({ tipo, detalhe: Array.from(new Set(m)).slice(0, 5).join(', ') });
  }
  if (window.__auditLang === 'en') {
    const pt = text.match(/\b(não|sessões|comunidade|jogadores|equipas|mensagens|ainda|criar|entrar|palavra-passe|guardar|eliminar|perfil|definições|histórico|época)\b/gi);
    if (pt) problems.push({ tipo: 'portugues-em-ingles', detalhe: Array.from(new Set(pt.map(w => w.toLowerCase()))).slice(0, 12).join(', ') });
  }
  const dashes = (text.match(/(^|\n)\s*—\s*(\n|$)/g) || []).length;
  if (dashes >= 3) problems.push({ tipo: 'muitos-tracos', detalhe: dashes + ' valores "—" visíveis (cartões vazios?)' });
  return problems;
}

async function auditPage(page, name, route, vp, consoleErrors, httpErrors) {
  consoleErrors.length = 0; httpErrors.length = 0;
  const started = Date.now();
  await page.goto(SITE + route, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => httpErrors.push('navegação: ' + e.message.split('\n')[0]));
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const file = vp.name + '__' + name + '.png';
  await page.screenshot({ path: path.join(OUT, 'screens', file), fullPage: true }).catch(() => {});
  const problems = await page.evaluate(inspect, vp.mobile).catch(e => [{ tipo: 'erro-inspecao', detalhe: e.message }]);
  const entry = { pagina: name, rota: route, ecra: vp.name, ms: Date.now() - started, captura: file,
    problemas: problems, consola: Array.from(new Set(consoleErrors)).slice(0, 8), http: Array.from(new Set(httpErrors)).slice(0, 8) };
  report.push(entry);
  log(`${vp.name} ${name}: ${problems.length} problemas, ${entry.consola.length} erros consola, ${entry.http.length} HTTP`);
  return entry;
}

(async () => {
  if (!USER || !PASS) throw Error('Faltam JYNLO_QA_USERNAME_1/JYNLO_QA_PASSWORD_1');
  const token = await login();
  const { routes, tabs } = await discoverRoutes(token);
  const browser = await chromium.launch();
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile, locale: LANG === 'en' ? 'en-GB' : 'pt-PT', deviceScaleFactor: vp.mobile ? 2 : 1 });
    if (!VISITOR) await context.addInitScript(([t, u, l]) => {
      try { localStorage.setItem('t', t); localStorage.setItem('jynlo.firstSteps.skipped.' + u.toLowerCase(), String(Date.now())); if (l === 'en') { localStorage.setItem('d24-language', 'en'); window.__auditLang = 'en'; } } catch {}
    }, [token, USER, LANG]);
    const page = await context.newPage();
    const consoleErrors = []; const httpErrors = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
    page.on('pageerror', e => consoleErrors.push('JS: ' + e.message.slice(0, 200)));
    page.on('response', r => { if (r.status() >= 400 && /api\./.test(r.url())) httpErrors.push(r.status() + ' ' + r.request().method() + ' ' + new URL(r.url()).pathname); });
    for (const [name, route] of routes) await auditPage(page, name, route, vp, consoleErrors, httpErrors);
    // Every tab of each community (tabs only switch views; nothing is changed).
    for (const route of tabs) {
      await page.goto(SITE + route, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
      const names = await page.locator('[role=tab], .community-tabs button, nav.community-sections button').allInnerTexts().catch(() => []);
      for (const tabName of Array.from(new Set(names.map(n => n.trim()).filter(Boolean))).slice(0, 10)) {
        consoleErrors.length = 0; httpErrors.length = 0;
        await page.locator('[role=tab], .community-tabs button, nav.community-sections button').filter({ hasText: tabName }).first().click({ timeout: 5000 }).catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(1200);
        const slug = route.split('/').pop() + '-' + tabName.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-');
        const file = vp.name + '__comunidade-' + slug + '.png';
        await page.screenshot({ path: path.join(OUT, 'screens', file), fullPage: true }).catch(() => {});
        const problems = await page.evaluate(inspect, vp.mobile).catch(() => []);
        report.push({ pagina: 'comunidade-' + slug, rota: route + ' [' + tabName + ']', ecra: vp.name, captura: file, problemas: problems,
          consola: Array.from(new Set(consoleErrors)).slice(0, 8), http: Array.from(new Set(httpErrors)).slice(0, 8) });
        log(`${vp.name} comunidade ${tabName}: ${problems.length} problemas`);
      }
    }
    await context.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'relatorio.json'), JSON.stringify(report, null, 1));
  const total = report.reduce((n, e) => n + e.problemas.length + e.consola.length + e.http.length, 0);
  console.log(`Concluído: ${report.length} ecrãs, ${total} avisos.`);
})().catch(e => { console.error('Falhou:', e.message); process.exit(1); });
