// Vixen – aplikace kanceláře. Zatím: úvodní stránka s dotazy (tikety) majitelek pro Tbdb.
(function () {
const C = window.VIXEN_CONFIG, K = window.K;
const sb = window.supabase.createClient(C.url, C.key, window.VIXEN_DEMO ? { auth: window.VIXEN_DEMO_AUTH, global: { fetch: (...a) => window.fetch(...a) } } : undefined);
const $app = document.getElementById('app');
const DEV = new URLSearchParams(location.search).has('dev');
const S = { user: null, jmeno: '', tbdb: false, nabor: false, smlouvy: false, vedeni: false, tikety: [], cis: null, lide: [], vyber: new Set() };
const TYP = { dotaz: 'Dotaz', chyba: 'Něco nefunguje', prani: 'Přání / nápad' };
const STAV = { novy: ['nový', 't-w'], resime: ['řešíme', 't-g'], ceka_na_vas: ['čeká na vás', 't-b'], hotovo: ['hotovo', 't-ok'] };
const MAX_MB = 10;

if (window.VIXEN_DEMO) { /* text pásku nastaví demo.js */ }
else if (C.prostredi) document.getElementById('env').textContent = C.prostredi + ' – jen zkušební data';
else document.getElementById('env').classList.add('hidden');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const msg = (t, typ = 'ok') => `<div class="msg ${typ}">${t}</div>`;

// chyba formuláře: jedno pole hlášky přímo nad tlačítkem odeslání, vždy na obrazovce
function chybaFormu(form, text) {
  let box = form.querySelector('.form-chyba');
  if (!box) {
    box = document.createElement('div'); box.className = 'form-chyba'; box.setAttribute('role', 'alert');
    const tl = [...form.querySelectorAll('button[type=submit], button:not([type])')].pop();
    if (tl) tl.before(box); else form.append(box);
  }
  box.innerHTML = msg(esc(text), 'bad');
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
const kdy = (d) => new Date(d).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
const chyba = (e) => (e && (e.message || e.error_description)) || String(e);
document.getElementById('odhlasit').onclick = async () => { if (window.VIXEN_DEMO) return (location.href = location.pathname); await sb.auth.signOut(); location.reload(); };

async function start() {
  const { data } = await sb.auth.getSession();
  data.session ? poPrihlaseni() : vPrihlaseni();
}
sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_IN' && !S.user) poPrihlaseni(); });

function vPrihlaseni() {
  $app.innerHTML = `<h1>Kancelář Vixen</h1><p class="mute">Přihlaste se e-mailem – pošleme odkaz.</p>
   <form id="f" class="card" novalidate>
    <div class="fld" data-f="email"><label for="email">E-mail</label><input id="email" type="email" autocomplete="email"><div class="err"></div></div>
    ${DEV ? '<div class="fld" data-f="heslo"><label for="heslo">Heslo (jen pro testy ve vývoji)</label><input id="heslo" type="password"><div class="err"></div></div>' : ''}
    <button class="btn" type="submit">${DEV ? 'Přihlásit' : 'Poslat odkaz'}</button></form>`;
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim().toLowerCase();
    const ch = K.emailChyba(email);
    if (ch) { const f = document.querySelector('[data-f=email]'); f.classList.add('chyba'); f.querySelector('.err').textContent = ch; return; }
    const heslo = DEV && document.getElementById('heslo').value;
    const { error } = heslo ? await sb.auth.signInWithPassword({ email, password: heslo })
      : await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: location.href.split('#')[0] } });
    if (error) return chybaFormu(e.target, chyba(error));
    if (heslo) return poPrihlaseni();
    $app.innerHTML = `<h1>Mrkněte do e-mailu</h1>${msg('Poslali jsme odkaz na ' + esc(email) + '.')}`;
  };
}

async function poPrihlaseni() {
  const { data: { user } } = await sb.auth.getUser();
  S.user = user;
  const [{ data: vedeni }, { data: tbdb }, { data: nabor }] = await Promise.all([sb.rpc('ma_pravo', { p: 'vedeni' }), sb.rpc('ma_pravo', { p: 'superadmin' }), sb.rpc('ma_pravo', { p: 'nabor' })]);
  document.getElementById('odhlasit').classList.remove('hidden');
  if (!vedeni) { $app.innerHTML = msg('Tento účet nemá přístup do kanceláře. Ozvěte se Tbdb.', 'warn'); return; }
  S.tbdb = !!tbdb; S.nabor = !!nabor; S.vedeni = !!vedeni;
  S.smlouvy = !!(await sb.rpc('ma_pravo', { p: 'smlouvy' })).data;
  S.jmeno = (user.user_metadata && user.user_metadata.jmeno) || user.email.split('@')[0];
  if (S.tbdb) S.jmeno += ' (Tbdb)';
  document.getElementById('kdo').textContent = S.jmeno;
  S.nabor ? vLide() : vUvod();   // úvodní obrazovka kanceláře = Lidé
}

async function nactiTikety() {
  const { data, error } = await sb.from('tiket').select('*').order('zmeneno', { ascending: false });
  if (error) throw error;
  S.tikety = data || [];
}

// ---------- diktování (převod řeči na text v prohlížeči) ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const mikrofon = (id) => `<div class="dikt"><button type="button" class="mic" data-pro="${id}">🎤 Diktovat</button><span class="dikt-info pozn"></span></div>`;
function zapniDiktovani() {
  $app.querySelectorAll('button.mic').forEach((btn) => {
    const pole = document.getElementById(btn.dataset.pro), info = btn.nextElementSibling;
    if (!SR) { btn.onclick = () => (info.textContent = 'Tento prohlížeč diktování nepodporuje – použijte mikrofon na klávesnici telefonu.'); return; }
    let rec = null, zaklad = '';
    btn.onclick = () => {
      if (rec) { rec.stop(); return; }
      rec = new SR(); rec.lang = 'cs-CZ'; rec.continuous = true; rec.interimResults = true;
      zaklad = pole.value ? pole.value.replace(/\s*$/, ' ') : '';
      rec.onresult = (e) => {
        let hotovo = '', rozpracovano = '';
        for (let i = 0; i < e.results.length; i++) (e.results[i].isFinal ? (hotovo += e.results[i][0].transcript) : (rozpracovano += e.results[i][0].transcript));
        pole.value = zaklad + hotovo + rozpracovano;
        pole.dispatchEvent(new Event('input'));
      };
      rec.onerror = (e) => (info.textContent = e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? 'Povolte prosím mikrofon pro tuto stránku.' : e.error === 'no-speech' ? 'Nic jsem neslyšela – zkuste to znovu.' : 'Diktování se přerušilo (' + e.error + ').');
      rec.onend = () => { rec = null; btn.textContent = '🎤 Diktovat'; btn.classList.remove('nahrava'); if (!info.textContent.startsWith('Povol')) info.textContent = 'Text můžete před odesláním upravit.'; };
      rec.start(); btn.textContent = '⏹ Zastavit diktování'; btn.classList.add('nahrava'); info.textContent = 'Poslouchám… mluvte česky.';
    };
  });
}

