// Vixen – aplikace pro hostesky (fáze 1): registrace → přihlášení → profil → údaje pro smlouvu → podpis DPP
(function () {
const C = window.VIXEN_CONFIG, K = window.K;
const sb = window.supabase.createClient(C.url, C.key);
const $app = document.getElementById('app');
const DEV = new URLSearchParams(location.search).has('dev');
const S = { cis: {}, osoba: null, profil: null, nastup: null, dokumenty: [], view: 'prehled' };

if (C.prostredi) document.getElementById('env').textContent = C.prostredi + ' – jen zkušební data, žádné skutečné údaje';
else document.getElementById('env').classList.add('hidden');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const opt = (list, val, prazdna) => (prazdna !== undefined ? `<option value="">${esc(prazdna)}</option>` : '') +
  list.map((x) => `<option value="${esc(x.kod)}"${x.kod === val ? ' selected' : ''}>${esc(x.nazev)}${x.kod.length === 4 ? ' (' + x.kod + ')' : ''}</option>`).join('');
const msg = (t, typ = 'ok') => `<div class="msg ${typ}">${t}</div>`;

// srozumitelné chyby z databáze
function chybaText(e) {
  const m = (e && (e.message || e.error_description || e.chyba)) || String(e);
  const map = [
    ['osoba_nastup_rodne_cislo_check', 'Rodné číslo nesedí – zkontrolujte číslice.'],
    ['nastup_rc_pro_cz', 'Rodné číslo nesedí s datem narození.'],
    ['nastup_ucet', 'Číslo účtu nesedí – zkontrolujte číslice.'],
    ['nastup_psc', 'Zkontrolujte PSČ.'],
    ['nastup_cizinec_rezidence', 'U zahraniční daňové rezidence vyplňte daňový identifikátor.'],
    ['osoba_telefon_check', 'Zkontrolujte telefon.'], ['osoba_email_check', 'Zkontrolujte e-mail.'],
    ['Invalid login credentials', 'Nesprávný e-mail nebo heslo.'],
  ];
  for (const [k, v] of map) if (m.includes(k)) return v;
  return m;
}

// ---------- pole formuláře ----------
function pole(id, label, val = '', o = {}) {
  const typ = o.typ || 'text';
  const attr = `id="${id}" name="${id}" ${o.ro ? 'readonly class="pre"' : ''} ${o.ac ? `autocomplete="${o.ac}"` : ''} ${o.im ? `inputmode="${o.im}"` : ''}`;
  let input;
  if (o.select) input = `<select ${attr}>${o.select}</select>`;
  else if (typ === 'textarea') input = `<textarea ${attr} rows="3">${esc(val)}</textarea>`;
  else input = `<input type="${typ}" ${attr} value="${esc(val)}" ${o.ph ? `placeholder="${esc(o.ph)}"` : ''}>`;
  return `<div class="fld${o.cls ? ' ' + o.cls : ''}" data-f="${id}"><label for="${id}">${label}</label>${input}<div class="err"></div>${o.hint ? `<div class="hint">${o.hint}</div>` : ''}</div>`;
}
const val = (id) => { const el = document.getElementById(id); return el ? (el.type === 'checkbox' ? el.checked : el.value.trim()) : ''; };
function ukazChyby(chyby) {
  document.querySelectorAll('.fld').forEach((f) => { f.classList.remove('chyba'); f.querySelector('.err').textContent = ''; });
  let prvni = null;
  for (const [id, t] of Object.entries(chyby)) {
    if (!t) continue;
    const f = document.querySelector(`.fld[data-f="${id}"]`);
    if (f) { f.classList.add('chyba'); f.querySelector('.err').textContent = t; prvni = prvni || f; }
  }
  if (prvni) { prvni.scrollIntoView({ behavior: 'smooth', block: 'center' }); prvni.querySelector('input,select,textarea')?.focus(); }
  return !prvni;
}
function hlidejPole(kontrola) {   // kontrola pole po opuštění; u pole s chybou průběžně, aby chyba zmizela hned po opravě
  const over = (el, vzdy) => {
    const f = el.closest('.fld'); if (!f) return;
    if (!vzdy && !f.classList.contains('chyba')) return;
    const t = kontrola()[f.dataset.f] || ''; f.classList.toggle('chyba', !!t); f.querySelector('.err').textContent = t;
  };
  $app.querySelectorAll('input,select,textarea').forEach((el) => {
    el.addEventListener('blur', () => over(el, el.type !== 'checkbox'));
    el.addEventListener('input', () => over(el, false));
    el.addEventListener('change', () => over(el, el.type === 'checkbox' || el.tagName === 'SELECT'));
  });
}

// ---------- start ----------
async function start() {
  const [kraj, stat, zp, banka] = await Promise.all([
    sb.from('kraj').select('kod,nazev').order('poradi'),
    sb.from('stat').select('kod,nazev').order('nazev'),
    sb.from('zdravotni_pojistovna').select('kod,nazev').order('kod'),
    sb.from('banka').select('kod,nazev').order('nazev'),
  ]);
  S.cis = { kraj: kraj.data || [], stat: stat.data || [], zp: zp.data || [], banka: banka.data || [] };
  const { data } = await sb.auth.getSession();
  if (data.session) return poPrihlaseni();
  location.hash === '#registrace' ? vRegistrace() : vUvod();
}
sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_IN' && !S.osoba) poPrihlaseni(); });
document.getElementById('odhlasit').onclick = async () => { await sb.auth.signOut(); location.hash = ''; location.reload(); };
document.querySelectorAll('#tabs button').forEach((b) => b.onclick = () => ukaz(b.dataset.v));

function vUvod() {
  $app.innerHTML = `<h1>Vítejte ve Vixen</h1><p class="mute">Hostesky a promotéři – vše k brigádám na jednom místě.</p>
   <button class="btn" id="b1">Chci se zaregistrovat</button><button class="btn o" id="b2">Už jsem registrovaná – přihlásit</button>`;
  document.getElementById('b1').onclick = vRegistrace;
  document.getElementById('b2').onclick = vPrihlaseni;
}

// ---------- krok 1: registrace ----------
function vRegistrace() {
  location.hash = 'registrace';
  $app.innerHTML = `<h1>Registrace</h1><p class="mute">Zabere to 2 minuty. Údaje pro smlouvu budeme chtít až před první akcí.</p>
  <form id="f" novalidate class="card">
   <div class="row">${pole('jmeno', 'Jméno', '', { ac: 'given-name' })}${pole('prijmeni', 'Příjmení', '', { ac: 'family-name' })}</div>
   ${pole('telefon', 'Telefon', '', { typ: 'tel', ac: 'tel', ph: '777 123 456', im: 'tel' })}
   ${pole('email', 'E-mail', '', { typ: 'email', ac: 'email', ph: 'jana@seznam.cz', hint: 'Na tento e-mail se budete přihlašovat.' })}
   ${pole('kraj', 'Kraj, kde můžete pracovat', '', { select: opt(S.cis.kraj, '', '— vyberte —') })}
   ${pole('obec', 'Obec / město', '', { ac: 'address-level2' })}
   <div class="fld" data-f="zajem"><label>Mám zájem o</label><div class="chips">
     <label><input type="checkbox" name="zajem" value="hosteska" checked> hosteska</label>
     <label><input type="checkbox" name="zajem" value="promoter"> promotér/ka</label>
     <label><input type="checkbox" name="zajem" value="jine"> jiné</label></div><div class="err"></div></div>
   <div class="fld" data-f="kanal"><label>Kontaktujte mě přes</label><div class="chips">
     <label><input type="checkbox" name="kanal" value="email" checked> e-mail</label>
     <label><input type="checkbox" name="kanal" value="sms" checked> SMS</label>
     <label><input type="checkbox" name="kanal" value="whatsapp"> WhatsApp</label></div><div class="err"></div></div>
   <div class="fld" data-f="gdpr"><label class="chk"><input type="checkbox" id="gdpr"> <span>Souhlasím se zpracováním osobních údajů pro účely spolupráce s Vixen. <span class="mute">(text souhlasu dodá Vixen – DOPLNIT)</span></span></label><div class="err"></div></div>
   <button class="btn" type="submit">Odeslat registraci</button></form>
   <p class="mute" style="text-align:center"><a href="#" id="zpet">Už jsem registrovaná – přihlásit</a></p>`;
  document.getElementById('zpet').onclick = (e) => { e.preventDefault(); vPrihlaseni(); };
  const vyber = (n) => [...document.querySelectorAll(`input[name="${n}"]:checked`)].map((x) => x.value);
  const kontrola = () => ({
    jmeno: K.povinne(val('jmeno'), 'jméno'), prijmeni: K.povinne(val('prijmeni'), 'příjmení'),
    telefon: K.telefonChyba(val('telefon')), email: K.emailChyba(val('email')),
    kraj: K.povinne(val('kraj'), 'kraj'), obec: K.povinne(val('obec'), 'obec'),
    zajem: vyber('zajem').length ? '' : 'Vyberte aspoň jednu možnost.',
    gdpr: val('gdpr') ? '' : 'Bez souhlasu vás nemůžeme evidovat.',
  });
  hlidejPole(kontrola);
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    if (!ukazChyby(kontrola())) return;
    const b = e.target.querySelector('button'); b.disabled = true; b.textContent = 'Odesílám…';
    const { error } = await sb.rpc('registrace', { p: {
      jmeno: val('jmeno'), prijmeni: val('prijmeni'), telefon: K.telefonNormalizuj(val('telefon')), email: val('email').toLowerCase(),
      kraj_kod: val('kraj'), obec: val('obec'), zajem: vyber('zajem'), kanal_kontaktu: vyber('kanal'), souhlas_gdpr_v: C.gdprVerze } });
    if (error) { b.disabled = false; b.textContent = 'Odeslat registraci'; e.target.insertAdjacentHTML('afterbegin', msg(esc(chybaText(error)), 'bad')); return; }
    $app.innerHTML = `<h1>Děkujeme!</h1>${msg('Registrace dorazila ✓')}<p>Ozveme se vám. Jakmile vás schválíme, přihlásíte se e-mailem <b>${esc(val('email') || '')}</b> a doplníte profil.</p>
      <button class="btn o" id="pp">Přihlásit</button>`;
    document.getElementById('pp').onclick = vPrihlaseni;
  };
}

// ---------- přihlášení ----------
function vPrihlaseni() {
  location.hash = '';
  $app.innerHTML = `<h1>Přihlášení</h1><p class="mute">Zadejte e-mail z registrace. Pošleme vám odkaz – žádné heslo není potřeba.</p>
   <form id="f" class="card" novalidate>${pole('email', 'E-mail', '', { typ: 'email', ac: 'email' })}
   ${DEV ? pole('heslo', 'Heslo (jen pro testy ve vývoji)', '', { typ: 'password' }) : ''}
   <button class="btn" type="submit">${DEV ? 'Přihlásit' : 'Poslat odkaz'}</button></form>
   <p class="mute" style="text-align:center"><a href="#" id="reg">Nemám registraci</a></p>`;
  document.getElementById('reg').onclick = (e) => { e.preventDefault(); vRegistrace(); };
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    if (!ukazChyby({ email: K.emailChyba(val('email')) })) return;
    const email = val('email').toLowerCase();
    if (DEV && val('heslo')) {
      const { error } = await sb.auth.signInWithPassword({ email, password: val('heslo') });
      if (error) return e.target.insertAdjacentHTML('afterbegin', msg(esc(chybaText(error)), 'bad'));
      return poPrihlaseni();
    }
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href.split('#')[0] } });
    $app.innerHTML = error ? msg(esc(chybaText(error)), 'bad') :
      `<h1>Mrkněte do e-mailu</h1>${msg('Poslali jsme odkaz na ' + esc(email) + '. Klikněte na něj v tomto telefonu.')}`;
  };
}

