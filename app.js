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
  return K.prelozChybu(m);
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
const val = (id) => { const el = document.getElementById(id); return el ? (el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value.trim()) : ''; };
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
  S.kontrola = kontrola;
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

// ---------- kde může pracovat: města bez nutnosti znát kraj (Vixen 26. 10. 2026) ----------
// rychlý výběr krajských měst + vyhledávání ostatních okresních měst; vybrané jako štítky s ✕
const KRAJSKA = ['praha', 'brno-mesto', 'ostrava-mesto', 'plzen-mesto', 'ceske-budejovice', 'hradec-kralove', 'pardubice', 'olomouc', 'liberec', 'usti-nad-labem', 'zlin', 'jihlava', 'karlovy-vary'];
const bezDiak = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function oblastHtml(vybrane) {   // vybrane = Set kódů okresů nebo null (nová registrace)
  S.oblast = new Set(vybrane ? [...vybrane] : []);
  const rychle = KRAJSKA.map((k) => S.cis.okres.find((o) => o.kod === k)).filter(Boolean);
  return `<div class="fld oblast" data-f="oblast"><label for="mesto-hledej">Vyberte města</label>
    <div class="chips rychle">${rychle.map((o) => `<label><input type="checkbox" name="mesto-rychle" value="${o.kod}"> ${esc(o.mesto)}</label>`).join('')}</div>
    <div class="hledej-mesto"><input type="search" id="mesto-hledej" placeholder="Další město – začněte psát (např. Písek)" autocomplete="off"><div class="naseptavac hidden" id="mesto-nab"></div></div>
    <div class="vybrana" id="mesta-vybrana"></div>
    <div class="err"></div><div class="hint">Vyberte všechna města, kam můžete dojet. Kraj znát nemusíte.</div></div>`;
}
function oblastPrekontroluj() {   // po přidání / odebrání města schovat nebo ukázat chybu
  const f = document.querySelector('.fld[data-f="oblast"]'); if (!f || !S.kontrola || !f.classList.contains('chyba')) return;
  const t = S.kontrola().oblast || ''; f.classList.toggle('chyba', !!t); f.querySelector('.err').textContent = t;
}
function oblastKresli() {
  document.querySelectorAll('input[name=mesto-rychle]').forEach((ch) => (ch.checked = S.oblast.has(ch.value)));
  const box = document.getElementById('mesta-vybrana'); if (!box) return;
  const vyb = S.cis.okres.filter((o) => S.oblast.has(o.kod));
  box.innerHTML = vyb.length ? `<span class="mute">Vybráno ${vyb.length}:</span> ` + vyb.map((o) => `<span class="mesto-chip">${esc(o.mesto)}<button type="button" data-k="${o.kod}" title="Odebrat ${esc(o.mesto)}">✕</button></span>`).join('') : '<span class="mute">Zatím žádné město.</span>';
  box.querySelectorAll('button').forEach((btn) => (btn.onclick = () => { S.oblast.delete(btn.dataset.k); oblastKresli(); oblastPrekontroluj(); }));
}
function zapniOblast() {
  document.querySelectorAll('input[name=mesto-rychle]').forEach((ch) => ch.addEventListener('change', () => {
    if (ch.checked) S.oblast.add(ch.value); else S.oblast.delete(ch.value);
    oblastKresli(); oblastPrekontroluj();
  }));
  const vstup = document.getElementById('mesto-hledej'), nab = document.getElementById('mesto-nab');
  const pridej = (k) => { S.oblast.add(k); vstup.value = ''; nab.classList.add('hidden'); oblastKresli(); oblastPrekontroluj(); vstup.focus(); };
  vstup.addEventListener('input', () => {
    const q = bezDiak(vstup.value.trim()); if (!q) return nab.classList.add('hidden');
    const l = S.cis.okres.filter((o) => !S.oblast.has(o.kod) && bezDiak(o.mesto).includes(q)).slice(0, 8);
    nab.innerHTML = l.length ? l.map((o) => `<button type="button" data-k="${o.kod}">${esc(o.mesto)}</button>`).join('') : '<span class="mute">Nenašli jsme – zkuste nejbližší okresní město.</span>';
    nab.classList.remove('hidden');
    nab.querySelectorAll('button').forEach((btn) => (btn.onclick = () => pridej(btn.dataset.k)));
  });
  vstup.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); nab.querySelector('button')?.click(); } });
  oblastKresli();
}
const oblastVyber = () => [...(S.oblast || [])];