// ---------- úvodní stránka: nový dotaz + seznam ----------
async function vUvod(hlaska) {
  await nactiTikety();
  const otevrene = S.tikety.filter((t) => t.stav !== 'hotovo'), hotove = S.tikety.filter((t) => t.stav === 'hotovo');
  const radek = (t) => `<div class="tik" data-id="${t.id}"><span><b>#${t.cislo} ${esc(t.predmet)}</b>${t.spech ? ' ⚡' : ''}<small>${TYP[t.typ]} · ${esc(t.autor_jmeno)} · ${kdy(t.zmeneno)}</small></span><span class="tag ${STAV[t.stav][1]}">${STAV[t.stav][0]}</span></div>`;
  $app.innerHTML = `${await menu('dotazy')}<h1>Dobrý den${S.tbdb ? '' : ', ' + esc(K.vokativ(S.jmeno))}</h1>
   ${hlaska || ''}
   <div class="card"><h2 style="margin-top:0">Napište nám (Tbdb)</h2>
    <p class="pozn">Dotaz, problém nebo nápad k aplikaci. Odpovíme tady – uvidíte to v seznamu níže.</p>
    <form id="f" novalidate>
     <div class="fld" data-f="typ"><label>Co potřebujete</label><div class="chips typy">
      ${Object.entries(TYP).map(([k, v], i) => `<label><input type="radio" name="typ" value="${k}"${i ? '' : ' checked'}> ${v}</label>`).join('')}</div><div class="err"></div></div>
     <div class="fld" data-f="predmet"><label for="predmet">Předmět</label><input id="predmet" maxlength="120" placeholder="Např. Jak přidat novou kolegyni"><div class="err"></div></div>
     <div class="fld" data-f="text"><label for="text">Popis</label><textarea id="text" rows="5" placeholder="Napište nebo nadiktujte, co se stalo / co potřebujete. U chyby: kde v aplikaci a co jste dělala."></textarea>${mikrofon('text')}<div class="err"></div></div>
     <div class="fld" data-f="soubory"><label for="soubory">Přílohy (nepovinné – snímek obrazovky, dokument; max. ${MAX_MB} MB)</label><input id="soubory" type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"><div class="err"></div></div>
     <label class="chk"><input type="checkbox" id="spech"> Spěchá</label>
     <button class="btn" type="submit">Odeslat dotaz</button>
    </form></div>
   <h2>Otevřené dotazy</h2>${otevrene.map(radek).join('') || '<p class="mute">Žádné.</p>'}
   ${hotove.length ? `<h2>Vyřešené</h2>${hotove.map(radek).join('')}` : ''}
   <p class="pozn" style="margin-top:24px">Další části kanceláře (lidé, akce, dokumenty) připravujeme.</p>`;
  zapniMenu();
  $app.querySelectorAll('.tik').forEach((el) => (el.onclick = () => vDetail(el.dataset.id)));
  document.getElementById('f').onsubmit = odeslat;
  zapniDiktovani();
}

function chybyFormulare(predmet, text, soubory) {
  const ch = {
    predmet: predmet.length < 3 ? 'Napište krátký předmět (aspoň 3 znaky).' : '',
    text: text.length < 3 ? 'Popište prosím, co potřebujete.' : '',
    soubory: [...soubory].some((f) => f.size > MAX_MB * 1048576) ? `Soubor je větší než ${MAX_MB} MB.` : '',
  };
  document.querySelectorAll('.fld').forEach((f) => { const t = ch[f.dataset.f] || ''; f.classList.toggle('chyba', !!t); f.querySelector('.err').textContent = t; });
  return !Object.values(ch).some(Boolean);
}

async function nahrajPrilohy(tiketId, soubory) {
  for (const f of soubory) {
    const nazev = f.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
    const cesta = `${tiketId}/${Date.now()}_${nazev}`;
    const { error } = await sb.storage.from('tikety').upload(cesta, f);
    if (error) throw error;
    const { error: e2 } = await sb.from('tiket_priloha').insert({ tiket_id: tiketId, cesta, nazev: f.name });
    if (e2) throw e2;
  }
}

async function odeslat(e) {
  e.preventDefault();
  const predmet = document.getElementById('predmet').value.trim(), text = document.getElementById('text').value.trim();
  const soubory = document.getElementById('soubory').files;
  if (!chybyFormulare(predmet, text, soubory)) return;
  const b = e.target.querySelector('button[type=submit]'); b.disabled = true; b.textContent = 'Odesílám…';
  try {
    const { data, error } = await sb.from('tiket').insert({
      autor_jmeno: S.jmeno, predmet, text, spech: document.getElementById('spech').checked,
      typ: document.querySelector('input[name=typ]:checked').value }).select('id,cislo').single();
    if (error) throw error;
    if (soubory.length) await nahrajPrilohy(data.id, soubory);
    vUvod(msg(`Dotaz #${data.cislo} jsme přijali ✓ Odpovíme co nejdřív.`));
  } catch (err) {
    b.disabled = false; b.textContent = 'Odeslat dotaz';
    chybaFormu(e.target, 'Odeslání se nepovedlo: ' + chyba(err));
  }
}


// ---------- menu kanceláře ----------
async function menu(aktivni) {
  if (!S.nabor) return '';
  const { count } = await sb.from('osoba').select('id', { count: 'exact', head: true }).eq('stav', 'uchazec');
  document.body.classList.add('ma-side'); document.body.classList.toggle('siroka', aktivni === 'lide' || aktivni === 'nastenka');
  const pol = [['nastenka', 'Nástěnka'], ['lide', 'Lidé'], ['prihlasky', 'Přihlášky', count], ['akce', 'Akce', null, 1], ['dokumenty', 'Dokumenty', null, 1], ['hodiny', 'Hodiny', null, 1], ['vyplaty', 'Výplaty', null, 1], ['nastaveni', 'Nastavení', null, 1], ['dotazy', 'Dotazy pro Tbdb']];
  return `<nav class="knav kside">${pol.map(([v, t, n, pripr]) => `<button data-v="${v}"${aktivni === v ? ' class="on"' : ''}${pripr ? ' disabled title="Připravujeme"' : ''}>${t}${n ? ` <span class="pocet">${n}</span>` : ''}${pripr ? '<small>připravujeme</small>' : ''}</button>`).join('')}</nav>`;
}
function zapniMenu() {
  $app.querySelectorAll('.knav button:not([disabled])').forEach((b) => (b.onclick = () => ({ nastenka: vNastenka, prihlasky: vPrihlasky, lide: vLide, dotazy: vUvod })[b.dataset.v]()));
}

// ---------- NÁSTĚNKA: „Dnes je potřeba“ ----------
async function vNastenka() {
  $app.innerHTML = `${await menu('nastenka')}<p class="mute">Načítám…</p>`; zapniMenu();
  try { await nactiLidi(); } catch (e) { $app.innerHTML = (await menu('nastenka')) + msg(esc(chyba(e)), 'bad'); zapniMenu(); return; }
  const tym = S.lide.filter((o) => ['prijata', 'aktivni'].includes(o.stav));
  const dlazdice = [
    ['y', S.lide.filter((o) => o.stav === 'uchazec').length, 'nových přihlášek', () => vPrihlasky()],
    ['r', tym.filter((o) => o.udaje && o.dpp !== 'podepsano').length, 'bez podepsané smlouvy (údaje mají)', () => lideFiltr({ udaje: 'ano', dpp: 'ne' })],
    ['y', tym.filter((o) => !o.udaje).length, 'bez údajů pro smlouvu', () => lideFiltr({ udaje: 'ne' })],
    ['y', tym.filter((o) => !o.ma_profil).length, 'bez profilu', () => lideFiltr({ profil: 'ne' })],
    ['y', tym.filter((o) => !o.fotky.length).length, 'bez fotky', () => lideFiltr({ foto: 'ne' })],
    ['g', tym.filter((o) => o.dpp === 'podepsano').length, 'připraveno s podepsanou DPP', () => lideFiltr({ dpp: 'ano' })],
  ];
  $app.innerHTML = `${await menu('nastenka')}<h1>Dnes je potřeba</h1><p class="mute">Počítá se z přijatých a aktivních lidí (${tym.length}). Kliknutím na dlaždici otevřete seznam.</p>
   <div class="tiles">${dlazdice.map(([c, n, t], i) => `<button class="tile ${n ? c : 'g'}" data-i="${i}"><div class="n">${n}</div>${t}</button>`).join('')}
    <div class="tile seda"><div class="n">–</div>nepřihlášeno ČSSZ<small>připravujeme</small></div><div class="tile seda"><div class="n">–</div>neobsazená místa na akcích<small>připravujeme</small></div></div>
   <h2>Akce tento týden</h2><p class="mute">Akce a obsazování připravujeme – tady bude přehled obsazení a smluv pro každou akci.</p>`;
  zapniMenu();
  $app.querySelectorAll('.tile[data-i]').forEach((t) => (t.onclick = () => dlazdice[t.dataset.i][3]()));
}
function lideFiltr(f) { F = { ...F0(), ...f }; ulozF(); STRANA = 0; vLide(); }

