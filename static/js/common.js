/* Shared front-end helpers, loaded on every page. Exposes window.ERP.
   - api(): fetch wrapper that sends the JWT and turns failures into readable errors
   - overlays: error / confirm dialogs, generic open/close, toasts (no alert() anywhere)
   - requireAuth(): guards a page and fills in the top bar
   The theme toggle is handled only by theme.js. */
(function () {
  'use strict';

  var TOKEN_KEY = 'erp-token';
  var FLASH_KEY = 'erp-flash';
  var ROLE_LABELS = { admin: 'Admin', executive: 'Executive', employee: 'Employee', intern: 'Intern' };
  var STATUS_LABELS = { pending: 'Pending', in_progress: 'In progress', completed: 'Completed' };

  /* ---------- DOM helper (always uses textContent, never innerHTML) ---------- */
  function h(tag, props) {
    var el = document.createElement(tag);
    Object.keys(props || {}).forEach(function (key) {
      var value = props[key];
      if (value === null || value === undefined || value === false) return;
      if (key === 'class') el.className = value;
      else if (key.indexOf('on') === 0 && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
      else el.setAttribute(key, value === true ? '' : value);
    });
    Array.prototype.slice.call(arguments, 2).forEach(function append(child) {
      if (child === null || child === undefined || child === false) return;
      if (Array.isArray(child)) child.forEach(append);
      else el.append(child.nodeType ? child : document.createTextNode(String(child)));
    });
    return el;
  }

  /* ---------- token (JWT) ---------- */
  var token = {
    get: function () { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } },
    set: function (value) { try { localStorage.setItem(TOKEN_KEY, value); } catch (e) { /* ignore */ } },
    clear: function () { try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ } }
  };

  function signOut(message) {
    token.clear();
    if (message) { try { sessionStorage.setItem(FLASH_KEY, message); } catch (e) { /* ignore */ } }
    location.replace('/login');
  }

  /* ---------- overlays ---------- */
  var stack = [];
  var lastFocus = new WeakMap();
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled])';

  function openOverlay(el) {
    if (!el) return;
    lastFocus.set(el, document.activeElement);
    el.hidden = false;
    if (stack.indexOf(el) === -1) stack.push(el);
    document.body.classList.add('overlay-open');
    var target = el.querySelector('[data-autofocus]') || el.querySelector(FOCUSABLE);
    if (target) target.focus();
  }

  function closeOverlay(el) {
    if (!el || el.hidden) return;
    el.hidden = true;
    var i = stack.indexOf(el);
    if (i !== -1) stack.splice(i, 1);
    if (!stack.length) document.body.classList.remove('overlay-open');
    var previous = lastFocus.get(el);
    if (previous && previous.focus && document.contains(previous)) previous.focus();
    el.dispatchEvent(new CustomEvent('overlay:closed'));
  }

  document.addEventListener('click', function (e) {
    var closer = e.target.closest('[data-close]');
    if (closer) { closeOverlay(closer.closest('.overlay')); return; }
    if (e.target.classList && e.target.classList.contains('overlay') && e.target.hasAttribute('data-backdrop-close')) {
      closeOverlay(e.target);
    }
  });

  document.addEventListener('keydown', function (e) {
    if (!stack.length) return;
    var top = stack[stack.length - 1];
    if (e.key === 'Escape') { closeOverlay(top); return; }
    if (e.key === 'Tab') {   // keep keyboard focus inside the open overlay
      var items = Array.prototype.filter.call(top.querySelectorAll(FOCUSABLE), function (n) { return n.offsetParent !== null; });
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  function showError(message, title) {
    var el = document.getElementById('error-overlay');
    el.querySelector('[data-error-title]').textContent = title || 'Something went wrong';
    el.querySelector('[data-error-message]').textContent = message || 'An unexpected error occurred.';
    openOverlay(el);
  }

  /* Show an error unless it was already handled (e.g. redirect after a 401). */
  function report(err, title) {
    if (err && err.silent) return;
    showError(err && err.message ? err.message : 'An unexpected error occurred.', title);
  }

  function confirmDialog(message, options) {
    options = options || {};
    var el = document.getElementById('confirm-overlay');
    var yes = el.querySelector('[data-confirm-yes]');
    el.querySelector('[data-confirm-title]').textContent = options.title || 'Please confirm';
    el.querySelector('[data-confirm-message]').textContent = message;
    yes.textContent = options.confirmText || 'Confirm';
    yes.className = 'btn ' + (options.danger ? 'btn-danger' : 'btn-primary');
    return new Promise(function (resolve) {
      var answer = false;
      function onYes() { answer = true; closeOverlay(el); }
      function onClosed() {
        yes.removeEventListener('click', onYes);
        el.removeEventListener('overlay:closed', onClosed);
        resolve(answer);
      }
      yes.addEventListener('click', onYes);
      el.addEventListener('overlay:closed', onClosed);
      openOverlay(el);
    });
  }

  function toast(message) {
    var root = document.getElementById('toast-root');
    var node = h('div', { class: 'toast', role: 'status' }, message);
    root.append(node);
    setTimeout(function () { node.classList.add('toast-out'); }, 2600);
    setTimeout(function () { node.remove(); }, 3000);
  }

  /* Returns a message listing empty required fields, or null when the form is complete. */
  function checkRequired(form) {
    var missing = [];
    form.querySelectorAll('[required]').forEach(function (input) {
      if (input.disabled) return;
      var empty = input.type === 'file' ? !input.files.length : !String(input.value).trim();
      if (empty) missing.push(input.getAttribute('data-label') || input.name);
    });
    return missing.length ? 'Please fill in: ' + missing.join(', ') + '.' : null;
  }

  /* ---------- API ---------- */
  function ApiError(message, status, silent) {
    this.name = 'ApiError';
    this.message = message;
    this.status = status;
    this.silent = !!silent;
  }
  ApiError.prototype = Object.create(Error.prototype);

  function errorText(data, status) {
    if (data && typeof data.detail === 'string') return data.detail;
    if (data && Array.isArray(data.detail)) {
      return data.detail.map(function (d) { return d.msg; }).join('\n');
    }
    return 'The request failed (HTTP ' + status + ').';
  }

  /* options: method, body (JSON), formData, auth (default true), redirect401 (default true), raw */
  async function api(path, options) {
    options = options || {};
    var headers = {};
    var payload;
    if (options.auth !== false && token.get()) headers['Authorization'] = 'Bearer ' + token.get();
    if (options.formData) payload = options.formData;
    else if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(options.body);
    }

    var res;
    try {
      res = await fetch(path, { method: options.method || 'GET', headers: headers, body: payload });
    } catch (e) {
      throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
    }

    if (res.status === 401 && options.auth !== false && options.redirect401 !== false) {
      var data401 = await res.json().catch(function () { return null; });
      signOut(errorText(data401, 401));
      throw new ApiError('Signed out', 401, true);
    }
    if (!res.ok) {
      var data = await res.json().catch(function () { return null; });
      throw new ApiError(errorText(data, res.status), res.status);
    }
    if (options.raw) return res;
    if (res.status === 204) return null;
    return res.json();
  }

  async function download(path, filename) {
    var res = await api(path, { raw: true });
    var url = URL.createObjectURL(await res.blob());
    var link = h('a', { href: url, download: filename });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  /* ---------- page guard + top bar ---------- */
  function decodeJwt(tokenValue) {
    try {
      var part = tokenValue.split('.')[1];
      if (!part) return null;
      var padded = part.replace(/-/g, '+').replace(/_/g, '/');
      padded += '==='.slice((padded.length + 3) % 4);
      var binary = atob(padded);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (e) {
      return null;
    }
  }

  function localCapabilities(payload) {
    var rules = {
      admin: { can_view_directory: true, viewable_roles: ['executive', 'employee', 'intern'], creatable_roles: ['executive', 'employee', 'intern'] },
      executive: { can_view_directory: true, viewable_roles: ['executive', 'employee', 'intern'], creatable_roles: ['employee', 'intern'] },
      employee: { can_view_directory: false, viewable_roles: [], creatable_roles: [] },
      intern: { can_view_directory: false, viewable_roles: [], creatable_roles: [] }
    };
    var rule = rules[payload && payload.role];
    if (!rule || !payload.sub || !payload.name || !payload.exp || payload.exp * 1000 <= Date.now()) return null;
    return {
      id: payload.sub,
      name: payload.name,
      role: payload.role,
      email: payload.email || '',
      can_view_directory: rule.can_view_directory,
      viewable_roles: rule.viewable_roles.slice(),
      creatable_roles: rule.creatable_roles.slice()
    };
  }

  function requireAuth() {
    var savedToken = token.get();
    var me = localCapabilities(decodeJwt(savedToken || ''));
    if (!me) {
      token.clear();
      location.replace('/login');
      return new Promise(function () {});   // never resolves: stops the page script
    }
    var nameEl = document.getElementById('nav-user-name');
    var roleEl = document.getElementById('nav-user-role');
    var perfLink = document.getElementById('nav-performance');
    var logoutBtn = document.getElementById('logout-btn');
    if (nameEl) nameEl.textContent = me.name;
    if (roleEl) { roleEl.textContent = ROLE_LABELS[me.role] || me.role; roleEl.className = 'badge badge-' + me.role; }
    if (perfLink) perfLink.hidden = me.role === 'admin';   // the built-in admin has no dashboard of its own
    if (logoutBtn) logoutBtn.onclick = function () { signOut(); };
    return me;
  }

  /* ---------- formatting ---------- */
  function fmtDateTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }
  /* "YYYY-MM-DD" -> local date, built from parts so the time zone cannot shift the day. */
  function fmtDate(value) {
    if (!value) return '';
    var p = String(value).split('-');
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return isNaN(d) ? value : d.toLocaleDateString(undefined, { dateStyle: 'medium' });
  }
  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
  function roleBadge(role) {
    return h('span', { class: 'badge badge-' + role }, ROLE_LABELS[role] || role);
  }
  function statusBadge(status) {
    return h('span', { class: 'badge badge-' + status }, STATUS_LABELS[status] || status);
  }

  /* ---------- anything unexpected goes to the overlay, never alert() ---------- */
  window.addEventListener('unhandledrejection', function (e) { e.preventDefault(); report(e.reason); });
  window.addEventListener('error', function (e) { if (e.error) report(e.error); });

  window.ERP = {
    ROLE_LABELS: ROLE_LABELS,
    STATUS_LABELS: STATUS_LABELS,
    FLASH_KEY: FLASH_KEY,
    decodeJwt: decodeJwt,
    localCapabilities: localCapabilities,
    h: h, token: token, api: api, download: download, requireAuth: requireAuth, signOut: signOut,
    openOverlay: openOverlay, closeOverlay: closeOverlay,
    showError: showError, report: report, confirmDialog: confirmDialog, toast: toast,
    checkRequired: checkRequired, fmtDateTime: fmtDateTime, fmtDate: fmtDate, fmtSize: fmtSize,
    roleBadge: roleBadge, statusBadge: statusBadge
  };
})();