// ---------- start ----------
// číselníky se načítají na pozadí – úvod se ukáže hned; registrace a přihlášený obsah na ně počkají
async function start() {
  S.cisP = Promise.all([
    sb.from('kraj').select('kod,nazev').order('poradi'),
    sb.from('okres').select('kod,mesto,kraj_kod').order('poradi'),
    sb.from('stat').select('kod,nazev').order('nazev'),
    sb.from('zdravotni_pojistovna').select('kod,nazev').order('kod'),
    sb.from('banka').select('kod,nazev').order('nazev'),
  ]).then(([kraj, okres, stat, zp, banka]) => { S.cis = { kraj: kraj.data || [], okres: okres.data || [], stat: stat.data || [], zp: zp.data || [], banka: banka.data || [] }; });
  const { data } = await sb.auth.getSession();
  if (data.session) { await S.cisP; return poPrihlaseni(); }
  if (location.hash === '#registrace') { await S.cisP; return vRegistrace(); }
  vUvod();
}
sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_IN' && !S.osoba) poPrihlaseni(); });
document.getElementById('odhlasit').onclick = async () => { await sb.auth.signOut(); location.hash = ''; location.reload(); };
document.querySelectorAll('#tabs button').forEach((b) => b.onclick = () => ukaz(b.dataset.v));

const IKONA = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const VYHODY = [
  [IKONA('<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4M8 14h3"/>'), 'Pracujete, kdy chcete', 'Akce si vybíráte podle svého času.'],
  [IKONA('<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'), 'Akce blízko vás', 'Uvedete města, kam můžete jezdit.'],
  [IKONA('<rect x="6.5" y="2.5" width="11" height="19" rx="2"/><path d="M10 18.5h4M9.5 8.5l2 2 3.5-3.5"/>'), 'Vše v telefonu', 'Smlouvu podepíšete kódem, bez papírů.'],
];
function vUvod() {
  $app.innerHTML = `<section class="hero"><div class="linka"></div><div class="nad">Hostesky · modelky · promotéři</div>
    <h1>Přidejte se k týmu Vixen</h1>
    <p>Veletrhy, koncerty, ochutnávky, firemní akce. Brigády po celé republice – kdy se vám to hodí.</p>
    <button class="btn" id="b1">Chci se zaregistrovat</button><button class="btn o" id="b2">Už mám registraci – přihlásit</button></section>
   <div class="vyhody">${VYHODY.map(([ikona, t, p]) => `<div>${ikona}<p style="margin:0"><b>${t}</b><span>${p}</span></p></div>`).join('')}</div>
   <p class="mute" style="text-align:center">Registrace zabere 2 minuty. Údaje pro smlouvu až před první akcí.</p>`;
  document.getElementById('b1').onclick = async () => { await S.cisP; vRegistrace(); };
  document.getElementById('b2').onclick = vPrihlaseni;
}