// ---------- přihlášky: schválení / odmítnutí uchazečů ----------
const FILTR = { uchazec: ['Nové', ['uchazec']], prijate: ['Přijaté', ['prijata', 'aktivni']], odmitnute: ['Odmítnuté', ['odmitnuta', 'neaktivni']] };
const STAV_O = { uchazec: ['nová', 't-w'], prijata: ['přijatá', 't-ok'], aktivni: ['aktivní', 't-ok'], neaktivni: ['neaktivní', 't-b'], odmitnuta: ['odmítnutá', 't-b'] };
const ZAJEM = { hosteska: 'hosteska', promoter: 'promotér/ka', jine: 'jiné' };
const KANAL = { email: 'e-mail', sms: 'SMS', whatsapp: 'WhatsApp', messenger: 'Messenger' };
async function ciselniky() {
  if (S.cis) return S.cis;
  const [{ data: kraj }, { data: okres }, { data: zp }] = await Promise.all([sb.from('kraj').select('kod,nazev'), sb.from('okres').select('kod,mesto,kraj_kod'), sb.from('zdravotni_pojistovna').select('kod,nazev')]);
  S.cis = { kraj: Object.fromEntries((kraj || []).map((k) => [k.kod, k.nazev])), okres: Object.fromEntries((okres || []).map((o) => [o.kod, o])), zp: Object.fromEntries((zp || []).map((z) => [z.kod, z.nazev])) };
  return S.cis;
}
function mistaText(kody) {
  const po = {};
  for (const k of kody) { const o = S.cis.okres[k]; const kr = o ? S.cis.kraj[o.kraj_kod] || o.kraj_kod : '?'; (po[kr] = po[kr] || []).push(o ? o.mesto : k); }
  return Object.entries(po).map(([kr, m]) => `<b>${esc(kr)}:</b> ${m.map(esc).join(', ')}`).join('<br>') || '<span class="mute">neuvedeno</span>';
}
async function vPrihlasky(filtr = 'uchazec', hlaska = '') {
  await ciselniky();
  const { data, error } = await sb.from('osoba').select('*, osoba_okres(okres_kod), osoba_poznamka(text), osoba_foto(cesta,poradi)').in('stav', FILTR[filtr][1]).order('vytvoreno', { ascending: filtr !== 'uchazec' ? false : true });
  if (error) { $app.innerHTML = msg(esc(chyba(error)), 'bad'); return; }
  for (const o of data || []) o.osoba_poznamka = Array.isArray(o.osoba_poznamka) ? o.osoba_poznamka[0] || null : o.osoba_poznamka;
  const karta = (o) => `<div class="card prihl" data-id="${o.id}">
     <div class="prihl-hl"><b>${esc(o.jmeno)} ${esc(o.prijmeni)}</b><span class="tag ${STAV_O[o.stav][1]}">${STAV_O[o.stav][0]}</span></div>
     <small class="mute">Registrace ${kdy(o.vytvoreno)}</small>
     <div class="det-fotky">${(o.osoba_foto || []).length ? [...o.osoba_foto].sort((a, b) => a.poradi - b.poradi).map((f) => `<img data-cesta="${esc(f.cesta)}" alt="">`).join('') : '<span class="mute">Bez fotky</span>'}</div>
     <dl>
      <dt>Telefon</dt><dd><a href="tel:${esc(o.telefon)}">${esc(o.telefon)}</a></dd>
      <dt>E-mail</dt><dd><a href="mailto:${esc(o.email)}">${esc(o.email)}</a></dd>
      <dt>Bydliště</dt><dd>${esc(o.obec || '')}</dd>
      <dt>Může pracovat</dt><dd>${mistaText((o.osoba_okres || []).map((x) => x.okres_kod))}</dd>
      <dt>Zájem</dt><dd>${(o.zajem || []).map((z) => esc(ZAJEM[z] || z)).join(', ')}</dd>
      <dt>Kontakt přes</dt><dd>${(o.kanal_kontaktu || []).map((z) => esc(KANAL[z] || z)).join(', ')}</dd>
      <dt>Souhlas</dt><dd>${o.souhlas_gdpr_at ? 'ano, ' + kdy(o.souhlas_gdpr_at) + ' (verze ' + esc(o.souhlas_gdpr_v) + ')' : '<span class="no">chybí</span>'}</dd>
     </dl>
     <form class="rozh" novalidate>
      <div class="fld" data-f="pozn"><label>Interní poznámka (hosteska ji neuvidí)</label><textarea rows="2" name="pozn" placeholder="Nepovinné – např. odkud se o nás dozvěděla">${esc(o.osoba_poznamka?.text || '')}</textarea><div class="err"></div></div>
      <div class="akce">
       ${o.stav !== 'prijata' && o.stav !== 'aktivni' ? '<button type="button" class="btn" data-a="prijata">Schválit</button>' : ''}
       ${o.stav !== 'odmitnuta' ? `<button type="button" class="btn o" data-a="odmitnuta">${o.stav === 'uchazec' ? 'Odmítnout' : 'Vyřadit'}</button>` : ''}
       ${o.stav !== 'uchazec' ? '<button type="button" class="btn o" data-a="uchazec">Vrátit mezi nové</button>' : ''}
      </div>
      <div class="potvrd hidden"></div>
     </form></div>`;
  $app.innerHTML = `${await menu('prihlasky')}<h1>Přihlášky</h1>${hlaska}
    <div class="chips filtr">${Object.entries(FILTR).map(([k, v]) => `<label><input type="radio" name="filtr" value="${k}"${k === filtr ? ' checked' : ''}> ${v[0]}</label>`).join('')}</div>
    ${(data || []).map(karta).join('') || `<p class="mute">${filtr === 'uchazec' ? 'Žádné nové přihlášky.' : 'Nic tu není.'}</p>`}
    <p class="pozn">Po schválení se hosteska může přihlásit e-mailem z registrace a doplnit profil a údaje pro smlouvu. E-mail o schválení zatím neposíláme (DOPLNIT po nastavení odesílání) – dejte jí prosím vědět.</p>`;
  zapniMenu();
  podepisFotky((data || []).flatMap((o) => (o.osoba_foto || []).map((f) => f.cesta))).then(() => $app.querySelectorAll('.prihl img[data-cesta]').forEach((i) => (i.src = S.fotoUrl[i.dataset.cesta] || '')));
  $app.querySelectorAll('input[name=filtr]').forEach((r) => (r.onchange = () => vPrihlasky(r.value)));
  $app.querySelectorAll('.prihl').forEach((karta) => {
    const id = karta.dataset.id, form = karta.querySelector('form'), potvrd = karta.querySelector('.potvrd');
    const o = data.find((x) => x.id === id), jmeno = `${o.jmeno} ${o.prijmeni}`;
    karta.querySelectorAll('button[data-a]').forEach((b) => (b.onclick = () => {
      const novy = b.dataset.a;
      if (novy === 'prijata') return zmenStav(o, novy, form);
      potvrd.classList.remove('hidden');
      potvrd.innerHTML = `${msg(novy === 'odmitnuta' ? `Opravdu ${o.stav === 'uchazec' ? 'odmítnout' : 'vyřadit'} ${esc(jmeno)}? Záznam zůstane v Odmítnutých, jde to vrátit.` : `Vrátit ${esc(jmeno)} mezi nové?`, 'warn')}
        <div class="akce"><button type="button" class="btn" data-ok>Ano</button><button type="button" class="btn o" data-ne>Ne</button></div>`;
      potvrd.querySelector('[data-ne]').onclick = () => potvrd.classList.add('hidden');
      potvrd.querySelector('[data-ok]').onclick = () => zmenStav(o, novy, form);
    }));
  });
}
async function zmenStav(o, novy, form) {
  form.querySelectorAll('button').forEach((b) => (b.disabled = true));
  const pozn = form.querySelector('textarea[name=pozn]').value.trim();
  const { error } = await sb.from('osoba').update({ stav: novy }).eq('id', o.id);
  if (error) { form.querySelectorAll('button').forEach((b) => (b.disabled = false)); return chybaFormu(form, chyba(error)); }
  if (pozn !== (o.osoba_poznamka?.text || '')) {
    const r = pozn ? await sb.from('osoba_poznamka').upsert({ osoba_id: o.id, text: pozn, zmeneno: new Date().toISOString() }) : await sb.from('osoba_poznamka').delete().eq('osoba_id', o.id);
    if (r.error) return chybaFormu(form, 'Stav je uložený, poznámka ne: ' + chyba(r.error));
  }
  const jm = esc(`${o.jmeno} ${o.prijmeni}`);
  const text = { prijata: `Přihláška – ${jm}: schváleno ✓ Přihlásí se e-mailem ${esc(o.email)}.`, odmitnuta: `Přihláška – ${jm}: odmítnuto (najdete v Odmítnutých).`, uchazec: `Přihláška – ${jm}: vrácena mezi nové.` }[novy];
  vPrihlasky(o.stav === 'uchazec' ? 'uchazec' : novy === 'uchazec' ? 'uchazec' : novy === 'prijata' ? 'prijate' : 'odmitnute', msg(text));
}

