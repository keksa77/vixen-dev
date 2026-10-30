// Vixen – aplikace kanceláře. Zatím: úvodní stránka s dotazy (tikety) majitelek pro TBDB.
(function () {
const C = window.VIXEN_CONFIG, K = window.K;
const sb = window.supabase.createClient(C.url, C.key, window.VIXEN_DEMO ? { auth: window.VIXEN_DEMO_AUTH, global: { fetch: (...a) => window.fetch(...a) } } : undefined);
const $app = document.getElementById('app');
const DEV = new URLSearchParams(location.search).has('dev');
const S = { user: null, jmeno: '', tbdb: false, nabor: false, smlouvy: false, vedeni: false, tikety: [], cis: null, lide: [], vyber: new Set() };
const TYP = { dotaz: 'Dotaz', chyba: 'Něco nefunguje', prani: 'Přání / nápad' };
const STAV = { novy: ['nový', 't-w'], resime: ['řešíme', 't-g'], ceka_na_vas: ['čeká na vás', 't-b'], hotovo: ['hotovo', 't-ok'] };
// stav z pohledu přihlášeného: TBDB vidí „čeká na Vixen“ místo „čeká na vás“
const stavT = (s) => (S.tbdb && s === 'ceka_na_vas' ? ['čeká na Vixen', 't-b'] : STAV[s]);
// na tahu = kdo má teď odpovědět: TBDB u nových a řešených, Vixen u „čeká na vás“
const naTahu = (t) => (S.tbdb ? t.stav === 'novy' || t.stav === 'resime' : t.stav === 'ceka_na_vas');
// upozornění e-mailem pro TBDB (nový dotaz / odpověď Vixen); chyba upozornění nesmí zastavit práci
const upozorni = (tiket_id, udalost) => { if (!S.tbdb) sb.functions.invoke('tiket-upozorneni', { body: { tiket_id, udalost } }).catch(() => {}); };
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
// kdo co nastavil: „Vixen – Laďka“, „TBDB – …“, „hosteska“, nebo „aplikace automaticky“ (+ kdy)
const kdoTxt = (uid, cas, o, kratce) => { const j = S.jmena?.[uid];
  const t = !uid ? 'aplikace automaticky' : o && uid === o.auth_user_id ? 'hosteska' : j ? `${j.tbdb ? 'TBDB' : 'Vixen'} – ${j.jmeno}` : 'kancelář';
  return t + (cas ? ' · ' + (kratce ? new Date(cas).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' }) : kdy(cas)) : ''); };
const kdoZn = (uid, cas, o, pred = '', kratce) => `<small class="kdo">${pred}${esc(kdoTxt(uid, cas, o, kratce))}</small>`;
// stav člověka: kdo registraci schválil / odmítl / vyřadil
const stavKdo = (o, kratce) => o.stav === 'uchazec' ? `<small class="kdo">registrace – hosteska · ${kdy(o.vytvoreno)}</small>`
  : !o.stav_zmenil && o.stav === 'prijata' ? `<small class="kdo">přijatá automaticky (schvalování vypnuté)${o.stav_zmeneno ? ' · ' + kdy(o.stav_zmeneno) : ''}</small>`
  : kdoZn(o.stav_zmenil, o.stav_zmeneno, o, '', kratce);
const chyba = (e) => { const m = (e && (e.message || e.error_description)) || String(e);
  return /signups not allowed/i.test(m) ? 'Tento e-mail nemá přístup do kanceláře. Přihlaste se e-mailem, ke kterému vám TBDB nastavilo přístup.' : K.prelozChybu(m); };
document.getElementById('odhlasit').onclick = async () => { if (window.VIXEN_DEMO) return (location.href = location.pathname); await sb.auth.signOut(); location.reload(); };

async function start() {
  const { data } = await sb.auth.getSession();
  data.session ? poPrihlaseni() : vPrihlaseni();
}
sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_IN' && !S.user) poPrihlaseni(); });

function vPrihlaseni() {
  $app.innerHTML = `<h1>Kancelář Vixen</h1><p class="mute">Přihlaste se e-mailem – pošleme odkaz a kód.</p>
   <form id="f" class="card" novalidate>
    <div class="fld" data-f="email"><label for="email">E-mail</label><input id="email" type="email" autocomplete="email"><div class="err"></div></div>
    ${DEV ? '<div class="fld" data-f="heslo"><label for="heslo">Heslo (jen pro testy ve vývoji)</label><input id="heslo" type="password"><div class="err"></div></div>' : ''}
    <button class="btn" type="submit">${DEV ? 'Přihlásit' : 'Poslat e-mail'}</button></form>`;
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
    const znovu = async () => { const { error: err } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: location.href.split('#')[0] } });
      if (err) chybaFormu(document.getElementById('fk'), chyba(err)); else vKod(email, znovu); };
    vKod(email, znovu);
  };
}

// přihlášení kódem z e-mailu (27. 10. 2026): odkaz i kód; kód funguje i v aplikaci na ploše iPhonu a na jiném zařízení
function vKod(email, znovu) {
  $app.innerHTML = `<h1>Mrkněte do e-mailu</h1>${msg('Poslali jsme e-mail na ' + esc(email) + '.')}
   <form id="fk" class="card" novalidate><p style="margin-top:0">Klikněte na odkaz v e-mailu, <b>nebo sem opište kód</b> z e-mailu – to funguje vždy, i v aplikaci na ploše.</p>
   <div class="fld" data-f="kod"><label for="kod">Kód z e-mailu</label><input id="kod" inputmode="numeric" autocomplete="one-time-code" maxlength="12" placeholder="123456"><div class="err"></div></div>
   <button class="btn" type="submit">Přihlásit kódem</button></form>
   <p class="mute" style="text-align:center"><a href="#" id="znovu">Poslat e-mail znovu</a> · <a href="#" id="jiny">Jiný e-mail</a></p>`;
  document.getElementById('kod').focus();
  document.getElementById('znovu').onclick = (e) => { e.preventDefault(); znovu(); };
  document.getElementById('jiny').onclick = (e) => { e.preventDefault(); vPrihlaseni(); };
  document.getElementById('fk').onsubmit = async (e) => {
    e.preventDefault();
    const kod = K.cisla(document.getElementById('kod').value), f = document.querySelector('[data-f=kod]');
    if (kod.length < 6) { f.classList.add('chyba'); f.querySelector('.err').textContent = 'Opište celý kód z e-mailu (6 číslic).'; return; }
    const b = e.target.querySelector('button'); b.disabled = true; b.textContent = 'Přihlašuji…';
    const { error } = await sb.auth.verifyOtp({ email, token: kod, type: 'email' });
    if (error) { b.disabled = false; b.textContent = 'Přihlásit kódem'; f.classList.add('chyba'); f.querySelector('.err').textContent = /expired|invalid/i.test(error.message || '') ? 'Kód nesedí nebo už vypršel. Zkontrolujte ho, nebo si pošlete nový.' : K.prelozChybu(error.message); }
    // úspěch: přihlášení dokončí onAuthStateChange (SIGNED_IN)
  };
}


async function poPrihlaseni() {
  const { data: { user } } = await sb.auth.getUser();
  S.user = user;
  const [{ data: vedeni }, { data: tbdb }, { data: nabor }] = await Promise.all([sb.rpc('ma_pravo', { p: 'vedeni' }), sb.rpc('ma_pravo', { p: 'superadmin' }), sb.rpc('ma_pravo', { p: 'nabor' })]);
  document.getElementById('odhlasit').classList.remove('hidden');
  if (!vedeni) { $app.innerHTML = msg('Tento účet nemá přístup do kanceláře. Ozvěte se TBDB.', 'warn'); return; }
  S.tbdb = !!tbdb; S.nabor = !!nabor; S.vedeni = !!vedeni;
  S.smlouvy = !!(await sb.rpc('ma_pravo', { p: 'smlouvy' })).data;
  if (S.smlouvy) S.podpisuji = (await sb.from('podpisujici').select('jmeno,opravneni,do_').eq('auth_user_id', user.id).maybeSingle()).data;
  if (S.podpisuji?.do_ && new Date(S.podpisuji.do_) < new Date()) S.podpisuji = null;
  S.jmeno = (user.user_metadata && user.user_metadata.jmeno) || user.email.split('@')[0];
  if (S.tbdb) S.jmeno += ' (TBDB)';
  const kdo = document.getElementById('kdo');
  kdo.textContent = `${user.email} · ${S.tbdb ? 'TBDB' : S.vedeni ? 'vedení' : 'kancelář'}${S.podpisuji ? ' · podepisuje za Vixen' : ''}`;
  kdo.title = 'Přihlášený účet';
  try { const { data } = await sb.rpc('kancelar_jmena'); S.jmena = Object.fromEntries((data || []).map((x) => [x.id, x])); } catch { S.jmena = {}; }
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
        ? 'Povolte prosím mikrofon pro tuto stránku.' : e.error === 'no-speech' ? 'Nic nebylo slyšet – zkuste to znovu.' : 'Diktování se přerušilo (' + e.error + ').');
      rec.onend = () => { rec = null; btn.textContent = '🎤 Diktovat'; btn.classList.remove('nahrava'); if (!info.textContent.startsWith('Povol')) info.textContent = 'Text můžete před odesláním upravit.'; };
      rec.start(); btn.textContent = '⏹ Zastavit diktování'; btn.classList.add('nahrava'); info.textContent = 'Poslouchám… mluvte česky.';
    };
  });
}

// ---------- dotazy: Vixen píše, TBDB odpovídá – stejná obrazovka, jen jiný pohled ----------
async function vUvod(hlaska) {
  await nactiTikety();
  const radek = (t) => `<div class="tik${naTahu(t) ? ' natahu' : ''}" data-id="${t.id}"><span><b>#${t.cislo} ${esc(t.predmet)}</b>${t.spech ? ' ⚡' : ''}<small>${TYP[t.typ]} · ${esc(t.autor_jmeno)} · ${kdy(t.zmeneno)}</small></span><span class="tag ${stavT(t.stav)[1]}">${stavT(t.stav)[0]}</span></div>`;
  const razeni = (a, b) => (b.spech - a.spech) || (a.zmeneno < b.zmeneno ? -1 : 1);   // spěchá nahoře, pak nejstarší
  const tah = S.tikety.filter(naTahu).sort(razeni), ostatni = S.tikety.filter((t) => t.stav !== 'hotovo' && !naTahu(t)), hotove = S.tikety.filter((t) => t.stav === 'hotovo');
  const formular = `<div class="card"><h2 style="margin-top:0">Napište nám (TBDB)</h2>
    <p class="pozn">Dotaz, problém nebo nápad k aplikaci. TBDB dostane upozornění e-mailem a odpoví tady – uvidíte to v seznamu níže.</p>
    <form id="f" novalidate>
     <div class="fld" data-f="typ"><label>Co potřebujete</label><div class="chips typy">
      ${Object.entries(TYP).map(([k, v], i) => `<label><input type="radio" name="typ" value="${k}"${i ? '' : ' checked'}> ${v}</label>`).join('')}</div><div class="err"></div></div>
     <div class="fld" data-f="predmet"><label for="predmet">Předmět</label><input id="predmet" maxlength="120" placeholder="Např. Jak přidat novou kolegyni"><div class="err"></div></div>
     <div class="fld" data-f="text"><label for="text">Popis</label><textarea id="text" rows="5" placeholder="Napište nebo nadiktujte, co se stalo / co potřebujete. U chyby: kde v aplikaci to bylo a co se dělo."></textarea>${mikrofon('text')}<div class="err"></div></div>
     <div class="fld" data-f="soubory"><label for="soubory">Přílohy (nepovinné – snímek obrazovky, dokument; max. ${MAX_MB} MB)</label><input id="soubory" type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"><div class="err"></div></div>
     <label class="chk"><input type="checkbox" id="spech"> Spěchá</label>
     <button class="btn" type="submit">Odeslat dotaz</button>
    </form></div>`;
  $app.innerHTML = `${await menu('dotazy')}<h1>${S.tbdb ? 'Dotazy od Vixen' : 'Dobrý den, ' + esc(K.vokativ(S.jmeno))}</h1>
   ${hlaska || ''}
   ${S.tbdb ? '<p class="pozn">Stejný seznam vidí Vixen. Odpovídáte v detailu dotazu, stav mění jen TBDB. Nahoře je, co čeká na vás – spěchající první.</p>' : formular}
   <h2>${S.tbdb ? 'Čeká na TBDB' : 'Čeká na vaši odpověď'} <span class="mute">(${tah.length})</span></h2>${tah.map(radek).join('') || '<p class="mute">Nic – vše vyřízeno.</p>'}
   <h2>${S.tbdb ? 'Čeká na Vixen' : 'Otevřené dotazy – řeší TBDB'} <span class="mute">(${ostatni.length})</span></h2>${ostatni.map(radek).join('') || '<p class="mute">Žádné.</p>'}
   ${hotove.length ? `<h2>Vyřešené <span class="mute">(${hotove.length})</span></h2>${hotove.map(radek).join('')}` : ''}`;
  zapniMenu();
  $app.querySelectorAll('.tik').forEach((el) => (el.onclick = () => vDetail(el.dataset.id)));
  const f = document.getElementById('f'); if (f) { f.onsubmit = odeslat; zapniDiktovani(); }
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
    upozorni(data.id, 'novy');
    vUvod(msg(`Dotaz #${data.cislo} jsme přijali ✓ Odpovíme co nejdřív.`));
  } catch (err) {
    b.disabled = false; b.textContent = 'Odeslat dotaz';
    chybaFormu(e.target, 'Odeslání se nepovedlo: ' + chyba(err));
  }
}


// ---------- menu kanceláře ----------
async function menu(aktivni) {
  if (!S.nabor) return '';
  const [{ count }, { count: dotazy }] = await Promise.all([sb.from('osoba').select('id', { count: 'exact', head: true }).eq('stav', 'uchazec'),
    sb.from('tiket').select('id', { count: 'exact', head: true }).in('stav', S.tbdb ? ['novy', 'resime'] : ['ceka_na_vas'])]);
  document.body.classList.add('ma-side'); document.body.classList.toggle('siroka', ['lide', 'nastenka', 'prihlasky', 'akce'].includes(aktivni));
  const pol = [['nastenka', 'Nástěnka'], ['lide', 'Lidé'], ['prihlasky', 'Registrace', count], ['akce', 'Akce'], ['dokumenty', 'Dokumenty', null, 1], ['hodiny', 'Hodiny', null, 1], ['vyplaty', 'Výplaty', null, 1], ['nastaveni', 'Nastavení', null, !(S.vedeni || S.tbdb)], ['dotazy', S.tbdb ? 'Dotazy od Vixen' : 'Dotazy pro TBDB', dotazy]];
  return `<nav class="knav kside">${pol.map(([v, t, n, pripr]) => `<button data-v="${v}"${aktivni === v ? ' class="on"' : ''}${pripr ? ' disabled title="Připravujeme"' : ''}>${t}${n ? ` <span class="pocet">${n}</span>` : ''}${pripr ? '<small>připravujeme</small>' : ''}</button>`).join('')}</nav>`;
}
function zapniMenu() {
  $app.querySelectorAll('.knav button:not([disabled])').forEach((b) => (b.onclick = () => (S.proAkci = null) || ({ nastenka: vNastenka, prihlasky: vPrihlasky, lide: vLide, akce: vAkce, nastaveni: vNastaveni, dotazy: vUvod })[b.dataset.v]()));
  horniPosuvniky();
}

// Široké tabulky: vodorovný posuvník i nad tabulkou (synchronizovaný se spodním), jen když se tabulka nevejde.
function horniPosuvniky() {
  $app.querySelectorAll('.tab-obal').forEach((obal) => {
    if (obal.previousElementSibling?.classList.contains('posuv-horni')) return;
    const horni = document.createElement('div'); horni.className = 'posuv-horni'; horni.innerHTML = '<div></div>';
    obal.before(horni);
    const sirka = () => { horni.firstChild.style.width = obal.scrollWidth + 'px'; horni.classList.toggle('hidden', obal.scrollWidth <= obal.clientWidth + 1); };
    const prenes = (z, na) => () => { if (Math.abs(na.scrollLeft - z.scrollLeft) > 1) na.scrollLeft = z.scrollLeft; };
    horni.addEventListener('scroll', prenes(horni, obal));
    obal.addEventListener('scroll', prenes(obal, horni));
    new ResizeObserver(sirka).observe(obal); if (obal.firstElementChild) new ResizeObserver(sirka).observe(obal.firstElementChild);
    sirka();
  });
}

// ---------- NÁSTĚNKA: „Dnes je potřeba“ ----------
async function vNastenka() {
  $app.innerHTML = `${await menu('nastenka')}<p class="mute">Načítám…</p>`; zapniMenu();
  try { await Promise.all([nactiLidi(), nactiAkce().catch(() => (S.akce = S.akce || []))]); } catch (e) { $app.innerHTML = (await menu('nastenka')) + msg(esc(chyba(e)), 'bad'); zapniMenu(); return; }
  const tym = S.lide.filter((o) => ['prijata', 'aktivni'].includes(o.stav));
  const volnaMista = S.akce.filter((a) => a.stav !== 'zrusena' && a.datum >= dnesIso()).reduce((s, a) => s + Math.max(0, a.pocet_lidi - obsazeni(a).potvrzeno), 0);
  const tyden = S.akce.filter((a) => a.stav !== 'zrusena' && a.datum >= dnesIso() && a.datum <= posunDen(dnesIso(), 7));
  const dlazdice = [
    ['y', S.lide.filter((o) => o.stav === 'uchazec').length, 'nových registrací', () => vPrihlasky()],
    ['r', tym.filter((o) => o.dpp === 'ceka_vixen').length, 'smluv čeká na váš podpis', () => lideFiltr({ dpp: 'vixen' })],
    ['r', tym.filter((o) => o.udaje && !dppOk(o) && o.dpp !== 'ceka_vixen').length, 'bez uzavřené smlouvy (údaje mají)', () => lideFiltr({ udaje: 'ano', dpp: 'ne' })],
    ['y', tym.filter((o) => !o.udaje).length, 'bez údajů pro smlouvu', () => lideFiltr({ udaje: 'ne' })],
    ['y', tym.filter((o) => !o.ma_profil).length, 'bez profilu', () => lideFiltr({ profil: 'ne' })],
    ['y', tym.filter((o) => !o.fotky.length).length, 'bez fotky', () => lideFiltr({ foto: 'ne' })],
    ['g', tym.filter(dppOk).length, 'připraveno s uzavřenou DPP', () => lideFiltr({ dpp: 'ano' })],
  ];
  $app.innerHTML = `${await menu('nastenka')}<h1>Dnes je potřeba</h1><p class="mute">Počítá se z přijatých a aktivních lidí (${tym.length}). Kliknutím na dlaždici otevřete seznam.</p>
   <div class="tiles">${dlazdice.map(([c, n, t], i) => `<button class="tile ${n ? c : 'g'}" data-i="${i}"><div class="n">${n}</div>${t}</button>`).join('')}
    <div class="tile seda"><div class="n">–</div>nepřihlášeno ČSSZ<small>připravujeme</small></div><button class="tile ${volnaMista ? 'r' : 'g'}" id="t-volna"><div class="n">${volnaMista}</div>neobsazená místa na akcích<small>nadcházející akce</small></button></div>
   <h2>Akce v příštích 7 dnech</h2>${tyden.length ? `<div class="ak-tyden">${tyden.map((a) => `<button class="ak-den" data-id="${a.id}"><b>${denAkce(a.datum)} · ${cas(a.sraz_cas)}</b>${esc(a.nazev)}<small>${esc(S.cis.okres[a.okres_kod]?.mesto || '')} · obsazeno ${obsazeni(a).potvrzeno}/${a.pocet_lidi}${a.klient ? ' · ' + esc(a.klient.nazev) : ''}</small></button>`).join('')}</div>` : '<p class="mute">Žádná akce. Novou založíte v menu Akce.</p>'}`;
  zapniMenu();
  $app.querySelectorAll('.tile[data-i]').forEach((t) => (t.onclick = () => dlazdice[t.dataset.i][3]()));
  document.getElementById('t-volna').onclick = () => { AKF = { ...AKF0(), stav: ['nadchazejici'], obsazeni: 'chybi' }; ulozAKF(); vAkce(); };
  $app.querySelectorAll('.ak-den').forEach((b) => (b.onclick = () => vAkceForm(S.akce.find((a) => a.id === b.dataset.id))));
}
function lideFiltr(f) { F = { ...F0(), ...f }; ulozF(); STRANA = 0; vLide(); }

