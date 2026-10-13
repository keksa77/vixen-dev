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

// ---------- kde může pracovat: kraje (více) → okresní města (výchozí všechna) ----------
function oblastHtml(vybrane) {   // vybrane = Set kódů okresů nebo null (nová registrace)
  const vKraji = (k) => S.cis.okres.filter((o) => o.kraj_kod === k);
  const krajZap = (k) => vybrane && vKraji(k).some((o) => vybrane.has(o.kod));
  return `<div class="fld oblast" data-f="oblast"><label>Kde můžete pracovat – vyberte kraje</label>
    <div class="chips">${S.cis.kraj.map((k) => `<label><input type="checkbox" name="oblkraj" value="${k.kod}"${krajZap(k.kod) ? ' checked' : ''}> ${esc(k.nazev.replace('Hlavní město ', ''))}</label>`).join('')}</div>
    ${S.cis.kraj.map((k) => `<div class="okresy${krajZap(k.kod) ? '' : ' hidden'}" data-kraj="${k.kod}">
      <div class="okr-hlava"><b>${esc(k.nazev)}</b> <span class="okr-pocet"></span> <a href="#" class="okr-vse">vybrat vše</a></div>
      <div class="chips">${vKraji(k.kod).map((o) => `<label><input type="checkbox" name="okres" value="${o.kod}"${!vybrane || vybrane.has(o.kod) ? ' checked' : ''}> ${esc(o.mesto)}</label>`).join('')}</div>
      <div class="hint">Okresní města – odznačte, kam jezdit nechcete.</div></div>`).join('')}
    <div class="err"></div></div>`;
}
function oblastPocty() {
  document.querySelectorAll('.okresy').forEach((p) => {
    const vse = p.querySelectorAll('input[name=okres]'), zap = p.querySelectorAll('input[name=okres]:checked');
    p.querySelector('.okr-pocet').textContent = `${zap.length} z ${vse.length}`;
    p.querySelector('.okr-vse').textContent = zap.length === vse.length ? 'zrušit vše' : 'vybrat vše';
  });
}
function zapniOblast() {
  document.querySelectorAll('input[name=oblkraj]').forEach((ch) => ch.addEventListener('change', () => {
    const p = document.querySelector(`.okresy[data-kraj="${ch.value}"]`);
    p.classList.toggle('hidden', !ch.checked);
    p.querySelectorAll('input[name=okres]').forEach((o) => (o.checked = ch.checked));   // nově vybraný kraj = všechna města
    oblastPocty();
  }));
  document.querySelectorAll('.okr-vse').forEach((a) => (a.onclick = (e) => {
    e.preventDefault();
    const boxy = a.closest('.okresy').querySelectorAll('input[name=okres]');
    const vse = [...boxy].every((b) => b.checked); boxy.forEach((b) => (b.checked = !vse)); oblastPocty();
  }));
  document.querySelectorAll('input[name=okres]').forEach((o) => o.addEventListener('change', oblastPocty));
  oblastPocty();
}
const oblastVyber = () => [...document.querySelectorAll('.okresy:not(.hidden) input[name=okres]:checked')].map((x) => x.value);

// ---------- start ----------
async function start() {
  const [kraj, okres, stat, zp, banka] = await Promise.all([
    sb.from('kraj').select('kod,nazev').order('poradi'),
    sb.from('okres').select('kod,mesto,kraj_kod').order('poradi'),
    sb.from('stat').select('kod,nazev').order('nazev'),
    sb.from('zdravotni_pojistovna').select('kod,nazev').order('kod'),
    sb.from('banka').select('kod,nazev').order('nazev'),
  ]);
  S.cis = { kraj: kraj.data || [], okres: okres.data || [], stat: stat.data || [], zp: zp.data || [], banka: banka.data || [] };
  const { data } = await sb.auth.getSession();
  if (data.session) return poPrihlaseni();
  location.hash === '#registrace' ? vRegistrace() : vUvod();
}
sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_IN' && !S.osoba) poPrihlaseni(); });
document.getElementById('odhlasit').onclick = async () => { await sb.auth.signOut(); location.hash = ''; location.reload(); };
document.querySelectorAll('#tabs button').forEach((b) => b.onclick = () => ukaz(b.dataset.v));