// ---------- LIDÉ: přehled všech hostesek s filtry, hromadnými akcemi a detailem ----------
const KONFEKCE = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const F0 = () => ({ text: '', tel: '', foto: '', stav: ['prijata', 'aktivni'], kraje: [], okres: '', zajem: [], kanal: [], vyskaOd: '', vyskaDo: '', konfekce: [], jazyk: '', ridicak: false, auto: false, profil: '', udaje: '', dpp: '', vekOd: '', vekDo: '', regOd: '' });
let F = F0(), RAZENI = { k: 'reg', smer: -1 }, STRANA = 0;
const NA_STRANU = 50;
try { const ul = JSON.parse(localStorage.getItem('vixen_lide_filtr') || 'null'); if (ul) F = { ...F0(), ...ul }; } catch {}
const ulozF = () => { try { localStorage.setItem('vixen_lide_filtr', JSON.stringify(F)); } catch {} };
const bezDiakritiky = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const datum = (d) => (d ? new Date(d).toLocaleDateString('cs-CZ') : '');
const krajeOsoby = (o) => [...new Set(o.okresy.map((k) => S.cis.okres[k]?.kraj_kod).filter(Boolean))];
S.fotoUrl = S.fotoUrl || {};

async function nactiLidi() {
  await ciselniky();
  const [a, b] = await Promise.all([
    sb.from('osoba').select('*, osoba_okres(okres_kod), osoba_profil(*), osoba_poznamka(text), osoba_foto(cesta,poradi)').order('vytvoreno', { ascending: false }),
    sb.rpc('kancelar_lide'),
  ]);
  if (a.error) throw a.error;
  const stav = Object.fromEntries((b.data || []).map((x) => [x.osoba_id, x]));
  const jeden = (x) => (Array.isArray(x) ? x[0] || null : x);
  S.lide = (a.data || []).map((o) => {
    const p = jeden(o.osoba_profil), s = stav[o.id] || {}, fotky = [...(o.osoba_foto || [])].sort((x, y) => x.poradi - y.poradi);
    return { ...o, profil: p, pozn: jeden(o.osoba_poznamka)?.text || '', okresy: (o.osoba_okres || []).map((x) => x.okres_kod), fotky: fotky.map((f) => f.cesta),
      ma_profil: !!p, udaje: !!s.udaje_hotove, vek: s.vek ?? null, dpp: s.dpp_stav || '', dpp_at: s.dpp_podepsano_at || null,
      hledej: bezDiakritiky([o.jmeno, o.prijmeni, o.email, o.obec].join(' ')) };
  });
}

// podepsané odkazy na fotky (soukromé úložiště) – jen pro to, co je vidět
async function podepisFotky(cesty) {
  const chybi = [...new Set(cesty)].filter((c) => c && !S.fotoUrl[c]);
  if (!chybi.length) return;
  if (window.VIXEN_DEMO_FOTO) { chybi.forEach((c) => (S.fotoUrl[c] = window.VIXEN_DEMO_FOTO(c))); return; }
  const { data } = await sb.storage.from('fotky').createSignedUrls(chybi, 3600);
  (data || []).forEach((d, i) => { if (d.signedUrl) S.fotoUrl[chybi[i]] = d.signedUrl; });
}
const inicialy = (o) => esc((o.jmeno[0] || '') + (o.prijmeni[0] || ''));
const nahled = (o, velky) => o.fotky[0]
  ? `<span class="foto${velky ? ' velka' : ''}" data-cesta="${esc(o.fotky[0])}"><img alt="" src="${esc(S.fotoUrl[o.fotky[0]] || '')}"></span>`
  : `<span class="foto bez${velky ? ' velka' : ''}" title="Bez fotky">${inicialy(o)}</span>`;

function filtruj() {
  const t = bezDiakritiky(F.text).trim(), tel = F.tel.replace(/\D/g, '');
  const tri = (hodnota, f) => !f || (f === 'ano' ? hodnota : !hodnota);
  const num = (v) => (v === '' || v == null ? null : Number(v));
  return S.lide.filter((o) => {
    if (t && !o.hledej.includes(t)) return false;
    if (tel && !o.telefon.replace(/\D/g, '').includes(tel)) return false;
    if (F.foto && (F.foto === 'ano') !== o.fotky.length > 0) return false;
    if (F.stav.length && !F.stav.includes(o.stav)) return false;
    if (F.kraje.length && !krajeOsoby(o).some((k) => F.kraje.includes(k))) return false;
    if (F.okres && !o.okresy.includes(F.okres)) return false;
    if (F.zajem.length && !F.zajem.some((z) => (o.zajem || []).includes(z))) return false;
    if (F.kanal.length && !F.kanal.some((z) => (o.kanal_kontaktu || []).includes(z))) return false;
    const p = o.profil || {};
    if (num(F.vyskaOd) && !(p.vyska_cm >= num(F.vyskaOd))) return false;
    if (num(F.vyskaDo) && !(p.vyska_cm <= num(F.vyskaDo))) return false;
    if (F.konfekce.length && !F.konfekce.includes(p.konfekce)) return false;
    if (F.jazyk && !(p.jazyky || []).some((j) => bezDiakritiky(j).includes(bezDiakritiky(F.jazyk)))) return false;
    if (F.ridicak && !p.ridicak) return false;
    if (F.auto && !p.vlastni_auto) return false;
    if (!tri(o.ma_profil, F.profil) || !tri(o.udaje, F.udaje) || !tri(o.dpp === 'podepsano', F.dpp)) return false;
    if (num(F.vekOd) && !(o.vek >= num(F.vekOd))) return false;
    if (num(F.vekDo) && !(o.vek <= num(F.vekDo))) return false;
    if (F.regOd && new Date(o.vytvoreno) < new Date(F.regOd)) return false;
    return true;
  });
}
const RAD = {
  profil: (o) => (o.ma_profil ? 1 : 0), udaje: (o) => (o.udaje ? 1 : 0), dpp: (o) => (o.dpp === 'podepsano' ? 2 : o.dpp ? 1 : 0),
  jmeno: (o) => bezDiakritiky(o.prijmeni + ' ' + o.jmeno), stav: (o) => o.stav, vyska: (o) => o.profil?.vyska_cm ?? 0, foto: (o) => o.fotky.length,
  vek: (o) => o.vek ?? 0, reg: (o) => o.vytvoreno, podklady: (o) => (o.ma_profil ? 1 : 0) + (o.udaje ? 1 : 0) + (o.dpp === 'podepsano' ? 1 : 0),
};
const serad = (l) => [...l].sort((a, b) => { const x = RAD[RAZENI.k](a), y = RAD[RAZENI.k](b); return (x > y ? 1 : x < y ? -1 : 0) * RAZENI.smer; });

// filtr ve sloupci: rozbalovací seznam zaškrtávátek
const vf = (nazev, titul, volby, extra = '') => `<details class="vf" data-vf="${nazev}"><summary></summary><div class="vf-panel"><b>${titul}</b>
  ${volby.map(([k, v]) => `<label><input type="checkbox" data-f="${nazev}" value="${esc(k)}"${F[nazev].includes(k) ? ' checked' : ''}> ${esc(v)}</label>`).join('')}${extra}</div></details>`;