// ---------- po přihlášení ----------
async function poPrihlaseni() {
  const { data: { user } } = await sb.auth.getUser();
  const { data: id, error } = await sb.rpc('propoj_ucet');
  if (error || !id) {
    $app.innerHTML = msg('E-mail ' + esc(user?.email) + ' v evidenci nemáme. Zaregistrujte se prosím stejným e-mailem.', 'warn') + '<button class="btn" id="r">Registrace</button>';
    document.getElementById('odhlasit').classList.remove('hidden');
    document.getElementById('r').onclick = async () => { await sb.auth.signOut(); vRegistrace(); };
    return;
  }
  document.getElementById('odhlasit').classList.remove('hidden');
  document.getElementById('tabs').classList.remove('hidden');
  await nacti();
  ukaz('prehled');
}
async function nacti() {
  const [o, p, n, d] = await Promise.all([
    sb.from('osoba').select('*').single(),
    sb.from('osoba_profil').select('*').maybeSingle(),
    sb.from('osoba_nastup').select('*').maybeSingle(),
    sb.from('dokument').select('id,stav,obsah,vytvoreno,podepsano_at,podpis,dokument_sablona(nazev,druh)').order('vytvoreno', { ascending: false }),
  ]);
  S.osoba = o.data; S.profil = p.data; S.nastup = n.data; S.dokumenty = (d.data || []).filter((x) => x.stav !== 'zruseno');
  document.getElementById('kdo').textContent = S.osoba ? S.osoba.jmeno + ' ' + S.osoba.prijmeni : '';
}
function ukaz(v) {
  S.view = v;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  ({ prehled: vPrehled, profil: vProfil, nastup: vNastup, dokumenty: vDokumenty })[v]();
  window.scrollTo(0, 0);
}
const schvalena = () => S.osoba && S.osoba.stav !== 'uchazec' && S.osoba.stav !== 'odmitnuta';

