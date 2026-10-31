(async function () {
  'use strict';
  var ERP = window.ERP;
  var h = ERP.h;
  var $ = function (id) { return document.getElementById(id); };
  var enc = encodeURIComponent;
  var DESCRIPTION_ROLES = ['executive', 'employee'];

  var me = await ERP.requireAuth();

  var targetId = new URLSearchParams(location.search).get('user') || (me.role === 'admin' ? null : me.id);
  if (!targetId) { location.replace('/panel'); return; }
  var base = '/api/performance/' + enc(targetId);

  var data = null;
  var editingTask = null;
  var taskForm = $('task-form');
  var tf = taskForm.elements;

  async function load() {
    try {
      data = await ERP.api(base);
      render();
    } catch (err) {
      ERP.report(err, 'Could not load the dashboard');
    }
  }

  function render() {
    var user = data.user;
    $('perf-title').textContent = user.id === me.id ? 'My performance dashboard' : 'Performance dashboard: ' + user.name;
    $('perf-subtitle').replaceChildren(
      user.name + ' (' + user.id + ') ', ERP.roleBadge(user.role), user.department ? ' · ' + user.department : ''
    );
    $('back-link').hidden = !me.can_view_directory;
    $('add-task').hidden = !data.can_edit;

    $('sum-total').textContent = data.summary.total;
    $('sum-pending').textContent = data.summary.pending;
    $('sum-progress').textContent = data.summary.in_progress;
    $('sum-done').textContent = data.summary.completed;

    renderTasks();
    renderProfile();
    renderPromotions();
    renderDocuments();
  }

  /* ---------- tasks as cards ---------- */
  function line(label, value) {
    return h('div', { class: 'user-card-meta' },
      h('span', { class: 'meta-label' }, label), h('span', { class: 'pre-wrap' }, value));
  }

  function taskCard(t) {
    var actions = h('div', { class: 'user-card-actions' });
    if (data.can_edit) {
      actions.append(
        h('button', { type: 'button', class: 'btn btn-small', onclick: function () { openTaskForm(t); } }, 'Edit'),
        h('button', { type: 'button', class: 'btn btn-small btn-danger', onclick: function () { removeTask(t); } }, 'Delete')
      );
    }
    return h('article', { class: 'card user-card task-card' },
      h('div', { class: 'user-card-head' },
        h('h3', { class: 'user-card-name' }, t.title),
        ERP.statusBadge(t.status)),
      h('div', { class: 'user-card-body' },
        t.details ? h('p', { class: 'user-card-desc pre-wrap' }, t.details) : null,
        line('Assigned by', (t.assigned_by_name || '—') + (t.assigned_at ? ' · ' + ERP.fmtDateTime(t.assigned_at) : '')),
        line('Due', t.due_date ? ERP.fmtDate(t.due_date) : '—'),
        t.completed_at ? line('Completed', ERP.fmtDateTime(t.completed_at)) : null,
        line('Remarks', t.remarks || '—')),
      data.can_edit ? actions : null);
  }

  function renderTasks() {
    var tasks = data.tasks;
    var grid = $('task-grid');
    grid.replaceChildren.apply(grid, tasks.map(taskCard));
    $('task-empty').hidden = tasks.length > 0;
  }

  function openTaskForm(task) {
    editingTask = task || null;
    taskForm.reset();
    if (task) {
      tf['title'].value = task.title;
      tf['details'].value = task.details;
      tf['due_date'].value = task.due_date;
      tf['status'].value = task.status;
      tf['remarks'].value = task.remarks;
    }
    $('task-overlay-title').textContent = task ? 'Edit task' : 'Assign task to ' + data.user.name;
    ERP.openOverlay($('task-overlay'));
  }

  $('add-task').addEventListener('click', function () { openTaskForm(null); });

  taskForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var problem = ERP.checkRequired(taskForm);
    if (problem) { ERP.showError(problem, 'Missing information'); return; }
    var body = {
      title: tf['title'].value,
      details: tf['details'].value,
      due_date: tf['due_date'].value,
      status: tf['status'].value,
      remarks: tf['remarks'].value
    };
    $('task-submit').disabled = true;
    try {
      data = editingTask
        ? await ERP.api(base + '/tasks/' + enc(editingTask.id), { method: 'PUT', body: body })
        : await ERP.api(base + '/tasks', { method: 'POST', body: body });
      render();
      ERP.closeOverlay($('task-overlay'));
      ERP.toast(editingTask ? 'Task updated' : 'Task assigned');
    } catch (err) {
      ERP.report(err, 'Could not save the task');
    } finally {
      $('task-submit').disabled = false;
    }
  });

  async function removeTask(t) {
    var ok = await ERP.confirmDialog('Delete the task "' + t.title + '"? This cannot be undone.',
      { title: 'Delete task', confirmText: 'Delete', danger: true });
    if (!ok) return;
    try {
      data = await ERP.api(base + '/tasks/' + enc(t.id), { method: 'DELETE' });
      render();
      ERP.toast('Task deleted');
    } catch (err) { ERP.report(err, 'Could not delete the task'); }
  }

  /* ---------- profile + role history ---------- */
  function renderProfile() {
    var user = data.user;
    var showDescription = DESCRIPTION_ROLES.indexOf(user.role) !== -1;
    $('profile-description').hidden = !showDescription;
    $('profile-description').textContent = user.description || 'No description added.';
    $('profile-created').textContent =
      'Created by ' + (user.created_by_name || 'unknown') + ' on ' + ERP.fmtDateTime(user.created_at) + '.';
    $('profile-edited').textContent = user.last_edited_at
      ? 'Last edited by ' + user.last_edited_by_name + ' on ' + ERP.fmtDateTime(user.last_edited_at) + '.'
      : 'Not edited since it was created.';
  }

  function renderPromotions() {
    var list = $('promo-list');
    $('promotion-card').hidden = data.promotions.length === 0;
    list.replaceChildren.apply(list, data.promotions.map(function (p) {
      return h('li', null,
        h('div', null,
          h('div', { class: 'doc-title' }, ERP.ROLE_LABELS[p.from_role] + ' → ' + ERP.ROLE_LABELS[p.to_role]),
          h('div', { class: 'doc-meta' }, 'Changed by ' + p.promoted_by_name + ' · ' + ERP.fmtDateTime(p.promoted_at))
        )
      );
    }));
  }

  /* ---------- documents ---------- */
  function renderDocuments() {
    var docs = data.documents;
    $('documents-section').hidden = !(data.doc_label || docs.length);

    var gen = $('generate-doc');
    gen.hidden = !data.doc_kind;
    if (data.doc_kind) {
      gen.textContent = 'Generate ' + data.doc_label.toLowerCase() + ' (PDF)';
      gen.href = '/document?user=' + enc(data.user.id);
    }

    $('upload-form').hidden = !data.can_upload;
    if (data.doc_label) {
      $('upload-label').textContent = 'Upload signed ' + data.doc_label.toLowerCase();
    }
    var list = $('doc-list');
    list.replaceChildren.apply(list, docs.map(function (doc) {
      var actions = h('div', { class: 'doc-actions' },
        h('button', { type: 'button', class: 'btn btn-small', onclick: function () { downloadDoc(doc); } }, 'Download')
      );
      if (data.can_upload) {
        actions.append(h('button', { type: 'button', class: 'btn btn-small btn-danger', onclick: function () { removeDoc(doc); } }, 'Delete'));
      }
      return h('li', null,
        h('div', null,
          h('div', { class: 'doc-title' }, doc.label + ' · ' + doc.filename),
          h('div', { class: 'doc-meta' },
            ERP.fmtSize(doc.size) + ' · uploaded ' + ERP.fmtDateTime(doc.uploaded_at) + ' by ' + doc.uploaded_by_name)
        ),
        actions
      );
    }));
    $('doc-empty').hidden = docs.length > 0;
  }

  async function downloadDoc(doc) {
    try { await ERP.download(base + '/documents/' + enc(doc.id), doc.filename); }
    catch (err) { ERP.report(err, 'Download failed'); }
  }

  async function removeDoc(doc) {
    var ok = await ERP.confirmDialog('Delete "' + doc.filename + '"? This cannot be undone.',
      { title: 'Delete document', confirmText: 'Delete', danger: true });
    if (!ok) return;
    try {
      await ERP.api(base + '/documents/' + enc(doc.id), { method: 'DELETE' });
      ERP.toast('Document deleted');
      await load();
    } catch (err) { ERP.report(err, 'Could not delete the document'); }
  }

  $('upload-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var input = $('upload-file');
    if (!input.files.length) { ERP.showError('Please choose a file to upload.', 'No file selected'); return; }
    var body = new FormData();
    body.append('file', input.files[0]);
    $('upload-submit').disabled = true;
    try {
      await ERP.api(base + '/documents', { method: 'POST', formData: body });
      e.target.reset();
      ERP.toast('Document uploaded');
      await load();
    } catch (err) {
      ERP.report(err, 'Upload failed');
    } finally {
      $('upload-submit').disabled = false;
    }
  });

  load();
})();
