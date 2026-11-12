// Temporary event banner. Inlined into every page by build.js, right after the banner markup.
// It shows itself only between data-start and data-end (UTC), and stays hidden once dismissed.
(function () {
  var el = document.getElementById('eventBanner');
  if (!el) return;
  var now = Date.now();
  var start = Date.parse(el.getAttribute('data-start'));
  var end = Date.parse(el.getAttribute('data-end'));
  var key = 'eventBannerDismissed:' + el.getAttribute('data-id');
  if (isNaN(start) || isNaN(end) || now < start || now >= end) { el.remove(); return; }
  try { if (localStorage.getItem(key) === '1') { el.remove(); return; } } catch (e) {}
  el.hidden = false;
  var btn = el.querySelector('.event-banner__close');
  if (btn) btn.addEventListener('click', function () {
    el.remove();
    try { localStorage.setItem(key, '1'); } catch (e) {}
  });
})();
