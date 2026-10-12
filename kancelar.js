// Vixen – aplikace kanceláře. Zatím: úvodní stránka s dotazy (tikety) majitelek pro Tbdb.
(function () {
const C = window.VIXEN_CONFIG, K = window.K;
const sb = window.supabase.createClient(C.url, C.key);
const $app = document.getElementById('app');
const DEV = new URLSearchParams(location.search).has('dev');
const S = { user: null, jmeno: '', tbdb: false, nabor: false, tikety: [], cis: null };
const TYP = { dotaz: 'Dotaz', chyba: 'Něco nefunguje', prani: 'Přání / nápad' };
const STAV = { novy: ['nový', 't-w'], resime: ['řešíme', 't-g'], ceka_na_vas: ['čeká na vás', 't-b'], hotovo: ['hotovo', 't-ok'] };
const MAX_MB = 10;

if (C.prostredi) document.getElementById('env').textContent = C.prostredi + ' – jen zkušební data';
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
document.getElementById('odhlasit').onclick = async () => { await sb.auth.signOut(); location.reload(); };

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
  S.tbdb = !!tbdb; S.nabor = !!nabor;
  S.jmeno = (user.user_metadata && user.user_metadata.jmeno) || user.email.split('@')[0];
  if (S.tbdb) S.jmeno += ' (Tbdb)';
  document.getElementById('kdo').textContent = S.jmeno;
  vUvod();
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
  $app.innerHTML = `${await menu('dotazy')}<h1>Dobrý den${S.tbdb ? '' : ', ' + esc(S.jmeno)}</h1>
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
  return `<nav class="knav"><button data-v="prihlasky"${aktivni === 'prihlasky' ? ' class="on"' : ''}>Přihlášky${count ? ` <span class="pocet">${count}</span>` : ''}</button><button data-v="dotazy"${aktivni === 'dotazy' ? ' class="on"' : ''}>Dotazy pro Tbdb</button></nav>`;
}
function zapniMenu() {
  $app.querySelectorAll('.knav button').forEach((b) => (b.onclick = () => (b.dataset.v === 'prihlasky' ? vPrihlasky() : vUvod())));
}

// ---------- přihlášky: schválení / odmítnutí uchazečů ----------
const FILTR = { uchazec: ['Nové', ['uchazec']], prijate: ['Přijaté', ['prijata', 'aktivni']], odmitnute: ['Odmítnuté', ['odmitnuta', 'neaktivni']] };
const STAV_O = { uchazec: ['nová', 't-w'], prijata: ['přijatá', 't-ok'], aktivni: ['aktivní', 't-ok'], neaktivni: ['neaktivní', 't-b'], odmitnuta: ['odmítnutá', 't-b'] };
const ZAJEM = { hosteska: 'hosteska', promoter: 'promotér/ka', jine: 'jiné' };
const KANAL = { email: 'e-mail', sms: 'SMS', whatsapp: 'WhatsApp', messenger: 'Messenger' };
async function ciselniky() {
  if (S.cis) return S.cis;
  const [{ data: kraj }, { data: okres }] = await Promise.all([sb.from('kraj').select('kod,nazev'), sb.from('okres').select('kod,mesto,kraj_kod')]);
  S.cis = { kraj: Object.fromEntries((kraj || []).map((k) => [k.kod, k.nazev])), okres: Object.fromEntries((okres || []).map((o) => [o.kod, o])) };
  return S.cis;
}
function mistaText(kody) {
  const po = {};
  for (const k of kody) { const o = S.cis.okres[k]; const kr = o ? S.cis.kraj[o.kraj_kod] || o.kraj_kod : '?'; (po[kr] = po[kr] || []).push(o ? o.mesto : k); }
  return Object.entries(po).map(([kr, m]) => `<b>${esc(kr)}:</b> ${m.map(esc).join(', ')}`).join('<br>') || '<span class="mute">neuvedeno</span>';
}
async function vPrihlasky(filtr = 'uchazec', hlaska = '') {
  await ciselniky();
  const { data, error } = await sb.from('osoba').select('*, osoba_okres(okres_kod), osoba_poznamka(text)').in('stav', FILTR[filtr][1]).order('vytvoreno', { ascending: filtr !== 'uchazec' ? false : true });
  if (error) { $app.innerHTML = msg(esc(chyba(error)), 'bad'); return; }
  for (const o of data || []) o.osoba_poznamka = Array.isArray(o.osoba_poznamka) ? o.osoba_poznamka[0] || null : o.osoba_poznamka;
  const karta = (o) => `<div class="card prihl" data-id="${o.id}">
     <div class="prihl-hl"><b>${esc(o.jmeno)} ${esc(o.prijmeni)}</b><span class="tag ${STAV_O[o.stav][1]}">${STAV_O[o.stav][0]}</span></div>
     <small class="mute">Registrace ${kdy(o.vytvoreno)}</small>
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
  const text = { prijata: `${jm} je schválená ✓ Může se přihlásit e-mailem ${esc(o.email)}.`, odmitnuta: `${jm} je mezi odmítnutými.`, uchazec: `${jm} je zpět mezi novými.` }[novy];
  vPrihlasky(o.stav === 'uchazec' ? 'uchazec' : novy === 'uchazec' ? 'uchazec' : novy === 'prijata' ? 'prijate' : 'odmitnute', msg(text));
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
