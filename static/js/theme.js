/* Theme handling, shared by every page.
   Loaded in <head> (before first paint) so there is no light/dark flash.
   The choice is saved in localStorage; with no saved choice the OS preference is used. */
(function () {
  'use strict';
  var KEY = 'erp-theme';

  function saved() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function current() {
    var s = saved();
    if (s === 'dark' || s === 'light') return s;
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  }

  function updateButtonLabel(theme) {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    var label = btn.querySelector('.theme-toggle-label');
    if (label) {
      label.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
    }
  }

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    updateButtonLabel(theme);
  }

  window.ERPTheme = {
    get: function () { return document.documentElement.getAttribute('data-theme') || current(); },
    set: function (theme) {
      try { localStorage.setItem(KEY, theme); } catch (e) { /* storage unavailable */ }
      apply(theme);
    },
    toggle: function () {
      this.set(this.get() === 'dark' ? 'light' : 'dark');
    }
  };

  apply(current());

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('theme-toggle');
    if (btn) {
      updateButtonLabel(window.ERPTheme.get());
      // Self-contained click listener: ensures toggle works even if common.js didn't bind it
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        window.ERPTheme.toggle();
      });
    }

    // Optional: listen for system theme switches if user has no saved preference
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
        if (!saved()) {
          apply(e.matches ? 'dark' : 'light');
        }
      });
    }
  });
})();

