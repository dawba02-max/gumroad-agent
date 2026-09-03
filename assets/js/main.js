// Classic Cuts template — mobile nav, back-to-top, header shadow, booking form.
// No backend: booking form opens the shop's email via mailto (see CONTACT_EMAIL).
(function () {
  'use strict';

  var CONTACT_EMAIL = 'contact@yourcompany.com'; // <-- swap in shop email

  // Mobile nav open/close
  var toggle = document.querySelector('.mobile-nav-toggle');
  var overlay = document.querySelector('.mobile-nav');
  var closeBtn = document.querySelector('.mobile-nav-close');
  function setNav(open) {
    if (!overlay || !toggle) return;
    overlay.classList.toggle('hidden', !open);
    document.body.classList.toggle('overflow-hidden', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    var openIcon = toggle.querySelector('.hamburger-open');
    var closeIcon = toggle.querySelector('.hamburger-close');
    if (openIcon) openIcon.classList.toggle('hidden', open);
    if (closeIcon) closeIcon.classList.toggle('hidden', !open);
  }
  if (toggle) toggle.addEventListener('click', function () {
    setNav(overlay.classList.contains('hidden'));
  });
  if (closeBtn) closeBtn.addEventListener('click', function () { setNav(false); });
  if (overlay) overlay.addEventListener('click', function (e) {
    if (e.target === overlay) setNav(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setNav(false);
  });

  // Back-to-top + header shadow on scroll
  var toTop = document.getElementById('back-to-top');
  var header = document.getElementById('site-header');
  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    if (toTop) {
      var show = y > 600;
      toTop.classList.toggle('opacity-0', !show);
      toTop.classList.toggle('invisible', !show);
    }
    if (header) header.classList.toggle('shadow-md', y > 8);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  if (toTop) toTop.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Booking form (contact page): compose mailto, no backend needed
  var form = document.getElementById('booking-form');
  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = function (id) {
      var el = document.getElementById(id);
      return el ? el.value.trim() : '';
    };
    var subject = 'Booking request — ' + v('bk-service') + ' (' + v('bk-date') + ')';
    var body = ['Name: ' + v('bk-name'), 'Phone: ' + v('bk-phone'),
      'Service: ' + v('bk-service'), 'Preferred date: ' + v('bk-date'),
      '', v('bk-notes')].join('\n');
    window.location.href = 'mailto:' + CONTACT_EMAIL +
      '?subject=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent(body);
  });
})();