// ---------- krok 1: registrace ----------
function vRegistrace() {
  location.hash = 'registrace';
  $app.innerHTML = `<section class="hero mala"><div class="linka"></div><div class="nad">Registrace</div><h1>Přidejte se k nám</h1>
    <p>Zabere to 2 minuty. Údaje pro smlouvu budeme chtít až před první akcí.</p></section>
  <form id="f" novalidate class="card">
   <div class="oddil"><i>1</i>Kontakt</div>
   <div class="row">${pole('jmeno', 'Jméno', '', { ac: 'given-name' })}${pole('prijmeni', 'Příjmení', '', { ac: 'family-name' })}</div>
   ${pole('telefon', 'Telefon', '', { typ: 'tel', ac: 'tel', ph: '777 123 456', im: 'tel' })}
   ${pole('email', 'E-mail', '', { typ: 'email', ac: 'email', ph: 'jana@seznam.cz', hint: 'Na tento e-mail se budete přihlašovat.' })}
   ${pole('obec', 'Kde bydlíte (obec / město)', '', { ac: 'address-level2' })}
   <div class="oddil"><i>2</i>Fotky</div>
   <div class="fld" data-f="fotky"><label>1–3 fotky – portrét nebo postava</label><div class="fotky" id="reg-fotky"></div><div class="err"></div>
     <div class="hint">Fotka se zmenší přímo v telefonu. Uvidí ji jen kancelář Vixen.</div></div>
   <div class="oddil"><i>3</i>Kde můžete pracovat</div>
   ${oblastHtml(null)}
   <div class="oddil"><i>4</i>O vás</div>
   <div class="row">${pole('vyska', 'Výška (cm)', '', { typ: 'number', im: 'numeric', ph: 'např. 170' })}<div></div></div>
   ${K.jazykyHtml([])}
   <label class="chk"><input type="checkbox" id="ridicak"> Mám řidičák</label>
   <label class="chk"><input type="checkbox" id="auto"> Mám vlastní auto</label>
   <div class="fld" data-f="zajem"><label>Mám zájem o</label><div class="chips">
     <label><input type="checkbox" name="zajem" value="hosteska" checked> hosteska</label>
     <label><input type="checkbox" name="zajem" value="promoter"> promotér/ka</label>
     <label><input type="checkbox" name="zajem" value="jine"> jiné</label></div><div class="err"></div></div>
   <div class="oddil"><i>5</i>Nabídky a souhlas</div>
   <p class="mute" style="margin-top:0">Nabídky akcí najdete v aplikaci, upozornění vám pošleme e-mailem.</p>
   <label class="chk"><input type="checkbox" id="whatsapp"> Upozornění na nové nabídky mi můžete posílat i přes WhatsApp na můj telefon.</label>
   <div class="fld" data-f="gdpr"><label class="chk"><input type="checkbox" id="gdpr"> <span>Souhlasím se zpracováním osobních údajů pro účely spolupráce s Vixen. <span class="mute">(text souhlasu dodá Vixen – DOPLNIT)</span></span></label><div class="err"></div></div>
   <div class="past" aria-hidden="true"><label>Web <input id="web" name="web" tabindex="-1" autocomplete="off"></label></div>
   <button class="btn" type="submit">Odeslat registraci</button></form>
   <p class="mute" style="text-align:center"><a href="#" id="zpet">Už mám registraci – přihlásit</a></p>`;
  document.getElementById('zpet').onclick = (e) => { e.preventDefault(); vPrihlaseni(); };
  zapniOblast();
  K.jazykyZapni(document.getElementById('f'));
  S.regFotky = []; const zacatek = Date.now();   // ochrana proti robotům: doba vyplnění + skryté pole „web“
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
    oblast: oblastVyber().length ? '' : 'Vyberte aspoň jedno město.', obec: K.povinne(val('obec'), 'obec'),
    fotky: S.regFotky.length ? '' : 'Přidejte aspoň jednu fotku.',
    vyska: val('vyska') && (val('vyska') < 120 || val('vyska') > 220) ? 'Výška 120–220 cm.' : '',
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
      okresy: oblastVyber(), obec: val('obec'), zajem: vyber('zajem'), souhlas_gdpr_v: C.gdprVerze,
      vyska: val('vyska') || null, jazyky: K.jazykyHodnota(e.target), ridicak: val('ridicak'), auto: val('auto'), whatsapp: val('whatsapp'),
      web: document.getElementById('web').value, cas_ms: Date.now() - zacatek } });
    if (error) {
      b.disabled = false; b.textContent = 'Odeslat registraci';
      // duplicita: označit jen to pole, které je obsazené (telefon / e-mail); starší hláška bez určení = obě
      const t = error.message || '';
      if (/evidujeme|duplicit/i.test(t)) for (const id of /telefon/i.test(t) && !/e-mail/i.test(t) ? ['telefon'] : /e-mail/i.test(t) && !/telefon/i.test(t) ? ['email'] : ['email', 'telefon']) {
        const f = document.querySelector(`.fld[data-f="${id}"]`); if (f) { f.classList.add('chyba'); f.querySelector('.err').textContent = `Tento ${id === 'email' ? 'e-mail' : 'telefon'} už evidujeme – zkontrolujte ho nebo se nám ozvěte.`; }
      }
      chybaFormu(e.target, chybaText(error)); return;
    }
    $app.innerHTML = `<h1>Děkujeme!</h1>${msg('Registrace dorazila ✓')}<p>Přihlásíte se e-mailem <b>${esc(val('email') || '')}</b> – heslo není potřeba. Nabídky akcí pak uvidíte v aplikaci. Údaje pro smlouvu budeme chtít až před vaší první akcí.</p>
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
  document.getElementById('reg').onclick = async (e) => { e.preventDefault(); await S.cisP; vRegistrace(); };
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
    // účet kanceláře / TBDB není hosteska – nabídnout kancelář místo registrace
    const [{ data: nabor }, { data: admin }] = await Promise.all([sb.rpc('ma_pravo', { p: 'nabor' }), sb.rpc('ma_pravo', { p: 'superadmin' })]);
    if (nabor || admin) {
      $app.innerHTML = msg('Účet ' + esc(user?.email) + ' je účet kanceláře, ne hostesky. Pokračujte do kanceláře.', 'warn') + '<a class="btn" href="kancelar.html">Do kanceláře</a>';
      document.getElementById('odhlasit').classList.remove('hidden');
      return;
    }
    $app.innerHTML = msg('E-mail ' + esc(user?.email) + ' v evidenci nemáme. Zaregistrujte se prosím stejným e-mailem.', 'warn') + '<button class="btn" id="r">Registrace</button>';
    document.getElementById('odhlasit').classList.remove('hidden');
    document.getElementById('r').onclick = async () => { await sb.auth.signOut(); await S.cisP; vRegistrace(); };
    return;
  }
  document.getElementById('odhlasit').classList.remove('hidden');
  document.getElementById('tabs').classList.remove('hidden');
  await nacti();
  ukaz('prehled');
}
async function nacti() {
  const [o, p, n, d, oo, ff, sch] = await Promise.all([
    sb.from('osoba').select('*').single(),
    sb.from('osoba_profil').select('*').maybeSingle(),
    sb.from('osoba_nastup').select('*').maybeSingle(),
    sb.from('dokument').select('id,stav,obsah,vytvoreno,podepsano_at,podpis,vixen_podepsano_at,vixen_podpis,odeslano_at,odeslano_na,odstoupeni_do,odstoupeno_at,pdf_cesta,dokument_sablona(nazev,druh)').order('vytvoreno', { ascending: false }),
    sb.from('osoba_okres').select('okres_kod'),
    sb.from('osoba_foto').select('id,cesta,poradi').order('poradi'),
    sb.rpc('parametr_dnes', { p_kod: 'registrace_schvalovat' }),
  ]);
  S.okresy = (oo.data || []).map((x) => x.okres_kod);
  S.fotky = ff.data || [];
  S.schvalovat = sch.error ? true : sch.data !== false;
  S.osoba = o.data; S.profil = p.data; S.nastup = n.data; S.dokumenty = (d.data || []).filter((x) => x.stav !== 'zruseno');
  document.getElementById('kdo').textContent = S.osoba ? S.osoba.jmeno + ' ' + S.osoba.prijmeni : '';
}
function ukaz(v) {
  S.view = v;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  navStav();
  ({ prehled: vPrehled, profil: vProfil, forma: vForma, nastup: vNastup, dokumenty: vDokumenty })[v]();
  window.scrollTo(0, 0);
}
const schvalena = () => S.osoba && S.osoba.stav !== 'uchazec' && S.osoba.stav !== 'odmitnuta';
const vyzvan = () => !!S.osoba?.smlouva_vyzva_at;
const FORMY = { dpp: 'Dohoda o provedení práce (DPP)', ico: 'Mám IČO – budu fakturovat', prilezitostna: 'Smlouva o příležitostné činnosti' };
function smlouvaKrok() {   // co je v kroku „Smlouva před první akcí“ na řadě
  const forma = S.osoba.forma_spoluprace;
  const dpp = S.dokumenty.find((x) => x.dokument_sablona?.druh === 'dpp');
  if (!vyzvan()) return { hotovo: false, kdo: 'kanc', popis: 'až před vaší první akcí – kancelář vám dá vědět' };
  if (!forma) return { hotovo: false, kdo: 'vy', v: 'forma', popis: 'vyberte, jak s námi budete spolupracovat', tlac: 'Vybrat formu spolupráce' };
  if (forma === 'ico') return { hotovo: !!S.osoba.ico, kdo: 'vy', v: 'forma', popis: S.osoba.ico ? 'fakturujete na IČO ' + S.osoba.ico : 'doplňte IČO', tlac: 'Doplnit IČO' };
  if (!S.nastup?.potvrzeno_at) return { hotovo: false, kdo: 'vy', v: 'nastup', popis: 'rodné číslo, adresa, pojišťovna, účet', tlac: 'Vyplnit údaje' };
  if (forma === 'prilezitostna') return { hotovo: true, kdo: 'vy', v: 'dokumenty', popis: 'údaje máme – smlouvu připraví kancelář' };
  if (dpp && dpp.stav === 'k_podpisu' && !dpp.vixen_podepsano_at) return { hotovo: false, kdo: 'kanc', v: 'dokumenty', popis: 'smlouvu teď podepisuje Vixen, pak vy' };
  return { hotovo: dpp?.stav === 'podepsano' && !dpp.odstoupeno_at, kdo: 'vy', v: 'dokumenty',
    popis: dpp?.stav === 'k_podpisu' ? 'Vixen podepsal – smlouva čeká na váš podpis' : dpp?.odeslano_at ? 'podepsaná smlouva přišla na váš e-mail' : 'přečíst a podepsat kódem', tlac: dpp ? 'Podepsat smlouvu' : 'Připravit smlouvu' };
}
function kroky() {
  const k = [{ id: 'reg', t: 'Registrace', kdo: 'vy', hotovo: true, popis: 'kontakt, města, fotka' }];
  if (S.schvalovat || !schvalena()) k.push({ id: 'schval', t: 'Schválení kanceláří', kdo: 'kanc', hotovo: schvalena(),
    popis: S.osoba.stav === 'odmitnuta' ? 'registrace nebyla přijata' : 'kancelář projde vaši registraci',
    cekani: 'Vaši registraci prochází kancelář. Po schválení vám dáme vědět.' });
  k.push({ id: 'profil', t: 'Profil', v: 'profil', kdo: 'vy', hotovo: !!S.profil && S.fotky.length > 0, popis: 'fotky, výška, jazyky, kdy můžete – upravit můžete kdykoli', tlac: 'Doplnit profil' });
  k.push({ id: 'akce', t: 'Nabídka akce', kdo: 'kanc', hotovo: vyzvan(), popis: 'nabídky akcí uvidíte v aplikaci',
    cekani: 'Jakmile pro vás budeme mít akci, dáme vám vědět. Před první akcí vás požádáme o údaje pro smlouvu.' });
  k.push({ id: 'smlouva', t: 'Smlouva před první akcí', ...smlouvaKrok() });
  if (S.osoba.forma_spoluprace === 'dpp') k.push({ id: 'cssz', t: 'Přihlášení na ČSSZ', kdo: 'kanc', hotovo: false, popis: 'kancelář vás přihlásí před první akcí',
    cekani: 'Z vaší strany je hotovo. Kancelář vás přihlásí na ČSSZ před první akcí.' });
  return k;
}
function navStav() {
  if (!S.osoba) return;
  const k = kroky(), ok = schvalena(), dalsi = k.find((x) => !x.hotovo);
  const prof = k.find((x) => x.id === 'profil'), sml = k.find((x) => x.id === 'smlouva');
  const mapa = { profil: [prof, ok], nastup: [sml, ok && vyzvan()], dokumenty: [sml, ok && vyzvan()] };
  document.querySelectorAll('#tabs button').forEach((b) => {
    const [x, otevreno] = mapa[b.dataset.v] || []; if (!x) return;
    const hotovo = b.dataset.v === 'nastup' ? !!S.nastup?.potvrzeno_at : x.hotovo;
    b.classList.toggle('hot', hotovo); b.classList.toggle('dalsi', otevreno && x === dalsi && x.v === b.dataset.v); b.classList.toggle('zamek', !otevreno);
    b.querySelector('i').textContent = hotovo ? '✓' : !otevreno ? '🔒' : { profil: '3', nastup: '4', dokumenty: '5' }[b.dataset.v];
  });
}
// zástupce na ploše telefonu: Android nabídne instalaci sám (beforeinstallprompt), iPhone jen ručně přes Sdílet
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.instalace = e; });
function plochaKarta() {
  const naPlose = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  let skryto = false; try { skryto = localStorage.getItem('vixen_plocha_skryto') === '1'; } catch {}
  if (naPlose || skryto) return '';
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const navod = ios ? 'V Safari klepněte dole na <b>Sdílet</b> (čtvereček se šipkou) a pak na <b>Přidat na plochu</b>.'
    : S.instalace ? 'Jedním klepnutím si přidáte ikonu Vixen na plochu a aplikaci pak otevřete jako každou jinou.'
    : 'V prohlížeči otevřete nabídku <b>⋮</b> a zvolte <b>Přidat na plochu</b> (nebo <b>Nainstalovat aplikaci</b>).';
  return `<div class="card plocha"><img src="ikony/ikona-192.png" alt="" width="52" height="52"><div><b class="nadp">Vixen na ploše telefonu</b><span>${navod}</span>
    <div class="plocha-tl">${!ios && S.instalace ? '<button class="btn" id="plocha-pridat">Přidat na plochu</button>' : ''}<button class="btn o" id="plocha-skryt">Teď ne</button></div></div></div>`;
}
function zapniPlochu() {
  const pr = document.getElementById('plocha-pridat');
  if (pr) pr.onclick = async () => { S.instalace.prompt(); await S.instalace.userChoice; S.instalace = null; document.querySelector('.plocha')?.remove(); };
  const sk = document.getElementById('plocha-skryt');
  if (sk) sk.onclick = () => { try { localStorage.setItem('vixen_plocha_skryto', '1'); } catch {} document.querySelector('.plocha')?.remove(); };
}
function vPrehled() {
  const k = kroky(), dalsi = k.find((x) => !x.hotovo), hotovych = k.filter((x) => x.hotovo).length;
  const odmitnuta = S.osoba.stav === 'odmitnuta';
  let ted;
  if (odmitnuta) ted = `<div class="ted kancelar"><b>Registrace nebyla přijata</b>Pokud jde o omyl, ozvěte se prosím kanceláři Vixen.</div>`;
  else if (dalsi && dalsi.kdo === 'vy') ted = `<div class="ted"><b>Teď je to na vás: ${esc(dalsi.t)}</b>${esc(dalsi.popis)}<button class="btn" id="dal">${esc(dalsi.tlac)} →</button></div>`;
  else if (dalsi && dalsi.cekani) ted = `<div class="ted kancelar"><b>Teď čekáte na kancelář</b>${esc(dalsi.cekani)}</div>`;
  else if (dalsi) ted = `<div class="ted kancelar"><b>Teď čekáte na kancelář</b>${esc(dalsi.popis)}</div>`;
  else ted = `<div class="ted konec"><b>Z vaší strany je hotovo ✓</b>Údaje můžete kdykoli upravit.</div>`;
  const stav = (x) => (x.hotovo ? 'hotovo' : x === dalsi ? 'nyni' : 'budouci');
  $app.innerHTML = `<h1>Dobrý den, ${esc(K.vokativ(S.osoba.jmeno))}</h1>
   <p class="mute">Vaše cesta k první akci – hotovo ${hotovych} z ${k.length}</p>
   <div class="prubeh"><div style="width:${Math.round((hotovych / k.length) * 100)}%"></div></div>
   ${ted}
   ${plochaKarta()}
   <ol class="cesta">${k.map((x, i) => `<li class="${stav(x)}"${x.v && schvalena() && (x.id !== 'smlouva' || vyzvan()) ? ` data-v="${x.v}"` : ''}>
     <span class="c">${x.hotovo ? '✓' : i + 1}</span>
     <span class="t"><b>${esc(x.t)}<span class="kdo ${x.kdo === 'vy' ? 'vy' : 'kanc'}">${x.kdo === 'vy' ? 'vy' : 'kancelář'}</span></b><small>${esc(x.popis)}</small></span></li>`).join('')}</ol>`;
  const tl = document.getElementById('dal'); if (tl) tl.onclick = () => ukaz(dalsi.v);
  $app.querySelectorAll('.cesta li[data-v]').forEach((el) => (el.onclick = () => ukaz(el.dataset.v)));
  zapniPlochu();
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
   ${K.jazykyHtml(p.jazyky || [])}
   ${pole('zkusenosti', 'Zkušenosti', p.zkusenosti || '', { typ: 'textarea' })}
   <label class="chk"><input type="checkbox" id="ridicak" ${p.ridicak ? 'checked' : ''}> Mám řidičák</label>
   <label class="chk"><input type="checkbox" id="auto" ${p.vlastni_auto ? 'checked' : ''}> Mám vlastní auto</label>
   ${pole('dostupnost', 'Kdy můžete pracovat', p.dostupnost || '', { ph: 'víkendy, po 16:00…' })}
   ${oblastHtml(new Set(S.okresy))}
   <button class="btn" type="submit">Uložit profil</button></form>`;
  zapniOblast();
  K.jazykyZapni(document.getElementById('f'));
  fotkyBlok();
  const kontrola = () => ({
    vyska: val('vyska') && (val('vyska') < 120 || val('vyska') > 220) ? 'Výška 120–220 cm.' : '',
    bota: val('bota') && (val('bota') < 30 || val('bota') > 50) ? 'Velikost bot 30–50.' : '',
    oblast: oblastVyber().length ? '' : 'Vyberte aspoň jedno město.',
  });
  hlidejPole(kontrola);
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault(); if (!ukazChyby(kontrola())) return;
    const { error } = await sb.from('osoba_profil').upsert({
      osoba_id: S.osoba.id, vyska_cm: val('vyska') || null, bota_eu: val('bota') || null, konfekce: val('konfekce') || null,
      jazyky: K.jazykyHodnota(e.target),
      zkusenosti: val('zkusenosti') || null, ridicak: val('ridicak'), vlastni_auto: val('auto'), dostupnost: val('dostupnost') || null });
    if (error) return chybaFormu(e.target, chybaText(error));
    const nove = oblastVyber(), stare = S.okresy;
    const pryc = stare.filter((k) => !nove.includes(k)), pribyla = nove.filter((k) => !stare.includes(k));
    if (pribyla.length) { const r = await sb.from('osoba_okres').insert(pribyla.map((k) => ({ osoba_id: S.osoba.id, okres_kod: k }))); if (r.error) return chybaFormu(e.target, chybaText(r.error)); }
    if (pryc.length) { const r = await sb.from('osoba_okres').delete().eq('osoba_id', S.osoba.id).in('okres_kod', pryc); if (r.error) return chybaFormu(e.target, chybaText(r.error)); }
    await nacti(); ukaz('prehled');
  };
}