// ---------- přihlášky: schválení / odmítnutí uchazečů ----------
const FILTR = { uchazec: ['Nové', ['uchazec']], prijate: ['Přijaté', ['prijata', 'aktivni']], odmitnute: ['Odmítnuté', ['odmitnuta', 'neaktivni']] };
const STAV_O = { uchazec: ['nová', 't-w'], prijata: ['přijatá', 't-ok'], aktivni: ['aktivní', 't-ok'], neaktivni: ['neaktivní', 't-b'], odmitnuta: ['odmítnutá', 't-b'] };
const ZAJEM = { hosteska: 'hosteska', promoter: 'promotér/ka', jine: 'jiné' };
const KANAL = { email: 'e-mail', sms: 'SMS', whatsapp: 'WhatsApp', messenger: 'Messenger' };
// důvod odmítnutí / vyřazení (povinný u stavu odmítnutá a neaktivní) – osoba_kancelar.duvod_vyrazeni
const DUVOD = { nevyhovuje: 'nevyhovuje požadavkům', nespolehliva: 'nespolehlivost', nema_zajem: 'nemá zájem', nereaguje: 'nereaguje',
  duplicita: 'duplicitní registrace', pauza: 'pauza (studium, mateřská…)', bez_prace: 'dlouho bez práce', jine: 'jiný důvod (viz poznámka)' };
const sDuvodem = (stav) => stav === 'odmitnuta' || stav === 'neaktivni';
const duvodVolba = (vybrany = '') => `<select class="duvod"><option value="">– vyberte důvod –</option>${Object.entries(DUVOD).map(([k, v]) => `<option value="${k}"${k === vybrany ? ' selected' : ''}>${v}</option>`).join('')}</select>`;
const neoslovovatZn = (o) => (o.neoslovovat ? ' <span class="tag t-r" title="Neoslovovat – hromadné akce a připomínky tohoto člověka vynechají">neoslovovat</span>' : '');
// změna stavu (i hromadně) – u odmítnuté/neaktivní s důvodem; neoslovovat: true/false/undefined (= beze změny)
const zmenStavDb = (ids, stav, duvod, neoslovovat) => sb.rpc('zmen_stav', { p_osoby: ids, p_stav: stav, p_duvod: sDuvodem(stav) ? duvod || null : null, p_neoslovovat: neoslovovat ?? null });
// e-mail hostesce (schválení / připomínka) přes funkci hosteska-zprava; vrátí text výsledku
const ZPRAVA_VYS = { odeslano: 'odesláno', vyvoj_neodeslano: 'VÝVOJ – neodesláno', vynechano: 'vynecháno', chyba: 'chyba' };
// náhled e-mailu (nic se neposílá) do prvku box; druhé kliknutí náhled zavře
async function nahledZpravy(o, typ, box) {
  if (box.innerHTML) { box.innerHTML = ''; return; }
  box.innerHTML = '<p class="mute">Připravuji náhled…</p>';
  const { data, error } = await sb.functions.invoke('hosteska-zprava', { body: { osoba_ids: [o.id], typ, osloveni: { [o.id]: K.vokativ(o.jmeno) }, nahled: true } });
  const v = data?.vysledky?.[0];
  if (error || data?.chyba || !v) { box.innerHTML = msg('Náhled se nepodařilo připravit: ' + esc(data?.chyba || chyba(error)), 'bad'); return; }
  box.innerHTML = v.vysledek !== 'nahled' ? msg(`E-mail by neodešel: ${esc(v.zprava)}.`, 'warn')
    : `<div class="doc nahled-mail"><b>Komu:</b> ${esc(v.komu)}\n<b>Předmět:</b> ${esc(v.predmet)}\n\n${esc(v.text)}</div>${v.zprava ? msg(esc(v.zprava), 'warn') : ''}`;
}
async function posliZpravu(osoby, typ) {
  const osloveni = Object.fromEntries(osoby.map((o) => [o.id, K.vokativ(o.jmeno)]));
  const { data, error } = await sb.functions.invoke('hosteska-zprava', { body: { osoba_ids: osoby.map((o) => o.id), typ, osloveni } });
  if (error || data?.chyba) return { ok: false, text: 'E-mail se nepodařilo poslat: ' + esc(data?.chyba || chyba(error)) };
  if (osoby.length === 1) { const v = data.vysledky[0] || { vysledek: 'vynechano', zprava: '' }; return { ok: v.vysledek === 'odeslano', text: `E-mail: ${ZPRAVA_VYS[v.vysledek]}${v.zprava && v.vysledek !== 'odeslano' ? ' – ' + esc(v.zprava) : ''}.` }; }
  return { ok: !data.chyby, text: `E-maily: odesláno ${data.odeslano}${data.vyvoj ? `, VÝVOJ – neodesláno ${data.vyvoj}` : ''}${data.vynechano ? `, vynecháno ${data.vynechano} (neoslovovat, nic nechybí nebo připomínka nedávno odešla)` : ''}${data.chyby ? `, chyby ${data.chyby}` : ''}.` };
}
async function ciselniky() {
  if (S.cis) return S.cis;
  const [{ data: kraj }, { data: okres }, { data: zp }] = await Promise.all([sb.from('kraj').select('kod,nazev'), sb.from('okres').select('kod,mesto,kraj_kod'), sb.from('zdravotni_pojistovna').select('kod,nazev')]);
  S.cis = { kraj: Object.fromEntries((kraj || []).map((k) => [k.kod, k.nazev])), okres: Object.fromEntries((okres || []).map((o) => [o.kod, o])), zp: Object.fromEntries((zp || []).map((z) => [z.kod, z.nazev])) };
  return S.cis;
}
function mistaText(kody) {
  const po = {};
  for (const k2 of kody) { const o = S.cis.okres[k2]; const kr = o ? S.cis.kraj[o.kraj_kod] || o.kraj_kod : '?'; (po[kr] = po[kr] || []).push(o ? o.mesto : k2); }
  return Object.entries(po).map(([kr, m]) => `${m.sort((a, b) => a.localeCompare(b, 'cs')).map(esc).join(', ')} <span class="mute">– ${esc(kr)}</span>`).join('<br>') || '<span class="mute">neuvedeno</span>';
}
// Registrace: záložky s počty, kompaktní seznam (nejdéle čekající nahoře), detail vybrané registrace vedle, hromadné odmítnutí.
// Schvaluje se vždy jednotlivě v detailu (záměrně – každého spolupracovníka posoudit).
const REG = { razeni: 1, hledat: '', vybrano: null, vyber: new Set() };
const dniOd = (d) => Math.floor((Date.now() - new Date(d)) / 86400000);
const cekaZn = (o) => { const n = dniOd(o.vytvoreno); return `<span class="ceka ${n <= 2 ? 'ok' : n <= 7 ? 'wa' : 'no'}" title="Registrace ${kdy(o.vytvoreno)}">${n === 0 ? 'dnes' : n === 1 ? '1 den' : n < 5 ? n + ' dny' : n + ' dní'}</span>`; };
async function vPrihlasky(filtr = 'uchazec', hlaska = '') {
  await ciselniky();
  const { data, error } = await sb.from('osoba').select('*, osoba_okres(okres_kod), osoba_poznamka(text), osoba_foto(cesta,poradi), osoba_kancelar(duvod_vyrazeni,neoslovovat)')
    .in('stav', Object.values(FILTR).flatMap((f) => f[1])).order('vytvoreno', { ascending: true });
  if (error) { $app.innerHTML = msg(esc(chyba(error)), 'bad'); return; }
  for (const o of data || []) {
    o.osoba_poznamka = Array.isArray(o.osoba_poznamka) ? o.osoba_poznamka[0] || null : o.osoba_poznamka;
    const k = (Array.isArray(o.osoba_kancelar) ? o.osoba_kancelar[0] : o.osoba_kancelar) || {}; o.duvod = k.duvod_vyrazeni || ''; o.neoslovovat = !!k.neoslovovat;
    o.fotky = [...(o.osoba_foto || [])].sort((a, b) => a.poradi - b.poradi).map((f) => f.cesta);
    o.hledej = bezDiakritiky([o.jmeno, o.prijmeni, o.email, o.obec, o.telefon].join(' '));
  }
  const vsechny = data || [], vTabu = (f) => vsechny.filter((o) => FILTR[f][1].includes(o.stav));
  REG.vyber.clear();
  $app.innerHTML = `${await menu('prihlasky')}
   <div class="reg-hlava"><h1>Registrace</h1>
    <div class="reg-taby" role="tablist">${Object.entries(FILTR).map(([k, v]) => `<button role="tab" data-f="${k}" class="${k === filtr ? 'on' : ''}">${v[0]} <b>${vTabu(k).length}</b></button>`).join('')}</div>
    <input type="search" id="reg-hledat" placeholder="hledat jméno, telefon, e-mail" value="${esc(REG.hledat)}"></div>${hlaska}
   <div class="reg-obal"><div class="reg-seznam"><div id="reg-hrom" class="hromadne hidden"></div><div class="tab-obal"><table class="lide-tab reg-tab"><thead><tr>
     <th class="vyb-sl"><input type="checkbox" id="reg-vse" title="Vybrat vše"></th><th></th><th>Jméno · města · zájem</th>
     <th class="raz" id="reg-raz">${filtr === 'uchazec' ? 'Čeká' : 'Registrace'}<i></i></th>${filtr === 'uchazec' ? '' : '<th>Stav</th>'}</tr></thead><tbody id="reg-telo"></tbody></table></div>
     <p class="pozn">Po schválení se uchazeč může přihlásit e-mailem z registrace a doplnit profil a údaje pro smlouvu. E-mail o schválení odejde, pokud je zaškrtnutý (ve vývoji jen na adresy TBDB).</p></div>
    <div class="reg-detail" id="reg-detail"></div></div>`;
  zapniMenu();
  $app.querySelectorAll('.reg-taby button').forEach((b) => (b.onclick = () => { REG.vybrano = null; vPrihlasky(b.dataset.f); }));
  document.getElementById('reg-hledat').oninput = (e) => { REG.hledat = e.target.value; seznam(); };
  document.getElementById('reg-raz').onclick = () => { REG.razeni = -REG.razeni; seznam(); };
  document.getElementById('reg-vse').onchange = (e) => { aktualni().forEach((o) => (e.target.checked ? REG.vyber.add(o.id) : REG.vyber.delete(o.id))); seznam(); };
  function aktualni() {
    const h = bezDiakritiky(REG.hledat).trim();
    const l = vTabu(filtr).filter((o) => !h || o.hledej.includes(h) || o.telefon.replace(/\D/g, '').includes(h.replace(/\D/g, '') || '§'));
    const klic = filtr === 'uchazec' ? 'vytvoreno' : 'zmeneno', smer = filtr === 'uchazec' ? REG.razeni : -REG.razeni;
    return l.sort((a, b) => (a[klic] < b[klic] ? -smer : a[klic] > b[klic] ? smer : 0));
  }
  function seznam() {
    const l = aktualni(), telo = document.getElementById('reg-telo');
    document.querySelector('#reg-raz i').textContent = REG.razeni > 0 ? (filtr === 'uchazec' ? ' ▼ nejdéle' : ' ▼ nejnovější') : ' ▲';
    if (!l.some((o) => o.id === REG.vybrano)) REG.vybrano = l[0]?.id || null;
    telo.innerHTML = l.map((o) => { const kr = (o.osoba_okres || []).map((x) => S.cis.okres[x.okres_kod]?.mesto || x.okres_kod).sort((a, b) => a.localeCompare(b, 'cs'));
      return `<tr data-id="${o.id}" class="${o.id === REG.vybrano ? 'on' : ''}${REG.vyber.has(o.id) ? ' vybran' : ''}">
        <td><input type="checkbox" class="vyb"${REG.vyber.has(o.id) ? ' checked' : ''}></td>
        <td>${o.fotky[0] ? `<span class="foto" data-cesta="${esc(o.fotky[0])}"><img alt=""></span>` : `<span class="foto bez">${inicialy(o)}</span>`}</td>
        <td><b>${esc(o.prijmeni)} ${esc(o.jmeno)}</b>${neoslovovatZn(o)}<small>${esc([kr.slice(0, 3).join(', ') + (kr.length > 3 ? ' +' + (kr.length - 3) : ''), (o.zajem || []).map((z) => ZAJEM[z] || z).join(', ')].filter(Boolean).join(' · '))}</small></td>
        <td class="nw">${filtr === 'uchazec' ? cekaZn(o) : `${datum(o.vytvoreno)}<small>změna ${datum(o.zmeneno)}</small>`}</td>
        ${filtr === 'uchazec' ? '' : `<td class="nw"><span class="tag ${STAV_O[o.stav][1]}">${STAV_O[o.stav][0]}</span>${stavKdo(o)}${o.duvod ? `<small>${esc(DUVOD[o.duvod] || o.duvod)}</small>` : ''}</td>`}</tr>`; }).join('')
      || `<tr><td colspan="5" class="prazdno">${REG.hledat ? 'Hledání nic nenašlo.' : filtr === 'uchazec' ? 'Žádné nové registrace.' : 'Nic tu není.'}</td></tr>`;
    podepisFotky(l.map((o) => o.fotky[0]).filter(Boolean)).then(() => telo.querySelectorAll('.foto[data-cesta] img').forEach((i) => (i.src = S.fotoUrl[i.parentElement.dataset.cesta] || '')));
    telo.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = (e) => {
      const id = tr.dataset.id;
      if (e.target.classList.contains('vyb')) { e.target.checked ? REG.vyber.add(id) : REG.vyber.delete(id); tr.classList.toggle('vybran', e.target.checked); return hromadneReg(); }
      REG.vybrano = id; telo.querySelectorAll('tr.on').forEach((x) => x.classList.remove('on')); tr.classList.add('on'); detail();
      if (innerWidth <= 900) document.getElementById('reg-detail').scrollIntoView({ behavior: 'smooth' });
    }));
    document.getElementById('reg-vse').checked = l.length > 0 && l.every((o) => REG.vyber.has(o.id));
    detail(); hromadneReg();
  }
  function detail() {
    const box = document.getElementById('reg-detail'), o = vsechny.find((x) => x.id === REG.vybrano);
    if (!o) { box.innerHTML = '<p class="mute">Vyberte registraci v seznamu.</p>'; return; }
    box.innerHTML = `<div class="card prihl" data-id="${o.id}">
     <div class="prihl-hl"><b>${esc(o.jmeno)} ${esc(o.prijmeni)}</b><span class="tag ${STAV_O[o.stav][1]}">${STAV_O[o.stav][0]}</span>${neoslovovatZn(o)}</div>${stavKdo(o)}
     <small class="mute">Registrace ${kdy(o.vytvoreno)}${o.stav === 'uchazec' ? ' · čeká ' + cekaZn(o) : ''}</small>
     <div class="det-fotky">${o.fotky.length ? o.fotky.map((c) => `<img data-cesta="${esc(c)}" alt="">`).join('') : '<span class="mute">Bez fotky</span>'}</div>
     <dl>
      <dt>Telefon</dt><dd><a href="tel:${esc(o.telefon)}">${esc(o.telefon)}</a></dd>
      <dt>E-mail</dt><dd><a href="mailto:${esc(o.email)}">${esc(o.email)}</a></dd>
      <dt>Bydliště</dt><dd>${esc(o.obec || '')}</dd>
      <dt>Může pracovat</dt><dd>${mistaText((o.osoba_okres || []).map((x) => x.okres_kod))}</dd>
      <dt>Zájem</dt><dd>${(o.zajem || []).map((z) => esc(ZAJEM[z] || z)).join(', ')}</dd>
      <dt>Kontakt přes</dt><dd>${(o.kanal_kontaktu || []).map((z) => esc(KANAL[z] || z)).join(', ')}</dd>
    <dt>WhatsApp</dt><dd>${o.whatsapp_souhlas_at ? 'souhlas s upozorněními ' + datum(o.whatsapp_souhlas_at) + ' <small class="kdo">dala hosteska</small>' : '<span class="mute">bez souhlasu</span>'}</dd>
      ${o.duvod ? `<dt>Důvod</dt><dd>${esc(DUVOD[o.duvod] || o.duvod)}</dd>` : ''}
      <dt>Zásady (informace)</dt><dd>${o.souhlas_gdpr_at ? 'ano, ' + kdy(o.souhlas_gdpr_at) + ' (verze ' + esc(o.souhlas_gdpr_v) + ')' : '<span class="no">chybí</span>'}</dd>
     </dl>
     <form class="rozh" novalidate>
      <div class="fld" data-f="pozn"><label>Interní poznámka (uchazeč ji neuvidí)</label><textarea rows="2" name="pozn" placeholder="Nepovinné – např. odkud o nás ví">${esc(o.osoba_poznamka?.text || '')}</textarea><div class="err"></div></div>
      ${o.stav !== 'prijata' && o.stav !== 'aktivni' ? `<label class="chk"><input type="checkbox" name="mail"${o.neoslovovat ? '' : ' checked'}> <span>Při schválení poslat e-mail (jak se přihlásit a co doplnit)</span></label><p class="pozn"><a href="#" class="ukaz-mail">Zobrazit e-mail předem</a></p><div class="mail-box"></div>` : ''}
      <div class="akce">
       ${o.stav !== 'prijata' && o.stav !== 'aktivni' ? '<button type="button" class="btn" data-a="prijata">Schválit</button>' : ''}
       ${o.stav !== 'odmitnuta' ? `<button type="button" class="btn o" data-a="odmitnuta">${o.stav === 'uchazec' ? 'Odmítnout' : 'Vyřadit'}</button>` : ''}
       ${o.stav !== 'uchazec' ? '<button type="button" class="btn o" data-a="uchazec">Vrátit mezi nové</button>' : ''}
      </div>
      <div class="potvrd hidden"></div>
     </form></div>`;
    podepisFotky(o.fotky).then(() => box.querySelectorAll('.det-fotky img[data-cesta]').forEach((i) => (i.src = S.fotoUrl[i.dataset.cesta] || '')));
    const karta = box.querySelector('.prihl'), form = karta.querySelector('form'), potvrd = karta.querySelector('.potvrd'), jmeno = `${o.jmeno} ${o.prijmeni}`;
    const um = karta.querySelector('.ukaz-mail'); if (um) um.onclick = (e) => { e.preventDefault(); nahledZpravy(o, 'schvaleno', karta.querySelector('.mail-box')); };
    karta.querySelectorAll('button[data-a]').forEach((b) => (b.onclick = () => {
      const novy = b.dataset.a;
      if (novy === 'prijata') return zmenStav(o, novy, form);
      potvrd.classList.remove('hidden');
      potvrd.innerHTML = `${msg(novy === 'odmitnuta' ? `Opravdu ${o.stav === 'uchazec' ? 'odmítnout' : 'vyřadit'} ${esc(jmeno)}? Záznam zůstane v Odmítnutých, jde to vrátit.` : `Vrátit ${esc(jmeno)} mezi nové?`, 'warn')}
        ${novy === 'odmitnuta' ? `<div class="fld" data-f="duvod"><label>Důvod</label>${duvodVolba(o.duvod)}<div class="err"></div></div>
        <label class="chk"><input type="checkbox" class="neosl"${o.neoslovovat ? ' checked' : ''}> <span>Neoslovovat ani v budoucnu</span></label>` : ''}
        <div class="akce"><button type="button" class="btn" data-ok>Ano</button><button type="button" class="btn o" data-ne>Ne</button></div>`;
      potvrd.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      potvrd.querySelector('[data-ne]').onclick = () => potvrd.classList.add('hidden');
      potvrd.querySelector('[data-ok]').onclick = () => {
        const duvod = potvrd.querySelector('.duvod')?.value;
        if (novy === 'odmitnuta' && !duvod) { const f = potvrd.querySelector('[data-f=duvod]'); f.classList.add('chyba'); f.querySelector('.err').textContent = 'Vyberte důvod.'; return; }
        zmenStav(o, novy, form, duvod, potvrd.querySelector('.neosl')?.checked, filtr);
      };
    }));
  }
  function hromadneReg() {
    const el = document.getElementById('reg-hrom'), osoby = vsechny.filter((o) => REG.vyber.has(o.id) && FILTR[filtr][1].includes(o.stav));
    if (!osoby.length) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    el.classList.remove('hidden');
    el.innerHTML = `<b>Vybráno ${osoby.length}</b>
      ${filtr !== 'odmitnute' ? `<button class="btn o mini" data-h="odm">${filtr === 'uchazec' ? 'Odmítnout' : 'Vyřadit'} vybrané</button>` : ''}
      <button class="btn o mini" data-h="zrus">Zrušit výběr</button><span id="reg-hinfo" class="mute"></span>`;
    const info = (t) => (document.getElementById('reg-hinfo').textContent = t);
    el.querySelector('[data-h=zrus]').onclick = () => { REG.vyber.clear(); seznam(); };
    const odm = el.querySelector('[data-h=odm]');
    if (odm) odm.onclick = () => {
      el.querySelector('.potvrd-h')?.remove();
      el.insertAdjacentHTML('beforeend', `<div class="potvrd-h">${msg(`Opravdu ${filtr === 'uchazec' ? 'odmítnout' : 'vyřadit'} ${osoby.length} registrací?`, 'warn')}Důvod: ${duvodVolba()} <button class="btn mini" data-ok>Ano</button> <button class="btn o mini" data-ne>Ne</button></div>`);
      el.querySelector('[data-ne]').onclick = () => el.querySelector('.potvrd-h').remove();
      el.querySelector('[data-ok]').onclick = async () => { const duvod = el.querySelector('.potvrd-h .duvod').value; if (!duvod) return info('Vyberte důvod.');
        const { error } = await zmenStavDb(osoby.map((o) => o.id), 'odmitnuta', duvod); if (error) return info(chyba(error));
        vPrihlasky(filtr, msg(`Odmítnuto ${osoby.length} (najdete v Odmítnutých).`)); };
    };
  }
  seznam();
}
async function zmenStav(o, novy, form, duvod, neoslovovat) {
  form.querySelectorAll('button').forEach((b) => (b.disabled = true));
  const pozn = form.querySelector('textarea[name=pozn]').value.trim(), mail = novy === 'prijata' && form.querySelector('input[name=mail]')?.checked;
  const { error } = await zmenStavDb([o.id], novy, duvod, neoslovovat);
  if (error) { form.querySelectorAll('button').forEach((b) => (b.disabled = false)); return chybaFormu(form, chyba(error)); }
  if (pozn !== (o.osoba_poznamka?.text || '')) {
    const r = pozn ? await sb.from('osoba_poznamka').upsert({ osoba_id: o.id, text: pozn, zmeneno: new Date().toISOString() }) : await sb.from('osoba_poznamka').delete().eq('osoba_id', o.id);
    if (r.error) return chybaFormu(form, 'Stav je uložený, poznámka ne: ' + chyba(r.error));
  }
  const jm = esc(`${o.jmeno} ${o.prijmeni}`);
  let text = { prijata: `Registrace – ${jm}: schváleno ✓ Přihlásí se e-mailem ${esc(o.email)}.`, odmitnuta: `Registrace – ${jm}: odmítnuto (najdete v Odmítnutých).`, uchazec: `Registrace – ${jm}: vrácena mezi nové.` }[novy];
  let typ = 'ok';
  if (mail) { const r = await posliZpravu([o], 'schvaleno'); text += ' ' + r.text; if (!r.ok) typ = 'warn'; }
  // zůstat na záložce, odkud akce přišla (v Nových se pak vybere další nejdéle čekající)
  vPrihlasky(o.stav === 'uchazec' ? 'uchazec' : o.stav === 'prijata' || o.stav === 'aktivni' ? 'prijate' : 'odmitnute', msg(text, typ));
}

