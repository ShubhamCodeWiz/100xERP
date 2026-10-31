(function () {
  'use strict';
  var ERP = window.ERP;
  var form = document.getElementById('login-form');
  var submit = document.getElementById('login-submit');
  var userInput = document.getElementById('user_id');
  var passwordInput = document.getElementById('password');

  userInput.focus();

  // Message left by a forced sign-out (expired token, deleted account, ...).
  var flash = null;
  try {
    flash = sessionStorage.getItem(ERP.FLASH_KEY);
    sessionStorage.removeItem(ERP.FLASH_KEY);
  } catch (e) { /* ignore */ }
  if (flash) {
    ERP.showError(flash, 'Signed out');
  } else if (ERP.token.get()) {
    // Already signed in? Skip the form if the saved token is still good.
    ERP.api('/api/auth/me', { redirect401: false })
      .then(function () { location.replace('/panel'); })
      .catch(function () { ERP.token.clear(); });
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var problem = ERP.checkRequired(form);
    if (problem) { ERP.showError(problem, 'Missing information'); return; }

    submit.disabled = true;
    try {
      var data = await ERP.api('/api/auth/login', {
        method: 'POST',
        auth: false,
        body: { user_id: userInput.value.trim(), password: passwordInput.value }
      });
      ERP.token.set(data.access_token);
      location.replace('/panel');
    } catch (err) {
      passwordInput.value = '';
      ERP.report(err, 'Sign-in failed');
    } finally {
      submit.disabled = false;
    }
  });
})();