// ---------- před první akcí: forma spolupráce (rozcestník, Vixen 26. 10. 2026) ----------
const icoChyba = (v) => {
  const c = K.cisla(v); if (!c) return 'Vyplňte IČO.'; if (c.length !== 8) return 'IČO má 8 číslic.';
  const a = [...c.slice(0, 7)].reduce((s, d, i) => s + Number(d) * (8 - i), 0) % 11;
  return Number(c[7]) === (a === 0 ? 1 : a === 1 ? 0 : 11 - a) ? '' : 'IČO nesedí – zkontrolujte číslice.';
};
function vForma(zmena = false) {
  S.view = 'forma';
  if (!schvalena() || !vyzvan()) return ($app.innerHTML = '<h1>Smlouva</h1>' + msg('Smlouvu budeme chtít až před vaší první akcí – kancelář vám dá vědět.', 'warn'));
  const forma = zmena ? null : S.osoba.forma_spoluprace;
  if (forma === 'ico') {
    $app.innerHTML = `<h1>Spolupráce na IČO</h1><p class="mute">${esc(FORMY.ico)} · <a href="#" id="zmen-formu">změnit</a></p>
      <form id="f" class="card" novalidate>${pole('ico', 'IČO', S.osoba.ico || '', { im: 'numeric', ph: '12345678' })}
      <p class="mute">Po akci vystavíte fakturu. <span class="mute">(jaké další údaje a doklady potřebuje Vixen – DOPLNIT)</span></p>
      <button class="btn" type="submit">Uložit</button></form>`;
    document.getElementById('zmen-formu').onclick = (e) => { e.preventDefault(); vForma(true); };
    const kontrola = () => ({ ico: icoChyba(val('ico')) });
    hlidejPole(kontrola);
    document.getElementById('f').onsubmit = async (e) => {
      e.preventDefault(); if (!ukazChyby(kontrola())) return;
      const { error } = await sb.from('osoba').update({ ico: K.cisla(val('ico')) }).eq('id', S.osoba.id);
      if (error) return chybaFormu(e.target, chybaText(error));
      await nacti(); ukaz('prehled');
    };
    return;
  }
  $app.innerHTML = `<h1>Jak s námi budete spolupracovat?</h1>
    <p class="mute">Před první akcí potřebujeme vědět, na co budete pracovat. Podle toho připravíme smlouvu.</p>
    <div class="formy">
      <button class="forma" data-f="dpp"><b>${FORMY.dpp}</b><span>Dohoda + prohlášení poplatníka, podepíšete v telefonu kódem.</span></button>
      <button class="forma" data-f="ico"><b>${FORMY.ico}</b><span>Máte živnost – po akci vystavíte fakturu.</span></button>
      <button class="forma" data-f="prilezitostna"><b>${FORMY.prilezitostna}</b><span>Chodíte nepravidelně.</span></button>
    </div><div id="m"></div>`;
  $app.querySelectorAll('.forma').forEach((b) => (b.onclick = async () => {
    const { error } = await sb.from('osoba').update({ forma_spoluprace: b.dataset.f }).eq('id', S.osoba.id);
    if (error) return (document.getElementById('m').innerHTML = msg(esc(chybaText(error)), 'bad'));
    await nacti(); ukaz(b.dataset.f === 'ico' ? 'forma' : 'nastup');
  }));
}