// ---------- LIDÉ: přehled všech hostesek s filtry, hromadnými akcemi a detailem ----------
const KONFEKCE = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const F0 = () => ({ text: '', tel: '', foto: '', stav: ['prijata', 'aktivni'], kraje: [], okresy: [], zajem: [], botaOd: '', botaDo: '', posledni: '', kanal: [], vyskaOd: '', vyskaDo: '', konfekce: [], jazyk: '', ridicak: false, auto: false, profil: '', udaje: '', dpp: '', vekOd: '', vekDo: '', regOd: '' });
let F = F0(), RAZENI = { k: 'reg', smer: -1 }, STRANA = 0;
const NA_STRANU = 50;
try { const ul = JSON.parse(localStorage.getItem('vixen_lide_filtr') || 'null'); if (ul) { F = { ...F0(), ...ul }; if (ul.okres && !F.okresy.length) F.okresy = [ul.okres]; delete F.okres; } } catch {}
const ulozF = () => { try { localStorage.setItem('vixen_lide_filtr', JSON.stringify(F)); } catch {} };
const bezDiakritiky = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const datum = (d) => (d ? new Date(d).toLocaleDateString('cs-CZ') : '');
// stav DPP z kancelar_lide: ceka_vixen | ceka_hosteska | neodeslano | lhuta | uzavreno | odstoupeno
const dppOk = (o) => o.dpp === 'lhuta' || o.dpp === 'uzavreno';
const DPP_TXT = { ceka_vixen: 'čeká na podpis Vixen', ceka_hosteska: 'čeká na podpis hostesky', neodeslano: 'podepsáno, PDF neodešlo', lhuta: 'uzavřeno – běží 7 dní na odstoupení', uzavreno: 'uzavřeno', odstoupeno: 'odstoupení od smlouvy' };
const krajeOsoby = (o) => [...new Set(o.okresy.map((k) => S.cis.okres[k]?.kraj_kod).filter(Boolean))];
S.fotoUrl = S.fotoUrl || {};

async function nactiLidi() {
  await ciselniky();
  const [a, b] = await Promise.all([
    sb.from('osoba').select('*, osoba_okres(okres_kod), osoba_profil(*), osoba_poznamka(text), osoba_foto(cesta,poradi), osoba_kancelar(duvod_vyrazeni,neoslovovat)').order('vytvoreno', { ascending: false }),
    sb.rpc('kancelar_lide'),
  ]);
  if (a.error) throw a.error;
  const stav = Object.fromEntries((b.data || []).map((x) => [x.osoba_id, x]));
  const jeden = (x) => (Array.isArray(x) ? x[0] || null : x);
  S.lide = (a.data || []).map((o) => {
    const p = jeden(o.osoba_profil), s = stav[o.id] || {}, fotky = [...(o.osoba_foto || [])].sort((x, y) => x.poradi - y.poradi), k = jeden(o.osoba_kancelar) || {};
    return { ...o, profil: p, duvod: k.duvod_vyrazeni || '', neoslovovat: !!k.neoslovovat, pozn: jeden(o.osoba_poznamka)?.text || '', okresy: (o.osoba_okres || []).map((x) => x.okres_kod), fotky: fotky.map((f) => f.cesta),
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

// akce u člověka: poslední akce, na kterou byl potvrzený (už proběhla); nabídka na vybíranou akci; jiná potvrzená akce týž den
const posledniAkce = (o) => (S.nabidky || []).filter((n) => n.osoba_id === o.id && n.rozhodnuti === 'potvrzeno')
  .map((n) => (S.akce || []).find((a) => a.id === n.akce_id)).filter((a) => a && a.stav !== 'zrusena' && a.datum < dnesIso()).map((a) => a.datum).sort().pop() || null;
const nabidnutoNaAkci = (o) => !!S.proAkci && (S.nabidky || []).some((n) => n.akce_id === S.proAkci.id && n.osoba_id === o.id);
const jinaAkceTenDen = (o) => !!S.proAkci && (S.nabidky || []).some((n) => n.osoba_id === o.id && n.rozhodnuti === 'potvrzeno' && n.akce_id !== S.proAkci.id
  && (S.akce || []).some((a) => a.id === n.akce_id && a.stav !== 'zrusena' && a.datum === S.proAkci.datum));
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
    if (F.okresy.length && !F.okresy.some((m) => o.okresy.includes(m))) return false;
    if (F.zajem.length && !F.zajem.some((z) => (o.zajem || []).includes(z))) return false;
    if (F.kanal.length && !F.kanal.some((z) => (o.kanal_kontaktu || []).includes(z))) return false;
    const p = o.profil || {};
    if (num(F.vyskaOd) && !(p.vyska_cm >= num(F.vyskaOd))) return false;
    if (num(F.vyskaDo) && !(p.vyska_cm <= num(F.vyskaDo))) return false;
    if (F.konfekce.length && !F.konfekce.includes(p.konfekce)) return false;
    if (num(F.botaOd) && !(p.bota_eu >= num(F.botaOd))) return false;
    if (num(F.botaDo) && !(p.bota_eu <= num(F.botaDo))) return false;
    if (F.jazyk && !(p.jazyky || []).some((j) => bezDiakritiky(j).includes(bezDiakritiky(F.jazyk)))) return false;
    if (F.ridicak && !p.ridicak) return false;
    if (F.auto && !p.vlastni_auto) return false;
    if (!tri(o.ma_profil, F.profil) || !tri(o.udaje, F.udaje) || (F.dpp === 'vixen' ? o.dpp !== 'ceka_vixen' : !tri(dppOk(o), F.dpp))) return false;
    if (num(F.vekOd) && !(o.vek >= num(F.vekOd))) return false;
    if (num(F.vekDo) && !(o.vek <= num(F.vekDo))) return false;
    if (F.regOd && new Date(o.vytvoreno) < new Date(F.regOd)) return false;
    if (F.posledni) { const d = posledniAkce(o); if (F.posledni === 'nikdy' ? d : !d || (F.posledni === 'do30' ? dniOd(d) > 30 : dniOd(d) <= 30)) return false; }
    if (S.proAkci && S.proAkciSkryt?.nabidnuto && nabidnutoNaAkci(o)) return false;
    if (S.proAkci && S.proAkciSkryt?.kolize && jinaAkceTenDen(o)) return false;
    return true;
  });
}
const RAD = {
  profil: (o) => (o.ma_profil ? 1 : 0), udaje: (o) => (o.udaje ? 1 : 0), dpp: (o) => (dppOk(o) ? 2 : o.dpp ? 1 : 0),
  jmeno: (o) => bezDiakritiky(o.prijmeni + ' ' + o.jmeno), stav: (o) => o.stav, vyska: (o) => o.profil?.vyska_cm ?? 0, foto: (o) => o.fotky.length,
  vek: (o) => o.vek ?? 0, posl: (o) => posledniAkce(o) || '', reg: (o) => o.vytvoreno, podklady: (o) => (o.ma_profil ? 1 : 0) + (o.udaje ? 1 : 0) + (dppOk(o) ? 1 : 0),
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
    kraje: () => (F.kraje.length ? `kraje${pocet(F.kraje.length)}` : 'celé kraje'),
    zajem: () => (F.zajem.length ? F.zajem.map((k) => ZAJEM[k]).join(', ') : 'vše'),
    kanal: () => (F.kanal.length ? F.kanal.map((k) => KANAL[k]).join(', ') : 'kontakt přes'),
    konfekce: () => [F.konfekce.length && F.konfekce.join(', '), (F.botaOd || F.botaDo) && `bota ${F.botaOd || '…'}–${F.botaDo || '…'}`].filter(Boolean).join(' · ') || 'velikost, bota',
    jazykx: () => [F.ridicak && 'řidičák', F.auto && 'auto'].filter(Boolean).join(', ') || 'řidičák / auto',
    podklady: () => [F.profil && 'P ' + F.profil, F.udaje && 'Ú ' + F.udaje, F.dpp && 'D ' + F.dpp].filter(Boolean).join(', ') || 'vše',
  };
  document.querySelectorAll('details.vf').forEach((d) => { const f = nast[d.dataset.vf]; d.querySelector('summary').textContent = f ? f() : ''; d.classList.toggle('aktivni', f && !/^(vše|celé kraje|kontakt přes|velikost, bota)$/.test(f())); });
}

async function vLide(hlaska = '') {
  $app.innerHTML = `${await menu('lide')}<p class="mute">Načítám lidi…</p>`; zapniMenu();
  try { await Promise.all([nactiLidi(), nactiAkce().catch(() => { S.akce = S.akce || []; S.nabidky = S.nabidky || []; })]); } catch (e) { $app.innerHTML = (await menu('lide')) + msg(esc(chyba(e)), 'bad'); zapniMenu(); return; }
  const krajeVolby = Object.entries(S.cis.kraj).sort((a, b) => a[1].localeCompare(b[1], 'cs'));
  const okresy = Object.values(S.cis.okres).sort((a, b) => a.mesto.localeCompare(b.mesto, 'cs'));
  const th = (k, t) => (k ? `<th data-k="${k}" class="raz">${t}<i></i></th>` : `<th>${t}</th>`);
  $app.innerHTML = `${await menu('lide')}
   <div class="lide-hlava"><h1>Lidé</h1><span id="pocet" class="mute"></span><span id="shrnuti" class="shrnuti"></span><button class="btn o mini" id="vymazat">Vymazat filtry</button>
    <span class="pozn">Filtry jsou v řádku pod názvy sloupců. Najetím na fotku se zvětší, kliknutím na řádek otevřete detail.</span></div>${vyberProAkciHtml()}${hlaska}
   <div id="hromadne" class="hromadne hidden"></div>
   <div class="tab-obal"><table class="lide-tab"><thead>
    <tr><th class="vyb-sl"><input type="checkbox" id="vse" title="Vybrat vše podle filtru"></th>${th('foto', 'Foto')}${th('jmeno', 'Jméno')}${th('stav', 'Stav')}${th('', 'Telefon')}${th('', 'Města')}${th('', 'Zájem')}${th('vyska', 'Výška')}${th('', 'Jazyky')}${th('vek', 'Věk')}${th('posl', 'Poslední akce')}${th('profil', 'Profil')}${th('udaje', 'Údaje')}${th('dpp', 'DPP')}${th('', 'ČSSZ')}${th('reg', 'Registrace')}</tr>
    <tr class="filtry-radek">
     <td></td>
     <td><select data-f="foto"><option value="">vše</option><option value="ano"${F.foto === 'ano' ? ' selected' : ''}>s fotkou</option><option value="ne"${F.foto === 'ne' ? ' selected' : ''}>bez</option></select></td>
     <td><input data-f="text" type="search" placeholder="jméno, e-mail, obec" value="${esc(F.text)}"></td>
     <td>${vf('stav', 'Stav', Object.entries(STAV_O).map(([k, v]) => [k, v[0]]))}</td>
     <td><input data-f="tel" type="search" inputmode="numeric" placeholder="část čísla" value="${esc(F.tel)}">${vf('kanal', 'Kontakt přes', Object.entries(KANAL))}</td>
     <td class="f-mesta"><div id="mesta-f"></div><input data-mesto list="mesta-dl" placeholder="+ město" autocomplete="off"><datalist id="mesta-dl">${okresy.map((o) => `<option value="${esc(o.mesto)}">`).join('')}</datalist>${vf('kraje', 'Celé kraje', krajeVolby)}</td>
     <td>${vf('zajem', 'Zájem', Object.entries(ZAJEM))}</td>
     <td><div class="od-do"><input data-f="vyskaOd" type="number" placeholder="od" value="${esc(F.vyskaOd)}"><input data-f="vyskaDo" type="number" placeholder="do" value="${esc(F.vyskaDo)}"></div>${vf('konfekce', 'Konfekce', KONFEKCE.map((k) => [k, k]), `<b>Bota (EU)</b><div class="od-do"><input data-f="botaOd" type="number" placeholder="od" value="${esc(F.botaOd)}"><input data-f="botaDo" type="number" placeholder="do" value="${esc(F.botaDo)}"></div>`)}</td>
     <td><input data-f="jazyk" type="search" placeholder="jazyk" value="${esc(F.jazyk)}"><div class="f-doprava"><label><input type="checkbox" data-f="ridicak"${F.ridicak ? ' checked' : ''}> řidičák</label><label><input type="checkbox" data-f="auto"${F.auto ? ' checked' : ''}> auto</label></div></td>
     <td><div class="od-do"><input data-f="vekOd" type="number" placeholder="od" value="${esc(F.vekOd)}"><input data-f="vekDo" type="number" placeholder="do" value="${esc(F.vekDo)}"></div></td>
     <td><select data-f="posledni" class="mini-sel"><option value="">vše</option>${[['nikdy', 'ještě nebyl/a'], ['do30', 'do 30 dní'], ['nad30', 'před víc než 30 dny']].map(([h, t]) => `<option value="${h}"${F.posledni === h ? ' selected' : ''}>${t}</option>`).join('')}</select></td>
     ${['profil', 'udaje', 'dpp'].map((k) => `<td><select data-f="${k}" class="mini-sel"><option value="">vše</option><option value="ano"${F[k] === 'ano' ? ' selected' : ''}>●&nbsp;má</option><option value="ne"${F[k] === 'ne' ? ' selected' : ''}>○&nbsp;chybí</option>${k === 'dpp' ? `<option value="vixen"${F.dpp === 'vixen' ? ' selected' : ''}>✍&nbsp;čeká na Vixen</option>` : ''}</select></td>`).join('')}<td></td>
     <td><input data-f="regOd" type="date" title="Registrace od" value="${esc(F.regOd)}"></td>
    </tr></thead><tbody id="telo"></tbody></table></div>
   <div id="strany"></div>
   <p class="pozn"><span class="tecka ok">●</span> hotovo · <span class="tecka wa">●</span> čeká (např. smlouva na podpis) · <span class="tecka no">●</span> chybí · <span class="tecka">●</span> připravujeme (ČSSZ, hodiny za rok).</p>
   <div id="foto-velka" class="foto-velka hidden"><img alt=""></div>
   <div id="detail" class="detail hidden"></div>`;
  zapniMenu();
  document.getElementById('vymazat').onclick = () => { F = F0(); ulozF(); vLide(); };
  // města: hledání v nabídce (bez diakritiky), vybraná jako štítky s ✕ – člověk vyhovuje, když může pracovat aspoň v jednom
  const mestaF = () => { const box = document.getElementById('mesta-f');
    box.innerHTML = F.okresy.map((m) => `<span class="chip-m">${esc(S.cis.okres[m]?.mesto || m)}<button type="button" data-x="${m}" title="Odebrat">✕</button></span>`).join('');
    box.querySelectorAll('button[data-x]').forEach((b) => (b.onclick = () => { F.okresy = F.okresy.filter((m) => m !== b.dataset.x); ulozF(); STRANA = 0; mestaF(); vykresliTabulku(); })); };
  mestaF();
  const vstupM = $app.querySelector('input[data-mesto]');
  vstupM.oninput = vstupM.onchange = () => { const h = bezDiakritiky(vstupM.value.trim()); if (!h) return;
    const o = okresy.find((x) => bezDiakritiky(x.mesto) === h); if (!o) return;
    if (!F.okresy.includes(o.kod)) F.okresy = [...F.okresy, o.kod]; vstupM.value = ''; ulozF(); STRANA = 0; mestaF(); vykresliTabulku(); };
  $app.querySelectorAll('[data-skryt]').forEach((c) => (c.onchange = () => { S.proAkciSkryt[c.dataset.skryt] = c.checked; STRANA = 0; vykresliTabulku(); }));
  const zpetAk = document.getElementById('ak-vyber-zpet');
  if (zpetAk) zpetAk.onclick = () => { const a = S.proAkci; S.proAkci = null; S.vyber.clear(); vAkceForm(S.akce.find((x) => x.id === a.id)); };
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
  const shrn = [F.text && `„${F.text}“`, F.stav.length && F.stav.map((k) => STAV_O[k][0]).join('+'), F.kraje.length && F.kraje.map((k) => S.cis.kraj[k]).join(', '), F.okresy.length && F.okresy.map((m) => S.cis.okres[m]?.mesto || m).join(', '),
    F.zajem.length && F.zajem.map((k) => ZAJEM[k]).join('+'), (F.vyskaOd || F.vyskaDo) && `výška ${F.vyskaOd || '…'}–${F.vyskaDo || '…'}`, F.jazyk, F.ridicak && 'řidičák', F.auto && 'auto', (F.botaOd || F.botaDo) && `bota ${F.botaOd || '…'}–${F.botaDo || '…'}`, F.posledni && { nikdy: 'na akci ještě nebyl/a', do30: 'na akci do 30 dní', nad30: 'na akci před víc než 30 dny' }[F.posledni], F.foto && (F.foto === 'ano' ? 's fotkou' : 'bez fotky'),
    F.profil && `profil ${F.profil === 'ano' ? 'má' : 'chybí'}`, F.udaje && `údaje ${F.udaje === 'ano' ? 'má' : 'chybí'}`, F.dpp && `DPP ${F.dpp === 'ano' ? 'má' : F.dpp === 'vixen' ? 'čeká na podpis Vixen' : 'chybí'}`].filter(Boolean);
  document.getElementById('shrnuti').textContent = shrn.length ? 'filtr: ' + shrn.join(' · ') : 'bez filtru';
  $app.querySelectorAll('thead th.raz').forEach((t) => { t.classList.toggle('on', RAZENI.k === t.dataset.k); t.querySelector('i').textContent = RAZENI.k === t.dataset.k ? (RAZENI.smer > 0 ? ' ▲' : ' ▼') : ''; });
  const tecka = (c, t) => `<span class="tecka ${c}" title="${t}: ${c === 'ok' ? 'hotovo' : c === 'wa' ? 'čeká' : c === 'no' ? 'chybí' : '–'}">●</span>`;
  const zn = (ok, t, title) => `<span class="zn ${ok ? 'ok' : ''}" title="${title}: ${ok ? 'ano' : 'ne'}">${t}</span>`;
  const radek = (o) => {
    const p = o.profil || {}, kr = krajeOsoby(o).map((k) => S.cis.kraj[k] || k), posl = posledniAkce(o);
    const mesta = [...o.okresy].sort((x, y) => (F.okresy.includes(y) ? 1 : 0) - (F.okresy.includes(x) ? 1 : 0)).map((k) => S.cis.okres[k]?.mesto || k);
    return `<tr data-id="${o.id}"${S.vyber.has(o.id) ? ' class="vybran"' : ''}>
     <td><input type="checkbox" class="vyb" ${S.vyber.has(o.id) ? 'checked' : ''}></td>
     <td>${nahled(o)}</td>
     <td><b>${esc(o.prijmeni)} ${esc(o.jmeno)}</b>${neoslovovatZn(o)}${S.proAkci && S.nabidky.some((n) => n.akce_id === S.proAkci.id && n.osoba_id === o.id) ? ' <span class="tag t-g">nabídnuto</span>' : ''}${jinaAkceTenDen(o) ? ' <span class="tag t-r">jiná akce tento den</span>' : ''}<small>${esc(o.obec || '')}</small></td>
     <td><span class="tag ${STAV_O[o.stav][1]}"${o.duvod ? ` title="Důvod: ${esc(DUVOD[o.duvod] || o.duvod)}"` : ''}>${STAV_O[o.stav][0]}</span>${stavKdo(o, true)}${o.duvod ? `<small>${esc(DUVOD[o.duvod] || o.duvod)}</small>` : ''}</td>
     <td><a href="tel:${esc(o.telefon)}" class="tel">${esc(o.telefon)}</a><small>${esc((o.kanal_kontaktu || []).map((z) => KANAL[z] || z).join(', '))}</small></td>
     <td title="${esc(o.okresy.map((k) => S.cis.okres[k]?.mesto || k).join(', '))}">${esc(mesta.slice(0, 3).join(', '))}${mesta.length > 3 ? ` +${mesta.length - 3}` : ''}<small>${esc(kr.slice(0, 2).join(', '))}${kr.length > 2 ? ` +${kr.length - 2}` : ''}</small></td>
     <td>${esc((o.zajem || []).map((z) => ZAJEM[z] || z).join(', '))}</td>
     <td class="nw">${p.vyska_cm ? p.vyska_cm + ' cm' : '–'}<small>${esc(p.konfekce || '')}${p.bota_eu ? ' · ' + p.bota_eu : ''}</small></td>
     <td>${esc((p.jazyky || []).join(', ')) || '–'}<small>${p.ridicak ? 'řidičák' : ''}${p.vlastni_auto ? ' · auto' : ''}</small></td>
     <td>${o.vek ?? '–'}</td>
     <td class="nw">${posl ? datum(posl) + `<small>před ${dniOd(posl)} dny</small>` : '<span class="mute">–</span>'}</td>
     <td class="semf">${tecka(o.ma_profil ? 'ok' : 'no', 'Profil')}</td><td class="semf">${tecka(o.udaje ? 'ok' : 'no', 'Údaje pro smlouvu')}</td>
     <td class="semf">${tecka(o.dpp === 'uzavreno' ? 'ok' : o.dpp && o.dpp !== 'odstoupeno' ? 'wa' : 'no', o.dpp ? 'DPP – ' + DPP_TXT[o.dpp] : 'DPP')}</td><td class="semf">${tecka('', 'ČSSZ – připravujeme')}</td>
     <td>${datum(o.vytvoreno)}</td></tr>`;
  };
  const telo = document.getElementById('telo');
  telo.innerHTML = list.length ? list.map(radek).join('') : `<tr><td colspan="16" class="prazdno">Filtru nikdo neodpovídá.</td></tr>`;
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
  const oslovit = osoby.filter((o) => !o.neoslovovat), bez = osoby.length - oslovit.length, bezText = bez ? ` (vynecháno ${bez} – neoslovovat)` : '';
  el.classList.remove('hidden');
  el.innerHTML = `<b>Vybráno ${ids.length}</b>
    ${S.proAkci ? '<button class="btn mini" data-h="nabidka">Poslat nabídku na akci</button>' : ''}
    <button class="btn o mini" data-h="email">Kopírovat e-maily</button><button class="btn o mini" data-h="tel">Kopírovat telefony</button>
    <button class="btn o mini" data-h="zprava">Poslat zprávu…</button>
    <button class="btn o mini" data-h="vyzva">Požádat o údaje a smlouvu</button>
    <button class="btn o mini" data-h="csv">Export do Excelu (CSV)</button>
    <select id="hstav"><option value="">Změnit stav…</option>${Object.entries(STAV_O).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select>
    <button class="btn o mini" data-h="zrus">Zrušit výběr</button><span id="hinfo" class="mute"></span>`;
  const info = (t) => (document.getElementById('hinfo').textContent = t);
  const kopiruj = async (t, co) => { try { await navigator.clipboard.writeText(t); info(`Zkopírováno: ${co}`); } catch { info('Kopírování prohlížeč nepovolil.'); } };
  el.querySelector('[data-h=email]').onclick = () => kopiruj(oslovit.map((o) => o.email).join(', '), `${oslovit.length} e-mailů${bezText}`);
  el.querySelector('[data-h=tel]').onclick = () => kopiruj(oslovit.map((o) => o.telefon).join('\n'), `${oslovit.length} telefonů${bezText}`);
  el.querySelector('[data-h=zprava]').onclick = () => { el.querySelector('.potvrd-h')?.remove(); zpravaPanel(el, osoby); };
  el.querySelector('[data-h=csv]').onclick = () => { exportCsv(osoby); info('Soubor stažen.'); };
  if (S.proAkci) el.querySelector('[data-h=nabidka]').onclick = () => poslatNabidku(el, osoby, info);
  el.querySelector('[data-h=vyzva]').onclick = () => {
    el.querySelector('.potvrd-h')?.remove();
    const tym = osoby.filter((o) => ['prijata', 'aktivni'].includes(o.stav) && !o.smlouva_vyzva_at);
    el.insertAdjacentHTML('beforeend', `<div class="potvrd-h">${msg(`Požádat ${tym.length} lidí o údaje a smlouvu před první akcí? V aplikaci se jim odemknou Údaje a Smlouva. (Kdo už výzvu má nebo není přijatý, toho aplikace vynechá.)`, 'warn')}<button class="btn mini" data-ok>Ano, požádat</button> <button class="btn o mini" data-ne>Ne</button></div>`);
    el.querySelector('[data-ne]').onclick = () => el.querySelector('.potvrd-h').remove();
    el.querySelector('[data-ok]').onclick = async () => {
      const { data, error } = await sb.rpc('kancelar_smlouva_vyzva', { p_osoby: tym.map((o) => o.id) });
      if (error) return info(chyba(error));
      S.vyber.clear(); vLide(msg(`Výzva ke smlouvě odeslána do aplikace ${data} lidem.`));
    };
  };
  el.querySelector('[data-h=zrus]').onclick = () => { S.vyber.clear(); vykresliTabulku(); };
  el.querySelector('#hstav').onchange = (e) => {
    const novy = e.target.value; if (!novy) return;
    el.querySelector('.potvrd-h')?.remove();
    el.insertAdjacentHTML('beforeend', `<div class="potvrd-h">${msg(`Opravdu změnit stav ${ids.length} lidí na „${STAV_O[novy][0]}“?`, 'warn')}${sDuvodem(novy) ? `Důvod: ${duvodVolba()} ` : ''}<button class="btn mini" data-ok>Ano, změnit</button> <button class="btn o mini" data-ne>Ne</button></div>`);
    el.querySelector('[data-ne]').onclick = () => vykresliTabulku();
    el.querySelector('[data-ok]').onclick = async () => {
      const duvod = el.querySelector('.potvrd-h .duvod')?.value;
      if (sDuvodem(novy) && !duvod) return info('Vyberte důvod.');
      const { error } = await zmenStavDb(ids, novy, duvod);
      if (error) return info(chyba(error));
      S.vyber.clear(); vLide(msg(`Stav změněn u ${ids.length} lidí.`));
    };
  };
}