// ---------- přehled (semafor) ----------
function vPrehled() {
  const dpp = S.dokumenty.find((x) => x.dokument_sablona?.druh === 'dpp');
  const r = (t, tag, cls, v) => `<div class="sem" data-v="${v || ''}"><span>${t}</span><span class="tag ${cls}">${tag}</span></div>`;
  $app.innerHTML = `<h1>Dobrý den, ${esc(S.osoba.jmeno)}</h1><p class="mute">Co máte hotové a co ještě chybí:</p>
   ${r('Registrace', 'hotovo', 't-ok')}
   ${S.osoba.stav === 'uchazec' ? r('Schválení kanceláří', 'čekáme', 't-w') : S.osoba.stav === 'odmitnuta' ? r('Schválení', 'nepřijato', 't-b') : r('Schválení kanceláří', 'hotovo', 't-ok')}
   ${r('Profil', S.profil ? 'hotovo' : 'doplnit', S.profil ? 't-ok' : 't-w', 'profil')}
   ${r('Údaje pro smlouvu', S.nastup?.potvrzeno_at ? 'hotovo' : 'doplnit', S.nastup?.potvrzeno_at ? 't-ok' : 't-w', 'nastup')}
   ${r('Smlouva DPP', dpp ? (dpp.stav === 'podepsano' ? 'podepsáno' : 'k podpisu') : 'zatím ne', dpp ? (dpp.stav === 'podepsano' ? 't-ok' : 't-b') : 't-g', 'dokumenty')}
   ${r('Přihlášení na ČSSZ', 'řeší kancelář', 't-g')}
   ${S.osoba.stav === 'uchazec' ? msg('Vaši registraci ještě prochází kancelář. Profil a údaje pro smlouvu půjdou doplnit po schválení.', 'warn') : ''}`;
  $app.querySelectorAll('.sem[data-v]').forEach((el) => el.dataset.v && (el.onclick = () => ukaz(el.dataset.v)));
}