const triSel = (nazev, popis) => `<label class="tri">${popis}<select data-f="${nazev}"><option value="">vše</option><option value="ano"${F[nazev] === 'ano' ? ' selected' : ''}>ano</option><option value="ne"${F[nazev] === 'ne' ? ' selected' : ''}>ne</option></select></label>`;
function popiskyFiltru() {
  const pocet = (n) => (n ? ` (${n})` : '');
  const nast = {
    stav: () => (F.stav.length ? F.stav.map((k) => STAV_O[k][0]).join(', ') : 'vše'),
    kraje: () => (F.kraje.length ? `kraje${pocet(F.kraje.length)}` : 'vše') + (F.okres ? ' · ' + (S.cis.okres[F.okres]?.mesto || '') : ''),
    zajem: () => (F.zajem.length ? F.zajem.map((k) => ZAJEM[k]).join(', ') : 'vše'),
    kanal: () => (F.kanal.length ? F.kanal.map((k) => KANAL[k]).join(', ') : 'kontakt přes'),
    konfekce: () => (F.konfekce.length ? F.konfekce.join(', ') : 'velikost'),
    jazykx: () => [F.ridicak && 'řidičák', F.auto && 'auto'].filter(Boolean).join(', ') || 'řidičák / auto',
    podklady: () => [F.profil && 'P ' + F.profil, F.udaje && 'Ú ' + F.udaje, F.dpp && 'D ' + F.dpp].filter(Boolean).join(', ') || 'vše',
  };
  document.querySelectorAll('details.vf').forEach((d) => { const f = nast[d.dataset.vf]; d.querySelector('summary').textContent = f ? f() : ''; d.classList.toggle('aktivni', f && !/^(vše|kontakt přes|velikost|řidičák \/ auto)$/.test(f())); });
}

async function vLide(hlaska = '') {
  $app.innerHTML = `${await menu('lide')}<p class="mute">Načítám lidi…</p>`; zapniMenu();
  try { await nactiLidi(); } catch (e) { $app.innerHTML = (await menu('lide')) + msg(esc(chyba(e)), 'bad'); zapniMenu(); return; }
  const krajeVolby = Object.entries(S.cis.kraj).sort((a, b) => a[1].localeCompare(b[1], 'cs'));
  const okresy = Object.values(S.cis.okres).sort((a, b) => a.mesto.localeCompare(b.mesto, 'cs'));
  const th = (k, t) => (k ? `<th data-k="${k}" class="raz">${t}<i></i></th>` : `<th>${t}</th>`);
  $app.innerHTML = `${await menu('lide')}
   <div class="lide-hlava"><h1>Lidé</h1><span id="pocet" class="mute"></span><span id="shrnuti" class="shrnuti"></span><button class="btn o mini" id="vymazat">Vymazat filtry</button>
    <span class="pozn">Filtry jsou v řádku pod názvy sloupců. Najetím na fotku se zvětší, kliknutím na řádek otevřete detail.</span></div>${hlaska}
   <div id="hromadne" class="hromadne hidden"></div>
   <div class="tab-obal"><table class="lide-tab"><thead>
    <tr><th class="vyb-sl"><input type="checkbox" id="vse" title="Vybrat vše podle filtru"></th>${th('foto', 'Foto')}${th('jmeno', 'Jméno')}${th('stav', 'Stav')}${th('', 'Telefon')}${th('', 'Kraje')}${th('', 'Zájem')}${th('vyska', 'Výška')}${th('', 'Jazyky')}${th('vek', 'Věk')}${th('profil', 'Profil')}${th('udaje', 'Údaje')}${th('dpp', 'DPP')}${th('', 'ČSSZ')}${th('reg', 'Registrace')}</tr>
    <tr class="filtry-radek">
     <td></td>
     <td><select data-f="foto"><option value="">vše</option><option value="ano"${F.foto === 'ano' ? ' selected' : ''}>s fotkou</option><option value="ne"${F.foto === 'ne' ? ' selected' : ''}>bez</option></select></td>
     <td><input data-f="text" type="search" placeholder="jméno, e-mail, obec" value="${esc(F.text)}"></td>
     <td>${vf('stav', 'Stav', Object.entries(STAV_O).map(([k, v]) => [k, v[0]]))}</td>
     <td><input data-f="tel" type="search" inputmode="numeric" placeholder="část čísla" value="${esc(F.tel)}">${vf('kanal', 'Kontakt přes', Object.entries(KANAL))}</td>
     <td>${vf('kraje', 'Kraje', krajeVolby, `<b>Okresní město</b><select data-f="okres"><option value="">– všechna –</option>${okresy.map((o) => `<option value="${o.kod}"${F.okres === o.kod ? ' selected' : ''}>${esc(o.mesto)}</option>`).join('')}</select>`)}</td>
     <td>${vf('zajem', 'Zájem', Object.entries(ZAJEM))}</td>
     <td><div class="od-do"><input data-f="vyskaOd" type="number" placeholder="od" value="${esc(F.vyskaOd)}"><input data-f="vyskaDo" type="number" placeholder="do" value="${esc(F.vyskaDo)}"></div>${vf('konfekce', 'Konfekce', KONFEKCE.map((k) => [k, k]))}</td>
     <td><input data-f="jazyk" type="search" placeholder="jazyk" value="${esc(F.jazyk)}"><details class="vf" data-vf="jazykx"><summary></summary><div class="vf-panel"><b>Doprava</b>
       <label><input type="checkbox" data-f="ridicak"${F.ridicak ? ' checked' : ''}> řidičák</label><label><input type="checkbox" data-f="auto"${F.auto ? ' checked' : ''}> vlastní auto</label></div></details></td>
     <td><div class="od-do"><input data-f="vekOd" type="number" placeholder="od" value="${esc(F.vekOd)}"><input data-f="vekDo" type="number" placeholder="do" value="${esc(F.vekDo)}"></div></td>
     ${['profil', 'udaje', 'dpp'].map((k) => `<td><select data-f="${k}" class="mini-sel"><option value="">vše</option><option value="ano"${F[k] === 'ano' ? ' selected' : ''}>●&nbsp;má</option><option value="ne"${F[k] === 'ne' ? ' selected' : ''}>○&nbsp;chybí</option></select></td>`).join('')}<td></td>
     <td><input data-f="regOd" type="date" title="Registrace od" value="${esc(F.regOd)}"></td>
    </tr></thead><tbody id="telo"></tbody></table></div>
   <div id="strany"></div>
   <p class="pozn"><span class="tecka ok">●</span> hotovo · <span class="tecka wa">●</span> čeká (např. smlouva na podpis) · <span class="tecka no">●</span> chybí · <span class="tecka">●</span> připravujeme (ČSSZ, hodiny za rok).</p>
   <div id="foto-velka" class="foto-velka hidden"><img alt=""></div>
   <div id="detail" class="detail hidden"></div>`;
  zapniMenu();
  document.getElementById('vymazat').onclick = () => { F = F0(); ulozF(); vLide(); };
  $app.querySelectorAll('thead th.raz').forEach((t) => (t.onclick = () => { RAZENI = { k: t.dataset.k, smer: RAZENI.k === t.dataset.k ? -RAZENI.smer : 1 }; vykresliTabulku(); }));
  $app.querySelectorAll('thead [data-f]').forEach((el) => (el.oninput = el.onchange = () => {
    const k = el.dataset.f;
    const pred = JSON.stringify(F[k]);
    if (el.type === 'checkbox' && Array.isArray(F[k])) F[k] = [...$app.querySelectorAll(`thead input[data-f="${k}"]:checked`)].map((x) => x.value);
    else if (el.type === 'checkbox') F[k] = el.checked; else F[k] = el.value;
    if (JSON.stringify(F[k]) === pred) return;   // „change“ po opuštění pole bez změny nepřekresluje (jinak by se ztratilo kliknutí)
    ulozF(); STRANA = 0; popiskyFiltru(); vykresliTabulku();
  }));
  document.addEventListener('click', (e) => { if (!e.target.closest('details.vf')) $app.querySelectorAll('details.vf[open]').forEach((d) => d.removeAttribute('open')); }, { once: false });
  const v = document.getElementById('vse');
  v.onchange = () => { filtruj().forEach((o) => (v.checked ? S.vyber.add(o.id) : S.vyber.delete(o.id))); vykresliTabulku(); };
  popiskyFiltru(); vykresliTabulku();
}