function exportCsv(osoby) {
  const h = ['Příjmení', 'Jméno', 'Telefon', 'E-mail', 'Bydliště', 'Stav', 'Města (kde může pracovat)', 'Kraje', 'Zájem', 'Kontakt přes', 'Výška', 'Konfekce', 'Bota', 'Jazyky', 'Řidičák', 'Auto', 'Dostupnost', 'Věk', 'Profil', 'Údaje', 'DPP podepsaná', 'Registrace'];
  const r = osoby.map((o) => { const p = o.profil || {}; return [o.prijmeni, o.jmeno, o.telefon, o.email, o.obec, STAV_O[o.stav][0], o.okresy.map((k) => S.cis.okres[k]?.mesto || k).join(', '),
    krajeOsoby(o).map((k) => S.cis.kraj[k]).join(', '), (o.zajem || []).map((z) => ZAJEM[z] || z).join(', '), (o.kanal_kontaktu || []).map((z) => KANAL[z] || z).join(', '),
    p.vyska_cm || '', p.konfekce || '', p.bota_eu || '', (p.jazyky || []).join(', '), p.ridicak ? 'ano' : '', p.vlastni_auto ? 'ano' : '', p.dostupnost || '', o.vek ?? '',
    o.ma_profil ? 'ano' : 'ne', o.udaje ? 'ano' : 'ne', dppOk(o) ? datum(o.dpp_at) : (DPP_TXT[o.dpp] || 'ne'), datum(o.vytvoreno)]; });
  const csv = '﻿' + [h, ...r].map((x) => x.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `vixen_lide_${new Date().toISOString().slice(0, 10)}.csv`; document.body.append(a); a.click(); a.remove();
}

// ---------- smlouva až před první akcí: výzva kanceláře a forma spolupráce (Vixen 26. 10. 2026) ----------
const FORMA = { dpp: 'DPP + prohlášení poplatníka', ico: 'IČO – fakturuje', prilezitostna: 'příležitostná činnost' };
function vyzvaHtml(o) {
  const tym = ['prijata', 'aktivni'].includes(o.stav);
  return `<dl><dt>Výzva ke smlouvě</dt><dd>${o.smlouva_vyzva_at ? 'požádáno ' + kdoZn(o.smlouva_vyzva_kdo, o.smlouva_vyzva_at, o) : '<span class="mute">zatím ne – smlouva až před první akcí</span>'}</dd>
    <dt>Forma spolupráce</dt><dd>${o.forma_spoluprace ? esc(FORMA[o.forma_spoluprace]) + (o.ico ? ' · IČO ' + esc(o.ico) : '') + ' <small class="kdo">vybrala hosteska</small>' : '<span class="mute">nevybraná – vybírá hosteska</span>'}</dd></dl>
    ${tym ? `<button class="btn o mini" id="vyzva-btn">${o.smlouva_vyzva_at ? 'Zrušit výzvu ke smlouvě' : 'Požádat o údaje a smlouvu (před první akcí)'}</button><div id="vyzva-msg"></div>` : ''}`;
}

// ---------- ZPRÁVA HOSTESCE: kancelář vždy vybere kanály (aplikace, e-mail, WhatsApp), každý má vlastní text ----------
// Aplikace = zpráva od kanceláře na Přehledu hostesky; e-mail přes funkci hosteska-zprava; WhatsApp odesílá kancelář ručně.
// Zástupné značky v textu: {oslovení}, {odkaz}, {email}, u připomínky {co chybí}, u nabídky {akce}.
const KANALY = { aplikace: 'Aplikace', email: 'E-mail', whatsapp: 'WhatsApp' };
const CO_CHYBI = {
  prihlaseni: 'přihlásit se do aplikace (e-mailem {email}, heslo nepotřebujete)',
  profil: 'doplnit profil (výška, konfekce, jazyky, kdy můžete pracovat)',
  udaje: 'doplnit údaje pro smlouvu (adresa, rodné číslo, pojišťovna, číslo účtu)',
  podpis: 'podepsat smlouvu kódem z e-mailu – Vixen ji už podepsal',
};
// co člověku chybí (stejné pořadí jako připomínka na serveru)
const chybiKrok = (o) => !o.auth_user_id ? 'prihlaseni' : !o.ma_profil ? 'profil' : o.smlouva_vyzva_at && !o.udaje ? 'udaje' : o.dpp === 'ceka_hosteska' ? 'podpis' : '';
const ZP_DRUH = {
  pripominka: { t: 'Připomínka – co chybí', typ: (o) => 'pripominka_' + chybiKrok(o), vynech: (o) => (!chybiKrok(o) ? 'nic nechybí' : ''),
    aplikace: ['Připomínka od kanceláře', 'Dobrý den, {oslovení},\nprosíme vás ještě {co chybí}.\nDěkujeme, kancelář Vixen'],
    email: ['Vixen – připomínka', 'Dobrý den, {oslovení},\n\nprosíme vás ještě {co chybí}.\n\nAplikace Vixen: {odkaz}\n\nDěkujeme,\nkancelář Vixen hostesky'],
    whatsapp: [null, 'Dobrý den, {oslovení}, připomínáme: prosíme vás ještě {co chybí}. Aplikace Vixen: {odkaz}\nDěkujeme, Vixen'] },
  nabidka: { t: 'Nabídka akce', typ: () => 'nabidka', vynech: () => '',
    aplikace: ['Čeká na vás nabídka: {akce}', 'Dobrý den, {oslovení},\nmáme pro vás akci {akce}. Podívejte se do Nabídek a odpovězte „Mám zájem“ nebo „Nemůžu“.\nDěkujeme, kancelář Vixen'],
    email: ['Vixen – nabídka akce: {akce}', 'Dobrý den, {oslovení},\n\nmáme pro vás akci {akce}.\nPodrobnosti a přihlášení najdete v aplikaci: {odkaz}\n\nDěkujeme,\nkancelář Vixen hostesky'],
    whatsapp: [null, 'Dobrý den, {oslovení}, máme pro vás novou akci: {akce}. Podrobnosti a přihlášení najdete v aplikaci: {odkaz}\nOdpovídejte prosím v aplikaci. Děkujeme, Vixen'] },
  vlastni: { t: 'Vlastní zpráva', typ: () => 'vlastni', vynech: () => '',
    aplikace: ['Zpráva od kanceláře', 'Dobrý den, {oslovení},\n\nDěkujeme, kancelář Vixen'],
    email: ['Vixen – zpráva od kanceláře', 'Dobrý den, {oslovení},\n\n\n\nDěkujeme,\nkancelář Vixen hostesky'],
    whatsapp: [null, 'Dobrý den, {oslovení}, \nDěkujeme, Vixen'] },
};
// zpravaPanel(el, osoby, { druhy: ['pripominka','vlastni'], akce, nabidky: {osoba_id: nabídka}, hotovo })
function zpravaPanel(el, osoby, opt = {}) {
  el.querySelector('.zp-panel')?.remove();
  const druhy = opt.druhy || ['pripominka', 'vlastni'], akce = opt.akce;
  const st = { druh: druhy[0], kanaly: new Set(['aplikace']), texty: {} };
  const base = new URL('./', location.href).href;
  const odkaz = (o) => (akce && opt.nabidky?.[o.id] ? base + '#n=' + opt.nabidky[o.id].token : base);
  const akceText = akce ? `${akce.nazev} (${denAkce(akce.datum)}, ${S.cis.okres[akce.okres_kod]?.mesto || ''})` : '';
  const vypln = (t, o) => t.split('{oslovení}').join(K.vokativ(o.jmeno)).split('{odkaz}').join(odkaz(o)).split('{akce}').join(akceText)
    .split('{co chybí}').join((CO_CHYBI[chybiKrok(o)] || '')).split('{email}').join(o.email);
  const prijemci = (k) => osoby.filter((o) => !o.neoslovovat && ['prijata', 'aktivni'].includes(o.stav) && !ZP_DRUH[st.druh].vynech(o) && (k !== 'whatsapp' || (o.whatsapp_souhlas_at && !(st.druh === 'nabidka' && opt.nabidky?.[o.id]?.otevreno))));
  el.insertAdjacentHTML('beforeend', `<div class="potvrd-h zp-panel"><div class="zp-hl"><b>Poslat zprávu – vybráno ${osoby.length}</b><button type="button" class="btn o mini" data-zp-zavrit>Zavřít</button></div>
    ${druhy.length > 1 ? `<div class="zp-druh">${druhy.map((d) => `<label><input type="radio" name="zp-druh" value="${d}"${d === st.druh ? ' checked' : ''}> ${ZP_DRUH[d].t}</label>`).join('')}</div>` : ''}
    <div class="zp-kanaly"><span>Kanály:</span>${Object.entries(KANALY).map(([k, t]) => `<label><input type="checkbox" data-kanal="${k}"${st.kanaly.has(k) ? ' checked' : ''}> ${t} <small data-pocet="${k}"></small></label>`).join('')}</div>
    <div class="zp-texty"></div><div class="zp-vynech pozn"></div>
    <div class="akce"><button type="button" class="btn mini" data-zp-odeslat>Odeslat vybranými kanály</button></div><div class="zp-vysledek"></div><div class="zp-wa"></div></div>`);
  const p = el.querySelector('.zp-panel');
  const vzor = (k, i) => st.texty[st.druh + k + i] ?? ZP_DRUH[st.druh][k][i];
  const nahled = (k, o) => `<small>Náhled pro ${esc(o.jmeno)} ${esc(o.prijmeni)}:</small>${ZP_DRUH[st.druh][k][0] !== null ? `<b>${esc(vypln(vzor(k, 0), o))}</b>
` : ''}${esc(vypln(vzor(k, 1), o))}`;
  const kresli = () => {
    Object.keys(KANALY).forEach((k) => (p.querySelector(`[data-pocet=${k}]`).textContent = `(${prijemci(k).length})`));
    const prvni = prijemci([...st.kanaly][0] || 'aplikace')[0];
    p.querySelector('.zp-texty').innerHTML = [...st.kanaly].map((k) => `<fieldset class="zp-kanal"><legend>${KANALY[k]}</legend>
      ${ZP_DRUH[st.druh][k][0] !== null ? `<label>${k === 'email' ? 'Předmět' : 'Nadpis'}<input data-t="${k}" data-i="0" value="${esc(vzor(k, 0))}"></label>` : ''}
      <label>Text<textarea data-t="${k}" data-i="1" rows="${k === 'whatsapp' ? 3 : 5}">${esc(vzor(k, 1))}</textarea></label>
      ${prvni ? `<div class="zp-nahled">${nahled(k, prvni)}</div>` : ''}</fieldset>`).join('')
      || '<p class="mute">Vyberte aspoň jeden kanál.</p>';
    p.querySelectorAll('[data-t]').forEach((x) => (x.oninput = () => { st.texty[st.druh + x.dataset.t + x.dataset.i] = x.value;
      const n = x.closest('fieldset').querySelector('.zp-nahled'); if (n && prvni) n.innerHTML = nahled(x.dataset.t, prvni); }));
    const vyn = osoby.length - prijemci('aplikace').length;
    p.querySelector('.zp-vynech').textContent = (vyn ? `Vynechá se ${vyn} (neoslovovat, nepřijatí${st.druh === 'pripominka' ? ', komu nic nechybí' : ''}). ` : '')
      + (st.kanaly.has('whatsapp') ? 'WhatsApp jen lidem se souhlasem – zprávy odešlete ručně ze seznamu níže. ' : '') + (st.kanaly.has('email') ? 'E-mail ve vývoji neodchází (jen zkušební adresy TBDB).' : '');
  };
  p.querySelector('[data-zp-zavrit]').onclick = () => p.remove();
  p.querySelectorAll('input[name=zp-druh]').forEach((r) => (r.onchange = () => { st.druh = r.value; kresli(); }));
  p.querySelectorAll('[data-kanal]').forEach((c) => (c.onchange = () => { c.checked ? st.kanaly.add(c.dataset.kanal) : st.kanaly.delete(c.dataset.kanal); kresli(); }));
  p.querySelector('[data-zp-odeslat]').onclick = async (e) => {
    const vys = p.querySelector('.zp-vysledek');
    if (!st.kanaly.size) return (vys.innerHTML = msg('Vyberte aspoň jeden kanál.', 'warn'));
    e.target.disabled = true; vys.innerHTML = msg('Posílám…', 'warn');
    const D = ZP_DRUH[st.druh], radky = [];
    if (st.kanaly.has('aplikace')) {
      const l = prijemci('aplikace');
      const { data, error } = l.length ? await sb.rpc('kancelar_zprava_aplikace', { p_zpravy: l.map((o) => ({ osoba_id: o.id, typ: D.typ(o), predmet: vypln(vzor('aplikace', 0), o), text: vypln(vzor('aplikace', 1), o), akce_id: akce?.id || null })) }) : { data: { odeslano: 0 } };
      radky.push(error ? `Aplikace: ${esc(chyba(error))}` : `Aplikace: zpráva doručena ${data.odeslano} lidem ✓`);
    }
    if (st.kanaly.has('email')) {
      const l = prijemci('email');
      const { data, error } = l.length ? await sb.functions.invoke('hosteska-zprava', { body: { osoba_ids: l.map((o) => o.id), typ: 'vlastni',
        zpravy: Object.fromEntries(l.map((o) => [o.id, { predmet: vypln(vzor('email', 0), o), text: vypln(vzor('email', 1), o), typ: D.typ(o), akce_id: akce?.id || null }])) } }) : { data: { odeslano: 0 } };
      radky.push(error || data?.chyba ? `E-mail: ${esc(data?.chyba || chyba(error))}` : `E-mail: odesláno ${data.odeslano || 0}${data.vyvoj ? `, VÝVOJ – neodesláno ${data.vyvoj}` : ''}${data.vynechano ? `, vynecháno ${data.vynechano}` : ''}${data.chyby ? `, chyby ${data.chyby}` : ''}`);
    }
    if (st.kanaly.has('whatsapp')) {
      const l = prijemci('whatsapp');
      radky.push(`WhatsApp: připraveno ${l.length} zpráv – odešlete je níže`);
      p.querySelector('.zp-wa').innerHTML = l.length ? `<table class="wa-tab">${l.map((o) => { const t = vypln(vzor('whatsapp', 1), o);
        return `<tr data-id="${o.id}"><td><b>${esc(o.prijmeni)} ${esc(o.jmeno)}</b><br><span class="mute">${esc(o.telefon)}</span></td><td class="wa-txt">${esc(t)}</td>
        <td class="wa-tl"><a class="btn mini" target="_blank" rel="noopener" href="https://wa.me/${o.telefon.replace(/\D/g, '')}?text=${encodeURIComponent(t)}">Otevřít ve WhatsAppu</a><button class="btn o mini" data-kop>Kopírovat text</button><span class="wa-stav mute"></span></td></tr>`; }).join('')}</table>` : '';
      p.querySelectorAll('.zp-wa tr').forEach((tr) => {
        const o = l.find((x) => x.id === tr.dataset.id), t = vypln(vzor('whatsapp', 1), o), stav = tr.querySelector('.wa-stav');
        const zapis = async () => { const { error } = await sb.rpc('kancelar_whatsapp_zapis2', { p_osoba: o.id, p_typ: D.typ(o), p_text: t, p_akce: akce?.id || null });
          stav.textContent = error ? 'nepodařilo se zapsat: ' + chyba(error) : 'odesláno ' + new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }) + ' ✓'; if (!error) tr.classList.add('wa-hotovo'); };
        tr.querySelector('a').addEventListener('click', zapis);
        tr.querySelector('[data-kop]').onclick = async () => { try { await navigator.clipboard.writeText(t); zapis(); } catch { stav.textContent = 'Kopírování prohlížeč nepovolil.'; } };
      });
    }
    vys.innerHTML = msg(radky.join('<br>'), radky.some((r) => /chyb|nepoda/.test(r)) ? 'warn' : 'ok'); e.target.disabled = false;
    opt.hotovo?.();
  };
  kresli();
}


