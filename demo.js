// UKÁZKOVÝ REŽIM kanceláře (kancelar.html?demo=1) – bez přihlášení, jen pro testování.
// Nic se neposílá do databáze: odpovědi Supabase se napodobí v prohlížeči z vymyšlených dat.
// Změny platí jen do obnovení stránky. Skutečná data dál chrání přihlášení a pravidla RLS.
(function () {
if (!new URLSearchParams(location.search).has('demo')) return;
window.VIXEN_DEMO = true;
const CIS = {"kraj":[{"kod":"praha","nazev":"Hlavní město Praha"},{"kod":"stredocesky","nazev":"Středočeský"},{"kod":"jihocesky","nazev":"Jihočeský"},{"kod":"plzensky","nazev":"Plzeňský"},{"kod":"karlovarsky","nazev":"Karlovarský"},{"kod":"ustecky","nazev":"Ústecký"},{"kod":"liberecky","nazev":"Liberecký"},{"kod":"kralovehradecky","nazev":"Královéhradecký"},{"kod":"pardubicky","nazev":"Pardubický"},{"kod":"vysocina","nazev":"Vysočina"},{"kod":"jihomoravsky","nazev":"Jihomoravský"},{"kod":"olomoucky","nazev":"Olomoucký"},{"kod":"zlinsky","nazev":"Zlínský"},{"kod":"moravskoslezsky","nazev":"Moravskoslezský"}],"okres":[{"kod":"praha","mesto":"Praha","kraj_kod":"praha"},{"kod":"benesov","mesto":"Benešov","kraj_kod":"stredocesky"},{"kod":"beroun","mesto":"Beroun","kraj_kod":"stredocesky"},{"kod":"kladno","mesto":"Kladno","kraj_kod":"stredocesky"},{"kod":"kolin","mesto":"Kolín","kraj_kod":"stredocesky"},{"kod":"kutna-hora","mesto":"Kutná Hora","kraj_kod":"stredocesky"},{"kod":"melnik","mesto":"Mělník","kraj_kod":"stredocesky"},{"kod":"mlada-boleslav","mesto":"Mladá Boleslav","kraj_kod":"stredocesky"},{"kod":"nymburk","mesto":"Nymburk","kraj_kod":"stredocesky"},{"kod":"praha-vychod","mesto":"Praha-východ","kraj_kod":"stredocesky"},{"kod":"praha-zapad","mesto":"Praha-západ","kraj_kod":"stredocesky"},{"kod":"pribram","mesto":"Příbram","kraj_kod":"stredocesky"},{"kod":"rakovnik","mesto":"Rakovník","kraj_kod":"stredocesky"},{"kod":"ceske-budejovice","mesto":"České Budějovice","kraj_kod":"jihocesky"},{"kod":"cesky-krumlov","mesto":"Český Krumlov","kraj_kod":"jihocesky"},{"kod":"jindrichuv-hradec","mesto":"Jindřichův Hradec","kraj_kod":"jihocesky"},{"kod":"pisek","mesto":"Písek","kraj_kod":"jihocesky"},{"kod":"prachatice","mesto":"Prachatice","kraj_kod":"jihocesky"},{"kod":"strakonice","mesto":"Strakonice","kraj_kod":"jihocesky"},{"kod":"tabor","mesto":"Tábor","kraj_kod":"jihocesky"},{"kod":"domazlice","mesto":"Domažlice","kraj_kod":"plzensky"},{"kod":"klatovy","mesto":"Klatovy","kraj_kod":"plzensky"},{"kod":"plzen-mesto","mesto":"Plzeň","kraj_kod":"plzensky"},{"kod":"plzen-jih","mesto":"Plzeň-jih","kraj_kod":"plzensky"},{"kod":"plzen-sever","mesto":"Plzeň-sever","kraj_kod":"plzensky"},{"kod":"rokycany","mesto":"Rokycany","kraj_kod":"plzensky"},{"kod":"tachov","mesto":"Tachov","kraj_kod":"plzensky"},{"kod":"cheb","mesto":"Cheb","kraj_kod":"karlovarsky"},{"kod":"karlovy-vary","mesto":"Karlovy Vary","kraj_kod":"karlovarsky"},{"kod":"sokolov","mesto":"Sokolov","kraj_kod":"karlovarsky"},{"kod":"decin","mesto":"Děčín","kraj_kod":"ustecky"},{"kod":"chomutov","mesto":"Chomutov","kraj_kod":"ustecky"},{"kod":"litomerice","mesto":"Litoměřice","kraj_kod":"ustecky"},{"kod":"louny","mesto":"Louny","kraj_kod":"ustecky"},{"kod":"most","mesto":"Most","kraj_kod":"ustecky"},{"kod":"teplice","mesto":"Teplice","kraj_kod":"ustecky"},{"kod":"usti-nad-labem","mesto":"Ústí nad Labem","kraj_kod":"ustecky"},{"kod":"ceska-lipa","mesto":"Česká Lípa","kraj_kod":"liberecky"},{"kod":"jablonec-nad-nisou","mesto":"Jablonec nad Nisou","kraj_kod":"liberecky"},{"kod":"liberec","mesto":"Liberec","kraj_kod":"liberecky"},{"kod":"semily","mesto":"Semily","kraj_kod":"liberecky"},{"kod":"hradec-kralove","mesto":"Hradec Králové","kraj_kod":"kralovehradecky"},{"kod":"jicin","mesto":"Jičín","kraj_kod":"kralovehradecky"},{"kod":"nachod","mesto":"Náchod","kraj_kod":"kralovehradecky"},{"kod":"rychnov-nad-kneznou","mesto":"Rychnov nad Kněžnou","kraj_kod":"kralovehradecky"},{"kod":"trutnov","mesto":"Trutnov","kraj_kod":"kralovehradecky"},{"kod":"chrudim","mesto":"Chrudim","kraj_kod":"pardubicky"},{"kod":"pardubice","mesto":"Pardubice","kraj_kod":"pardubicky"},{"kod":"svitavy","mesto":"Svitavy","kraj_kod":"pardubicky"},{"kod":"usti-nad-orlici","mesto":"Ústí nad Orlicí","kraj_kod":"pardubicky"},{"kod":"havlickuv-brod","mesto":"Havlíčkův Brod","kraj_kod":"vysocina"},{"kod":"jihlava","mesto":"Jihlava","kraj_kod":"vysocina"},{"kod":"pelhrimov","mesto":"Pelhřimov","kraj_kod":"vysocina"},{"kod":"trebic","mesto":"Třebíč","kraj_kod":"vysocina"},{"kod":"zdar-nad-sazavou","mesto":"Žďár nad Sázavou","kraj_kod":"vysocina"},{"kod":"blansko","mesto":"Blansko","kraj_kod":"jihomoravsky"},{"kod":"brno-mesto","mesto":"Brno","kraj_kod":"jihomoravsky"},{"kod":"brno-venkov","mesto":"Brno-venkov","kraj_kod":"jihomoravsky"},{"kod":"breclav","mesto":"Břeclav","kraj_kod":"jihomoravsky"},{"kod":"hodonin","mesto":"Hodonín","kraj_kod":"jihomoravsky"},{"kod":"vyskov","mesto":"Vyškov","kraj_kod":"jihomoravsky"},{"kod":"znojmo","mesto":"Znojmo","kraj_kod":"jihomoravsky"},{"kod":"jesenik","mesto":"Jeseník","kraj_kod":"olomoucky"},{"kod":"olomouc","mesto":"Olomouc","kraj_kod":"olomoucky"},{"kod":"prostejov","mesto":"Prostějov","kraj_kod":"olomoucky"},{"kod":"prerov","mesto":"Přerov","kraj_kod":"olomoucky"},{"kod":"sumperk","mesto":"Šumperk","kraj_kod":"olomoucky"},{"kod":"kromeriz","mesto":"Kroměříž","kraj_kod":"zlinsky"},{"kod":"uherske-hradiste","mesto":"Uherské Hradiště","kraj_kod":"zlinsky"},{"kod":"vsetin","mesto":"Vsetín","kraj_kod":"zlinsky"},{"kod":"zlin","mesto":"Zlín","kraj_kod":"zlinsky"},{"kod":"bruntal","mesto":"Bruntál","kraj_kod":"moravskoslezsky"},{"kod":"frydek-mistek","mesto":"Frýdek-Místek","kraj_kod":"moravskoslezsky"},{"kod":"karvina","mesto":"Karviná","kraj_kod":"moravskoslezsky"},{"kod":"novy-jicin","mesto":"Nový Jičín","kraj_kod":"moravskoslezsky"},{"kod":"opava","mesto":"Opava","kraj_kod":"moravskoslezsky"},{"kod":"ostrava-mesto","mesto":"Ostrava","kraj_kod":"moravskoslezsky"}],"zdravotni_pojistovna":[{"kod":"111","nazev":"Všeobecná zdravotní pojišťovna ČR"},{"kod":"201","nazev":"Vojenská zdravotní pojišťovna ČR"},{"kod":"205","nazev":"Česká průmyslová zdravotní pojišťovna"},{"kod":"207","nazev":"Oborová zdravotní pojišťovna"},{"kod":"209","nazev":"Zaměstnanecká pojišťovna Škoda"},{"kod":"211","nazev":"Zdravotní pojišťovna ministerstva vnitra ČR"},{"kod":"213","nazev":"RBP, zdravotní pojišťovna"}]};
const C = window.VIXEN_CONFIG;
// ---------- vymyšlená data ----------
let s = 20261012; const nah = (n) => { s = (s * 1103515245 + 12345) % 2147483648; return Math.floor((s / 2147483648) * n); };
const vyber = (a) => a[nah(a.length)];
const ZJ = ['Tereza','Jana','Lucie','Kateřina','Eliška','Anna','Klára','Natálie','Adéla','Barbora','Veronika','Kristýna','Michaela','Nikola','Simona','Markéta','Petra','Lenka','Denisa','Aneta','Karolína','Sára','Vendula','Zuzana','Monika','Hana','Pavla','Gabriela','Viktorie','Ivana','Dominika','Šárka','Alena','Romana','Nela','Ema','Julie','Sabina'];
const ZP = ['Nováková','Svobodová','Novotná','Dvořáková','Černá','Procházková','Kučerová','Veselá','Horáková','Němcová','Marková','Pokorná','Pospíšilová','Hájková','Králová','Jelínková','Růžičková','Benešová','Fialová','Sedláčková','Doležalová','Zemanová','Kolářová','Navrátilová','Čermáková','Vaňková','Urbanová','Malá','Šimková','Bartošová','Vlčková','Holubová','Musilová','Tichá'];
const MJ = ['Martin','Jakub','Petr','Ondřej','Tomáš','Lukáš','David','Filip','Adam','Matěj'];
const MP = ['Novák','Svoboda','Dvořák','Černý','Procházka','Kučera','Veselý','Horák','Marek','Pokorný'];
const MESTA = [['České Budějovice','37001','ceske-budejovice',4],['Písek','39701','pisek',2],['Tábor','39001','tabor',2],['Strakonice','38601','strakonice',1],['Jindřichův Hradec','37701','jindrichuv-hradec',1],['Český Krumlov','38101','cesky-krumlov',1],['Praha','11000','praha',4],['Brno','60200','brno-mesto',2],['Plzeň','30100','plzen-mesto',1],['Jihlava','58601','jihlava',1],['Ostrava','70200','ostrava-mesto',1],['Olomouc','77900','olomouc',1],['Hradec Králové','50002','hradec-kralove',1],['Liberec','46001','liberec',1],['Kladno','27201','kladno',1]].flatMap((m) => Array(m[3]).fill(m));
const JAZ = [['angličtina'], ['angličtina', 'němčina'], ['angličtina'], ['němčina'], ['angličtina', 'španělština'], ['angličtina', 'francouzština'], []];
const ZKUS = ['Veletrhy a výstavy v Praze a Brně.', 'Ochutnávky v obchodních centrech.', 'Firemní akce, recepce, šatna.', 'Promo akce pro nápoje.', 'Zatím bez zkušeností, ráda se naučím.', 'Hosteska na koncertech a festivalech.', 'Konference – registrace hostů.'];
const DOST = ['víkendy', 'všední dny po 15:00', 'kdykoli', 'víkendy a svátky', 'jen o prázdninách', 'večery a víkendy'];
const POZN = ['Spolehlivá, chodí včas.', 'Výborná na registraci hostů.', 'Mluví plynně německy.', 'Preferuje akce v ČB.', 'Doporučila ji Petra.', 'Vhodná na veletrhy.', 'Jen víkendy – studuje.'];
const SOUSED = { jihocesky: 'praha', praha: 'stredocesky', jihomoravsky: 'vysocina' };
const ascii = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const rcVyrob = (d, zena) => { const b = String(d.getFullYear() % 100).padStart(2, '0') + String(d.getMonth() + 1 + (zena ? 50 : 0)).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  for (;;) { const x = b + String(nah(1000)).padStart(3, '0'); const c = Number(BigInt(x) % 11n); if (c < 10) return x + c; } };
const ucetVyrob = () => { const w = [6, 3, 7, 9, 10, 5, 8, 4, 2, 1]; for (;;) { const d = Array.from({ length: 10 }, (_, i) => (i < 2 ? 0 : nah(10))); d[2] = 1 + nah(9); if (d.reduce((a, v, i) => a + v * w[i], 0) % 11 === 0) return d.join('').replace(/^0+/, ''); } };
const iso = (d) => d.toISOString();
const DEN = 86400000, TED = Date.now();
const db = { foto: {}, osoba: [], okres: {}, profil: {}, nastup: {}, dok: {}, pozn: {}, hist: [], tiket: [], zprava: [], kanc: {}, zpravyH: [] };
const stavy = [...Array(12).fill('uchazec'), ...Array(70).fill('aktivni'), ...Array(20).fill('prijata'), ...Array(10).fill('neaktivni')];
stavy.forEach((stav, i) => {
  const muz = nah(100) < 13, jm = muz ? vyber(MJ) : vyber(ZJ), pr = muz ? vyber(MP) : vyber(ZP), m = vyber(MESTA);
  const kraj = CIS.okres.find((o) => o.kod === m[2]).kraj_kod, id = 'demo-' + i;
  const vytv = new Date(TED - (stav === 'uchazec' ? nah(12 * 24) * 3600000 : (20 + nah(680)) * DEN));
  db.osoba.push({ id, auth_user_id: null, jmeno: jm, prijmeni: pr, telefon: '+420' + (6 + nah(2)) + (1 + nah(9)) + String(nah(1e7)).padStart(7, '0'), email: `${ascii(jm)}.${ascii(pr)}.${i + 1}@example.cz`,
    kraj_kod: kraj, obec: m[0], zajem: muz ? ['promoter'] : nah(4) ? ['hosteska'] : ['hosteska', 'promoter'], kanal_kontaktu: vyber([['email', 'sms'], ['email', 'sms', 'whatsapp'], ['email', 'whatsapp'], ['sms', 'whatsapp'], ['email']]),
    stav, souhlas_gdpr_v: '2026-dev', souhlas_gdpr_at: iso(vytv), vytvoreno: iso(vytv), zmeneno: iso(vytv) });
  const ok = CIS.okres.filter((o) => (o.kraj_kod === kraj && (nah(10) < 6 || o.kod === m[2])) || (o.kraj_kod === (SOUSED[kraj] || 'praha') && nah(10) < 3)).map((o) => o.kod);
  db.okres[id] = ok.length ? ok : [m[2]];
  db.foto[id] = nah(100) < 82 ? Array.from({ length: 1 + nah(3) }, (_, k) => `demo/${id}-${k + 1}-${muz ? 'm' : 'z'}.jpg`) : [];
  if (stav === 'uchazec') return;
  if (nah(100) < 15) db.pozn[id] = vyber(POZN);
  if (nah(100) > 85) return;
  db.profil[id] = { osoba_id: id, vyska_cm: muz ? 168 + nah(23) : 158 + nah(25), konfekce: muz ? vyber(['S', 'M', 'M', 'L', 'XL']) : vyber(['XS', 'S', 'S', 'M', 'M', 'L']), bota_eu: muz ? 41 + nah(6) : 36 + nah(6),
    jazyky: vyber(JAZ), zkusenosti: vyber(ZKUS), ridicak: nah(100) < 55, vlastni_auto: nah(100) < 30, dostupnost: vyber(DOST) };
  if (nah(100) > 70) return;
  const nar = new Date(1994 + nah(14), nah(12), 1 + nah(28));
  db.nastup[id] = { osoba_id: id, rodne_cislo: rcVyrob(nar, !muz), datum_narozeni: iso(nar).slice(0, 10), rodne_prijmeni: pr, misto_narozeni: m[0], obcanstvi: 'CZ', danova_rezidence: 'CZ',
    ulice: vyber(['Nádražní', 'Husova', 'Lannova', 'Pražská', 'Žižkova', 'Riegrova']), cislo_popisne: String(1 + nah(2400)), obec: m[0], psc: m[1], stat_bydliste: 'CZ',
    zdravotni_pojistovna: vyber(['111', '111', '201', '205', '207', '211']), ucet_predcisli: null, ucet_cislo: ucetVyrob(), ucet_banka: vyber(['0100', '0300', '0800', '2010', '3030', '5500']), potvrzeno_at: iso(new Date(+vytv + 5 * DEN)) };
  db.nastup[id].email_smlouvy = (db.osoba.find((x) => x.id === id) || {}).email || null; db.nastup[id].email_smlouvy_souhlas_at = db.nastup[id].potvrzeno_at;
  const r = nah(100), VIX = (t) => ({ vixen_podepsano_at: t, vixen_podpis: { jmeno: 'Ladislava Lišková', opravneni: 'zaměstnavatel (OSVČ)', zpusob: 'ukázka' } });
  const obsah = 'DOHODA O PROVEDENÍ PRÁCE\nUKÁZKOVÝ TEXT – vzor dodá Vixen\n\nZaměstnavatel: Ladislava Lišková – Vixen\nZaměstnanec: ' + jm + ' ' + pr + '\n\n[Předmět, rozsah, odměna – DOPLNIT podle vzoru Vixen]';
  const sabl = { nazev: 'Dohoda o provedení práce (zkušební text)', druh: 'dpp' };
  if (r < 80) { const pod = new Date(r < 8 ? TED - nah(5) * DEN - 3600000 : +vytv + 6 * DEN + 7200000), ode = new Date(+pod + 60000);
    db.dok[id] = [{ id: 'dd-' + i, stav: 'podepsano', obsah, vytvoreno: iso(new Date(+pod - 7200000)), ...VIX(iso(new Date(+pod - 3600000))), podepsano_at: iso(pod), podpis: { zpusob: 'kód e-mailem' },
      odeslano_at: iso(ode), odeslano_na: db.nastup[id].email_smlouvy, odstoupeni_do: iso(new Date(+ode + 7 * DEN)), odstoupeno_at: null, pdf_cesta: null, dokument_sablona: sabl }]; }
  else if (r < 90) db.dok[id] = [{ id: 'dd-' + i, stav: 'k_podpisu', obsah, vytvoreno: iso(new Date(TED - 2 * DEN)), ...(r < 85 ? VIX(iso(new Date(TED - DEN))) : {}), podepsano_at: null, podpis: null, dokument_sablona: sabl }];
});
db.tiket.push({ id: 'tk1', cislo: 1, typ: 'dotaz', predmet: 'Ukázkový dotaz pro TBDB', text: 'Takhle vypadá dotaz kanceláře. V ukázce se nic neodesílá.', spech: false, stav: 'resime', autor_jmeno: 'Laďka', vytvoreno: iso(new Date(TED - DEN)), zmeneno: iso(new Date(TED - DEN)) });

// ilustrační „fotky“ (vymyšlené postavy, žádné skutečné osoby) – SVG podle cesty
window.VIXEN_DEMO_FOTO = (cesta) => {
  let h = 0; for (const c of cesta) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const pozadi = ['#e9dcc4', '#d9e4ea', '#e7d6dc', '#dde6d5', '#e4dfee', '#f0e2cf'][h % 6], kuze = ['#f1c9a5', '#e0ac85', '#c98e66', '#f5d6bd'][(h >>> 3) % 4];
  const vlasy = ['#3b2a1e', '#6b4a2b', '#b07a3b', '#d9b26a', '#1f1a17', '#8a3b25'][(h >>> 5) % 6], obleceni = ['#23201b', '#ac9455', '#2f6f8f', '#7b2d42', '#3d7a4f'][(h >>> 7) % 5];
  const muz = cesta.includes('-m.'), dlouhe = !muz && (h >>> 9) % 3 !== 0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 156"><rect width="120" height="156" fill="${pozadi}"/>
    ${dlouhe ? `<path d="M30 70 Q28 30 60 26 Q92 30 90 70 L94 118 L26 118 Z" fill="${vlasy}"/>` : ''}
    <path d="M18 156 Q20 112 60 108 Q100 112 102 156 Z" fill="${obleceni}"/><rect x="51" y="86" width="18" height="24" rx="6" fill="${kuze}"/>
    <ellipse cx="60" cy="66" rx="24" ry="28" fill="${kuze}"/>
    <path d="M35 62 Q36 36 60 35 Q85 36 85 62 Q78 46 60 46 Q43 46 35 62 Z" fill="${vlasy}"/>
    <circle cx="51" cy="68" r="2.4" fill="#3a2b22"/><circle cx="69" cy="68" r="2.4" fill="#3a2b22"/><path d="M53 80 Q60 85 67 80" stroke="#9a5a45" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
};
// ---------- napodobené Supabase ----------
const USER = { id: 'demo-user', email: 'ukazka@example.cz', aud: 'authenticated', role: 'authenticated', user_metadata: { jmeno: 'Ukázka' }, app_metadata: { provider: 'email' } };
const KLIC = 'vixen-demo-auth';
const exp = Math.floor(TED / 1000) + 86400;
try { sessionStorage.setItem(KLIC, JSON.stringify({ access_token: 'demo.demo.demo', token_type: 'bearer', expires_in: 86400, expires_at: exp, refresh_token: 'demo', user: USER })); } catch {}
window.VIXEN_DEMO_AUTH = { storageKey: KLIC, storage: window.sessionStorage, autoRefreshToken: false, detectSessionInUrl: false };
const odpoved = (d, status = 200, h = {}) => new Response(d === undefined || status === 204 ? null : JSON.stringify(d), { status, headers: { 'content-type': 'application/json', ...h } });
const hodnota = (q, k) => { const v = q.get(k); return v == null ? null : v.replace(/^(eq|in)\./, '').replace(/^\(|\)$/g, ''); };
const zaznamZmeny = (id, pred) => db.hist.unshift({ tabulka: 'osoba', zaznam_id: id, akce: 'UPDATE', kdy: new Date().toISOString(), pred });
const osobaPlna = (o) => ({ ...o, osoba_foto: (db.foto[o.id] || []).map((cesta, i) => ({ cesta, poradi: i + 1 })), osoba_okres: db.okres[o.id].map((okres_kod) => ({ okres_kod })), osoba_profil: db.profil[o.id] || null, osoba_poznamka: db.pozn[o.id] ? { text: db.pozn[o.id] } : null, osoba_kancelar: db.kanc[o.id] || null });
const dppStav = (d) => !d ? null : d.odstoupeno_at ? 'odstoupeno' : d.stav === 'k_podpisu' ? (d.vixen_podepsano_at ? 'ceka_hosteska' : 'ceka_vixen')
  : !d.odeslano_at ? 'neodeslano' : new Date(d.odstoupeni_do) > new Date() ? 'lhuta' : 'uzavreno';
const puvodniFetch = window.fetch.bind(window);
window.fetch = async (vstup, init = {}) => {
  const url = new URL(typeof vstup === 'string' ? vstup : vstup.url, location.href);
  if (!url.href.startsWith(C.url)) return puvodniFetch(vstup, init);
  const p = url.pathname, q = url.searchParams, m = (init.method || 'GET').toUpperCase();
  let body = null; try { body = init.body ? JSON.parse(init.body) : null; } catch {}
  await new Promise((r) => setTimeout(r, 60));
  if (p.startsWith('/auth/v1/user')) return odpoved(USER);
  if (p.startsWith('/auth/v1/logout')) return odpoved(undefined, 204);
  if (p.startsWith('/auth/v1/')) return odpoved({ access_token: 'demo.demo.demo', token_type: 'bearer', expires_in: 86400, expires_at: exp, refresh_token: 'demo', user: USER });
  if (p.endsWith('/rpc/ma_pravo')) return odpoved(['vedeni', 'nabor', 'smlouvy', 'ucetni'].includes(body.p));
  if (p.endsWith('/rpc/kancelar_lide')) return odpoved(db.osoba.map((o) => { const n = db.nastup[o.id], d = (db.dok[o.id] || []).find((x) => x.stav !== 'zruseno');
    return { osoba_id: o.id, ma_profil: !!db.profil[o.id], udaje_hotove: !!n?.potvrzeno_at, vek: n ? Math.floor((TED - new Date(n.datum_narozeni)) / (365.25 * DEN)) : null, dpp_stav: dppStav(d), dpp_podepsano_at: d?.podepsano_at || null }; }));
  if (p.endsWith('/rpc/podpis_vixen')) { const d = Object.values(db.dok).flat().find((x) => x.id === body.p_dokument); if (!d || d.vixen_podepsano_at) return odpoved({ message: 'Dokument není k podpisu.' }, 400);
    Object.assign(d, { vixen_podepsano_at: new Date().toISOString(), vixen_podpis: { jmeno: 'Ladislava Lišková (ukázka)', opravneni: 'zaměstnavatel (OSVČ)', zpusob: 'ukázka' } }); return odpoved(d.vixen_podepsano_at); }
  if (p.endsWith('/functions/v1/smlouva-odeslat')) { const d = Object.values(db.dok).flat().find((x) => x.id === body.dokument_id);
    if (!d || d.stav !== 'podepsano') return odpoved({ chyba: 'Smlouva ještě není podepsaná oběma stranami.' });
    Object.assign(d, { odeslano_at: new Date().toISOString(), odeslano_na: 'UKÁZKA – neodesláno', odstoupeni_do: new Date(Date.now() + 7 * DEN).toISOString() }); return odpoved({ odeslano: true, na: 'ukázka' }); }
  if (p.endsWith('/rest/v1/podpisujici')) return odpoved({ jmeno: 'Ladislava Lišková (ukázka)', opravneni: 'zaměstnavatel (OSVČ)', do_: null });
  if (p.endsWith('/rpc/dokument_priprav')) { const id = body.p_osoba; db.dok[id] = [{ id: 'dd-n' + Date.now(), stav: 'k_podpisu', obsah: 'DOHODA O PROVEDENÍ PRÁCE\nUKÁZKOVÝ TEXT – vzor dodá Vixen', vytvoreno: new Date().toISOString(), podepsano_at: null, podpis: null, dokument_sablona: { nazev: 'Dohoda o provedení práce (zkušební text)', druh: 'dpp' } }, ...(db.dok[id] || [])]; return odpoved('nove'); }
  if (p.endsWith('/rpc/zmen_stav')) {
    if (['odmitnuta', 'neaktivni'].includes(body.p_stav) && !body.p_duvod) return odpoved({ message: 'Vyberte důvod (odmítnutí / vyřazení).' }, 400);
    db.osoba.filter((o) => body.p_osoby.includes(o.id)).forEach((o) => { if (o.stav !== body.p_stav) { zaznamZmeny(o.id, { stav: o.stav }); o.stav = body.p_stav; }
      const k = db.kanc[o.id] || { neoslovovat: false }; db.kanc[o.id] = { duvod_vyrazeni: ['odmitnuta', 'neaktivni'].includes(body.p_stav) ? body.p_duvod : null, neoslovovat: body.p_neoslovovat ?? k.neoslovovat }; });
    return odpoved(body.p_osoby.length);
  }
  if (p.endsWith('/rpc/kancelar_uprav_osobu')) { const o = db.osoba.find((x) => x.id === body.p_id);
    if (db.osoba.some((x) => x.id !== o.id && x.telefon === body.p_osoba.telefon)) return odpoved({ message: 'Tento telefon už má v evidenci někdo jiný.' }, 400);
    zaznamZmeny(o.id, { ...o }); Object.assign(o, body.p_osoba); db.okres[o.id] = body.p_okresy;
    if (body.p_profil) db.profil[o.id] = { ...(db.profil[o.id] || {}), osoba_id: o.id, ...body.p_profil, vyska_cm: body.p_profil.vyska_cm ? +body.p_profil.vyska_cm : null, bota_eu: body.p_profil.bota_eu ? +body.p_profil.bota_eu : null };
    return odpoved(null); }
  if (p.endsWith('/functions/v1/hosteska-zprava')) {
    const vysledky = body.osoba_ids.map((id) => { const o = db.osoba.find((x) => x.id === id), k = db.kanc[id] || {};
      const v = k.neoslovovat ? ['vynechano', 'neoslovovat'] : !['prijata', 'aktivni'].includes(o.stav) ? ['vynechano', 'není přijatá ani aktivní'] : ['vyvoj_neodeslano', 'ukázka – nic se neposílá'];
      if (v[0] !== 'vynechano') db.zpravyH.unshift({ osoba_id: id, typ: body.typ === 'schvaleno' ? 'schvaleno' : !db.profil[id] ? 'pripominka_profil' : 'pripominka_udaje', vysledek: v[0], chyba: v[1], vytvoreno: new Date().toISOString() });
      return { osoba_id: id, vysledek: v[0], zprava: v[1] }; });
    const n = (x) => vysledky.filter((v) => v.vysledek === x).length;
    return odpoved({ vysledky, odeslano: 0, vyvoj: n('vyvoj_neodeslano'), vynechano: n('vynechano'), chyby: 0 });
  }
  if (p.endsWith('/rest/v1/osoba_zprava')) return odpoved(db.zpravyH.filter((z) => z.osoba_id === hodnota(q, 'osoba_id')));
  for (const t of ['kraj', 'okres', 'zdravotni_pojistovna']) if (p.endsWith('/rest/v1/' + t)) return odpoved(CIS[t]);
  if (p.endsWith('/rest/v1/osoba')) {
    const stav = hodnota(q, 'stav'), ids = hodnota(q, 'id');
    let l = db.osoba; if (stav) l = l.filter((o) => stav.split(',').includes(o.stav)); if (ids) l = l.filter((o) => ids.split(',').includes(o.id));
    if (m === 'HEAD') return new Response(null, { status: 200, headers: { 'content-range': '*/' + l.length } });
    if (m === 'PATCH') { l.forEach((o) => { zaznamZmeny(o.id, { stav: o.stav }); Object.assign(o, body, { zmeneno: new Date().toISOString() }); }); return odpoved(undefined, 204); }
    const serazene = [...l].sort((a, b) => (a.vytvoreno < b.vytvoreno ? 1 : -1));
    return odpoved(serazene.map(osobaPlna));
  }
  if (p.endsWith('/rest/v1/osoba_poznamka')) { if (m === 'POST') db.pozn[body.osoba_id] = body.text; if (m === 'DELETE') delete db.pozn[hodnota(q, 'osoba_id')]; return odpoved(undefined, m === 'POST' ? 201 : 204); }
  if (p.endsWith('/rest/v1/osoba_nastup')) return odpoved(db.nastup[hodnota(q, 'osoba_id')] || null);
  if (p.endsWith('/rest/v1/dokument')) return odpoved(db.dok[hodnota(q, 'osoba_id')] || []);
  if (p.endsWith('/rest/v1/historie_zmen')) return odpoved(db.hist.filter((h) => h.zaznam_id === hodnota(q, 'zaznam_id')));
  if (p.endsWith('/rest/v1/tiket')) {
    if (m === 'POST') { const t = { id: 'tk' + (db.tiket.length + 1), cislo: db.tiket.length + 1, stav: 'novy', vytvoreno: new Date().toISOString(), zmeneno: new Date().toISOString(), ...body }; db.tiket.unshift(t); return odpoved(t, 201); }
    if (m === 'PATCH') { const t = db.tiket.find((x) => x.id === hodnota(q, 'id')); if (t) Object.assign(t, body); return odpoved(undefined, 204); }
    return odpoved(db.tiket);
  }
  if (p.endsWith('/rest/v1/tiket_zprava')) { if (m === 'POST') { db.zprava.push({ ...body, id: 'z' + db.zprava.length, vytvoreno: new Date().toISOString() }); return odpoved(undefined, 201); } return odpoved(db.zprava.filter((z) => z.tiket_id === hodnota(q, 'tiket_id'))); }
  if (p.endsWith('/rest/v1/tiket_priloha')) return odpoved(m === 'POST' ? undefined : [], m === 'POST' ? 201 : 200);
  if (p.includes('/storage/v1/')) return odpoved({ Key: 'ukazka', signedURL: '#' });
  return odpoved({ message: 'V ukázce není k dispozici.' }, 404);
};
document.addEventListener('DOMContentLoaded', () => {
  const env = document.getElementById('env'); env.classList.remove('hidden');
  env.textContent = 'UKÁZKA bez přihlášení – vymyšlená data, nic se neukládá (po obnovení stránky se vše vrátí)';
  env.style.cssText = 'background:#e8f0fb;color:#1f4f8a;font-weight:600';
});
})();
