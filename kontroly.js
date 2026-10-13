(function () {
// Kontroly údajů v prohlížeči – stejná pravidla jako v databázi (migrace 0100).
// Prohlížeč chybu ukáže hned u pole; databáze ji stejně odmítne, kdyby se kontrola obešla.

const cisla = (s) => String(s ?? '').replace(/[^0-9]/g, '');

function rcDatum(rc) {
  const s = cisla(rc);
  if (s.length !== 9 && s.length !== 10) return null;
  const yy = +s.slice(0, 2); let mm = +s.slice(2, 4); const dd = +s.slice(4, 6);
  const rok = s.length === 9 ? 1900 + yy : (yy < 54 ? 2000 + yy : 1900 + yy);
  if (mm > 70) mm -= 70; else if (mm > 50) mm -= 50; else if (mm > 20) mm -= 20;
  if (mm < 1 || mm > 12) return null;
  const d = new Date(Date.UTC(rok, mm - 1, dd));
  if (d.getUTCFullYear() !== rok || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return null;
  return d;
}

function rcChyba(rc) {
  const s = cisla(rc);
  if (!s) return 'Vyplňte rodné číslo.';
  if (s.length !== 9 && s.length !== 10) return 'Rodné číslo má 9 nebo 10 číslic.';
  if (s.length === 9 && +s.slice(0, 2) >= 54) return 'Devítimístné rodné číslo mají jen lidé narození do roku 1953.';
  const d = rcDatum(s);
  if (!d) return 'Rodné číslo neobsahuje platné datum narození – zkontrolujte první číslice.';
  const mm = +s.slice(2, 4);
  if (((mm >= 21 && mm <= 32) || (mm >= 71 && mm <= 82)) && d < new Date(Date.UTC(2004, 0, 1)))
    return 'Rodné číslo nesedí – zkontrolujte číslice.';
  if (s.length === 10) {
    const ok = BigInt(s) % 11n === 0n || (BigInt(s.slice(0, 9)) % 11n === 10n && s[9] === '0');
    if (!ok) return 'Rodné číslo nesedí – zkontrolujte číslice (překlep?).';
  }
  return '';
}

const VAHY = [6, 3, 7, 9, 10, 5, 8, 4, 2, 1];
function castUctuOk(p) {
  if (!p) return true;
  if (!/^[0-9]{1,10}$/.test(p)) return false;
  const s = p.padStart(10, '0');
  return [...s].reduce((a, c, i) => a + (+c) * VAHY[i], 0) % 11 === 0;
}
function ucetChyba(predcisli, cislo, banka) {
  predcisli = cisla(predcisli); cislo = cisla(cislo);
  if (!cislo) return 'Vyplňte číslo účtu.';
  if (predcisli.length > 6) return 'Předčíslí má nejvýš 6 číslic.';
  if (cislo.length < 2 || cislo.length > 10) return 'Číslo účtu má 2–10 číslic.';
  if (!/^[0-9]{4}$/.test(banka || '')) return 'Vyberte kód banky (4 číslice).';
  if (!castUctuOk(predcisli)) return 'Předčíslí nesedí – zkontrolujte číslice.';
  if (!castUctuOk(cislo)) return 'Číslo účtu nesedí – zkontrolujte číslice (překlep?).';
  return '';
}

const pscChyba = (p) => /^[1-7][0-9]{4}$/.test(String(p || '').replace(/\s/g, '')) ? '' : 'PSČ má 5 číslic (např. 370 01).';

function telefonNormalizuj(p) {
  const s = String(p || '').replace(/[^0-9+]/g, '');
  if (/^[0-9]{9}$/.test(s)) return '+420' + s;
  if (/^00[0-9]{9,15}$/.test(s)) return '+' + s.slice(2);
  return s;
}
const telefonChyba = (p) => /^\+[0-9]{11,15}$/.test(telefonNormalizuj(p)) ? '' : 'Telefon zadejte jako 777 123 456 nebo s předvolbou +420…';
const emailChyba = (p) => /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(String(p || '').trim()) ? '' : 'Zkontrolujte e-mail (např. jana@seznam.cz).';
const povinne = (v, co) => String(v ?? '').trim() ? '' : `Vyplňte ${co}.`;

const datumCz = (d) => d ? `${d.getUTCDate()}. ${d.getUTCMonth() + 1}. ${d.getUTCFullYear()}` : '';
const datumIso = (d) => d ? d.toISOString().slice(0, 10) : null;

// 5. pád (oslovení) českých křestních jmen – pravidla podle koncovky + výjimky.
// Neznámé nebo cizí jméno se nechá beze změny (bezpečnější než špatný tvar).
const VOK_VYJIMKY = {
  pavel: 'Pavle', karel: 'Karle', marek: 'Marku', petr: 'Petře', alexandr: 'Alexandře', daniel: 'Danieli', michael: 'Michaeli',
  samuel: 'Samueli', emanuel: 'Emanueli', rafael: 'Rafaeli', gabriel: 'Gabrieli', izák: 'Izáku', bohumil: 'Bohumile', vít: 'Víte',
  lev: 'Lve', ota: 'Oto', jiří: 'Jiří', lukáš: 'Lukáši', tomáš: 'Tomáši', ondřej: 'Ondřeji', matěj: 'Matěji', kryštof: 'Kryštofe',
};
const VOK_ZENY_NA_SOUHLASKU = new Set(['dagmar', 'ester', 'miriam', 'ingrid', 'karin', 'carmen', 'nikol', 'elen', 'ellen', 'kim', 'sarah', 'ruth', 'judit', 'rut', 'ivet', 'mariam', 'jasmin', 'lilian', 'vivien', 'noemi', 'sofi', 'emily', 'ashley']);
function vokativ(jmeno) {
  const j = String(jmeno || '').trim();
  if (!j || /\s/.test(j) || !/^[A-Za-zÀ-ž'-]+$/.test(j)) return j;
  const m = j.toLowerCase(), zachovej = (t) => j[0] + t.slice(1);
  if (VOK_VYJIMKY[m]) return zachovej(VOK_VYJIMKY[m]);
  if (VOK_ZENY_NA_SOUHLASKU.has(m)) return j;
  if (/[eěiíyýouůú]$/.test(m)) return j;                    // Lucie, Marie, Jiří, Ondřeji…
  if (/a$/.test(m)) return j.slice(0, -1) + 'o';             // Tereza→Terezo, Laďka→Laďko, Honza→Honzo
  if (/[dtn]ěk$/.test(m)) return j.slice(0, -3) + { d: 'ď', t: 'ť', n: 'ň' }[m.slice(-3, -2)] + 'ku'; // Zdeněk→Zdeňku
  if (/ek$/.test(m)) return j.slice(0, -2) + 'ku';           // Radek→Radku, Zdeněk→Zdeňku
  if (/ec$/.test(m)) return j.slice(0, -2) + 'če';           // Lubomírec (vzácné)
  if (/[kgh]$/.test(m) || /ch$/.test(m)) return j + 'u';     // Dominik→Dominiku, Vojtěch→Vojtěchu
  if (/[šžčřjcť]$/.test(m) || /[^aeiouyáéíóúůý]ď$/.test(m)) return j + 'i'; // Tomáš→Tomáši, Matěj→Matěji
  if (/[^aeiouyáéíóúůý]r$/.test(m)) return j.slice(0, -1) + 'ře';           // Petr→Petře
  if (/[bdflmnprstvz]$/.test(m)) return j + 'e';            // Jan→Jane, Jakub→Jakube, Michal→Michale, Josef→Josefe
  return j;
}
// Jazyky: zaškrtávání nabídnutých + „jiné“ s textovým polem (jako výběr okresních měst). Ukládá se pole názvů.
const JAZYKY = ['angličtina', 'němčina', 'francouzština', 'polština', 'španělština'];
const escJ = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function jazykyHtml(vybrane = []) {
  const jine = vybrane.filter((j) => !JAZYKY.includes(j));
  return `<div class="fld" data-f="jazyky"><label>Jazyky</label><div class="chips">${JAZYKY.map((j) => `<label><input type="checkbox" name="jazyk" value="${j}"${vybrane.includes(j) ? ' checked' : ''}> ${j}</label>`).join('')}
    <label><input type="checkbox" name="jazyk" value="jine" class="jazyk-jine-chk"${jine.length ? ' checked' : ''}> jiné</label></div>
    <input class="jazyk-jine${jine.length ? '' : ' hidden'}" style="margin-top:8px" placeholder="doplňte, např. italština, ruština" value="${escJ(jine.join(', '))}"><div class="err"></div></div>`;
}
function jazykyZapni(root) {
  const chk = root.querySelector('.jazyk-jine-chk'), pole = root.querySelector('.jazyk-jine');
  if (chk) chk.onchange = () => { pole.classList.toggle('hidden', !chk.checked); if (chk.checked) pole.focus(); };
}
function jazykyHodnota(root) {
  const v = [...root.querySelectorAll('input[name=jazyk]:checked')].map((x) => x.value).filter((x) => x !== 'jine');
  if (root.querySelector('.jazyk-jine-chk')?.checked) v.push(...root.querySelector('.jazyk-jine').value.split(',').map((x) => x.trim()).filter(Boolean));
  return [...new Set(v)];
}
window.K = { jazykyHtml, jazykyZapni, jazykyHodnota, vokativ, cisla, rcDatum, rcChyba, ucetChyba, pscChyba, telefonNormalizuj, telefonChyba, emailChyba, povinne, datumCz, datumIso };
})();