// ---------- krok 3: profil ----------
function vProfil() {
  if (!schvalena()) return ($app.innerHTML = '<h1>Profil</h1>' + msg('Profil půjde doplnit po schválení registrace.', 'warn'));
  const p = S.profil || {};
  const k = ['XS', 'S', 'M', 'L', 'XL', 'XXL'].map((x) => ({ kod: x, nazev: x }));
  $app.innerHTML = `<h1>Profil</h1><p class="mute">Pomůže nám vybrat vhodnou akci. <span class="mute">(rozsah polí upřesní Vixen)</span></p>
  <form id="f" class="card" novalidate>
   <div class="row">${pole('vyska', 'Výška (cm)', p.vyska_cm ?? '', { typ: 'number', im: 'numeric' })}${pole('bota', 'Bota (EU)', p.bota_eu ?? '', { typ: 'number', im: 'decimal' })}</div>
   ${pole('konfekce', 'Konfekční velikost', '', { select: opt(k, p.konfekce, '—') })}
   ${pole('jazyky', 'Jazyky', (p.jazyky || []).join(', '), { ph: 'angličtina, němčina' })}
   ${pole('zkusenosti', 'Zkušenosti', p.zkusenosti || '', { typ: 'textarea' })}
   <label class="chk"><input type="checkbox" id="ridicak" ${p.ridicak ? 'checked' : ''}> Mám řidičák</label>
   <label class="chk"><input type="checkbox" id="auto" ${p.vlastni_auto ? 'checked' : ''}> Mám vlastní auto</label>
   ${pole('dostupnost', 'Kdy můžete pracovat', p.dostupnost || '', { ph: 'víkendy, po 16:00…' })}
   <button class="btn" type="submit">Uložit profil</button></form>`;
  const kontrola = () => ({
    vyska: val('vyska') && (val('vyska') < 120 || val('vyska') > 220) ? 'Výška 120–220 cm.' : '',
    bota: val('bota') && (val('bota') < 30 || val('bota') > 50) ? 'Velikost bot 30–50.' : '',
  });
  hlidejPole(kontrola);
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault(); if (!ukazChyby(kontrola())) return;
    const { error } = await sb.from('osoba_profil').upsert({
      osoba_id: S.osoba.id, vyska_cm: val('vyska') || null, bota_eu: val('bota') || null, konfekce: val('konfekce') || null,
      jazyky: val('jazyky') ? val('jazyky').split(',').map((x) => x.trim()).filter(Boolean) : [],
      zkusenosti: val('zkusenosti') || null, ridicak: val('ridicak'), vlastni_auto: val('auto'), dostupnost: val('dostupnost') || null });
    if (error) return e.target.insertAdjacentHTML('afterbegin', msg(esc(chybaText(error)), 'bad'));
    await nacti(); ukaz('prehled');
  };
}