// ---------- krok 4: údaje pro smlouvu ----------
const SOUHLAS_SML = 'Tento e-mail je můj soukromý (ne pracovní ani sdílený) a souhlasím, aby na něj Vixen posílal smlouvy a dohody k elektronickému uzavření.';
function vNastup(predvypln) {
  if (!schvalena() || !vyzvan()) return ($app.innerHTML = '<h1>Údaje pro smlouvu</h1>' + msg('Údaje pro smlouvu budeme chtít až před vaší první akcí – kancelář vám dá vědět.', 'warn'));
  if (!S.osoba.forma_spoluprace || S.osoba.forma_spoluprace === 'ico') return vForma();
  const n = predvypln || S.nastup || { obcanstvi: 'CZ', danova_rezidence: 'CZ', stat_bydliste: 'CZ', rodne_prijmeni: S.osoba.prijmeni };
  const rc = n.rodne_cislo ? n.rodne_cislo.slice(0, 6) + '/' + n.rodne_cislo.slice(6) : '';
  const bankaJina = n.ucet_banka && !S.cis.banka.some((b) => b.kod === n.ucet_banka);
  $app.innerHTML = `<h1>Údaje pro smlouvu</h1>
  <p class="mute">${esc(FORMY[S.osoba.forma_spoluprace])} · <a href="#" id="zmen-formu">změnit</a>. Vyplníte jednou, dál se předvyplňují.</p>
  <form id="f" class="card" novalidate>
   <div class="fld up-otazka" data-f="up"><label>Úřad práce – důležité</label>
     <label class="chk velke"><input type="radio" name="up" id="up_ne" ${S.nastup && !n.vedena_na_up ? 'checked' : ''}> <b>NEJSEM</b> veden/a v evidenci úřadu práce</label>
     <label class="chk velke"><input type="radio" name="up" id="up_ano" ${n.vedena_na_up ? 'checked' : ''}> <b>JSEM</b> veden/a v evidenci úřadu práce</label>
     <div class="err"></div><div class="hint">Musíme to vědět ještě před podpisem smlouvy.</div></div>
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
   <h2>Ještě jedna otázka</h2>
   <label class="chk"><input type="checkbox" id="duchod" ${n.predcasny_duchod ? 'checked' : ''}> Pobírám předčasný starobní důchod</label>
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
      up: val('up_ne') || val('up_ano') ? '' : 'Vyberte prosím, jestli jste v evidenci úřadu práce.',
    };
  };
  hlidejPole(kontrola);
  document.getElementById('zmen-formu').onclick = (e) => { e.preventDefault(); vForma(true); };
  document.getElementById('f').onsubmit = (e) => {
    e.preventDefault(); if (!ukazChyby(kontrola())) return;
    vSouhrn({
      osoba_id: S.osoba.id, obcanstvi: val('obcanstvi'), rodne_cislo: K.cisla(val('rc')) || null, datum_narozeni: val('datum'),
      rodne_prijmeni: val('rodne_prijmeni'), misto_narozeni: val('misto'), ulice: val('ulice') || null, cislo_popisne: val('cp'),
      psc: val('psc').replace(/\s/g, ''), obec: val('obec'), stat_bydliste: val('stat_bydliste'), koresp_adresa: val('koresp') || null,
      zdravotni_pojistovna: val('zp') || null, danova_rezidence: val('rezidence'), zahr_dan_id: val('rezidence') !== 'CZ' ? val('zahr_id') : null,
      ucet_predcisli: K.cisla(val('pred')) || null, ucet_cislo: K.cisla(val('ucet')), ucet_banka: kodBanky(),
      predcasny_duchod: val('duchod'), vedena_na_up: val('up_ano'),
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
    $app.innerHTML = S.osoba.forma_spoluprace === 'prilezitostna'
      ? `<h1>Uloženo ✓</h1>${msg('Údaje máme. Smlouvu o příležitostné činnosti vám připraví kancelář.')}<button class="btn" id="d">Zpět na přehled</button>`
      : `<h1>Uloženo ✓</h1>${msg('Údaje máme. Teď můžete podepsat smlouvu.')}<button class="btn" id="d">Ke smlouvě</button>`;
    document.getElementById('d').onclick = () => ukaz(S.osoba.forma_spoluprace === 'prilezitostna' ? 'prehled' : 'dokumenty');
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
  if (!schvalena() || !vyzvan()) return ($app.innerHTML = '<h1>Smlouva</h1>' + msg('Smlouvu podepíšete až před vaší první akcí – kancelář vám dá vědět.', 'warn'));
  if (!S.osoba.forma_spoluprace || S.osoba.forma_spoluprace === 'ico') return vForma();
  if (S.osoba.forma_spoluprace === 'prilezitostna' && S.nastup?.potvrzeno_at) return ($app.innerHTML = '<h1>Smlouva</h1>' + msg('Smlouvu o příležitostné činnosti připraví kancelář podle vzoru Vixen. <span class="mute">(vzor dodá Vixen – DOPLNIT)</span>', 'warn'));
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
      <p class="mute">Za Vixen podepsáno: <b>${esc(vixen?.jmeno || '')}</b> ${kdyCz(kPodpisu.vixen_podepsano_at)}. Přečtěte si smlouvu – vaše údaje jsou doplněné automaticky.</p>
      <div class="doc">${esc(kPodpisu.obsah)}</div>
      <label class="chk"><input type="checkbox" id="precteno"> Smlouvu mám přečtenou a údaje v ní jsou správné.</label>
      <p class="mute">Po podpisu pošleme podepsané PDF na <b>${esc(S.nastup.email_smlouvy)}</b>. Doručením je smlouva uzavřená; do 7 dnů od ní můžete odstoupit, pokud jste ještě nenastoupili na první akci.</p>
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