// ---------- AKCE (modul 2, etapa A): seznam, založení, úprava, kopie, zrušení ----------
// Akce = jeden den, jeden sraz; vícedenní akce se zakládá kopií. Klient s fakturačními údaji se vybírá znovu.
const DEN_T = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];
const isoDen = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const dnesIso = () => isoDen(new Date());
const posunDen = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDen(d); };
const denAkce = (iso) => { const d = new Date(iso + 'T12:00:00'); return `${DEN_T[d.getDay()]} ${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`; };
const cas = (t) => (t ? String(t).slice(0, 5) : '');
const KONTAKT_ROLE = [['primarni', 'Primární kontakt'], ['na_akci', 'Kontakt na akci'], ['dalsi', 'Další kontakt'], ['dalsi', 'Další kontakt']];
const mapa = (adresa) => adresa ? `<span class="ak-mapa">Otevřít v mapě: <a href="https://mapy.com/fnc/v1/search?query=${encodeURIComponent(adresa)}" target="_blank" rel="noopener">Mapy.cz</a> · <a href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(adresa)}" target="_blank" rel="noopener">Google Maps</a></span>` : '';
// filtry akcí: řádek pod názvy sloupců jako v Lidé; výchozí = všechny akce
const AKF0 = () => ({ text: '', stav: [], od: '', do: '', klient: '', okresy: [], obsazeni: '', uzaverka: '' });
let AKF = AKF0(), AKRAD = { k: 'datum', smer: 1 };
try { const ul = JSON.parse(localStorage.getItem('vixen_akce_filtr') || 'null'); if (ul) AKF = { ...AKF0(), ...ul }; } catch {}
const ulozAKF = () => { try { localStorage.setItem('vixen_akce_filtr', JSON.stringify(AKF)); } catch {} };
const AK_STAV = { dnes: ['dnes', 't-w'], nadchazejici: ['nadcházející', 't-ok'], probehla: ['proběhla', 't-b'], zrusena: ['zrušená', 't-r'] };
const stavAkce = (a) => (a.stav === 'zrusena' ? 'zrusena' : a.datum === dnesIso() ? 'dnes' : a.datum > dnesIso() ? 'nadchazejici' : 'probehla');
const AK_OBS = { nenabidnuto: 'nenabídnuto', chybi: 'chybí lidi', plno: 'obsazeno', zajem: 'čeká se zájmem' };
const obsStav = (a) => { const o = obsazeni(a); return { nenabidnuto: !o.celkem, chybi: o.celkem > 0 && o.potvrzeno < a.pocet_lidi, plno: o.potvrzeno >= a.pocet_lidi, zajem: o.zajem > 0 }; };
function filtrujAkce() {
  const h = bezDiakritiky(AKF.text.trim()), ted = new Date();
  return S.akce.filter((a) => {
    if (h && !a.hledej.includes(h)) return false;
    if (AKF.stav.length && !AKF.stav.includes(stavAkce(a)) && !(AKF.stav.includes('nadchazejici') && stavAkce(a) === 'dnes')) return false;
    if (AKF.od && a.datum < AKF.od) return false;
    if (AKF.do && a.datum > AKF.do) return false;
    if (AKF.klient && (AKF.klient === '-' ? a.klient_id : a.klient_id !== AKF.klient)) return false;
    if (AKF.okresy.length && !AKF.okresy.includes(a.okres_kod)) return false;
    if (AKF.obsazeni && !obsStav(a)[AKF.obsazeni]) return false;
    if (AKF.uzaverka === 'bezi' && !(a.uzaverka && new Date(a.uzaverka) > ted)) return false;
    if (AKF.uzaverka === 'minula' && !(a.uzaverka && new Date(a.uzaverka) <= ted)) return false;
    if (AKF.uzaverka === 'bez' && a.uzaverka) return false;
    return true;
  });
}
const AK_RAD = { datum: (a) => a.datum + cas(a.sraz_cas), nazev: (a) => bezDiakritiky(a.nazev), klient: (a) => bezDiakritiky(a.klient?.nazev || '~'),
  mesto: (a) => bezDiakritiky(S.cis.okres[a.okres_kod]?.mesto || ''), obs: (a) => obsazeni(a).potvrzeno / a.pocet_lidi, uzav: (a) => a.uzaverka || '~', stav: (a) => ['dnes', 'nadchazejici', 'probehla', 'zrusena'].indexOf(stavAkce(a)) };

async function nactiAkce() {
  await ciselniky();
  const [a, k] = await Promise.all([sb.from('akce').select('*, klient(*)').order('datum').order('sraz_cas'), sb.from('klient').select('*').order('nazev')]);
  if (a.error) throw a.error; if (k.error) throw k.error;
  const n = await sb.from('akce_nabidka').select('*');
  S.nabidky = n.error ? [] : n.data || [];
  S.akce = (a.data || []).map((x) => { const klient = Array.isArray(x.klient) ? x.klient[0] || null : x.klient;
    return { ...x, klient, hledej: bezDiakritiky([x.nazev, x.adresa, klient?.nazev, S.cis.okres[x.okres_kod]?.mesto].join(' ')) }; });
  S.klienti = k.data || [];
}