// ---------- krok 4: údaje pro smlouvu ----------
function vNastup(predvypln) {
  if (!schvalena()) return ($app.innerHTML = '<h1>Údaje pro smlouvu</h1>' + msg('Údaje půjde doplnit po schválení registrace.', 'warn'));
  const n = predvypln || S.nastup || { obcanstvi: 'CZ', danova_rezidence: 'CZ', stat_bydliste: 'CZ', rodne_prijmeni: S.osoba.prijmeni };
  const rc = n.rodne_cislo ? n.rodne_cislo.slice(0, 6) + '/' + n.rodne_cislo.slice(6) : '';
  const bankaJina = n.ucet_banka && !S.cis.banka.some((b) => b.kod === n.ucet_banka);
  $app.innerHTML = `<h1>Údaje pro smlouvu</h1>
  <p class="mute">Potřebujeme je pro dohodu (DPP), přihlášení na sociální správu a výplatu. Vyplníte jednou, dál se předvyplňují.</p>
  <form id="f" class="card" novalidate>
   <div class="row">${pole('jm', 'Jméno', S.osoba.jmeno, { ro: 1 })}${pole('pr', 'Příjmení', S.osoba.prijmeni, { ro: 1 })}</div>
   ${pole('obcanstvi', 'Státní občanství', '', { select: opt(S.cis.stat, n.obcanstvi) })}
   ${pole('rc', 'Rodné číslo', rc, { im: 'numeric', ph: '015412/1234', hint: 'Datum narození doplníme z rodného čísla.' })}
   ${pole('datum', 'Datum narození', n.datum_narozeni || '', { typ: 'date' })}
   <div class="row">${pole('rodne_prijmeni', 'Rodné příjmení', n.rodne_prijmeni || '', { hint: 'Příjmení při narození.' })}${pole('misto', 'Místo narození', n.misto_narozeni || '')}</div>
   <h2>Trvalé bydliště</h2>
   ${pole('ulice', 'Ulice', n.ulice || '', { ac: 'address-line1' })}
   <div class="row">${pole('cp', 'Číslo popisné', n.cislo_popisne || '')}${pole('psc', 'PSČ', n.psc ? n.psc.slice(0, 3) + ' ' + n.psc.slice(3) : '', { im: 'numeric', ac: 'postal-code' })}</div>
   ${pole('obec', 'Obec', n.obec || '', { ac: 'address-level2' })}
   ${pole('stat_bydliste', 'Stát', '', { select: opt(S.cis.stat, n.stat_bydliste) })}
   ${pole('koresp', 'Korespondenční adresa (jen pokud je jiná)', n.koresp_adresa || '')}
   <h2>Pojištění a daně</h2>
   ${pole('zp', 'Zdravotní pojišťovna', '', { select: opt(S.cis.zp, n.zdravotni_pojistovna, '— vyberte —') })}
   ${pole('rezidence', 'Daňová rezidence (kde platíte daně)', '', { select: opt(S.cis.stat, n.danova_rezidence) })}
   ${pole('zahr_id', 'Zahraniční daňový identifikátor', n.zahr_dan_id || '', { cls: 'zahr' })}
   <h2>Účet pro výplatu</h2>
   <div class="row">${pole('pred', 'Předčíslí', n.ucet_predcisli || '', { im: 'numeric' })}${pole('ucet', 'Číslo účtu', n.ucet_cislo || '', { im: 'numeric' })}</div>
   ${pole('banka', 'Banka', '', { select: opt(S.cis.banka, bankaJina ? 'jina' : n.ucet_banka, '— vyberte —') + `<option value="jina"${bankaJina ? ' selected' : ''}>Jiná banka – zadám kód</option>` })}
   ${pole('kod_banky', 'Kód banky', bankaJina ? n.ucet_banka : '', { im: 'numeric', ph: '4 číslice', cls: 'kodb' })}
   <h2>Ještě dvě otázky</h2>
   <label class="chk"><input type="checkbox" id="duchod" ${n.predcasny_duchod ? 'checked' : ''}> Pobírám předčasný starobní důchod</label>
   <label class="chk"><input type="checkbox" id="up" ${n.vedena_na_up ? 'checked' : ''}> Jsem vedená na úřadu práce</label>
   <button class="btn" type="submit">Pokračovat ke kontrole</button></form>`;

  const prepni = () => {
    const cz = val('obcanstvi') === 'CZ';
    document.getElementById('datum').readOnly = cz; document.getElementById('datum').classList.toggle('pre', cz);
    document.querySelector('[data-f="rc"] label').textContent = cz ? 'Rodné číslo' : 'Rodné číslo (pokud máte české)';
    document.querySelector('.zahr').classList.toggle('hidden', val('rezidence') === 'CZ');
    document.querySelector('.kodb').classList.toggle('hidden', val('banka') !== 'jina');
  };
  const rcEl = document.getElementById('rc');
  rcEl.addEventListener('input', () => {   // datum narození z RČ hned při psaní
    const d = K.rcDatum(rcEl.value); if (d && val('obcanstvi') === 'CZ') document.getElementById('datum').value = K.datumIso(d);
  });
  ['obcanstvi', 'rezidence', 'banka'].forEach((id) => document.getElementById(id).addEventListener('change', prepni));
  prepni();
  const kodBanky = () => (val('banka') === 'jina' ? val('kod_banky') : val('banka'));
  const kontrola = () => {
    const cz = val('obcanstvi') === 'CZ', u = K.ucetChyba(val('pred'), val('ucet'), kodBanky());
    return {
      rc: cz || val('rc') ? K.rcChyba(val('rc')) : '',
      datum: K.povinne(val('datum'), 'datum narození'),
      rodne_prijmeni: K.povinne(val('rodne_prijmeni'), 'rodné příjmení'), misto: K.povinne(val('misto'), 'místo narození'),
      cp: K.povinne(val('cp'), 'číslo popisné'), obec: K.povinne(val('obec'), 'obec'),
      psc: val('stat_bydliste') === 'CZ' ? K.pscChyba(val('psc')) : K.povinne(val('psc'), 'PSČ'),
      zp: val('obcanstvi') === 'CZ' || val('rezidence') === 'CZ' ? K.povinne(val('zp'), 'zdravotní pojišťovnu') : '',
      zahr_id: val('rezidence') !== 'CZ' ? K.povinne(val('zahr_id'), 'daňový identifikátor') : '',
      pred: u.startsWith('Předčíslí') ? u : '', ucet: u && !u.startsWith('Předčíslí') && !u.includes('banky') ? u : '',
      banka: val('banka') === 'jina' ? '' : (u.includes('banky') ? u : ''), kod_banky: val('banka') === 'jina' && u.includes('banky') ? u : '',
    };
  };
  hlidejPole(kontrola);
  document.getElementById('f').onsubmit = (e) => {
    e.preventDefault(); if (!ukazChyby(kontrola())) return;
    vSouhrn({
      osoba_id: S.osoba.id, obcanstvi: val('obcanstvi'), rodne_cislo: K.cisla(val('rc')) || null, datum_narozeni: val('datum'),
      rodne_prijmeni: val('rodne_prijmeni'), misto_narozeni: val('misto'), ulice: val('ulice') || null, cislo_popisne: val('cp'),
      psc: val('psc').replace(/\s/g, ''), obec: val('obec'), stat_bydliste: val('stat_bydliste'), koresp_adresa: val('koresp') || null,
      zdravotni_pojistovna: val('zp') || null, danova_rezidence: val('rezidence'), zahr_dan_id: val('rezidence') !== 'CZ' ? val('zahr_id') : null,
      ucet_predcisli: K.cisla(val('pred')) || null, ucet_cislo: K.cisla(val('ucet')), ucet_banka: kodBanky(),
      predcasny_duchod: val('duchod'), vedena_na_up: val('up'),
    });
  };
}

