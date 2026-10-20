// Verze buildu – číslo buildu a datum doplní automat při nasazení (.github/workflows/nasadit.yml) z Gitu.
// Ručně se mění jen VERZE při větší změně. V místní kopii se ukazuje „build dev“.
window.VIXEN_VERZE = { verze: '0.7', build: 89, datum: '20. 10. 2026 14:42' };
(function () {
  var v = window.VIXEN_VERZE;
  var text = 'v' + v.verze + ' · build ' + v.build + ' · ' + v.datum;
  try { console.info('Vixen ' + text); } catch (e) {}
  function vloz() {
    if (document.getElementById('vixen-verze')) return;
    var d = document.createElement('span');
    d.id = 'vixen-verze';
    d.textContent = (window.innerWidth < 600) ? ('build ' + v.build) : text;
    d.title = 'Verze aplikace';
    var top = document.querySelector('.top');
    if (top) {
      d.style.cssText = 'font-size:11px;color:#9a9488;margin:0 10px 0 auto;padding-left:10px;white-space:nowrap;flex-shrink:0';
      // pořadí vpravo: verze · kdo je přihlášený · Odhlásit
      var za = document.getElementById('kdo') || document.getElementById('odhlasit');
      top.insertBefore(d, za && za.parentNode === top ? za : null);
    } else {
      d.style.cssText = 'text-align:center;font-size:11px;color:#8a8478;padding:18px 8px';
      document.body.appendChild(d);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', vloz);
  else vloz();
})();
