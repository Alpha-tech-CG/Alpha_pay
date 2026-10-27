// Page de paiement hébergée AlphaPay (T-53) : sans framework, pour la 3G.
(function () {
  'use strict';
  var parts = location.pathname.split('/').filter(Boolean); // ['l'|'c', code]
  var kind = parts[0] === 'c' ? 'tills' : 'links';
  var code = parts[1] || '';
  var base = '/v1/public/' + kind + '/' + encodeURIComponent(code);
  var $ = function (id) { return document.getElementById(id); };
  var view = null, operator = null, fixedAmount = null, pollTimer = null;

  function show(id) {
    ['loading', 'form', 'wait', 'done'].forEach(function (x) { $(x).hidden = x !== id; });
  }
  function fcfa(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA'; }

  function request(method, url, body) {
    return fetch(url, {
      method: method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) throw (data && data.error) || { message: 'Erreur réseau, réessayez.' };
        return data;
      });
    });
  }

  function finish(ok, title, message, canRetry) {
    show('done');
    $('done').className = 'state ' + (ok ? 'ok' : 'ko');
    $('icon').textContent = ok ? '✓' : '!';
    $('donetitle').textContent = title;
    $('donemsg').textContent = message || '';
    $('again').hidden = !canRetry;
  }

  // Opérateur prérempli d'après le préfixe (configuration serveur), modifiable.
  function guessOperator(raw) {
    var hints = view && view.operators;
    if (!hints) return null;
    var d = raw.replace(/\D/g, '');
    if (d.indexOf(hints.country_code) === 0 && d.length > hints.national_length) d = '0' + d.slice(hints.country_code.length).replace(/^0/, '');
    var best = null, len = 0;
    Object.keys(hints.prefixes).forEach(function (op) {
      hints.prefixes[op].forEach(function (p) { if (d.indexOf(p) === 0 && p.length > len) { best = op; len = p.length; } });
    });
    return best;
  }
  function setOperator(op) {
    operator = op;
    Array.prototype.forEach.call(document.querySelectorAll('.ops button'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-op') === op));
    });
  }

  function render(v) {
    view = v;
    if (v.state !== 'actif') return finish(false, 'Paiement impossible', v.message, false);
    $('test').hidden = v.livemode !== false;
    $('merchant').textContent = v.merchant_name;
    $('title').textContent = kind === 'tills' ? v.store_name + ' · ' + v.till_name : v.description;
    fixedAmount = kind === 'links' ? v.amount : null;
    $('fixed').hidden = fixedAmount == null;
    $('free').hidden = fixedAmount != null;
    if (fixedAmount != null) $('fixed').textContent = fcfa(fixedAmount);
    show('form');
    (fixedAmount == null ? $('amount') : $('phone')).focus();
  }

  function poll(id, token, startedAt) {
    request('GET', '/v1/public/payments/' + id + '?token=' + encodeURIComponent(token)).then(function (s) {
      if (!s.final) {
        // Toutes les 2 s la première minute, puis toutes les 5 s (économie de données).
        var wait = Date.now() - startedAt < 60000 ? 2000 : 5000;
        pollTimer = setTimeout(function () { poll(id, token, startedAt); }, wait);
        return;
      }
      if (s.status === 'réussi') finish(true, 'Paiement réussi', fcfa(s.amount) + ' payés à ' + s.merchant_name + '.', false);
      else finish(false, 'Paiement non abouti', s.message, true);
    }, function () {
      pollTimer = setTimeout(function () { poll(id, token, startedAt); }, 5000); // coupure réseau : on insiste
    });
  }

  $('phone').addEventListener('input', function () {
    var op = guessOperator(this.value);
    if (op) setOperator(op);
  });
  Array.prototype.forEach.call(document.querySelectorAll('.ops button'), function (b) {
    b.addEventListener('click', function () { setOperator(b.getAttribute('data-op')); });
  });
  $('amount').addEventListener('input', function () { this.value = this.value.replace(/\D/g, ''); });

  $('form').addEventListener('submit', function (e) {
    e.preventDefault();
    $('err').textContent = '';
    var body = { phone: $('phone').value.replace(/[\s.-]/g, '') };
    if (fixedAmount == null) body.amount = parseInt($('amount').value, 10);
    if (fixedAmount == null && !(body.amount > 0)) { $('err').textContent = 'Saisissez le montant.'; return; }
    if (!body.phone) { $('err').textContent = 'Saisissez votre numéro.'; return; }
    if (operator) body.operator = operator.toLowerCase();
    $('pay').disabled = true;
    request('POST', base + '/pay', body).then(function (r) {
      show('wait');
      poll(r.id, r.client_token, Date.now());
    }, function (err) {
      $('err').textContent = err.message || 'Le paiement n’a pas pu être lancé.';
    }).then(function () { $('pay').disabled = false; });
  });

  $('again').addEventListener('click', function () {
    clearTimeout(pollTimer);
    if (view) render(view);
  });

  request('GET', base).then(render, function (err) {
    finish(false, 'Paiement impossible', err.message || 'Ce lien n’existe pas.', false);
  });
})();