function vykresliTabulku() {
  const vse = serad(filtruj()), stran = Math.max(1, Math.ceil(vse.length / NA_STRANU));
  STRANA = Math.min(STRANA, stran - 1);
  const list = vse.slice(STRANA * NA_STRANU, (STRANA + 1) * NA_STRANU);
  document.getElementById('pocet').textContent = `${vse.length} z ${S.lide.length}`;
  const shrn = [F.text && `„${F.text}“`, F.stav.length && F.stav.map((k) => STAV_O[k][0]).join('+'), F.kraje.length && F.kraje.map((k) => S.cis.kraj[k]).join(', '), F.okres && S.cis.okres[F.okres]?.mesto,
    F.zajem.length && F.zajem.map((k) => ZAJEM[k]).join('+'), (F.vyskaOd || F.vyskaDo) && `výška ${F.vyskaOd || '…'}–${F.vyskaDo || '…'}`, F.jazyk, F.foto && (F.foto === 'ano' ? 's fotkou' : 'bez fotky'),
    F.profil && `profil ${F.profil === 'ano' ? 'má' : 'chybí'}`, F.udaje && `údaje ${F.udaje === 'ano' ? 'má' : 'chybí'}`, F.dpp && `DPP ${F.dpp === 'ano' ? 'má' : 'chybí'}`].filter(Boolean);
  document.getElementById('shrnuti').textContent = shrn.length ? 'filtr: ' + shrn.join(' · ') : 'bez filtru';
  $app.querySelectorAll('thead th.raz').forEach((t) => { t.classList.toggle('on', RAZENI.k === t.dataset.k); t.querySelector('i').textContent = RAZENI.k === t.dataset.k ? (RAZENI.smer > 0 ? ' ▲' : ' ▼') : ''; });
  const tecka = (c, t) => `<span class="tecka ${c}" title="${t}: ${c === 'ok' ? 'hotovo' : c === 'wa' ? 'čeká' : c === 'no' ? 'chybí' : '–'}">●</span>`;
  const zn = (ok, t, title) => `<span class="zn ${ok ? 'ok' : ''}" title="${title}: ${ok ? 'ano' : 'ne'}">${t}</span>`;
  const radek = (o) => {
    const p = o.profil || {}, kr = krajeOsoby(o).map((k) => S.cis.kraj[k] || k);
    return `<tr data-id="${o.id}"${S.vyber.has(o.id) ? ' class="vybran"' : ''}>
     <td><input type="checkbox" class="vyb" ${S.vyber.has(o.id) ? 'checked' : ''}></td>
     <td>${nahled(o)}</td>
     <td><b>${esc(o.prijmeni)} ${esc(o.jmeno)}</b><small>${esc(o.obec || '')}</small></td>
     <td><span class="tag ${STAV_O[o.stav][1]}">${STAV_O[o.stav][0]}</span></td>
     <td><a href="tel:${esc(o.telefon)}" class="tel">${esc(o.telefon)}</a><small>${esc((o.kanal_kontaktu || []).map((z) => KANAL[z] || z).join(', '))}</small></td>
     <td title="${esc(o.okresy.map((k) => S.cis.okres[k]?.mesto || k).join(', '))}">${esc(kr.slice(0, 2).join(', '))}${kr.length > 2 ? ` +${kr.length - 2}` : ''}<small>${o.okresy.length} měst</small></td>
     <td>${esc((o.zajem || []).map((z) => ZAJEM[z] || z).join(', '))}</td>
     <td class="nw">${p.vyska_cm ? p.vyska_cm + ' cm' : '–'}<small>${esc(p.konfekce || '')}${p.bota_eu ? ' · ' + p.bota_eu : ''}</small></td>
     <td>${esc((p.jazyky || []).join(', ')) || '–'}<small>${p.ridicak ? 'řidičák' : ''}${p.vlastni_auto ? ' · auto' : ''}</small></td>
     <td>${o.vek ?? '–'}</td>
     <td class="semf">${tecka(o.ma_profil ? 'ok' : 'no', 'Profil')}</td><td class="semf">${tecka(o.udaje ? 'ok' : 'no', 'Údaje pro smlouvu')}</td>
     <td class="semf">${tecka(o.dpp === 'podepsano' ? 'ok' : o.dpp === 'k_podpisu' ? 'wa' : 'no', o.dpp === 'k_podpisu' ? 'DPP čeká na podpis' : 'DPP')}</td><td class="semf">${tecka('', 'ČSSZ – připravujeme')}</td>
     <td>${datum(o.vytvoreno)}</td></tr>`;
  };
  const telo = document.getElementById('telo');
  telo.innerHTML = list.length ? list.map(radek).join('') : `<tr><td colspan="15" class="prazdno">Filtru nikdo neodpovídá.</td></tr>`;
  document.getElementById('strany').innerHTML = stran > 1 ? `<div class="strany"><button class="btn o mini" id="pred"${STRANA ? '' : ' disabled'}>←</button> strana ${STRANA + 1} z ${stran} <button class="btn o mini" id="dal"${STRANA < stran - 1 ? '' : ' disabled'}>→</button></div>` : '';
  telo.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = (e) => {
    if (e.target.closest('a')) return;
    if (e.target.classList.contains('vyb')) { e.target.checked ? S.vyber.add(tr.dataset.id) : S.vyber.delete(tr.dataset.id); tr.classList.toggle('vybran', e.target.checked); return hromadne(); }
    vDetailOsoby(tr.dataset.id);
  }));
  const v = document.getElementById('vse'); v.checked = vse.length > 0 && vse.every((o) => S.vyber.has(o.id));
  const pr = document.getElementById('pred'), da = document.getElementById('dal');
  if (pr) pr.onclick = () => { STRANA--; vykresliTabulku(); }; if (da) da.onclick = () => { STRANA++; vykresliTabulku(); };
  hromadne();
  // fotky: podepsat jen viditelné a zapnout zvětšení při najetí
  podepisFotky(list.flatMap((o) => o.fotky.slice(0, 1))).then(() => telo.querySelectorAll('.foto[data-cesta] img').forEach((img) => { const u = S.fotoUrl[img.parentElement.dataset.cesta]; if (u && img.src !== u) img.src = u; }));
  const velka = document.getElementById('foto-velka');
  telo.querySelectorAll('.foto[data-cesta]').forEach((f) => {
    f.onmouseenter = (e) => { const u = S.fotoUrl[f.dataset.cesta]; if (!u) return; velka.querySelector('img').src = u; velka.classList.remove('hidden'); posunNahled(e); };
    f.onmousemove = posunNahled; f.onmouseleave = () => velka.classList.add('hidden');
  });
  function posunNahled(e) { const w = 260, h = 340; velka.style.left = Math.min(e.clientX + 18, innerWidth - w - 10) + 'px'; velka.style.top = Math.max(10, Math.min(e.clientY - h / 2, innerHeight - h - 10)) + 'px'; }
}

function hromadne() {
  const el = document.getElementById('hromadne'); const ids = [...S.vyber].filter((id) => S.lide.some((o) => o.id === id));
  if (!ids.length) return el.classList.add('hidden');
  const osoby = S.lide.filter((o) => ids.includes(o.id));
  el.classList.remove('hidden');
  el.innerHTML = `<b>Vybráno ${ids.length}</b>
    <button class="btn o mini" data-h="email">Kopírovat e-maily</button><button class="btn o mini" data-h="tel">Kopírovat telefony</button>
    <button class="btn o mini" data-h="csv">Export do Excelu (CSV)</button>
    <select id="hstav"><option value="">Změnit stav…</option>${Object.entries(STAV_O).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select>
    <button class="btn o mini" data-h="zrus">Zrušit výběr</button><span id="hinfo" class="mute"></span>`;
  const info = (t) => (document.getElementById('hinfo').textContent = t);
  const kopiruj = async (t, co) => { try { await navigator.clipboard.writeText(t); info(`Zkopírováno: ${co}`); } catch { info('Kopírování prohlížeč nepovolil.'); } };
  el.querySelector('[data-h=email]').onclick = () => kopiruj(osoby.map((o) => o.email).join(', '), `${osoby.length} e-mailů`);
  el.querySelector('[data-h=tel]').onclick = () => kopiruj(osoby.map((o) => o.telefon).join('\n'), `${osoby.length} telefonů`);
  el.querySelector('[data-h=csv]').onclick = () => { exportCsv(osoby); info('Soubor stažen.'); };
  el.querySelector('[data-h=zrus]').onclick = () => { S.vyber.clear(); vykresliTabulku(); };
  el.querySelector('#hstav').onchange = (e) => {
    const novy = e.target.value; if (!novy) return;
    el.insertAdjacentHTML('beforeend', `<div class="potvrd-h">${msg(`Opravdu změnit stav ${ids.length} lidí na „${STAV_O[novy][0]}“?`, 'warn')}<button class="btn mini" data-ok>Ano, změnit</button> <button class="btn o mini" data-ne>Ne</button></div>`);
    el.querySelector('[data-ne]').onclick = () => vykresliTabulku();
    el.querySelector('[data-ok]').onclick = async () => {
      const { error } = await sb.from('osoba').update({ stav: novy }).in('id', ids);
      if (error) return info(chyba(error));
      S.vyber.clear(); vLide(msg(`Stav změněn u ${ids.length} lidí.`));
    };
  };
}