function vSouhrn(n) {
  const nazev = (list, k) => (list.find((x) => x.kod === k) || {}).nazev || k || '—';
  const radky = [
    ['Jméno', S.osoba.jmeno + ' ' + S.osoba.prijmeni], ['Rodné příjmení', n.rodne_prijmeni],
    ['Rodné číslo', n.rodne_cislo ? n.rodne_cislo.slice(0, 6) + '/' + n.rodne_cislo.slice(6) : '—'],
    ['Datum narození', n.datum_narozeni.split('-').reverse().map(Number).join('. ')], ['Místo narození', n.misto_narozeni],
    ['Občanství', nazev(S.cis.stat, n.obcanstvi)],
    ['Bydliště', [n.ulice, n.cislo_popisne].filter(Boolean).join(' ') + ', ' + n.psc.slice(0, 3) + ' ' + n.psc.slice(3) + ' ' + n.obec + ', ' + nazev(S.cis.stat, n.stat_bydliste)],
    ['Korespondenční adresa', n.koresp_adresa || 'stejná'], ['Zdravotní pojišťovna', nazev(S.cis.zp, n.zdravotni_pojistovna)],
    ['Daňová rezidence', nazev(S.cis.stat, n.danova_rezidence) + (n.zahr_dan_id ? ' (' + n.zahr_dan_id + ')' : '')],
    ['Účet', (n.ucet_predcisli ? n.ucet_predcisli + '-' : '') + n.ucet_cislo + '/' + n.ucet_banka],
    ['Předčasný důchod', n.predcasny_duchod ? 'ano' : 'ne'], ['Úřad práce', n.vedena_na_up ? 'ano' : 'ne'],
  ];
  const meniPodepsane = S.dokumenty.some((d) => d.stav === 'podepsano');
  $app.innerHTML = `<h1>Zkontrolujte své údaje</h1><p class="mute">Z těchto údajů vznikne vaše smlouva.</p>
   <div class="card sum">${radky.map(([a, b]) => `<div>${a}</div><div><b>${esc(b)}</b></div>`).join('')}</div>
   ${meniPodepsane ? msg('Po změně údajů připravíme novou verzi smlouvy k podpisu.', 'warn') : ''}
   <label class="chk"><input type="checkbox" id="spravne"> Údaje jsou správné a úplné.</label>
   <div id="m"></div>
   <button class="btn g" id="ulozit" disabled>Potvrdit a uložit</button><button class="btn o" id="opravit">Opravit</button>`;
  document.getElementById('spravne').onchange = (e) => (document.getElementById('ulozit').disabled = !e.target.checked);
  document.getElementById('opravit').onclick = () => vNastup(n);
  document.getElementById('ulozit').onclick = async (e) => {
    e.target.disabled = true;
    const { error } = await sb.from('osoba_nastup').upsert({ ...n, potvrzeno_at: new Date().toISOString() });
    if (error) { e.target.disabled = false; return (document.getElementById('m').innerHTML = msg(esc(chybaText(error)), 'bad')); }
    await nacti();
    $app.innerHTML = `<h1>Uloženo ✓</h1>${msg('Údaje máme. Teď můžete podepsat smlouvu.')}<button class="btn" id="d">Ke smlouvě</button>`;
    document.getElementById('d').onclick = () => ukaz('dokumenty');
  };
}