function vUvod() {
  $app.innerHTML = `<h1>Vítejte ve Vixen</h1><p class="mute">Hostesky a promotéři – vše k brigádám na jednom místě.</p>
   <button class="btn" id="b1">Chci se zaregistrovat</button><button class="btn o" id="b2">Už mám registraci – přihlásit</button>`;
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
   ${pole('obec', 'Kde bydlíte (obec / město)', '', { ac: 'address-level2' })}
   <div class="fld" data-f="fotky"><label>Fotky (1–3) – portrét nebo postava</label><div class="fotky" id="reg-fotky"></div><div class="err"></div>
     <div class="hint">Fotka se zmenší přímo v telefonu. Uvidí ji jen kancelář Vixen.</div></div>
   ${oblastHtml(null)}
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
   <p class="mute" style="text-align:center"><a href="#" id="zpet">Už mám registraci – přihlásit</a></p>`;
  document.getElementById('zpet').onclick = (e) => { e.preventDefault(); vPrihlaseni(); };
  zapniOblast();
  S.regFotky = [];
  const kresliRegFotky = () => {
    const box = document.getElementById('reg-fotky');
    box.innerHTML = S.regFotky.map((f, i) => `<figure><img src="${f.url}" alt="Fotka ${i + 1}"><button type="button" class="smaz" data-i="${i}" title="Odebrat">✕</button></figure>`).join('')
      + (S.regFotky.length < 3 ? '<label class="pridat"><input type="file" id="reg-foto" accept="image/jpeg,image/png,image/webp" hidden><span>＋<br>Přidat fotku</span></label>' : '');
    box.querySelectorAll('.smaz').forEach((b) => (b.onclick = () => { S.regFotky.splice(+b.dataset.i, 1); kresliRegFotky(); }));
    const v = document.getElementById('reg-foto');
    if (v) v.onchange = async () => {
      const f = v.files[0]; if (!f || !/^image\//.test(f.type)) return;
      const blob = await zmensi(f); S.regFotky.push({ blob, url: URL.createObjectURL(blob) }); kresliRegFotky();
      const fld = document.querySelector('.fld[data-f="fotky"]'); fld.classList.remove('chyba'); fld.querySelector('.err').textContent = '';
    };
  };
  kresliRegFotky();
  const vyber = (n) => [...document.querySelectorAll(`input[name="${n}"]:checked`)].map((x) => x.value);
  const kontrola = () => ({
    jmeno: K.povinne(val('jmeno'), 'jméno'), prijmeni: K.povinne(val('prijmeni'), 'příjmení'),
    telefon: K.telefonChyba(val('telefon')), email: K.emailChyba(val('email')),
    oblast: oblastVyber().length ? '' : 'Vyberte aspoň jeden kraj a v něm aspoň jedno město.', obec: K.povinne(val('obec'), 'obec'),
    fotky: S.regFotky.length ? '' : 'Přidejte aspoň jednu fotku.',
    zajem: vyber('zajem').length ? '' : 'Vyberte aspoň jednu možnost.',
    gdpr: val('gdpr') ? '' : 'Bez souhlasu vás nemůžeme evidovat.',
  });
  hlidejPole(kontrola);
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    if (!ukazChyby(kontrola())) return;
    const b = e.target.querySelector('button[type=submit]'); b.disabled = true; b.textContent = 'Odesílám…';
    const fotky = [];
    for (const f of S.regFotky) {
      const cesta = f.cesta || `registrace/${crypto.randomUUID()}.jpg`;
      if (!f.cesta) { const up = await sb.storage.from('fotky').upload(cesta, f.blob, { contentType: 'image/jpeg' });
        if (up.error) { b.disabled = false; b.textContent = 'Odeslat registraci'; return chybaFormu(e.target, 'Fotku se nepodařilo nahrát – zkuste to prosím znovu.'); }
        f.cesta = cesta; }
      fotky.push(cesta);
    }
    const { error } = await sb.rpc('registrace', { p: { fotky,
      jmeno: val('jmeno'), prijmeni: val('prijmeni'), telefon: K.telefonNormalizuj(val('telefon')), email: val('email').toLowerCase(),
      okresy: oblastVyber(), obec: val('obec'), zajem: vyber('zajem'), kanal_kontaktu: vyber('kanal'), souhlas_gdpr_v: C.gdprVerze } });
    if (error) {
      b.disabled = false; b.textContent = 'Odeslat registraci';
      // duplicita: označit jen to pole, které je obsazené (telefon / e-mail); starší hláška bez určení = obě
      const t = error.message || '';
      if (/evidujeme|duplicit/i.test(t)) for (const id of /telefon/i.test(t) && !/e-mail/i.test(t) ? ['telefon'] : /e-mail/i.test(t) && !/telefon/i.test(t) ? ['email'] : ['email', 'telefon']) {
        const f = document.querySelector(`.fld[data-f="${id}"]`); if (f) { f.classList.add('chyba'); f.querySelector('.err').textContent = `Tento ${id === 'email' ? 'e-mail' : 'telefon'} už evidujeme – zkontrolujte ho nebo se nám ozvěte.`; }
      }
      chybaFormu(e.target, chybaText(error)); return;
    }
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
      if (error) return chybaFormu(e.target, chybaText(error));
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
  const [o, p, n, d, oo, ff] = await Promise.all([
    sb.from('osoba').select('*').single(),
    sb.from('osoba_profil').select('*').maybeSingle(),
    sb.from('osoba_nastup').select('*').maybeSingle(),
    sb.from('dokument').select('id,stav,obsah,vytvoreno,podepsano_at,podpis,vixen_podepsano_at,vixen_podpis,odeslano_at,odeslano_na,odstoupeni_do,odstoupeno_at,pdf_cesta,dokument_sablona(nazev,druh)').order('vytvoreno', { ascending: false }),
    sb.from('osoba_okres').select('okres_kod'),
    sb.from('osoba_foto').select('id,cesta,poradi').order('poradi'),
  ]);
  S.okresy = (oo.data || []).map((x) => x.okres_kod);
  S.fotky = ff.data || [];
  S.osoba = o.data; S.profil = p.data; S.nastup = n.data; S.dokumenty = (d.data || []).filter((x) => x.stav !== 'zruseno');
  document.getElementById('kdo').textContent = S.osoba ? S.osoba.jmeno + ' ' + S.osoba.prijmeni : '';
}
function ukaz(v) {
  S.view = v;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  navStav();
  ({ prehled: vPrehled, profil: vProfil, nastup: vNastup, dokumenty: vDokumenty })[v]();
  window.scrollTo(0, 0);
}
const schvalena = () => S.osoba && S.osoba.stav !== 'uchazec' && S.osoba.stav !== 'odmitnuta';

// ---------- přehled: tok kroků k první akci ----------
function kroky() {
  const dpp = S.dokumenty.find((x) => x.dokument_sablona?.druh === 'dpp');
  const ok = schvalena();
  return [
    { t: 'Registrace', kdo: 'vy', hotovo: true, popis: 'kontakt, kde můžete pracovat' },
    { t: 'Schválení kanceláří', kdo: 'kanc', hotovo: ok, popis: S.osoba.stav === 'odmitnuta' ? 'registrace nebyla přijata' : 'kancelář projde vaši registraci' },
    { t: 'Profil', v: 'profil', kdo: 'vy', hotovo: !!S.profil, popis: 'fotka, výška, konfekce, jazyky, kdy můžete', tlac: 'Doplnit profil' },
    { t: 'Údaje pro smlouvu', v: 'nastup', kdo: 'vy', hotovo: !!S.nastup?.potvrzeno_at, popis: 'rodné číslo, adresa, pojišťovna, účet', tlac: 'Vyplnit údaje' },
    dpp && dpp.stav === 'k_podpisu' && !dpp.vixen_podepsano_at
      ? { t: 'Podpis smlouvy (DPP)', v: 'dokumenty', kdo: 'kanc', hotovo: false, popis: 'smlouvu teď podepisuje Vixen, pak vy' }
      : { t: 'Podpis smlouvy (DPP)', v: 'dokumenty', kdo: 'vy', hotovo: dpp?.stav === 'podepsano' && !dpp.odstoupeno_at, popis: dpp?.stav === 'k_podpisu' ? 'Vixen podepsal – smlouva čeká na váš podpis' : dpp?.odeslano_at ? 'podepsaná smlouva přišla na váš e-mail' : 'přečíst a podepsat kódem', tlac: dpp ? 'Podepsat smlouvu' : 'Připravit smlouvu' },
    { t: 'Přihlášení na ČSSZ', kdo: 'kanc', hotovo: false, popis: 'kancelář vás přihlásí před první akcí' },
  ];
}
function navStav() {
  if (!S.osoba) return;
  const k = kroky(), ok = schvalena(), dalsi = k.find((x) => !x.hotovo);
  const mapa = { profil: k[2], nastup: k[3], dokumenty: k[4] };
  document.querySelectorAll('#tabs button').forEach((b) => {
    const x = mapa[b.dataset.v]; if (!x) return;
    b.classList.toggle('hot', x.hotovo); b.classList.toggle('dalsi', ok && x === dalsi); b.classList.toggle('zamek', !ok);
    b.querySelector('i').textContent = x.hotovo ? '✓' : !ok ? '🔒' : { profil: '3', nastup: '4', dokumenty: '5' }[b.dataset.v];
  });
}
function vPrehled() {
  const k = kroky(), dalsi = k.find((x) => !x.hotovo), hotovych = k.filter((x) => x.hotovo).length;
  const odmitnuta = S.osoba.stav === 'odmitnuta';
  let ted;
  if (odmitnuta) ted = `<div class="ted kancelar"><b>Registrace nebyla přijata</b>Pokud jde o omyl, ozvěte se prosím kanceláři Vixen.</div>`;
  else if (dalsi.kdo === 'vy') ted = `<div class="ted"><b>Teď je to na vás: ${esc(dalsi.t)}</b>${esc(dalsi.popis)}<button class="btn" id="dal">${esc(dalsi.tlac)} →</button></div>`;
  else if (dalsi === k[1]) ted = `<div class="ted kancelar"><b>Teď čekáte na kancelář</b>Vaši registraci prochází kancelář. Po schválení vám dáme vědět a budete moct pokračovat profilem.</div>`;
  else ted = `<div class="ted konec"><b>Z vaší strany je hotovo ✓</b>Kancelář vás přihlásí na ČSSZ před první akcí. Údaje můžete kdykoli upravit.</div>`;
  const stav = (x) => (x.hotovo ? 'hotovo' : x === dalsi ? 'nyni' : 'budouci');
  $app.innerHTML = `<h1>Dobrý den, ${esc(K.vokativ(S.osoba.jmeno))}</h1>
   <p class="mute">Vaše cesta k první akci – hotovo ${hotovych} z ${k.length}</p>
   <div class="prubeh"><div style="width:${Math.round((hotovych / k.length) * 100)}%"></div></div>
   ${ted}
   <ol class="cesta">${k.map((x, i) => `<li class="${stav(x)}"${x.v && schvalena() ? ` data-v="${x.v}"` : ''}>
     <span class="c">${x.hotovo ? '✓' : i + 1}</span>
     <span class="t"><b>${esc(x.t)}<span class="kdo ${x.kdo === 'vy' ? 'vy' : 'kanc'}">${x.kdo === 'vy' ? 'vy' : 'kancelář'}</span></b><small>${esc(x.popis)}</small></span></li>`).join('')}</ol>`;
  const tl = document.getElementById('dal'); if (tl) tl.onclick = () => ukaz(dalsi.v);
  $app.querySelectorAll('.cesta li[data-v]').forEach((el) => (el.onclick = () => ukaz(el.dataset.v)));
}


// ---------- fotky v profilu (soukromé úložiště, zmenšené v telefonu před nahráním) ----------
const MAX_FOTEK = 3;
async function zmensi(soubor, max = 1200) {
  const img = await new Promise((ok, chyba) => { const i = new Image(); i.onload = () => ok(i); i.onerror = chyba; i.src = URL.createObjectURL(soubor); });
  const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
}
async function fotkyBlok(hlaska = '') {
  const box = document.getElementById('fotky'); if (!box) return;
  const urls = S.fotky.length ? ((await sb.storage.from('fotky').createSignedUrls(S.fotky.map((f) => f.cesta), 3600)).data || []) : [];
  box.innerHTML = `<h2 style="margin-top:0">Fotky</h2><p class="mute">Aspoň jedna aktuální fotka postavy nebo portrétu – kancelář podle ní vybírá lidi na akce. Vidí ji jen kancelář Vixen.</p>${hlaska}
   <div class="fotky">${S.fotky.map((f, i) => `<figure><img src="${esc(urls[i]?.signedUrl || '')}" alt="Fotka ${i + 1}"><button type="button" class="smaz" data-id="${f.id}" title="Smazat fotku">✕</button></figure>`).join('')}
   ${S.fotky.length < MAX_FOTEK ? `<label class="pridat"><input type="file" id="foto-vstup" accept="image/jpeg,image/png,image/webp" hidden><span>＋<br>Přidat fotku</span></label>` : ''}</div>`;
  const vstup = document.getElementById('foto-vstup');
  if (vstup) vstup.onchange = async () => {
    const f = vstup.files[0]; if (!f) return;
    if (!/^image\//.test(f.type)) return fotkyBlok(msg('Vyberte prosím obrázek (JPG, PNG).', 'bad'));
    box.querySelector('.pridat span').innerHTML = 'Nahrávám…';
    try {
      const blob = await zmensi(f), cesta = `${S.osoba.id}/${Date.now()}.jpg`;
      const up = await sb.storage.from('fotky').upload(cesta, blob, { contentType: 'image/jpeg' }); if (up.error) throw up.error;
      const ins = await sb.from('osoba_foto').insert({ osoba_id: S.osoba.id, cesta, poradi: S.fotky.length + 1 }).select('id,cesta,poradi').single(); if (ins.error) throw ins.error;
      S.fotky.push(ins.data); fotkyBlok(msg('Fotka nahraná ✓'));
    } catch (e) { fotkyBlok(msg(esc('Nahrání se nepovedlo: ' + chybaText(e)), 'bad')); }
  };
  box.querySelectorAll('.smaz').forEach((b) => (b.onclick = async () => {
    const f = S.fotky.find((x) => x.id === b.dataset.id);
    await sb.storage.from('fotky').remove([f.cesta]); const { error } = await sb.from('osoba_foto').delete().eq('id', f.id);
    if (error) return fotkyBlok(msg(esc(chybaText(error)), 'bad'));
    S.fotky = S.fotky.filter((x) => x.id !== f.id); fotkyBlok();
  }));
}

// ---------- krok 3: profil ----------
function vProfil() {
  if (!schvalena()) return ($app.innerHTML = '<h1>Profil</h1>' + msg('Profil půjde doplnit po schválení registrace.', 'warn'));
  const p = S.profil || {};
  const k = ['XS', 'S', 'M', 'L', 'XL', 'XXL'].map((x) => ({ kod: x, nazev: x }));
  $app.innerHTML = `<h1>Profil</h1><p class="mute">Pomůže nám vybrat vhodnou akci. <span class="mute">(rozsah polí upřesní Vixen)</span></p>
  <div class="card" id="fotky"></div>
  <form id="f" class="card" novalidate>
   <div class="row">${pole('vyska', 'Výška (cm)', p.vyska_cm ?? '', { typ: 'number', im: 'numeric' })}${pole('bota', 'Bota (EU)', p.bota_eu ?? '', { typ: 'number', im: 'decimal' })}</div>
   ${pole('konfekce', 'Konfekční velikost', '', { select: opt(k, p.konfekce, '—') })}
   ${pole('jazyky', 'Jazyky', (p.jazyky || []).join(', '), { ph: 'angličtina, němčina' })}
   ${pole('zkusenosti', 'Zkušenosti', p.zkusenosti || '', { typ: 'textarea' })}
   <label class="chk"><input type="checkbox" id="ridicak" ${p.ridicak ? 'checked' : ''}> Mám řidičák</label>
   <label class="chk"><input type="checkbox" id="auto" ${p.vlastni_auto ? 'checked' : ''}> Mám vlastní auto</label>
   ${pole('dostupnost', 'Kdy můžete pracovat', p.dostupnost || '', { ph: 'víkendy, po 16:00…' })}
   ${oblastHtml(new Set(S.okresy))}
   <button class="btn" type="submit">Uložit profil</button></form>`;
  zapniOblast();
  fotkyBlok();
  const kontrola = () => ({
    vyska: val('vyska') && (val('vyska') < 120 || val('vyska') > 220) ? 'Výška 120–220 cm.' : '',
    bota: val('bota') && (val('bota') < 30 || val('bota') > 50) ? 'Velikost bot 30–50.' : '',
    oblast: oblastVyber().length ? '' : 'Vyberte aspoň jeden kraj a v něm aspoň jedno město.',
  });
  hlidejPole(kontrola);
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault(); if (!ukazChyby(kontrola())) return;
    const { error } = await sb.from('osoba_profil').upsert({
      osoba_id: S.osoba.id, vyska_cm: val('vyska') || null, bota_eu: val('bota') || null, konfekce: val('konfekce') || null,
      jazyky: val('jazyky') ? val('jazyky').split(',').map((x) => x.trim()).filter(Boolean) : [],
      zkusenosti: val('zkusenosti') || null, ridicak: val('ridicak'), vlastni_auto: val('auto'), dostupnost: val('dostupnost') || null });
    if (error) return chybaFormu(e.target, chybaText(error));
    const nove = oblastVyber(), stare = S.okresy;
    const pryc = stare.filter((k) => !nove.includes(k)), pribyla = nove.filter((k) => !stare.includes(k));
    if (pribyla.length) { const r = await sb.from('osoba_okres').insert(pribyla.map((k) => ({ osoba_id: S.osoba.id, okres_kod: k }))); if (r.error) return chybaFormu(e.target, chybaText(r.error)); }
    if (pryc.length) { const r = await sb.from('osoba_okres').delete().eq('osoba_id', S.osoba.id).in('okres_kod', pryc); if (r.error) return chybaFormu(e.target, chybaText(r.error)); }
    await nacti(); ukaz('prehled');
  };
}

// ---------- krok 4: údaje pro smlouvu ----------
const SOUHLAS_SML = 'Tento e-mail je můj soukromý (ne pracovní ani sdílený) a souhlasím, aby na něj Vixen posílal smlouvy a dohody k elektronickému uzavření.';
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
   <h2>E-mail pro smlouvy</h2>
   ${pole('email_sml', 'Soukromý e-mail pro smlouvy', n.email_smlouvy || S.osoba.email || '', { typ: 'email', ac: 'email', hint: 'Sem vám pošleme podepsanou smlouvu v PDF. Doručením je smlouva uzavřená.' })}
   <div class="fld" data-f="souhlas_sml"><label class="chk"><input type="checkbox" id="souhlas_sml" ${n.email_smlouvy_souhlas_at ? 'checked' : ''}> ${SOUHLAS_SML}</label><div class="err"></div></div>
   <h2>Ještě dvě otázky</h2>
   <label class="chk"><input type="checkbox" id="duchod" ${n.predcasny_duchod ? 'checked' : ''}> Pobírám předčasný starobní důchod</label>
   <label class="chk"><input type="checkbox" id="up" ${n.vedena_na_up ? 'checked' : ''}> Jsem v evidenci úřadu práce</label>
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
      email_sml: K.emailChyba(val('email_sml')),
      souhlas_sml: val('souhlas_sml') ? '' : 'Bez souhlasu nejde smlouvu podepsat v aplikaci.',
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
      email_smlouvy: val('email_sml').toLowerCase(),
      email_smlouvy_souhlas_at: n.email_smlouvy_souhlas_at && (n.email_smlouvy || '') === val('email_sml').toLowerCase() ? n.email_smlouvy_souhlas_at : new Date().toISOString(),
      email_smlouvy_souhlas_text: SOUHLAS_SML,
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
    ['E-mail pro smlouvy', n.email_smlouvy + ' (souhlas s elektronickým uzavíráním)'],
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

// ---------- krok 5: smlouva – podpis Vixen → podpis hostesky → PDF na soukromý e-mail → 7 dní na odstoupení ----------
const kdyCz = (t) => (t ? new Date(t).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const denCz = (t) => (t ? new Date(t).toLocaleDateString('cs-CZ') : '');
function stahniPdf(b64, soubor) {
  const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([u], { type: 'application/pdf' })); a.download = soubor || 'smlouva.pdf'; a.click();
}
async function odesliSmlouvu(dok, m) {
  m('Připravuji PDF a posílám ho na váš e-mail…', 'warn');
  const { data, error } = await sb.functions.invoke('smlouva-odeslat', { body: { dokument_id: dok.id } });
  if (error || data?.chyba) { m(esc(data?.chyba || chybaText(error)) + ' Zkuste to prosím znovu tlačítkem níže.', 'bad'); return false; }
  if (data.dev) { m(`VÝVOJ: e-mail neodešel (SMTP pro funkce není nastavené). <a href="#" id="pdf-dev">Stáhnout PDF</a>`, 'warn');
    document.getElementById('pdf-dev').onclick = (e) => { e.preventDefault(); stahniPdf(data.pdf_base64, data.soubor); }; }
  else m(`Podepsanou smlouvu jsme poslali na ${esc(data.na)}. Doručením je smlouva uzavřená.`);
  return true;
}
function stavSmlouvy(d) {
  if (d.odstoupeno_at) return ['odstoupeno ' + denCz(d.odstoupeno_at), 't-b'];
  if (!d.odeslano_at) return ['podepsáno – PDF ještě neodešlo', 't-w'];
  if (new Date(d.odstoupeni_do) > new Date()) return ['uzavřeno · odstoupit lze do ' + denCz(d.odstoupeni_do), 't-ok'];
  return ['uzavřeno', 't-ok'];
}
function vDokumenty() {
  if (!S.nastup?.potvrzeno_at) return ($app.innerHTML = '<h1>Smlouva</h1>' + msg('Nejdřív prosím vyplňte a potvrďte údaje pro smlouvu.', 'warn') + '<button class="btn" id="n">Vyplnit údaje</button>', document.getElementById('n').onclick = () => ukaz('nastup'));
  const bezSouhlasu = !S.nastup.email_smlouvy || !S.nastup.email_smlouvy_souhlas_at;
  const kPodpisu = S.dokumenty.find((d) => d.stav === 'k_podpisu');
  const dppPodepsana = S.dokumenty.find((d) => d.stav === 'podepsano' && d.dokument_sablona?.druh === 'dpp' && !d.odstoupeno_at);
  const potrebaNova = dppPodepsana && new Date(S.nastup.zmeneno || S.nastup.potvrzeno_at) > new Date(dppPodepsana.podepsano_at);
  const vixen = kPodpisu?.vixen_podpis;
  let hlavni = '';
  if (bezSouhlasu) hlavni = msg('Pro podpis v aplikaci potřebujeme váš soukromý e-mail – pošleme na něj podepsanou smlouvu. Doplňte ho prosím v Údajích.', 'warn') + '<button class="btn" id="n">Doplnit e-mail</button>';
  else if (kPodpisu && !kPodpisu.vixen_podepsano_at) hlavni = `<div class="card"><h2 style="margin-top:0">${esc(kPodpisu.dokument_sablona?.nazev)}</h2>
      ${msg('Smlouvu teď kontroluje a podepisuje Vixen. Jakmile ji podepíše, podepíšete ji tady i vy – dáme vám vědět.', 'warn')}
      <details><summary>Náhled smlouvy</summary><div class="doc">${esc(kPodpisu.obsah)}</div></details></div>`;
  else if (kPodpisu) hlavni = `<div class="card"><h2 style="margin-top:0">${esc(kPodpisu.dokument_sablona?.nazev)}</h2>
      <p class="mute">Za Vixen podepsala <b>${esc(vixen?.jmeno || '')}</b> ${kdyCz(kPodpisu.vixen_podepsano_at)}. Přečtěte si smlouvu – vaše údaje jsou doplněné automaticky.</p>
      <div class="doc">${esc(kPodpisu.obsah)}</div>
      <label class="chk"><input type="checkbox" id="precteno"> Smlouvu mám přečtenou a údaje v ní jsou správné.</label>
      <p class="mute">Po podpisu pošleme podepsané PDF na <b>${esc(S.nastup.email_smlouvy)}</b>. Doručením je smlouva uzavřená; do 7 dnů od ní můžete odstoupit, pokud jste ještě nezačala pracovat.</p>
      <div id="m"></div>
      <button class="btn" id="kod" disabled>Podepsat – poslat kód e-mailem</button>
      <div id="zadat" class="hidden">${pole('k', 'Kód z e-mailu (6 číslic)', '', { im: 'numeric', ac: 'one-time-code' })}<button class="btn g" id="podepsat">Podepsat</button></div></div>`;
  else if (!dppPodepsana || potrebaNova) hlavni = `<button class="btn" id="pripravit">${potrebaNova ? 'Připravit novou verzi smlouvy' : 'Připravit smlouvu (DPP)'}</button><div id="m"></div>`;
  const podepsane = S.dokumenty.filter((d) => d.stav === 'podepsano');
  $app.innerHTML = `<h1>Smlouva</h1>${hlavni}
   <h2>Podepsané</h2>
   ${podepsane.map((d) => { const [t, c] = stavSmlouvy(d); const lze = d.odeslano_at && !d.odstoupeno_at && new Date(d.odstoupeni_do) > new Date();
     return `<div class="sem dok-pod" data-id="${d.id}"><span>${esc(d.dokument_sablona?.nazev)}<br><span class="mute">podepsáno ${kdyCz(d.podepsano_at)} · ${esc(d.podpis?.zpusob || '')}</span>
       <span class="akce">${d.pdf_cesta ? '<a href="#" class="pdf">Stáhnout PDF</a>' : ''}${!d.odeslano_at && !d.odstoupeno_at ? ' <button class="btn o mini poslat">Poslat PDF na e-mail</button>' : ''}${lze ? ' <a href="#" class="odstoupit">Odstoupit od smlouvy</a>' : ''}</span><span class="m2"></span></span>
       <span class="tag ${c}">${t}</span></div>`; }).join('') || '<p class="mute">Zatím nic.</p>'}`;
  const m = (t, typ) => { const el = document.getElementById('m'); if (el) el.innerHTML = msg(t, typ); };
  const n = document.getElementById('n'); if (n) n.onclick = () => ukaz('nastup');
  document.querySelectorAll('.dok-pod').forEach((r) => {
    const d = S.dokumenty.find((x) => x.id === r.dataset.id), m2 = (t, typ) => (r.querySelector('.m2').innerHTML = msg(t, typ));
    const pdf = r.querySelector('.pdf');
    if (pdf) pdf.onclick = async (e) => { e.preventDefault(); const { data, error } = await sb.storage.from('dokumenty').createSignedUrl(d.pdf_cesta, 120);
      if (error) return m2(esc(chybaText(error)), 'bad'); window.open(data.signedUrl, '_blank'); };
    const po = r.querySelector('.poslat');
    if (po) po.onclick = async () => { po.disabled = true; if (await odesliSmlouvu(d, m2)) { await nacti(); vDokumenty(); } else po.disabled = false; };
    const od = r.querySelector('.odstoupit');
    if (od) od.onclick = async (e) => { e.preventDefault();
      if (!confirm('Opravdu od smlouvy odstupujete? Tento krok nejde vrátit.')) return;
      const { error } = await sb.rpc('smlouva_odstoupit', { p_dokument: d.id });
      if (error) return m2(esc(chybaText(error)), 'bad');
      await nacti(); vDokumenty(); };
  });
  const pr = document.getElementById('pripravit');
  if (pr) pr.onclick = async () => {
    pr.disabled = true;
    const { error } = await sb.rpc('dokument_priprav', { p_osoba: S.osoba.id, p_druh: 'dpp' });
    if (error) { pr.disabled = false; return m(esc(chybaText(error)), 'bad'); }
    await nacti(); vDokumenty();
  };
  if (!kPodpisu || !kPodpisu.vixen_podepsano_at || bezSouhlasu) return;
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
    $app.innerHTML = `<h1>Podepsáno ✓</h1><div id="m"></div><button class="btn o" id="p">Zpět na přehled</button>`;
    document.getElementById('p').onclick = () => ukaz('prehled');
    await odesliSmlouvu(kPodpisu, m);
    await nacti();
  };
}

start().catch((e) => ($app.innerHTML = msg('Aplikaci se nepodařilo načíst: ' + esc(chybaText(e)), 'bad')));
})();