function exportCsv(osoby) {
  const h = ['Příjmení', 'Jméno', 'Telefon', 'E-mail', 'Bydliště', 'Stav', 'Kraje', 'Okresní města', 'Zájem', 'Kontakt přes', 'Výška', 'Konfekce', 'Bota', 'Jazyky', 'Řidičák', 'Auto', 'Dostupnost', 'Věk', 'Profil', 'Údaje', 'DPP podepsaná', 'Registrace'];
  const r = osoby.map((o) => { const p = o.profil || {}; return [o.prijmeni, o.jmeno, o.telefon, o.email, o.obec, STAV_O[o.stav][0], krajeOsoby(o).map((k) => S.cis.kraj[k]).join(', '),
    o.okresy.map((k) => S.cis.okres[k]?.mesto || k).join(', '), (o.zajem || []).map((z) => ZAJEM[z] || z).join(', '), (o.kanal_kontaktu || []).map((z) => KANAL[z] || z).join(', '),
    p.vyska_cm || '', p.konfekce || '', p.bota_eu || '', (p.jazyky || []).join(', '), p.ridicak ? 'ano' : '', p.vlastni_auto ? 'ano' : '', p.dostupnost || '', o.vek ?? '',
    o.ma_profil ? 'ano' : 'ne', o.udaje ? 'ano' : 'ne', o.dpp === 'podepsano' ? datum(o.dpp_at) : 'ne', datum(o.vytvoreno)]; });
  const csv = '﻿' + [h, ...r].map((x) => x.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `vixen_lide_${new Date().toISOString().slice(0, 10)}.csv`; document.body.append(a); a.click(); a.remove();
}

// ---------- detail osoby (panel vpravo) ----------
async function vDetailOsoby(id) {
  const o = S.lide.find((x) => x.id === id); if (!o) return;
  const d = document.getElementById('detail'); d.classList.remove('hidden');
  const p = o.profil || {}, tel = o.telefon.replace(/\D/g, '');
  const mistaPodleKraju = mistaText(o.okresy);
  d.innerHTML = `<div class="det-hl"><div><h2>${esc(o.jmeno)} ${esc(o.prijmeni)}</h2><span class="tag ${STAV_O[o.stav][1]}">${STAV_O[o.stav][0]}</span> <span class="mute">registrace ${datum(o.vytvoreno)}</span></div><button class="zavrit" title="Zavřít">✕</button></div>
   <div class="det-fotky" id="det-fotky">${o.fotky.length ? o.fotky.map((c) => `<img data-cesta="${esc(c)}" alt="">`).join('') : `<span class="foto bez velka">${inicialy(o)}</span><span class="mute">Bez fotky – hosteska ji může nahrát v profilu.</span>`}</div>
   <div class="det-akce"><a class="btn o mini" href="tel:${esc(o.telefon)}">📞 Zavolat</a><a class="btn o mini" href="mailto:${esc(o.email)}">✉ E-mail</a><a class="btn o mini" href="https://wa.me/${tel}" target="_blank" rel="noopener">WhatsApp</a></div>
   <section><h3>Kontakt a registrace</h3><dl>
    <dt>Telefon</dt><dd>${esc(o.telefon)}</dd><dt>E-mail</dt><dd>${esc(o.email)}</dd><dt>Bydliště</dt><dd>${esc(o.obec || '')}</dd>
    <dt>Může pracovat</dt><dd>${mistaPodleKraju}</dd><dt>Zájem</dt><dd>${(o.zajem || []).map((z) => esc(ZAJEM[z] || z)).join(', ')}</dd>
    <dt>Kontakt přes</dt><dd>${(o.kanal_kontaktu || []).map((z) => esc(KANAL[z] || z)).join(', ')}</dd>
    <dt>Souhlas</dt><dd>${o.souhlas_gdpr_at ? datum(o.souhlas_gdpr_at) + ' (verze ' + esc(o.souhlas_gdpr_v) + ')' : '<span class="no">chybí</span>'}</dd></dl></section>
   <section><h3>Profil</h3>${o.ma_profil ? `<dl><dt>Výška</dt><dd>${p.vyska_cm ? p.vyska_cm + ' cm' : '–'}</dd><dt>Konfekce / bota</dt><dd>${esc(p.konfekce || '–')} / ${p.bota_eu || '–'}</dd>
     <dt>Jazyky</dt><dd>${esc((p.jazyky || []).join(', ') || '–')}</dd><dt>Řidičák / auto</dt><dd>${p.ridicak ? 'ano' : 'ne'} / ${p.vlastni_auto ? 'ano' : 'ne'}</dd>
     <dt>Dostupnost</dt><dd>${esc(p.dostupnost || '–')}</dd><dt>Zkušenosti</dt><dd>${esc(p.zkusenosti || '–')}</dd></dl>` : '<p class="mute">Zatím nevyplnila.</p>'}</section>
   <section><h3>Smlouva a podklady</h3><div id="det-smlouva"><p class="mute">${S.smlouvy ? 'Načítám…' : `Údaje pro smlouvu: <b>${o.udaje ? 'potvrzené' : 'chybí'}</b> · DPP: <b>${o.dpp === 'podepsano' ? 'podepsaná ' + datum(o.dpp_at) : o.dpp === 'k_podpisu' ? 'čeká na podpis' : 'zatím ne'}</b><br>Podrobnosti vidí jen role Smlouvy.`}</p></div></section>
   <section><h3>Stav a poznámka</h3><form id="det-f" novalidate>
    <div class="fld"><label>Stav</label><select id="det-stav">${Object.entries(STAV_O).map(([k, v]) => `<option value="${k}"${k === o.stav ? ' selected' : ''}>${v[0]}</option>`).join('')}</select></div>
    <div class="fld"><label>Interní poznámka (hosteska ji neuvidí)</label><textarea id="det-pozn" rows="3">${esc(o.pozn)}</textarea></div>
    <button class="btn" type="submit">Uložit</button></form></section>
   ${S.vedeni || S.tbdb ? '<section><h3>Historie změn</h3><div id="det-hist" class="mute">Načítám…</div></section>' : ''}`;
  d.querySelector('.zavrit').onclick = () => d.classList.add('hidden');
  podepisFotky(o.fotky).then(() => d.querySelectorAll('#det-fotky img').forEach((img) => (img.src = S.fotoUrl[img.dataset.cesta] || '')));
  d.querySelector('#det-f').onsubmit = async (e) => {
    e.preventDefault();
    const stav = d.querySelector('#det-stav').value, pozn = d.querySelector('#det-pozn').value.trim();
    if (stav !== o.stav) { const { error } = await sb.from('osoba').update({ stav }).eq('id', id); if (error) return chybaFormu(e.target, chyba(error)); o.stav = stav; }
    if (pozn !== o.pozn) {
      const r = pozn ? await sb.from('osoba_poznamka').upsert({ osoba_id: id, text: pozn, zmeneno: new Date().toISOString() }) : await sb.from('osoba_poznamka').delete().eq('osoba_id', id);
      if (r.error) return chybaFormu(e.target, chyba(r.error)); o.pozn = pozn;
    }
    vykresliTabulku(); vDetailOsoby(id);
    d.querySelector('#det-f').insertAdjacentHTML('afterbegin', msg('Uloženo ✓'));
  };
  if (S.smlouvy) detailSmlouva(o);
  if (S.vedeni || S.tbdb) detailHistorie(o);
}

async function detailSmlouva(o) {
  const box = document.getElementById('det-smlouva');
  const [{ data: n }, { data: dok }] = await Promise.all([
    sb.from('osoba_nastup').select('*').eq('osoba_id', o.id).maybeSingle(),
    sb.from('dokument').select('id,stav,vytvoreno,podepsano_at,podpis,dokument_sablona(nazev,druh)').eq('osoba_id', o.id).order('vytvoreno', { ascending: false }),
  ]);
  if (!box) return;
  const skryj = (t) => (t ? String(t).slice(0, 2) + '••••' + String(t).slice(-2) : '–');
  const ucet = n ? `${n.ucet_predcisli ? n.ucet_predcisli + '-' : ''}${n.ucet_cislo}/${n.ucet_banka}` : '';
  box.innerHTML = n ? `<dl>
     <dt>Údaje potvrzeny</dt><dd>${n.potvrzeno_at ? datum(n.potvrzeno_at) : '<span class="no">ne</span>'}</dd>
     <dt>Rodné číslo</dt><dd><span class="citl" data-plne="${esc(n.rodne_cislo)}">${esc(skryj(n.rodne_cislo))}</span></dd>
     <dt>Narozena</dt><dd>${datum(n.datum_narozeni)}${o.vek != null ? ` (${o.vek} let)` : ''}, ${esc(n.misto_narozeni || '')}</dd>
     <dt>Adresa</dt><dd>${esc([n.ulice, n.cislo_popisne].filter(Boolean).join(' '))}, ${esc(n.psc || '')} ${esc(n.obec || '')}</dd>
     <dt>Pojišťovna</dt><dd>${esc(S.cis.zp?.[n.zdravotni_pojistovna] || n.zdravotni_pojistovna || '–')}</dd>
     <dt>Účet</dt><dd><span class="citl" data-plne="${esc(ucet)}">${esc(skryj(ucet))}</span></dd></dl>
     <button class="btn o mini" id="ukaz-citl">Zobrazit rodné číslo a účet</button>`
    : '<p class="mute">Údaje pro smlouvu zatím nevyplnila.</p>';
  const ukaz = document.getElementById('ukaz-citl');
  if (ukaz) ukaz.onclick = () => { box.querySelectorAll('.citl').forEach((s) => (s.textContent = s.dataset.plne)); ukaz.remove(); };
  const DS = { k_podpisu: ['čeká na podpis', 't-w'], podepsano: ['podepsáno', 't-ok'], zruseno: ['zrušeno', 't-b'] };
  box.insertAdjacentHTML('beforeend', `<h4>Dokumenty</h4>${(dok || []).map((x) => `<div class="dok-r"><span>${esc(x.dokument_sablona?.nazev || 'Dokument')}<small>${datum(x.vytvoreno)}${x.podepsano_at ? ' · podepsáno ' + datum(x.podepsano_at) + (x.podpis?.zpusob ? ' (' + esc(x.podpis.zpusob) + ')' : '') : ''}</small></span><span class="tag ${DS[x.stav][1]}">${DS[x.stav][0]}</span></div>`).join('') || '<p class="mute">Žádné.</p>'}
    ${n?.potvrzeno_at && !(dok || []).some((x) => x.dokument_sablona?.druh === 'dpp' && x.stav !== 'zruseno') ? '<button class="btn o mini" id="pripr-dpp">Připravit DPP k podpisu</button>' : ''}`);
  const pd = document.getElementById('pripr-dpp');
  if (pd) pd.onclick = async () => { pd.disabled = true; const { error } = await sb.rpc('dokument_priprav', { p_osoba: o.id, p_druh: 'dpp' }); if (error) { pd.disabled = false; return pd.insertAdjacentHTML('afterend', msg(esc(chyba(error)), 'bad')); } detailSmlouva(o); };
}

async function detailHistorie(o) {
  const box = document.getElementById('det-hist'); if (!box) return;
  const { data, error } = await sb.from('historie_zmen').select('tabulka,akce,kdy,pred').eq('zaznam_id', o.id).order('kdy', { ascending: false }).limit(20);
  if (error) { box.textContent = 'Historii se nepodařilo načíst.'; return; }
  const TAB = { osoba: 'registrace / stav', osoba_profil: 'profil', osoba_nastup: 'údaje pro smlouvu' };
  box.innerHTML = (data || []).length ? `<ul class="hist">${data.map((h) => `<li><b>${new Date(h.kdy).toLocaleString('cs-CZ')}</b> – ${esc(TAB[h.tabulka] || h.tabulka)}: ${h.akce === 'DELETE' ? 'smazáno' : 'změna'}${h.pred?.stav ? ` (dříve ${esc(STAV_O[h.pred.stav]?.[0] || h.pred.stav)})` : ''}</li>`).join('')}</ul>` : 'Zatím žádné změny.';
}

// ---------- detail dotazu ----------
async function vDetail(id) {
  const t = S.tikety.find((x) => x.id === id);
  const [{ data: zpr }, { data: pril }] = await Promise.all([
    sb.from('tiket_zprava').select('*').eq('tiket_id', id).order('vytvoreno'),
    sb.from('tiket_priloha').select('*').eq('tiket_id', id).order('vytvoreno'),
  ]);
  $app.innerHTML = `<p><a href="#" id="zpet">← Zpět</a></p>
   <h1>#${t.cislo} ${esc(t.predmet)}</h1>
   <p><span class="tag ${STAV[t.stav][1]}">${STAV[t.stav][0]}</span> <span class="mute">${TYP[t.typ]}${t.spech ? ' · spěchá' : ''}</span></p>
   <div class="zpr"><small>${esc(t.autor_jmeno)} · ${kdy(t.vytvoreno)}</small><div style="white-space:pre-wrap">${esc(t.text)}</div></div>
   ${(pril || []).map((p) => `<p>📎 <a href="#" data-cesta="${esc(p.cesta)}">${esc(p.nazev)}</a></p>`).join('')}
   ${(zpr || []).map((z) => `<div class="zpr${z.autor_jmeno.includes('(Tbdb)') ? ' tbdb' : ''}"><small>${esc(z.autor_jmeno)} · ${kdy(z.vytvoreno)}</small><div style="white-space:pre-wrap">${esc(z.text)}</div></div>`).join('')}
   <form id="f" class="card" novalidate>
    <div class="fld" data-f="text"><label for="text">Odpověď</label><textarea id="text" rows="3" placeholder="Napište nebo nadiktujte"></textarea>${mikrofon('text')}<div class="err"></div></div>
    ${S.tbdb ? `<div class="fld"><label for="stav">Stav (jen Tbdb)</label><select id="stav">${Object.entries(STAV).map(([k, v]) => `<option value="${k}"${k === t.stav ? ' selected' : ''}>${v[0]}</option>`).join('')}</select><div class="err"></div></div>` : ''}
    <button class="btn" type="submit">${S.tbdb ? 'Uložit' : 'Odeslat'}</button></form>`;
  document.getElementById('zpet').onclick = (e) => { e.preventDefault(); vUvod(); };
  zapniDiktovani();
  $app.querySelectorAll('a[data-cesta]').forEach((a) => (a.onclick = async (e) => {
    e.preventDefault();
    const { data, error } = await sb.storage.from('tikety').createSignedUrl(a.dataset.cesta, 60);
    if (!error) window.open(data.signedUrl, '_blank');
  }));
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    const text = document.getElementById('text').value.trim();
    const novyStav = S.tbdb ? document.getElementById('stav').value : t.stav;
    if (!text && novyStav === t.stav) { const f = document.querySelector('[data-f=text]'); f.classList.add('chyba'); f.querySelector('.err').textContent = 'Napište odpověď.'; return; }
    if (text) { const { error } = await sb.from('tiket_zprava').insert({ tiket_id: id, autor_jmeno: S.jmeno, text }); if (error) return chybaFormu(e.target, chyba(error)); }
    if (S.tbdb && novyStav !== t.stav) { const { error } = await sb.from('tiket').update({ stav: novyStav }).eq('id', id); if (error) return chybaFormu(e.target, chyba(error)); }
    await nactiTikety(); vDetail(id);
  };
}

start().catch((e) => ($app.innerHTML = msg('Načtení se nepovedlo: ' + esc(chyba(e)), 'bad')));
})();
