(async function () {
  'use strict';
  var ERP = window.ERP;
  var h = ERP.h;
  var DESCRIPTION_ROLES = ['executive', 'employee'];   // roles that get a description

  var me = await ERP.requireAuth();

  // Employees and interns get a shortcut to their dashboard instead of the directory.
  if (!me.can_view_directory) {
    document.getElementById('self-name').textContent = me.name;
    document.getElementById('self-section').hidden = false;
    return;
  }

  var els = {
    directory: document.getElementById('directory'),
    search: document.getElementById('search'),
    roleFilter: document.getElementById('role-filter'),
    grid: document.getElementById('user-grid'),
    empty: document.getElementById('empty-state'),
    count: document.getElementById('result-count'),
    add: document.getElementById('add-user'),
    overlay: document.getElementById('user-overlay'),
    form: document.getElementById('user-form'),
    title: document.getElementById('user-overlay-title'),
    roleHint: document.getElementById('role-hint'),
    pwHint: document.getElementById('password-hint'),
    pwToggle: document.getElementById('password-toggle'),
    descField: document.getElementById('description-field'),
    submit: document.getElementById('user-submit')
  };
  var f = els.form.elements;
  var editing = null;
  var revealed = null;   // password text fetched with "Show" (so we only send it if changed)
  var latest = 0;
  var usersList = [];
  var enc = encodeURIComponent;

  els.directory.hidden = false;
  els.add.hidden = me.creatable_roles.length === 0;

  els.roleFilter.append(h('option', { value: '' }, 'All roles'));
  me.viewable_roles.forEach(function (role) {
    els.roleFilter.append(h('option', { value: role }, ERP.ROLE_LABELS[role] + 's'));
  });

  /* ---------- list ---------- */
  async function load() {
    var mine = ++latest;   // ignore out-of-order responses while typing
    var params = new URLSearchParams();
    var q = els.search.value.trim();
    if (q) params.set('q', q);
    if (els.roleFilter.value) params.set('role', els.roleFilter.value);
    try {
      var users = await ERP.api('/api/users' + (params.toString() ? '?' + params : ''));
      if (mine === latest) {
        usersList = users;
        render(usersList);
      }
    } catch (err) {
      if (mine === latest) ERP.report(err, 'Could not load people');
    }
  }

  function render(users) {
    els.grid.replaceChildren.apply(els.grid, users.map(card));
    els.empty.hidden = users.length > 0;
    els.count.textContent = users.length === 1 ? '1 person' : users.length + ' people';
  }

  function sortUsers() {
    var order = { executive: 0, employee: 1, intern: 2 };
    usersList.sort(function (a, b) {
      return (order[a.role] - order[b.role]) || a.name.localeCompare(b.name);
    });
  }

  function meta(label, value) {
    return h('div', { class: 'user-card-meta' },
      h('span', { class: 'meta-label' }, label), h('span', null, value));
  }

  function card(u) {
    var actions = h('div', { class: 'user-card-actions' });
    if (u.can_view_dashboard) {
      actions.append(h('a', { class: 'btn btn-small', href: '/performance?user=' + enc(u.id) }, 'Dashboard'));
    }
    if (u.can_edit) {
      actions.append(h('button', { type: 'button', class: 'btn btn-small', onclick: function () { openForm(u); } }, 'Edit'));
      actions.append(h('button', { type: 'button', class: 'btn btn-small btn-danger', onclick: function () { remove(u); } }, 'Delete'));
    }
    var showDesc = u.description && DESCRIPTION_ROLES.indexOf(u.role) !== -1;
    return h('article', { class: 'card user-card' },
      h('div', { class: 'user-card-head' },
        h('div', null, h('h3', { class: 'user-card-name' }, u.name), h('span', { class: 'user-card-id' }, u.id)),
        ERP.roleBadge(u.role)),
      h('div', { class: 'user-card-body' },
        meta('Department', u.department || '—'),
        meta('Email', u.email || '—'),
        meta('Created by', (u.created_by_name || '—') + (u.created_at ? ' · ' + ERP.fmtDateTime(u.created_at) : '')),
        meta('Last edited', u.last_edited_at ? u.last_edited_by_name + ' · ' + ERP.fmtDateTime(u.last_edited_at) : '—'),
        showDesc ? h('p', { class: 'user-card-desc' }, u.description) : null),
      actions);
  }

  /* ---------- add / edit overlay ---------- */
  function syncDescription() {
    els.descField.hidden = DESCRIPTION_ROLES.indexOf(f['role'].value) === -1;
  }

  function resetPasswordField() {
    f['password'].type = 'password';
    els.pwToggle.textContent = 'Show';
    revealed = null;
  }

  function openForm(user) {
    editing = user || null;
    els.form.reset();
    resetPasswordField();

    if (editing) {
      // Only the admin may change a role; for everyone else it is shown but locked.
      var roles = editing.can_change_role ? me.creatable_roles : [editing.role];
      f['role'].replaceChildren.apply(f['role'], roles.map(function (role) {
        return h('option', { value: role }, ERP.ROLE_LABELS[role]);
      }));
      f['role'].value = editing.role;
      f['role'].disabled = !editing.can_change_role;
      els.roleHint.textContent = editing.can_change_role ? '' : 'Only the admin can change roles.';
      els.title.textContent = 'Edit ' + editing.name;
      f['user_id'].value = editing.id;
      f['user_id'].disabled = true;
      f['name'].value = editing.name;
      f['email'].value = editing.email;
      f['department'].value = editing.department;
      f['description'].value = editing.description || '';
      f['password'].required = false;
      els.pwHint.textContent = editing.can_view_password
        ? 'Press Show to view the current password. Type a new one to change it.'
        : 'Leave blank to keep the current password.';
    } else {
      f['role'].replaceChildren.apply(f['role'], me.creatable_roles.map(function (role) {
        return h('option', { value: role }, ERP.ROLE_LABELS[role]);
      }));
      f['role'].disabled = false;
      els.roleHint.textContent = '';
      els.title.textContent = 'Add person';
      f['user_id'].disabled = false;
      f['password'].required = true;
      els.pwHint.textContent = 'At least 6 characters.';
    }
    syncDescription();
    ERP.openOverlay(els.overlay);
  }

  f['role'].addEventListener('change', syncDescription);

  els.pwToggle.addEventListener('click', async function () {
    var input = f['password'];
    if (input.type === 'text') {          // hide again
      input.type = 'password';
      els.pwToggle.textContent = 'Show';
      return;
    }
    if (editing && editing.can_view_password && !input.value) {   // fetch the stored password
      try {
        var res = await ERP.api('/api/users/' + enc(editing.id) + '/password');
        input.value = res.password;
        revealed = res.password;
      } catch (err) {
        ERP.report(err, 'Could not show the password');
        return;
      }
    }
    input.type = 'text';
    els.pwToggle.textContent = 'Hide';
  });

  els.form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var problem = ERP.checkRequired(els.form);
    if (problem) { ERP.showError(problem, 'Missing information'); return; }

    var body = {
      name: f['name'].value,
      email: f['email'].value,
      department: f['department'].value
    };
    if (!els.descField.hidden) body.description = f['description'].value;
    var password = f['password'].value;

    els.submit.disabled = true;
    try {
      if (editing) {
        if (password && password !== revealed) body.password = password;   // only if it was changed
        if (editing.can_change_role && f['role'].value !== editing.role) body.role = f['role'].value;
        var saved = await ERP.api('/api/users/' + enc(editing.id), { method: 'PUT', body: body });
        if (body.role && saved.role !== body.role) {
          throw new Error('The server did not apply the role change. Restart the server so it loads the latest files, then try again.');
        }
        usersList = usersList.map(function (user) { return user.id === saved.id ? saved : user; });
        ERP.toast(body.role ? 'Role changed to ' + ERP.ROLE_LABELS[body.role] : 'Changes saved');
      } else {
        body.user_id = f['user_id'].value;
        body.role = f['role'].value;
        body.password = password;
        var created = await ERP.api('/api/users', { method: 'POST', body: body });
        usersList.push(created);
        ERP.toast('Person added');
      }
      latest++;
      sortUsers();
      render(usersList);
      ERP.closeOverlay(els.overlay);
    } catch (err) {
      ERP.report(err, 'Could not save');
    } finally {
      els.submit.disabled = false;
    }
  });

  /* ---------- delete ---------- */
  async function remove(u) {
    var ok = await ERP.confirmDialog(
      'Delete ' + u.name + ' (' + u.id + ')? Their tasks and documents will be removed too. This cannot be undone.',
      { title: 'Delete person', confirmText: 'Delete', danger: true }
    );
    if (!ok) return;
    try {
      await ERP.api('/api/users/' + enc(u.id), { method: 'DELETE' });
      latest++;
      usersList = usersList.filter(function (user) { return user.id !== u.id; });
      render(usersList);
      ERP.toast('Person deleted');
    } catch (err) {
      ERP.report(err, 'Could not delete');
    }
  }

  /* ---------- wiring ---------- */
  var timer;
  els.search.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(load, 250); });
  els.roleFilter.addEventListener('change', load);
  els.add.addEventListener('click', function () { openForm(null); });
  load();
})();