async function vAkce(hlaska = '') {
  $app.innerHTML = `${await menu('akce')}<p class="mute">Načítám…</p>`; zapniMenu();
  try { await nactiAkce(); } catch (e) { $app.innerHTML = (await menu('akce')) + msg(esc(chyba(e)), 'bad'); zapniMenu(); return; }
  const okresy = Object.values(S.cis.okres).sort((a, b) => a.mesto.localeCompare(b.mesto, 'cs'));
  const th = (kl, t) => (kl ? `<th data-k="${kl}" class="raz">${t}<i></i></th>` : `<th>${t}</th>`);
  const sel = (f, volby, prazdna = 'vše') => `<select data-af="${f}"><option value="">${prazdna}</option>${volby.map(([h, t]) => `<option value="${esc(h)}"${AKF[f] === h ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  $app.innerHTML = `${await menu('akce')}<div class="lide-hlava"><h1>Akce</h1><span id="ak-pocet" class="mute"></span><span id="ak-shrnuti" class="shrnuti"></span>
    <button class="btn o mini" id="ak-vymazat">Vymazat filtry</button><button class="btn mini" id="ak-nova">+ Nová akce</button>
    <span class="pozn">Filtry jsou v řádku pod názvy sloupců, řadit jde kliknutím na název sloupce.</span></div>${hlaska}
   <div class="tab-obal"><table class="lide-tab ak-tab"><thead>
    <tr>${th('datum', 'Datum')}<th>Sraz</th>${th('nazev', 'Akce')}${th('stav', 'Stav')}${th('klient', 'Klient')}${th('mesto', 'Město')}${th('obs', 'Obsazeno')}${th('uzav', 'Uzávěrka')}</tr>
    <tr class="filtry-radek">
     <td><div class="od-do"><input data-af="od" type="date" title="Od" value="${esc(AKF.od)}"><input data-af="do" type="date" title="Do" value="${esc(AKF.do)}"></div>
      <div class="ak-rychle"><button type="button" data-r="tyden">7 dní</button><button type="button" data-r="mesic">měsíc</button><button type="button" data-r="">vše</button></div></td>
     <td></td>
     <td><input data-af="text" type="search" placeholder="název, adresa, klient" value="${esc(AKF.text)}"></td>
     <td><details class="vf" data-vf="akstav"><summary></summary><div class="vf-panel"><b>Stav</b>${[['nadchazejici', 'nadcházející (i dnešní)'], ['probehla', 'proběhlé'], ['zrusena', 'zrušené']]
       .map(([h, t]) => `<label><input type="checkbox" data-af="stav" value="${h}"${AKF.stav.includes(h) ? ' checked' : ''}> ${t}</label>`).join('')}</div></details></td>
     <td>${sel('klient', [['-', '– bez klienta –'], ...S.klienti.map((x) => [x.id, x.nazev])])}</td>
     <td class="f-mesta"><div id="ak-mesta-f"></div><input data-akmesto list="ak-mesta-dl" placeholder="+ město" autocomplete="off"><datalist id="ak-mesta-dl">${okresy.map((o) => `<option value="${esc(o.mesto)}">`).join('')}</datalist></td>
     <td>${sel('obsazeni', Object.entries(AK_OBS))}</td>
     <td>${sel('uzaverka', [['bezi', 'běží'], ['minula', 'minula'], ['bez', 'bez uzávěrky']])}</td>
    </tr></thead><tbody id="ak-telo"></tbody></table></div>`;
  zapniMenu();
  const popisky = () => { const d = $app.querySelector('details[data-vf=akstav]'); d.querySelector('summary').textContent = AKF.stav.length ? AKF.stav.map((s) => ({ nadchazejici: 'nadcházející', probehla: 'proběhlé', zrusena: 'zrušené' })[s]).join(', ') : 'vše'; d.classList.toggle('aktivni', AKF.stav.length > 0); };
  const vykresli = () => {
    const vse = S.akce.length, l = [...filtrujAkce()].sort((x, y) => { const a = AK_RAD[AKRAD.k](x), b = AK_RAD[AKRAD.k](y); return (a > b ? 1 : a < b ? -1 : 0) * AKRAD.smer; });
    document.getElementById('ak-pocet').textContent = `${l.length} z ${vse}`;
    const shrn = [AKF.text && `„${AKF.text}“`, AKF.stav.length && $app.querySelector('details[data-vf=akstav] summary').textContent, (AKF.od || AKF.do) && `${AKF.od ? datum(AKF.od) : '…'} – ${AKF.do ? datum(AKF.do) : '…'}`,
      AKF.klient && (AKF.klient === '-' ? 'bez klienta' : S.klienti.find((x) => x.id === AKF.klient)?.nazev), AKF.okresy.length && AKF.okresy.map((m) => S.cis.okres[m]?.mesto || m).join(', '),
      AKF.obsazeni && AK_OBS[AKF.obsazeni], AKF.uzaverka && 'uzávěrka ' + { bezi: 'běží', minula: 'minula', bez: '–' }[AKF.uzaverka]].filter(Boolean);
    document.getElementById('ak-shrnuti').textContent = shrn.length ? 'filtr: ' + shrn.join(' · ') : 'všechny akce';
    $app.querySelectorAll('thead th.raz').forEach((t) => { t.classList.toggle('on', AKRAD.k === t.dataset.k); t.querySelector('i').textContent = AKRAD.k === t.dataset.k ? (AKRAD.smer > 0 ? ' ▲' : ' ▼') : ''; });
    document.getElementById('ak-telo').innerHTML = l.length ? l.map((a) => { const s = stavAkce(a);
      return `<tr data-id="${a.id}" class="${s === 'dnes' ? 'ak-dnes' : ''}${s === 'probehla' || s === 'zrusena' ? ' ak-stara' : ''}">
      <td class="nw"><b>${denAkce(a.datum)}</b></td><td class="nw">${cas(a.sraz_cas)}${a.prace_od ? `<small>práce ${cas(a.prace_od)}–${cas(a.prace_do)}</small>` : ''}</td>
      <td><b>${esc(a.nazev)}</b><small>${esc(a.adresa)}</small></td><td><span class="tag ${AK_STAV[s][1]}">${AK_STAV[s][0]}</span></td>
      <td>${esc(a.klient?.nazev || '–')}</td><td>${esc(S.cis.okres[a.okres_kod]?.mesto || a.okres_kod)}</td><td class="nw">${obsazeniZn(a)}</td>
      <td class="nw">${a.uzaverka ? kdy(a.uzaverka) : '–'}</td></tr>`; }).join('')
      : `<tr><td colspan="8" class="prazdno">${vse ? 'Filtru žádná akce neodpovídá.' : 'Zatím žádná akce. Založte ji tlačítkem „+ Nová akce“.'}</td></tr>`;
    document.querySelectorAll('#ak-telo tr[data-id]').forEach((r) => (r.onclick = () => vAkceForm(S.akce.find((a) => a.id === r.dataset.id))));
  };
  const zmena = () => { ulozAKF(); popisky(); vykresli(); };
  const mesta = () => { const box = document.getElementById('ak-mesta-f');
    box.innerHTML = AKF.okresy.map((m) => `<span class="chip-m">${esc(S.cis.okres[m]?.mesto || m)}<button type="button" data-x="${m}" title="Odebrat">✕</button></span>`).join('');
    box.querySelectorAll('button[data-x]').forEach((b) => (b.onclick = () => { AKF.okresy = AKF.okresy.filter((m) => m !== b.dataset.x); mesta(); zmena(); })); };
  const vstup = $app.querySelector('input[data-akmesto]');
  vstup.oninput = vstup.onchange = () => { const h = bezDiakritiky(vstup.value.trim()); const o = h && okresy.find((x) => bezDiakritiky(x.mesto) === h); if (!o) return;
    if (!AKF.okresy.includes(o.kod)) AKF.okresy = [...AKF.okresy, o.kod]; vstup.value = ''; mesta(); zmena(); };
  $app.querySelectorAll('thead [data-af]').forEach((el) => (el.oninput = el.onchange = () => {
    const f = el.dataset.af, pred = JSON.stringify(AKF[f]);
    AKF[f] = f === 'stav' ? [...$app.querySelectorAll('thead input[data-af=stav]:checked')].map((x) => x.value) : el.value;
    if (JSON.stringify(AKF[f]) !== pred) zmena();
  }));
  $app.querySelectorAll('.ak-rychle button').forEach((b) => (b.onclick = () => {
    AKF.od = b.dataset.r ? dnesIso() : ''; AKF.do = b.dataset.r ? posunDen(dnesIso(), b.dataset.r === 'tyden' ? 7 : 31) : '';
    $app.querySelector('[data-af=od]').value = AKF.od; $app.querySelector('[data-af=do]').value = AKF.do; zmena(); }));
  $app.querySelectorAll('thead th.raz').forEach((t) => (t.onclick = () => { AKRAD = { k: t.dataset.k, smer: AKRAD.k === t.dataset.k ? -AKRAD.smer : 1 }; vykresli(); }));
  document.addEventListener('click', (e) => { if (!e.target.closest('details.vf')) $app.querySelectorAll('details.vf[open]').forEach((d) => d.removeAttribute('open')); });
  document.getElementById('ak-vymazat').onclick = () => { AKF = AKF0(); ulozAKF(); vAkce(); };
  document.getElementById('ak-nova').onclick = () => vAkceForm(null);
  mesta(); popisky(); vykresli(); horniPosuvniky();
}

// podepsaný odkaz na fotku oblečení (soukromé úložiště 'akce')
async function fotkaAkce(cesta) {
  if (!cesta) return '';
  if (S.fotoUrl[cesta]) return S.fotoUrl[cesta];
  if (window.VIXEN_DEMO) return '';
  const { data } = await sb.storage.from('akce').createSignedUrl(cesta, 3600);
  return (S.fotoUrl[cesta] = data?.signedUrl || '');
}

async function vAkceForm(a, hlaska = '') {
  await ciselniky();
  if (!S.klienti) await nactiAkce();
  const nova = !a; a = a || { obleceni: 'klient', kontakt_vixen: { jmeno: S.jmeno }, kontakty_klient: [], pozadavky: {} };
  const kl = a.klient || {}, kv = a.kontakt_vixen || {}, poz = a.pozadavky || {}, zrusena = a.stav === 'zrusena', probehla = !nova && a.datum < dnesIso();
  // kontakty za klienta do 4 řádků podle role (primární, na akci, 2× další)
  const kk = [...a.kontakty_klient], radky = KONTAKT_ROLE.map(([role]) => { const i = kk.findIndex((x) => x.role === role); return i >= 0 ? kk.splice(i, 1)[0] : {}; });
  const pole = (id, label, val, typ = 'text', extra = '') => `<div class="fld" data-f="${id}"><label for="a-${id}">${label}</label><input id="a-${id}" type="${typ}" value="${esc(val ?? '')}"${extra}><div class="err"></div></div>`;
  const okresy = Object.entries(S.cis.kraj).sort((x, y) => x[1].localeCompare(y[1], 'cs')).map(([kod, kn]) => `<optgroup label="${esc(kn)}">${Object.values(S.cis.okres).filter((o) => o.kraj_kod === kod).sort((x, y) => x.mesto.localeCompare(y.mesto, 'cs'))
    .map((o) => `<option value="${o.kod}"${o.kod === a.okres_kod ? ' selected' : ''}>${esc(o.mesto)}</option>`).join('')}</optgroup>`).join('');
  const uzav = a.uzaverka ? isoDen(new Date(a.uzaverka)) + 'T' + new Date(a.uzaverka).toTimeString().slice(0, 5) : '';
  $app.innerHTML = `${await menu('akce')}<div class="ak-hlava"><button class="btn o mini" id="ak-zpet">← Akce</button>
    <h1>${nova ? 'Nová akce' : esc(a.nazev)}</h1>${zrusena ? '<span class="tag t-r">zrušená</span>' : probehla ? '<span class="tag t-b">proběhla</span>' : ''}</div>
   ${nova ? '' : `<p class="pozn ak-kdo">Založil(a): ${esc(kdoTxt(a.vytvoril, a.vytvoreno))}${a.zmenil && a.zmeneno !== a.vytvoreno ? ` · naposledy upravil(a): ${esc(kdoTxt(a.zmenil, a.zmeneno))}` : ''}</p>`}
   ${zrusena ? msg('Akce je zrušená: ' + esc(a.zruseni_duvod || '') + (a.zrusil ? ` (zrušil(a): ${esc(kdoTxt(a.zrusil))})` : ''), 'bad') : ''}${hlaska}
   ${nova || zrusena ? '' : '<div id="ak-obs"></div>'}
   <form id="ak-f" class="ak-form" novalidate>
    <section class="card"><h2>Akce</h2>
     ${pole('nazev', 'Název akce', a.nazev, 'text', ' placeholder="např. Ochutnávka kávy v obchodním centru"')}
     <div class="ak-2">${pole('datum', 'Datum', a.datum, 'date')}
      <div class="fld" data-f="okres"><label for="a-okres">Město (podle něj se vybírají lidé)</label><select id="a-okres"><option value="">– vyberte –</option>${okresy}</select><div class="err"></div></div></div>
     ${pole('adresa', 'Adresa', a.adresa, 'text', ' placeholder="ulice a číslo, obec – lidé podle ní najdou cestu"')}<div id="a-mapa">${mapa(a.adresa)}</div>
     <div class="ak-3">${pole('sraz_cas', 'Sraz v', cas(a.sraz_cas), 'time')}${pole('prace_od', 'Práce od', cas(a.prace_od), 'time')}${pole('prace_do', 'Práce do', cas(a.prace_do), 'time')}</div>
     ${pole('sraz_misto', 'Místo srazu (nepovinné)', a.sraz_misto, 'text', ' placeholder="např. u hlavního vchodu"')}</section>

    <section class="card"><h2>Klient a fakturace</h2>
     <div class="fld" data-f="klient"><label for="a-klient">Klient</label><select id="a-klient"><option value="">+ nový klient</option>${S.klienti.map((k) => `<option value="${k.id}"${k.id === kl.id ? ' selected' : ''}>${esc(k.nazev)}${k.ico ? ' · IČO ' + esc(k.ico) : ''}</option>`).join('')}</select><div class="err"></div></div>
     <div class="ak-2">${pole('k_nazev', 'Název klienta', kl.nazev)}${pole('k_ico', 'IČO', kl.ico, 'text', ' inputmode="numeric" maxlength="10"')}</div>
     <div class="ak-2">${pole('k_dic', 'DIČ (nepovinné)', kl.dic, 'text', ' placeholder="CZ12345678"')}${pole('k_email', 'E-mail pro faktury', kl.fakturacni_email, 'email')}</div>
     ${pole('k_adresa', 'Fakturační adresa', kl.fakturacni_adresa)}
     <p class="pozn">Fakturační údaje patří klientovi – změna se projeví u všech jeho akcí.</p></section>

    <section class="card"><h2>Kontakty</h2>
     <h3>Za Vixen</h3><div class="ak-2">${pole('v_jmeno', 'Jméno', kv.jmeno)}${pole('v_telefon', 'Telefon', kv.telefon, 'tel')}</div>
     <h3>Za klienta</h3>
     ${KONTAKT_ROLE.map(([role, t], i) => `<div class="ak-kontakt" data-role="${role}"><b>${t}${i > 1 ? ' <span class="mute">(nepovinné)</span>' : ''}</b>
      <div class="ak-3">${pole('kk' + i + '_jmeno', 'Jméno', radky[i].jmeno)}${pole('kk' + i + '_telefon', 'Telefon', radky[i].telefon, 'tel')}${pole('kk' + i + '_email', 'E-mail', radky[i].email, 'email')}</div></div>`).join('')}</section>

    <section class="card"><h2>Oblečení</h2>
     <div class="chips" data-f="obleceni"><label><input type="radio" name="obleceni" value="klient"${a.obleceni !== 'vlastni' ? ' checked' : ''}> od klienta</label><label><input type="radio" name="obleceni" value="vlastni"${a.obleceni === 'vlastni' ? ' checked' : ''}> vlastní</label></div>
     <div class="fld" data-f="obleceni_popis"><label for="a-obleceni_popis">Popis</label><textarea id="a-obleceni_popis" rows="2" placeholder="např. černé kalhoty, bílá košile, pohodlné černé boty">${esc(a.obleceni_popis || '')}</textarea><div class="err"></div></div>
     <div class="fld" data-f="foto"><label for="a-foto">Fotka, jak má oblečení vypadat (nepovinné)</label><div class="ak-foto" id="a-foto-nahled"></div>
      <input type="file" id="a-foto" accept="image/jpeg,image/png,image/webp">${a.obleceni_foto ? ' <label class="chk mini"><input type="checkbox" id="a-foto-smaz"> <span>odebrat fotku</span></label>' : ''}<div class="err"></div></div></section>

    <section class="card"><h2>Lidé a nabídka</h2>
     <div class="ak-2">${pole('pocet', 'Kolik lidí je potřeba', a.pocet_lidi, 'number', ' min="1" max="500"')}${pole('odmena', 'Odměna (hosteska ji uvidí v nabídce)', a.odmena, 'text', ' placeholder="např. 180 Kč/h"')}</div>
     ${pole('uzaverka', 'Uzávěrka přihlášek (nepovinné)', uzav, 'datetime-local')}
     <h3>Požadavky na lidi <span class="mute">– předvyplní filtr při výběru lidí</span></h3>
     <div class="ak-3">${pole('vyska_od', 'Výška od (cm)', poz.vyska_od, 'number', ' min="120" max="220"')}
      <div class="fld" data-f="jazyk"><label for="a-jazyk">Jazyk</label><select id="a-jazyk"><option value="">–</option>${['angličtina', 'němčina', 'francouzština', 'polština', 'španělština'].map((j) => `<option${j === poz.jazyk ? ' selected' : ''}>${j}</option>`).join('')}</select><div class="err"></div></div>
      <div class="fld"><label>&nbsp;</label><label class="chk"><input type="checkbox" id="a-ridicak"${poz.ridicak ? ' checked' : ''}> <span>řidičák</span></label> <label class="chk"><input type="checkbox" id="a-auto"${poz.auto ? ' checked' : ''}> <span>vlastní auto</span></label></div></div></section>

    <section class="card"><h2>Poznámka</h2><div class="fld" data-f="poznamka"><textarea id="a-poznamka" rows="3" placeholder="cokoli dalšího k akci">${esc(a.poznamka || '')}</textarea><div class="err"></div></div></section>
    <div class="akce ak-tlacitka"><button class="btn" type="submit">${nova ? 'Založit akci' : 'Uložit změny'}</button></div>
   </form>
   ${nova ? '' : `<section class="card ak-dalsi"><h2>Další kroky</h2><div class="akce">
     <button class="btn o mini" id="ak-kop1">Kopírovat na další den</button><button class="btn o mini" id="ak-kopx">Kopírovat na jiné datum…</button>
     ${zrusena ? '<button class="btn o mini" id="ak-obnov">Obnovit akci</button>' : '<button class="btn o mini" id="ak-zrus">Zrušit akci…</button>'}</div><div id="ak-krok"></div></section>`}`;
  zapniMenu();
  if (!nova && !zrusena) obsazeniSekce(a, probehla);
  const f = document.getElementById('ak-f'), h = (id) => (document.getElementById('a-' + id)?.value || '').trim();
  document.getElementById('ak-zpet').onclick = () => vAkce();
  document.getElementById('a-adresa').oninput = (e) => (document.getElementById('a-mapa').innerHTML = mapa(e.target.value.trim()));
  // výběr klienta: fakturační údaje a (když jsou kontakty prázdné) kontakty z jeho poslední akce
  document.getElementById('a-klient').onchange = (e) => {
    const k = S.klienti.find((x) => x.id === e.target.value) || {};
    [['k_nazev', 'nazev'], ['k_ico', 'ico'], ['k_dic', 'dic'], ['k_email', 'fakturacni_email'], ['k_adresa', 'fakturacni_adresa']].forEach(([p, s]) => (document.getElementById('a-' + p).value = k[s] || ''));
    const posledni = S.akce.filter((x) => k.id && x.klient_id === k.id).sort((x, y) => (x.datum < y.datum ? 1 : -1))[0];
    const prazdne = KONTAKT_ROLE.every((_, i) => !h(`kk${i}_jmeno`) && !h(`kk${i}_telefon`) && !h(`kk${i}_email`));
    if (posledni && prazdne) { const zb = [...posledni.kontakty_klient];
      KONTAKT_ROLE.forEach(([role], i) => { const j = zb.findIndex((x) => x.role === role), x = j >= 0 ? zb.splice(j, 1)[0] : {}; ['jmeno', 'telefon', 'email'].forEach((p) => (document.getElementById(`a-kk${i}_${p}`).value = x[p] || '')); }); }
  };
  // fotka oblečení: náhled hned po výběru, nahraje se při uložení
  let novaFotka = null;
  const ukazFotku = (url) => (document.getElementById('a-foto-nahled').innerHTML = url ? `<img alt="Oblečení" src="${esc(url)}">` : '');
  fotkaAkce(a.obleceni_foto).then(ukazFotku);
  document.getElementById('a-foto').onchange = (e) => { novaFotka = e.target.files[0] || null; const fl = f.querySelector('[data-f=foto]');
    fl.classList.remove('chyba'); fl.querySelector('.err').textContent = '';
    if (novaFotka && novaFotka.size > 5 * 1024 * 1024) { fl.classList.add('chyba'); fl.querySelector('.err').textContent = 'Fotka je větší než 5 MB.'; novaFotka = null; e.target.value = ''; return; }
    if (novaFotka) ukazFotku(URL.createObjectURL(novaFotka)); };

  f.onsubmit = async (e) => {
    e.preventDefault();
    f.querySelectorAll('.fld.chyba').forEach((x) => { x.classList.remove('chyba'); x.querySelector('.err').textContent = ''; });
    const ch = {};
    if (!h('nazev')) ch.nazev = 'Vyplňte název akce.';
    if (!h('datum')) ch.datum = 'Vyberte datum.'; else if (nova && h('datum') < dnesIso()) ch.datum = 'Datum je v minulosti.';
    if (!h('okres')) ch.okres = 'Vyberte město.';
    if (!h('adresa')) ch.adresa = 'Vyplňte adresu, ať lidé trefí.';
    if (!h('sraz_cas')) ch.sraz_cas = 'Vyplňte čas srazu.';
    if (h('prace_od') && h('prace_do') && h('prace_do') <= h('prace_od') && h('prace_do') > '06:00') ch.prace_do = 'Konec musí být po začátku.';
    if (!(+h('pocet') >= 1 && +h('pocet') <= 500)) ch.pocet = 'Zadejte počet 1–500.';
    if (h('vyska_od') && (+h('vyska_od') < 120 || +h('vyska_od') > 220)) ch.vyska_od = 'Výška 120–220 cm.';
    if (h('uzaverka') && h('datum') && h('uzaverka').slice(0, 10) > h('datum')) ch.uzaverka = 'Uzávěrka musí být nejpozději v den akce.';
    if (!h('k_nazev') && (h('k_ico') || h('k_dic') || h('k_email') || h('k_adresa'))) ch.k_nazev = 'Vyplňte název klienta.';
    if (h('k_ico')) { const c = K.icoChyba(h('k_ico')); if (c) ch.k_ico = c; }
    if (h('k_dic') && !/^[A-Z]{2}[0-9A-Z]{8,12}$/.test(h('k_dic').toUpperCase().replace(/\s/g, ''))) ch.k_dic = 'DIČ zadejte jako CZ12345678.';
    if (h('k_email')) { const c = K.emailChyba(h('k_email')); if (c) ch.k_email = c; }
    if (h('v_telefon')) { const c = K.telefonChyba(h('v_telefon')); if (c) ch.v_telefon = c; }
    KONTAKT_ROLE.forEach((_, i) => { if (h(`kk${i}_telefon`)) { const c = K.telefonChyba(h(`kk${i}_telefon`)); if (c) ch[`kk${i}_telefon`] = c; }
      if (h(`kk${i}_email`)) { const c = K.emailChyba(h(`kk${i}_email`)); if (c) ch[`kk${i}_email`] = c; } });
    if (Object.keys(ch).length) {
      Object.entries(ch).forEach(([k, t]) => { const x = f.querySelector(`[data-f=${k}]`); x.classList.add('chyba'); x.querySelector('.err').textContent = t; });
      return f.querySelector('.fld.chyba').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const tl = f.querySelector('button[type=submit]'); tl.disabled = true;
    const konec = (t) => { tl.disabled = false; chybaFormu(f, t); };
    // 1) klient: vybraný se upraví, nový se založí
    let klientId = h('klient') || null;
    if (h('k_nazev')) {
      const k = { nazev: h('k_nazev'), ico: K.cisla(h('k_ico')) || null, dic: h('k_dic').toUpperCase().replace(/\s/g, '') || null, fakturacni_email: h('k_email') || null, fakturacni_adresa: h('k_adresa') || null };
      const r = klientId ? await sb.from('klient').update(k).eq('id', klientId) : await sb.from('klient').insert(k).select('id').single();
      if (r.error) return konec(/klient_ico_uq|duplicate/i.test(r.error.message) ? 'Klient s tímto IČO už existuje – vyberte ho v seznamu.' : chyba(r.error));
      if (!klientId) klientId = r.data.id;
    } else klientId = null;
    // 2) akce
    const zaznam = { nazev: h('nazev'), klient_id: klientId, okres_kod: h('okres'), adresa: h('adresa'), datum: h('datum'), sraz_cas: h('sraz_cas'), sraz_misto: h('sraz_misto') || null,
      prace_od: h('prace_od') || null, prace_do: h('prace_do') || null,
      kontakt_vixen: { jmeno: h('v_jmeno'), telefon: h('v_telefon') ? K.telefonNormalizuj(h('v_telefon')) : '' },
      kontakty_klient: KONTAKT_ROLE.map(([role], i) => ({ role, jmeno: h(`kk${i}_jmeno`), telefon: h(`kk${i}_telefon`) ? K.telefonNormalizuj(h(`kk${i}_telefon`)) : '', email: h(`kk${i}_email`) }))
        .filter((x) => x.jmeno || x.telefon || x.email),
      obleceni: f.querySelector('input[name=obleceni]:checked').value, obleceni_popis: h('obleceni_popis') || null,
      pocet_lidi: +h('pocet'), odmena: h('odmena') || null, uzaverka: h('uzaverka') ? new Date(h('uzaverka')).toISOString() : null,
      pozadavky: Object.fromEntries(Object.entries({ vyska_od: h('vyska_od') ? +h('vyska_od') : null, jazyk: h('jazyk') || null, ridicak: document.getElementById('a-ridicak').checked || null, auto: document.getElementById('a-auto').checked || null }).filter(([, v]) => v)),
      poznamka: h('poznamka') || null };
    if (document.getElementById('a-foto-smaz')?.checked) zaznam.obleceni_foto = null;
    const r = nova ? await sb.from('akce').insert(zaznam).select('id').single() : await sb.from('akce').update(zaznam).eq('id', a.id);
    if (r.error) return konec(chyba(r.error));
    const id = nova ? r.data.id : a.id;
    // 3) fotka oblečení
    if (novaFotka) {
      const cesta = `${id}/obleceni-${Date.now()}.${(novaFotka.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')}`;
      const up = await sb.storage.from('akce').upload(cesta, novaFotka, { contentType: novaFotka.type });
      if (up.error) return konec('Akce je uložená, ale fotku se nepodařilo nahrát: ' + chyba(up.error));
      S.fotoUrl[cesta] = URL.createObjectURL(novaFotka);
      const u = await sb.from('akce').update({ obleceni_foto: cesta }).eq('id', id);
      if (u.error) return konec(chyba(u.error));
    }
    await nactiAkce();
    vAkceForm(S.akce.find((x) => x.id === id), msg(nova ? 'Akce založená ✓' : 'Změny uložené ✓'));
  };
  if (nova) return;
  const krok = document.getElementById('ak-krok');
  const kopiruj = async (datum) => {
    const { id, klient, hledej, vytvoreno, zmeneno, vytvoril, stav, zruseni_duvod, ...zbytek } = a;
    const posun = Math.round((new Date(datum + 'T12:00:00') - new Date(a.datum + 'T12:00:00')) / 86400000);
    const r = await sb.from('akce').insert({ ...zbytek, datum, zkopirovano_z: a.id, uzaverka: a.uzaverka ? new Date(new Date(a.uzaverka).getTime() + posun * 86400000).toISOString() : null }).select('id').single();
    if (r.error) return (krok.innerHTML = msg(esc(chyba(r.error)), 'bad'));
    await nactiAkce();
    vAkceForm(S.akce.find((x) => x.id === r.data.id), msg(`Kopie na ${esc(denAkce(datum))} vytvořena ✓ Zkontrolujte údaje.`));
  };
  document.getElementById('ak-kop1').onclick = () => kopiruj(posunDen(a.datum, 1));
  document.getElementById('ak-kopx').onclick = () => {
    krok.innerHTML = `<div class="ak-krok"><label for="ak-kop-datum">Datum kopie</label> <input type="date" id="ak-kop-datum" value="${posunDen(a.datum, 7)}"> <button class="btn mini" id="ak-kop-ok">Vytvořit kopii</button></div>`;
    document.getElementById('ak-kop-ok').onclick = () => { const d = document.getElementById('ak-kop-datum').value; if (d) kopiruj(d); };
  };
  const zrus = document.getElementById('ak-zrus');
  if (zrus) zrus.onclick = () => {
    krok.innerHTML = `<div class="ak-krok"><label for="ak-duvod">Proč se akce ruší?</label><input id="ak-duvod" placeholder="např. klient akci zrušil">
      <div class="akce"><button class="btn mini" id="ak-zrus-ok">Ano, zrušit akci</button><button class="btn o mini" id="ak-zrus-ne">Ne</button></div></div>`;
    document.getElementById('ak-zrus-ne').onclick = () => (krok.innerHTML = '');
    document.getElementById('ak-zrus-ok').onclick = async () => {
      const d = document.getElementById('ak-duvod').value.trim();
      if (!d) return document.getElementById('ak-duvod').focus();
      const { error } = await sb.from('akce').update({ stav: 'zrusena', zruseni_duvod: d }).eq('id', a.id);
      if (error) return krok.insertAdjacentHTML('beforeend', msg(esc(chyba(error)), 'bad'));
      await nactiAkce(); vAkceForm(S.akce.find((x) => x.id === a.id), msg('Akce zrušená. Najdete ji v záložce Zrušené.'));
    };
  };
  const obnov = document.getElementById('ak-obnov');
  if (obnov) obnov.onclick = async () => {
    const { error } = await sb.from('akce').update({ stav: 'priprava', zruseni_duvod: null }).eq('id', a.id);
    if (error) return (krok.innerHTML = msg(esc(chyba(error)), 'bad'));
    await nactiAkce(); vAkceForm(S.akce.find((x) => x.id === a.id), msg('Akce obnovená ✓'));
  };
}

// ---------- NABÍDKA A OBSAZENÍ (modul 2, etapa B) ----------
// odpoved = hosteska (zájem / nemůže), rozhodnuti = kancelář (potvrzeno / tentokrát ne). Potvrzení zároveň odemkne smlouvu.
const NAB_STAV = { potvrzeno: ['potvrzeno', 't-ok'], zajem: ['má zájem', 't-w'], ceka: ['bez odpovědi', 't-g'], nemuze: ['nemůže', 't-b'], odmitnuto: ['tentokrát ne', 't-b'] };
const nabStav = (n) => n.rozhodnuti || n.odpoved || 'ceka';
const nabidkyAkce = (a) => (S.nabidky || []).filter((n) => n.akce_id === a.id);
function obsazeni(a) {
  const l = nabidkyAkce(a), c = (s) => l.filter((n) => nabStav(n) === s).length;
  return { potvrzeno: c('potvrzeno'), zajem: c('zajem'), nemuze: c('nemuze'), odmitnuto: c('odmitnuto'), ceka: c('ceka'), neotevreno: l.filter((n) => nabStav(n) === 'ceka' && !n.otevreno).length, celkem: l.length };
}
const obsazeniZn = (a) => { const o = obsazeni(a); if (!o.celkem) return '<span class="mute">nenabídnuto</span>';
  return `<b class="${o.potvrzeno >= a.pocet_lidi ? 'ok' : 'no'}">${o.potvrzeno}/${a.pocet_lidi}</b><small>zájem ${o.zajem} · bez odp. ${o.ceka}</small>`; };

async function obsazeniSekce(a, probehla, hlaska = '') {
  const box = document.getElementById('ak-obs'); if (!box) return;
  if (!S.lide.length) { box.innerHTML = '<section class="card"><p class="mute">Načítám obsazení…</p></section>'; try { await nactiLidi(); } catch (e) { box.innerHTML = msg(esc(chyba(e)), 'bad'); return; } }
  const o = obsazeni(a), PORADI = ['zajem', 'potvrzeno', 'ceka', 'nemuze', 'odmitnuto'];
  const l = nabidkyAkce(a).map((n) => ({ n, o: S.lide.find((x) => x.id === n.osoba_id) })).filter((x) => x.o)
    .sort((x, y) => PORADI.indexOf(nabStav(x.n)) - PORADI.indexOf(nabStav(y.n)) || x.o.prijmeni.localeCompare(y.o.prijmeni, 'cs'));
  const bezOdpovedi = l.filter(({ n }) => nabStav(n) === 'ceka'), potvrzeni = l.filter(({ n }) => nabStav(n) === 'potvrzeno');
  const otevr = (n) => n.otevreno ? 'v aplikaci ' + kdy(n.otevreno) : n.odkaz_otevren ? 'odkaz ' + kdy(n.odkaz_otevren) + ', zatím nepřihlášen/a' : '<span class="no">neotevřel/a</span>';
  box.innerHTML = `<section class="card ak-obs"><h2>Nabídka a obsazení</h2>${hlaska}
    <div class="ak-souhrn"><span class="ak-cislo ${o.potvrzeno >= a.pocet_lidi ? 'ok' : ''}"><b>${o.potvrzeno}/${a.pocet_lidi}</b> potvrzeno</span>
     <span>má zájem <b>${o.zajem}</b></span><span>bez odpovědi <b>${o.ceka}</b> (neotevřelo ${o.neotevreno})</span><span>nemůže <b>${o.nemuze}</b></span><span>nabídnuto <b>${o.celkem}</b></span></div>
    ${o.potvrzeno > a.pocet_lidi ? msg(`Potvrzeno je víc lidí (${o.potvrzeno}), než je potřeba (${a.pocet_lidi}).`, 'warn') : ''}
    <div class="akce"><button class="btn mini" id="ak-vybrat"${probehla ? ' disabled title="Akce už proběhla"' : ''}>Vybrat lidi a poslat nabídku</button>
     <button class="btn o mini" id="ak-pripom"${bezOdpovedi.length && !probehla ? '' : ' disabled'}>Připomenout nabídku – bez odpovědi (${bezOdpovedi.length})</button>
     <button class="btn o mini" id="ak-zprava"${potvrzeni.length ? '' : ' disabled'}>Zpráva potvrzeným (${potvrzeni.length})</button></div>
    <div id="ak-zp-box"></div>
    ${l.length ? `<p class="pozn">Potvrzením člověku zároveň odemknete údaje a smlouvu v aplikaci (pokud je ještě nemá). Kontakty a podrobnosti uvidí až po potvrzení.</p>
    <div class="tab-obal"><table class="lide-tab ak-nab"><thead><tr><th>Foto</th><th>Jméno</th><th>Stav</th><th>Nabídku viděl/a</th><th>Smlouva</th><th></th></tr></thead><tbody>${l.map(({ n, o: x }) => { const s = nabStav(n);
      return `<tr data-n="${n.id}"><td>${nahled(x)}</td><td><b>${esc(x.prijmeni)} ${esc(x.jmeno)}</b><small><a class="tel" href="tel:${esc(x.telefon)}">${esc(x.telefon)}</a></small></td>
       <td><span class="tag ${NAB_STAV[s][1]}">${NAB_STAV[s][0]}</span>${n.rozhodnuti ? kdoZn(n.rozhodl, n.rozhodnuti_at) : n.odpoved ? `<small class="kdo">odpověděla hosteska · ${kdy(n.odpoved_at)}</small>` : kdoZn(n.odeslal, n.odeslano, null, 'nabídku poslal(a): ')}${n.odhlaseno_at && !n.rozhodnuti ? `<small class="no">hosteska se odhlásila po potvrzení · ${kdy(n.odhlaseno_at)}</small>` : ''}</td>
       <td class="nw">${otevr(n)}${n.whatsapp_at ? `<small>WhatsApp ${kdy(n.whatsapp_at)}</small>` : ''}</td>
       <td>${x.dpp ? esc(DPP_TXT[x.dpp] || x.dpp) : x.smlouva_vyzva_at ? '<span class="mute">vyzván/a, zatím bez smlouvy</span>' : '<span class="mute">–</span>'}</td>
       <td class="nw">${s !== 'potvrzeno' && !probehla ? '<button class="btn mini" data-r="potvrzeno">Potvrdit</button> ' : ''}${s !== 'odmitnuto' && s !== 'nemuze' && !probehla ? '<button class="btn o mini" data-r="odmitnuto">Tentokrát ne</button> ' : ''}${n.rozhodnuti && !probehla ? '<button class="btn o mini" data-r="">Vrátit</button>' : ''}</td></tr>`; }).join('')}</tbody></table></div>`
    : '<p class="mute">Nabídku zatím nikdo nedostal. Klikněte na „Vybrat lidi a poslat nabídku“ – filtr v Lidé se předvyplní podle města a požadavků akce.</p>'}</section>`;
  podepisFotky(l.map(({ o: x }) => x.fotky[0]).filter(Boolean)).then(() => box.querySelectorAll('.foto[data-cesta] img').forEach((i) => (i.src = S.fotoUrl[i.parentElement.dataset.cesta] || '')));
  document.getElementById('ak-vybrat').onclick = () => lideProAkci(a);
  const zpNab = Object.fromEntries(l.map(({ n }) => [n.osoba_id, n])), obnov = async () => { await nactiAkce(); };
  document.getElementById('ak-pripom').onclick = () => zpravaPanel(document.getElementById('ak-zp-box'), bezOdpovedi.map(({ o: x }) => x), { druhy: ['nabidka', 'vlastni'], akce: a, nabidky: zpNab, hotovo: obnov });
  document.getElementById('ak-zprava').onclick = () => zpravaPanel(document.getElementById('ak-zp-box'), potvrzeni.map(({ o: x }) => x), { druhy: ['vlastni'], akce: a, nabidky: zpNab, hotovo: obnov });
  box.querySelectorAll('button[data-r]').forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    const { error } = await sb.rpc('kancelar_nabidka_rozhodni', { p_nabidky: [b.closest('tr').dataset.n], p_rozhodnuti: b.dataset.r || null });
    if (error) { b.disabled = false; return box.querySelector('.ak-souhrn').insertAdjacentHTML('afterend', msg(esc(chyba(error)), 'bad')); }
    await nactiAkce(); if (b.dataset.r === 'potvrzeno') await nactiLidi();
    obsazeniSekce(S.akce.find((x) => x.id === a.id), probehla, msg(b.dataset.r === 'potvrzeno' ? 'Potvrzeno ✓ Hosteska to uvidí v aplikaci.' : 'Uloženo ✓'));
  }));
}