// ---------- krok 5: dokumenty a podpis ----------
function vDokumenty() {
  if (!S.nastup?.potvrzeno_at) return ($app.innerHTML = '<h1>Dokumenty</h1>' + msg('Nejdřív prosím vyplňte a potvrďte údaje pro smlouvu.', 'warn') + '<button class="btn" id="n">Vyplnit údaje</button>', document.getElementById('n').onclick = () => ukaz('nastup'));
  const kPodpisu = S.dokumenty.find((d) => d.stav === 'k_podpisu');
  const dppPodepsana = S.dokumenty.find((d) => d.stav === 'podepsano' && d.dokument_sablona?.druh === 'dpp');
  const potrebaNova = dppPodepsana && new Date(S.nastup.zmeneno || S.nastup.potvrzeno_at) > new Date(dppPodepsana.podepsano_at);
  $app.innerHTML = `<h1>Dokumenty</h1>
   ${kPodpisu ? `<div class="card"><h2 style="margin-top:0">${esc(kPodpisu.dokument_sablona?.nazev)}</h2>
      <p class="mute">Přečtěte si dokument. Vaše údaje jsou doplněné automaticky.</p>
      <div class="doc">${esc(kPodpisu.obsah)}</div>
      <label class="chk"><input type="checkbox" id="precteno"> Dokument jsem přečetla a údaje v něm jsou správné.</label>
      <div id="m"></div>
      <button class="btn" id="kod" disabled>Podepsat – poslat kód e-mailem</button>
      <div id="zadat" class="hidden">${pole('k', 'Kód z e-mailu (6 číslic)', '', { im: 'numeric', ac: 'one-time-code' })}<button class="btn g" id="podepsat">Podepsat</button></div></div>`
    : (!dppPodepsana || potrebaNova ? `<button class="btn" id="pripravit">${potrebaNova ? 'Připravit novou verzi smlouvy' : 'Připravit smlouvu (DPP)'}</button><div id="m"></div>` : '')}
   <h2>Podepsané</h2>
   ${S.dokumenty.filter((d) => d.stav === 'podepsano').map((d) => `<div class="sem"><span>${esc(d.dokument_sablona?.nazev)}<br><span class="mute">podepsáno ${new Date(d.podepsano_at).toLocaleString('cs-CZ')} · ${esc(d.podpis?.zpusob || '')}</span></span><span class="tag t-ok">✓</span></div>`).join('') || '<p class="mute">Zatím nic.</p>'}
   <p class="mute">PDF ke stažení doplníme v další verzi.</p>`;
  const m = (t, typ) => (document.getElementById('m').innerHTML = msg(t, typ));
  const pr = document.getElementById('pripravit');
  if (pr) pr.onclick = async () => {
    pr.disabled = true;
    const { error } = await sb.rpc('dokument_priprav', { p_osoba: S.osoba.id, p_druh: 'dpp' });
    if (error) { pr.disabled = false; return m(esc(chybaText(error)), 'bad'); }
    await nacti(); vDokumenty();
  };
  if (!kPodpisu) return;
  document.getElementById('precteno').onchange = (e) => (document.getElementById('kod').disabled = !e.target.checked);
  document.getElementById('kod').onclick = async (e) => {
    e.target.disabled = true; e.target.textContent = 'Posílám…';
    const { data, error } = await sb.functions.invoke('podpis-kod', { body: { dokument_id: kPodpisu.id, kanal: 'email' } });
    e.target.textContent = 'Poslat kód znovu'; e.target.disabled = false;
    if (error || data?.chyba) return m(esc(data?.chyba || chybaText(error)), 'bad');
    m(data.dev_kod ? `VÝVOJ: e-maily zatím nejsou nastavené. Kód: <b>${esc(data.dev_kod)}</b>` : `Kód jsme poslali na ${esc(data.adresat)}. Platí 10 minut.`, data.dev_kod ? 'warn' : 'ok');
    document.getElementById('zadat').classList.remove('hidden'); document.getElementById('k').focus();
  };
  document.getElementById('podepsat').onclick = async (e) => {
    const kod = K.cisla(val('k'));
    if (kod.length !== 6) return ukazChyby({ k: 'Kód má 6 číslic.' });
    e.target.disabled = true;
    const { data, error } = await sb.rpc('podpis_over', { p_dokument: kPodpisu.id, p_kod: kod, p_ip: null, p_prohlizec: navigator.userAgent.slice(0, 200) });
    e.target.disabled = false;
    if (error) return m(esc(chybaText(error)), 'bad');
    if (!data) return ukazChyby({ k: 'Kód nesedí. Zkuste to znovu nebo si pošlete nový.' });
    await nacti();
    $app.innerHTML = `<h1>Podepsáno ✓</h1>${msg('Smlouva je podepsaná. Děkujeme!')}<button class="btn o" id="p">Zpět na přehled</button>`;
    document.getElementById('p').onclick = () => ukaz('prehled');
  };
}

start().catch((e) => ($app.innerHTML = msg('Aplikaci se nepodařilo načíst: ' + esc(chybaText(e)), 'bad')));
})();