// výběr lidí pro akci: Lidé s filtrem podle města a požadavků akce
function lideProAkci(a) {
  const p = a.pozadavky || {};
  S.proAkci = a; S.vyber.clear();
  S.proAkciSkryt = { nabidnuto: true, kolize: true };
  F = { ...F0(), okresy: [a.okres_kod], vyskaOd: p.vyska_od ? String(p.vyska_od) : '', jazyk: p.jazyk || '', ridicak: !!p.ridicak, auto: !!p.auto };
  ulozF(); STRANA = 0; vLide();
}
function vyberProAkciHtml() {
  const a = S.proAkci; if (!a) return '';
  const uz = nabidkyAkce(a).length;
  return `<div class="ak-vyber"><div><b>Výběr lidí pro akci: ${esc(a.nazev)}</b> · ${denAkce(a.datum)} · ${esc(S.cis.okres[a.okres_kod]?.mesto || '')} · potřeba ${a.pocet_lidi}<br>
    <span class="pozn">Filtr je předvyplněný podle města a požadavků akce – další města a filtry přidáte v řádku pod názvy sloupců. Zaškrtněte lidi a klikněte „Poslat nabídku na akci“.</span><br>
    <label class="chk mini"><input type="checkbox" data-skryt="nabidnuto"${S.proAkciSkryt.nabidnuto ? ' checked' : ''}> <span>skrýt ty, kdo nabídku už mají (${uz})</span></label>
    <label class="chk mini"><input type="checkbox" data-skryt="kolize"${S.proAkciSkryt.kolize ? ' checked' : ''}> <span>skrýt potvrzené na jiné akci ve stejný den</span></label></div>
    <button class="btn o mini" id="ak-vyber-zpet">← Zpět na akci</button></div>`;
}
function poslatNabidku(el, osoby, info) {
  const a = S.proAkci;
  el.querySelector('.potvrd-h')?.remove();
  el.insertAdjacentHTML('beforeend', `<div class="potvrd-h">${msg(`Poslat nabídku akce „${esc(a.nazev)}“ (${denAkce(a.datum)}) ${osoby.length} lidem? Uvidí ji v aplikaci a odpoví „Mám zájem“ / „Nemůžu“. Kdo nabídku už má, je neoslovovat nebo není přijatý, toho aplikace vynechá.`, 'warn')}
    <button class="btn mini" data-ok>Ano, poslat</button> <button class="btn o mini" data-ne>Ne</button></div>`);
  el.querySelector('[data-ne]').onclick = () => el.querySelector('.potvrd-h').remove();
  el.querySelector('[data-ok]').onclick = async (e) => {
    e.target.disabled = true;
    const { data, error } = await sb.rpc('kancelar_nabidka_posli', { p_akce: a.id, p_osoby: osoby.map((o) => o.id) });
    if (error) { e.target.disabled = false; return info(chyba(error)); }
    S.proAkci = null; S.vyber.clear(); await nactiAkce();
    vAkceForm(S.akce.find((x) => x.id === a.id), msg(`Nabídka odeslána do aplikace ${data.nove} lidem.${data.uz_meli ? ` ${data.uz_meli} ji už měli.` : ''}${data.vynechano ? ` Vynecháno ${data.vynechano} (neoslovovat / nepřijatí).` : ''} Komu ji v aplikaci neotevřou, můžete poslat WhatsApp.`));
  };
}

// ---------- NASTAVENÍ (vedení, TBDB) ----------
async function vNastaveni(hlaska = '') {
  $app.innerHTML = `${await menu('nastaveni')}<p class="mute">Načítám…</p>`; zapniMenu();
  const { data, error } = await sb.rpc('parametr_dnes', { p_kod: 'registrace_schvalovat' });
  const sch = error ? true : data !== false;
  const { data: posl } = await sb.from('parametr_hodnota').select('zmenil,zmeneno,zdroj').eq('kod', 'registrace_schvalovat').order('zmeneno', { ascending: false }).limit(1);
  const pz = (posl || [])[0];
  $app.innerHTML = `${await menu('nastaveni')}<h1>Nastavení</h1>${hlaska}
   <div class="card nast"><h2 style="margin-top:0">Registrace</h2>
    <label class="chk"><input type="checkbox" id="n-schval"${sch ? ' checked' : ''}> <span><b>Nové registrace schvaluje kancelář</b><br>
    <span class="mute">Zapnuto: nový člověk čeká v Registracích, dokud ho neschválíte. Vypnuto: po registraci je rovnou přijatý a může se hned přihlásit (s každým si stejně před akcí voláte).</span></span></label>
    ${pz ? `<p class="pozn">Naposledy nastavil(a): ${pz.zmenil ? esc(kdoTxt(pz.zmenil, pz.zmeneno)) : 'výchozí hodnota (TBDB)'}</p>` : ''}
    <div id="n-msg"></div></div>`;
  zapniMenu();
  document.getElementById('n-schval').onchange = async (e) => {
    const { error: err } = await sb.rpc('kancelar_nastav', { p_kod: 'registrace_schvalovat', p_hodnota: e.target.checked });
    document.getElementById('n-msg').innerHTML = err ? msg(esc(chyba(err)), 'bad') : msg(e.target.checked ? 'Uloženo ✓ Nové registrace budete schvalovat.' : 'Uloženo ✓ Noví lidé budou po registraci rovnou přijatí.');
    if (err) e.target.checked = !e.target.checked;
  };
}

// ---------- detail osoby (panel vpravo) ----------
async function vDetailOsoby(id) {
  const o = S.lide.find((x) => x.id === id); if (!o) return;
  const d = document.getElementById('detail'); d.classList.remove('hidden');
  const p = o.profil || {}, tel = o.telefon.replace(/\D/g, '');
  const mistaPodleKraju = mistaText(o.okresy);
  d.innerHTML = `<div class="det-hl"><div><h2>${esc(o.jmeno)} ${esc(o.prijmeni)}</h2><span class="tag ${STAV_O[o.stav][1]}">${STAV_O[o.stav][0]}</span>${stavKdo(o)}${neoslovovatZn(o)} <span class="mute">registrace ${datum(o.vytvoreno)}</span></div><button class="zavrit" title="Zavřít">✕</button></div>
   <div class="det-fotky" id="det-fotky">${o.fotky.length ? o.fotky.map((c) => `<img data-cesta="${esc(c)}" alt="">`).join('') : `<span class="foto bez velka">${inicialy(o)}</span><span class="mute">Bez fotky – hosteska ji může nahrát v profilu.</span>`}</div>
   <div class="det-akce"><a class="btn o mini" href="tel:${esc(o.telefon)}">📞 Zavolat</a><a class="btn o mini" href="mailto:${esc(o.email)}">✉ E-mail</a><a class="btn o mini" href="https://wa.me/${tel}" target="_blank" rel="noopener">WhatsApp</a><button class="btn o mini" id="upravit">✏ Upravit údaje</button></div>
   <section><h3>Kontakt a registrace</h3><dl>
    <dt>Telefon</dt><dd>${esc(o.telefon)}</dd><dt>E-mail</dt><dd>${esc(o.email)}</dd><dt>Bydliště</dt><dd>${esc(o.obec || '')}</dd>
    <dt>Může pracovat</dt><dd>${mistaPodleKraju}</dd><dt>Zájem</dt><dd>${(o.zajem || []).map((z) => esc(ZAJEM[z] || z)).join(', ')}</dd>
    <dt>Kontakt přes</dt><dd>${(o.kanal_kontaktu || []).map((z) => esc(KANAL[z] || z)).join(', ')}</dd>
    <dt>WhatsApp</dt><dd>${o.whatsapp_souhlas_at ? 'souhlas s upozorněními ' + datum(o.whatsapp_souhlas_at) + ' <small class="kdo">dala hosteska</small>' : '<span class="mute">bez souhlasu</span>'}</dd>
    <dt>Zásady (informace)</dt><dd>${o.souhlas_gdpr_at ? datum(o.souhlas_gdpr_at) + ' (verze ' + esc(o.souhlas_gdpr_v) + ')' : '<span class="no">chybí</span>'}</dd></dl></section>
   <section><h3>Profil</h3>${o.ma_profil ? `<dl><dt>Výška</dt><dd>${p.vyska_cm ? p.vyska_cm + ' cm' : '–'}</dd><dt>Konfekce / bota</dt><dd>${esc(p.konfekce || '–')} / ${p.bota_eu || '–'}</dd>
     <dt>Jazyky</dt><dd>${esc((p.jazyky || []).join(', ') || '–')}</dd><dt>Řidičák / auto</dt><dd>${p.ridicak ? 'ano' : 'ne'} / ${p.vlastni_auto ? 'ano' : 'ne'}</dd>
     <dt>Dostupnost</dt><dd>${esc(p.dostupnost || '–')}</dd><dt>Zkušenosti</dt><dd>${esc(p.zkusenosti || '–')}</dd></dl>` : '<p class="mute">Profil zatím chybí.</p>'}</section>
   <section><h3>Smlouva a podklady</h3>${vyzvaHtml(o)}<div id="det-smlouva"><p class="mute">${S.smlouvy ? 'Načítám…' : `Údaje pro smlouvu: <b>${o.udaje ? 'potvrzené' : 'chybí'}</b> · DPP: <b>${o.dpp ? DPP_TXT[o.dpp] + (o.dpp_at ? ' (' + datum(o.dpp_at) + ')' : '') : 'zatím ne'}</b><br>Podrobnosti vidí jen role Smlouvy.`}</p></div></section>
   <section><h3>Stav a poznámka</h3><form id="det-f" novalidate>
    <div class="fld"><label>Stav</label><select id="det-stav">${Object.entries(STAV_O).map(([k, v]) => `<option value="${k}"${k === o.stav ? ' selected' : ''}>${v[0]}</option>`).join('')}</select></div>
    <div class="fld${sDuvodem(o.stav) ? '' : ' hidden'}" id="det-duvod" data-f="duvod"><label>Důvod odmítnutí / vyřazení</label>${duvodVolba(o.duvod)}<div class="err"></div></div>
    <label class="chk"><input type="checkbox" id="det-neosl"${o.neoslovovat ? ' checked' : ''}> <span>Neoslovovat – hromadné akce a připomínky tohoto člověka vynechají</span></label>
    <div class="fld"><label>Interní poznámka (uchazeč ji neuvidí)</label><textarea id="det-pozn" rows="3">${esc(o.pozn)}</textarea></div>
    <button class="btn" type="submit">Uložit</button></form></section>
   <section><h3>Zprávy hostesce</h3>
    ${o.neoslovovat ? '<p class="mute">Neoslovovat – zprávy se neposílají.</p>' : '<div class="akce"><button class="btn o mini" id="z-zprava">Poslat zprávu…</button></div><p class="pozn">Vyberete kanály (aplikace, e-mail, WhatsApp) a pro každý se připraví text – připomínka sama doplní, co člověku chybí.</p><div id="z-panel"></div>'}
    <div id="z-msg"></div><div id="det-zpravy" class="mute">Načítám…</div></section>
   ${S.vedeni || S.tbdb ? '<section><h3>Historie změn</h3><div id="det-hist" class="mute">Načítám…</div></section>' : ''}`;
  d.querySelector('.zavrit').onclick = () => d.classList.add('hidden');
  podepisFotky(o.fotky).then(() => d.querySelectorAll('#det-fotky img').forEach((img) => (img.src = S.fotoUrl[img.dataset.cesta] || '')));
  d.querySelector('#upravit').onclick = () => vUpravOsobu(o);
  const vb = d.querySelector('#vyzva-btn');
  if (vb) vb.onclick = async () => { vb.disabled = true;
    const { error } = await sb.rpc('kancelar_smlouva_vyzva', { p_osoby: [id], p_zrusit: !!o.smlouva_vyzva_at });
    if (error) { vb.disabled = false; return (d.querySelector('#vyzva-msg').innerHTML = msg(esc(chyba(error)), 'bad')); }
    o.smlouva_vyzva_at = o.smlouva_vyzva_at ? null : new Date().toISOString(); vDetailOsoby(id); };
  d.querySelector('#det-stav').onchange = (e) => d.querySelector('#det-duvod').classList.toggle('hidden', !sDuvodem(e.target.value));
  d.querySelector('#det-f').onsubmit = async (e) => {
    e.preventDefault();
    const stav = d.querySelector('#det-stav').value, pozn = d.querySelector('#det-pozn').value.trim();
    const duvod = sDuvodem(stav) ? d.querySelector('#det-duvod .duvod').value : '', neosl = d.querySelector('#det-neosl').checked;
    if (sDuvodem(stav) && !duvod) { const f = d.querySelector('#det-duvod'); f.classList.add('chyba'); f.querySelector('.err').textContent = 'Vyberte důvod.'; return; }
    if (stav !== o.stav || duvod !== o.duvod || neosl !== o.neoslovovat) {
      const { error } = await zmenStavDb([id], stav, duvod, neosl); if (error) return chybaFormu(e.target, chyba(error));
      Object.assign(o, { stav, duvod, neoslovovat: neosl });
    }
    if (pozn !== o.pozn) {
      const r = pozn ? await sb.from('osoba_poznamka').upsert({ osoba_id: id, text: pozn, zmeneno: new Date().toISOString() }) : await sb.from('osoba_poznamka').delete().eq('osoba_id', id);
      if (r.error) return chybaFormu(e.target, chyba(r.error)); o.pozn = pozn;
    }
    vykresliTabulku(); vDetailOsoby(id);
    d.querySelector('#det-f').insertAdjacentHTML('afterbegin', msg('Uloženo ✓'));
  };
  const zb = d.querySelector('#z-zprava'); if (zb) zb.onclick = () => zpravaPanel(d.querySelector('#z-panel'), [o], { hotovo: () => detailZpravy(o) });
  detailZpravy(o);
  if (S.smlouvy) detailSmlouva(o);
  if (S.vedeni || S.tbdb) detailHistorie(o);
}

const ZPRAVA_TYP = { vlastni: 'zpráva od kanceláře', nabidka: 'nabídka akce', whatsapp_nabidka: 'nabídka akce', whatsapp_upozorneni: 'upozornění (odesláno ručně)', schvaleno: 'schválení registrace', pripominka_prihlaseni: 'připomínka – přihlásit se', pripominka_profil: 'připomínka – profil', pripominka_udaje: 'připomínka – údaje pro smlouvu', pripominka_podpis: 'připomínka – podpis smlouvy' };
async function detailZpravy(o) {
  const box = document.getElementById('det-zpravy'); if (!box) return;
  const { data, error } = await sb.from('osoba_zprava').select('typ,kanal,predmet,vysledek,chyba,adresat,vytvoreno,precteno_at,kdo').eq('osoba_id', o.id).order('vytvoreno', { ascending: false }).limit(10);
  if (error) { box.textContent = 'Zprávy se nepodařilo načíst.'; return; }
  box.innerHTML = (data || []).length ? `<ul class="hist">${data.map((z) => `<li><b>${new Date(z.vytvoreno).toLocaleString('cs-CZ')}</b> – ${esc(KANALY[z.kanal] || z.kanal)} · ${esc(ZPRAVA_TYP[z.typ] || z.typ)}${z.predmet && z.kanal !== 'whatsapp' ? ` „${esc(z.predmet)}“` : ''}: ${esc(ZPRAVA_VYS[z.vysledek] || z.vysledek)}${z.kanal === 'aplikace' ? (z.precteno_at ? ', přečteno ' + kdy(z.precteno_at) : ', zatím nepřečteno') : ''}${z.chyba ? ' (' + esc(z.chyba) + ')' : ''} <small class="kdo">poslal(a): ${esc(kdoTxt(z.kdo))}</small></li>`).join('')}</ul>` : 'Zatím žádné zprávy.';
}

// ---------- úprava údajů člověka kanceláří ----------
function vUpravOsobu(o) {
  const d = document.getElementById('detail'), p = o.profil || {};
  const KRAJSKA = ['praha', 'brno-mesto', 'ostrava-mesto', 'plzen-mesto', 'ceske-budejovice', 'hradec-kralove', 'pardubice', 'olomouc', 'liberec', 'usti-nad-labem', 'zlin', 'jihlava', 'karlovy-vary'];
  const vsechnaMesta = Object.values(S.cis.okres).sort((a, b) => a.mesto.localeCompare(b.mesto, 'cs'));
  let mesta = [...o.okresy];
  const zaskrt = (nazev, mapa, vybrane) => Object.entries(mapa).map(([k, v]) => `<label class="chk"><input type="checkbox" name="${nazev}" value="${k}"${(vybrane || []).includes(k) ? ' checked' : ''}> <span>${esc(v)}</span></label>`).join(' ');
  const pole = (id, label, val, typ = 'text', extra = '') => `<div class="fld" data-f="${id}"><label for="u-${id}">${label}</label><input id="u-${id}" type="${typ}" value="${esc(val ?? '')}"${extra}><div class="err"></div></div>`;
  d.innerHTML = `<div class="det-hl"><div><h2>Upravit: ${esc(o.jmeno)} ${esc(o.prijmeni)}</h2><span class="mute">Změny se zapíšou do historie.</span></div><button class="zavrit" title="Zavřít">✕</button></div>
   <form id="upr-f" novalidate>
    <section><h3>Kontakt a bydliště</h3>
     ${pole('jmeno', 'Jméno', o.jmeno)}${pole('prijmeni', 'Příjmení', o.prijmeni)}
     ${pole('telefon', 'Telefon', o.telefon, 'tel')}${pole('email', 'E-mail', o.email, 'email')}
     ${o.auth_user_id ? '<p class="pozn">Účet už existuje: když změníte e-mail, přihlašuje se dál původním e-mailem. Změnu přihlašovacího e-mailu zařídí TBDB.</p>' : ''}
     <div class="fld hidden" data-f="kraj"><label for="u-kraj">Kraj bydliště</label><select id="u-kraj">${Object.entries(S.cis.kraj).sort((a, b) => a[1].localeCompare(b[1], 'cs')).map(([k, v]) => `<option value="${k}"${k === o.kraj_kod ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select><div class="err"></div></div>
     ${pole('obec', 'Kde bydlí (obec / město)', o.obec)}
     <div class="fld" data-f="zajem"><label>Zájem</label>${zaskrt('zajem', ZAJEM, o.zajem)}<div class="err"></div></div>
     <div class="fld" data-f="kanal"><label>Kontakt přes</label>${zaskrt('kanal', KANAL, o.kanal_kontaktu)}<div class="err"></div></div></section>
    <section><h3>Kde může pracovat</h3><div class="fld" data-f="okresy"><p class="pozn">Konkrétní města, kam může dojet – kraj se dopočítá sám.</p>
     <div id="upr-mesta" class="upr-mesta"></div>
     <input id="upr-mesto" list="upr-mesta-dl" placeholder="+ přidat město (stačí začít psát)" autocomplete="off"><datalist id="upr-mesta-dl">${vsechnaMesta.map((x) => `<option value="${esc(x.mesto)}">`).join('')}</datalist>
     <div class="upr-rychle"><span class="pozn">Krajská města:</span>${KRAJSKA.map((m) => `<button type="button" class="btn o mini" data-m="${m}">${esc(S.cis.okres[m]?.mesto || m)}</button>`).join('')}</div><div class="err"></div></div></section>
    <section><h3>Profil</h3>
     ${pole('vyska', 'Výška (cm)', p.vyska_cm, 'number', ' min="120" max="220"')}
     <div class="fld" data-f="konfekce"><label for="u-konfekce">Konfekce</label><select id="u-konfekce"><option value="">–</option>${KONFEKCE.map((k) => `<option${k === p.konfekce ? ' selected' : ''}>${k}</option>`).join('')}</select><div class="err"></div></div>
     ${pole('bota', 'Bota (EU)', p.bota_eu, 'number', ' min="30" max="50" step="0.5"')}
     ${K.jazykyHtml(p.jazyky || [])}
     <label class="chk"><input type="checkbox" id="u-ridicak"${p.ridicak ? ' checked' : ''}> <span>Řidičský průkaz</span></label>
     <label class="chk"><input type="checkbox" id="u-auto"${p.vlastni_auto ? ' checked' : ''}> <span>Vlastní auto</span></label>
     ${pole('dostupnost', 'Kdy může pracovat', p.dostupnost)}
     <div class="fld" data-f="zkusenosti"><label for="u-zkusenosti">Zkušenosti</label><textarea id="u-zkusenosti" rows="3">${esc(p.zkusenosti || '')}</textarea><div class="err"></div></div></section>
    <div class="akce"><button class="btn" type="submit">Uložit změny</button> <button class="btn o" type="button" id="upr-zpet">Zpět bez uložení</button></div>
   </form>`;
  d.querySelector('.zavrit').onclick = () => d.classList.add('hidden');
  d.querySelector('#upr-zpet').onclick = () => vDetailOsoby(o.id);
  K.jazykyZapni(d.querySelector('#upr-f'));
  const kresliMesta = () => { const box = d.querySelector('#upr-mesta');
    box.innerHTML = mesta.map((m) => `<span class="chip-m">${esc(S.cis.okres[m]?.mesto || m)}<button type="button" data-x="${m}" title="Odebrat">✕</button></span>`).join('') || '<span class="mute">zatím žádné</span>';
    box.querySelectorAll('button[data-x]').forEach((b) => (b.onclick = () => { mesta = mesta.filter((m) => m !== b.dataset.x); kresliMesta(); }));
    d.querySelectorAll('.upr-rychle button').forEach((b) => b.classList.toggle('on', mesta.includes(b.dataset.m))); };
  const pridej = (kod) => { if (kod && !mesta.includes(kod)) mesta.push(kod); kresliMesta(); };
  const vstup = d.querySelector('#upr-mesto');
  vstup.oninput = vstup.onchange = () => { const h = bezDiakritiky(vstup.value.trim()); const x = h && vsechnaMesta.find((m) => bezDiakritiky(m.mesto) === h); if (x) { pridej(x.kod); vstup.value = ''; } };
  d.querySelectorAll('.upr-rychle button').forEach((b) => (b.onclick = () => (mesta.includes(b.dataset.m) ? (mesta = mesta.filter((m) => m !== b.dataset.m), kresliMesta()) : pridej(b.dataset.m))));
  kresliMesta();
  d.querySelector('#upr-f').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, h = (id) => d.querySelector('#u-' + id).value.trim(), vyb = (n) => [...d.querySelectorAll(`input[name=${n}]:checked`)].map((x) => x.value);
    f.querySelectorAll('.fld.chyba').forEach((x) => { x.classList.remove('chyba'); x.querySelector('.err').textContent = ''; });
    const chyby = {};
    if (!h('jmeno')) chyby.jmeno = 'Vyplňte jméno.'; if (!h('prijmeni')) chyby.prijmeni = 'Vyplňte příjmení.';
    const tc = K.telefonChyba(h('telefon')); if (tc) chyby.telefon = tc;
    const ec = K.emailChyba(h('email')); if (ec) chyby.email = ec;
    if (!h('obec')) chyby.obec = 'Vyplňte obec.';
    if (!vyb('zajem').length) chyby.zajem = 'Vyberte aspoň jednu možnost.';
    if (!mesta.length) chyby.okresy = 'Vyberte aspoň jedno město.';
    if (h('vyska') && (+h('vyska') < 120 || +h('vyska') > 220)) chyby.vyska = 'Výška 120–220 cm.';
    if (h('bota') && (+h('bota') < 30 || +h('bota') > 50)) chyby.bota = 'Velikost bot 30–50.';
    if (Object.keys(chyby).length) {
      Object.entries(chyby).forEach(([k, t]) => { const x = f.querySelector(`[data-f=${k}]`); x.classList.add('chyba'); x.querySelector('.err').textContent = t; });
      return f.querySelector('.fld.chyba').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const profil = { vyska_cm: h('vyska') || null, konfekce: h('konfekce'), bota_eu: h('bota') || null, jazyky: K.jazykyHodnota(f),
      ridicak: d.querySelector('#u-ridicak').checked, vlastni_auto: d.querySelector('#u-auto').checked, dostupnost: h('dostupnost'), zkusenosti: h('zkusenosti') };
    const profilPrazdny = !o.profil && !profil.vyska_cm && !profil.konfekce && !profil.bota_eu && !profil.jazyky.length && !profil.ridicak && !profil.vlastni_auto && !profil.dostupnost && !profil.zkusenosti;
    f.querySelector('button[type=submit]').disabled = true;
    const { error } = await sb.rpc('kancelar_uprav_osobu', { p_id: o.id,
      p_osoba: { jmeno: h('jmeno'), prijmeni: h('prijmeni'), telefon: K.telefonNormalizuj(h('telefon')), email: h('email'), kraj_kod: S.cis.okres[mesta[0]]?.kraj_kod || h('kraj'), obec: h('obec'), zajem: vyb('zajem'), kanal_kontaktu: vyb('kanal') },
      p_okresy: mesta, p_profil: profilPrazdny ? null : profil });
    if (error) { f.querySelector('button[type=submit]').disabled = false; return chybaFormu(f, chyba(error)); }
    await nactiLidi(); vykresliTabulku(); await vDetailOsoby(o.id);
    d.querySelector('.det-hl').insertAdjacentHTML('afterend', msg('Údaje uloženy ✓'));
  };
}

async function detailSmlouva(o) {
  const box = document.getElementById('det-smlouva');
  const [{ data: n }, { data: dok }] = await Promise.all([
    sb.from('osoba_nastup').select('*').eq('osoba_id', o.id).maybeSingle(),
    sb.from('dokument').select('id,stav,obsah,vytvoreno,vytvoril,podepsano_at,podpis,vixen_podepsano_at,vixen_podpis,odeslano_at,odeslano_na,odstoupeni_do,odstoupeno_at,pdf_cesta,dokument_sablona(nazev,druh)').eq('osoba_id', o.id).order('vytvoreno', { ascending: false }),
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
    : '<p class="mute">Údaje pro smlouvu zatím chybí.</p>';
  const ukaz = document.getElementById('ukaz-citl');
  if (ukaz) ukaz.onclick = () => { box.querySelectorAll('.citl').forEach((s) => (s.textContent = s.dataset.plne)); ukaz.remove(); };
  const kdy = (t) => (t ? new Date(t).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  const stav = (x) => x.stav === 'zruseno' ? ['zrušeno', 't-b'] : x.odstoupeno_at ? ['hosteska odstoupila od smlouvy ' + datum(x.odstoupeno_at), 't-b']
    : x.stav === 'k_podpisu' ? (x.vixen_podepsano_at ? ['čeká na podpis hostesky', 't-w'] : ['čeká na podpis Vixen', 't-r'])
    : !x.odeslano_at ? ['podepsáno – PDF neodešlo', 't-w']
    : new Date(x.odstoupeni_do) > new Date() ? ['uzavřeno · odstoupení možné do ' + datum(x.odstoupeni_do), 't-ok'] : ['uzavřeno', 't-ok'];
  const radek = (x) => { const [t, c] = stav(x); return `<div class="dok-r" data-id="${x.id}"><span>${esc(x.dokument_sablona?.nazev || 'Dokument')}<small>připraveno ${datum(x.vytvoreno)}
      · připravil(a): ${esc(kdoTxt(x.vytvoril, x.vytvoreno, o))}${x.vixen_podepsano_at ? ' · podepsal(a) za Vixen: ' + esc(x.vixen_podpis?.jmeno || '') + ' ' + kdy(x.vixen_podepsano_at) : ''}
      ${x.podepsano_at ? ' · podepsala hosteska: ' + kdy(x.podepsano_at) + (x.podpis?.zpusob ? ' (' + esc(x.podpis.zpusob) + ')' : '') : ''}
      ${x.odeslano_at ? ' · PDF poslala aplikace ' + kdy(x.odeslano_at) + ' na ' + esc(x.odeslano_na || '') : ''}</small>
      <span class="dok-akce">${x.stav === 'k_podpisu' && !x.vixen_podepsano_at ? (S.podpisuji ? '<button class="btn mini podp-v">Zkontrolovat a podepsat za Vixen</button>' : '<small class="no">Podepsat smí jen oprávněná osoba (Laďka, Linda).</small>') : ''}
      ${x.stav === 'podepsano' && x.vixen_podepsano_at && !x.odeslano_at && !x.odstoupeno_at ? '<button class="btn o mini posl">Odeslat PDF hostesce</button>' : ''}
      ${x.pdf_cesta ? '<a href="#" class="pdf">Stáhnout PDF</a>' : ''}</span></span><span class="tag ${c}">${t}</span><div class="m3"></div></div>`; };
  box.insertAdjacentHTML('beforeend', `${n ? `<dl><dt>E-mail pro smlouvy</dt><dd>${n.email_smlouvy ? esc(n.email_smlouvy) + (n.email_smlouvy_souhlas_at ? ' · souhlas ' + datum(n.email_smlouvy_souhlas_at) : '') : '<span class="no">chybí – hosteska ho doplní v Údajích</span>'}</dd></dl>` : ''}
    <h4>Dokumenty</h4>${(dok || []).map(radek).join('') || '<p class="mute">Žádné.</p>'}
    ${n?.potvrzeno_at && !(dok || []).some((x) => x.dokument_sablona?.druh === 'dpp' && x.stav !== 'zruseno' && !x.odstoupeno_at) ? '<button class="btn o mini" id="pripr-dpp">Připravit DPP k podpisu</button>' : ''}`);
  const pd = document.getElementById('pripr-dpp');
  if (pd) pd.onclick = async () => { pd.disabled = true; const { error } = await sb.rpc('dokument_priprav', { p_osoba: o.id, p_druh: 'dpp' }); if (error) { pd.disabled = false; return pd.insertAdjacentHTML('afterend', msg(esc(chyba(error)), 'bad')); } detailSmlouva(o); obnovStavDpp(o); };
  box.querySelectorAll('.dok-r').forEach((r) => {
    const x = (dok || []).find((d) => d.id === r.dataset.id), m3 = (t, typ) => (r.querySelector('.m3').innerHTML = msg(t, typ));
    const pv = r.querySelector('.podp-v');
    if (pv) pv.onclick = () => {
      r.querySelector('.m3').innerHTML = `<div class="podpis-v"><div class="doc">${esc(x.obsah || '')}</div>
        <label class="chk"><input type="checkbox" class="pv-ok"><span>Text a údaje mám zkontrolované a podepisuji smlouvu za zaměstnavatele jako <b>${esc(S.podpisuji.jmeno)}</b> – ${esc(S.podpisuji.opravneni)}.</span></label>
        <button class="btn g mini pv-go" disabled>Podepsat za Vixen</button> <button class="btn o mini pv-zrus">Zrušit</button></div>`;
      pv.disabled = true;
      r.querySelector('.pv-ok').onchange = (e) => (r.querySelector('.pv-go').disabled = !e.target.checked);
      r.querySelector('.pv-zrus').onclick = () => { r.querySelector('.m3').innerHTML = ''; pv.disabled = false; };
      r.querySelector('.pv-go').onclick = async (e) => { e.target.disabled = true;
        const { error } = await sb.rpc('podpis_vixen', { p_dokument: x.id, p_prohlizec: navigator.userAgent.slice(0, 200) });
        if (error) { e.target.disabled = false; return m3(esc(chyba(error)), 'bad'); }
        detailSmlouva(o); obnovStavDpp(o); };
    };
    const ps = r.querySelector('.posl');
    if (ps) ps.onclick = async () => { ps.disabled = true; m3('Připravuji PDF a posílám…', 'warn');
      const { data, error } = await sb.functions.invoke('smlouva-odeslat', { body: { dokument_id: x.id } });
      if (error || data?.chyba) { ps.disabled = false; return m3(esc(data?.chyba || chyba(error)), 'bad'); }
      detailSmlouva(o); obnovStavDpp(o); };
    const pf = r.querySelector('.pdf');
    if (pf) pf.onclick = async (e) => { e.preventDefault(); const { data, error } = await sb.storage.from('dokumenty').createSignedUrl(x.pdf_cesta, 120);
      if (error) return m3(esc(chyba(error)), 'bad'); window.open(data.signedUrl, '_blank'); };
  });
}
// po změně smlouvy v detailu obnovit stav DPP v přehledu (tečky, nástěnka)
async function obnovStavDpp(o) {
  const { data } = await sb.rpc('kancelar_lide');
  const s = (data || []).find((x) => x.osoba_id === o.id); if (!s) return;
  o.dpp = s.dpp_stav || ''; o.dpp_at = s.dpp_podepsano_at || null;
}

async function detailHistorie(o) {
  const box = document.getElementById('det-hist'); if (!box) return;
  const { data, error } = await sb.from('historie_zmen').select('tabulka,akce,kdy,pred').eq('zaznam_id', o.id).order('kdy', { ascending: false }).limit(20);
  if (error) { box.textContent = 'Historii se nepodařilo načíst.'; return; }
  const TAB = { osoba: 'registrace / stav', osoba_profil: 'profil', osoba_nastup: 'údaje pro smlouvu', osoba_kancelar: 'důvod / neoslovovat' };
  box.innerHTML = (data || []).length ? `<ul class="hist">${data.map((h) => `<li><b>${new Date(h.kdy).toLocaleString('cs-CZ')}</b> – ${esc(TAB[h.tabulka] || h.tabulka)}: ${h.akce === 'DELETE' ? 'smazáno' : 'změna'}${h.pred?.stav ? ` (dříve ${esc(STAV_O[h.pred.stav]?.[0] || h.pred.stav)})` : ''}</li>`).join('')}</ul>` : 'Zatím žádné změny.';
}

// ---------- detail dotazu ----------
async function vDetail(id) {
  const t = S.tikety.find((x) => x.id === id);
  const [{ data: zpr }, { data: pril }] = await Promise.all([
    sb.from('tiket_zprava').select('*').eq('tiket_id', id).order('vytvoreno'),
    sb.from('tiket_priloha').select('*').eq('tiket_id', id).order('vytvoreno'),
  ]);
  $app.innerHTML = `${await menu('dotazy')}<p><a href="#" id="zpet">← Zpět na dotazy</a></p>
   <h1>#${t.cislo} ${esc(t.predmet)}</h1>
   <p><span class="tag ${stavT(t.stav)[1]}">${stavT(t.stav)[0]}</span>${t.stav_zmenil ? ' ' + kdoZn(t.stav_zmenil, t.stav_zmeneno, null, 'stav nastavil(a): ') : ''} <span class="mute">${TYP[t.typ]}${t.spech ? ' · spěchá' : ''}</span></p>
   <div class="zpr"><small>${esc(t.autor_jmeno)} · ${kdy(t.vytvoreno)}</small><div style="white-space:pre-wrap">${esc(t.text)}</div></div>
   ${(pril || []).map((p) => `<p>📎 <a href="#" data-cesta="${esc(p.cesta)}">${esc(p.nazev)}</a></p>`).join('')}
   ${(zpr || []).map((z) => `<div class="zpr${/\(tbdb\)/i.test(z.autor_jmeno) ? ' tbdb' : ''}"><small>${esc(z.autor_jmeno)} · ${kdy(z.vytvoreno)}</small><div style="white-space:pre-wrap">${esc(z.text)}</div></div>`).join('')}
   <form id="f" class="card" novalidate>
    <div class="fld" data-f="text"><label for="text">Odpověď</label><textarea id="text" rows="3" placeholder="Napište nebo nadiktujte"></textarea>${mikrofon('text')}<div class="err"></div></div>
    ${S.tbdb ? `<div class="fld"><label for="stav">Stav (jen TBDB)</label><select id="stav">${Object.keys(STAV).map((k) => `<option value="${k}"${k === t.stav ? ' selected' : ''}>${stavT(k)[0]}</option>`).join('')}</select><div class="err"></div></div>` : ''}
    <button class="btn" type="submit">${S.tbdb ? 'Uložit' : 'Odeslat'}</button></form>`;
  document.getElementById('zpet').onclick = (e) => { e.preventDefault(); vUvod(); };
  zapniMenu(); zapniDiktovani();
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
    if (text) { const { error } = await sb.from('tiket_zprava').insert({ tiket_id: id, autor_jmeno: S.jmeno, text }); if (error) return chybaFormu(e.target, chyba(error)); upozorni(id, 'odpoved'); }
    if (S.tbdb && novyStav !== t.stav) { const { error } = await sb.from('tiket').update({ stav: novyStav }).eq('id', id); if (error) return chybaFormu(e.target, chyba(error)); }
    await nactiTikety(); vDetail(id);
  };
}

start().catch((e) => ($app.innerHTML = msg('Načtení se nepovedlo: ' + esc(chyba(e)), 'bad')));
})();
