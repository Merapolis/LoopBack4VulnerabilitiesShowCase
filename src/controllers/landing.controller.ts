import {get, RestBindings, Response} from '@loopback/rest';
import {inject} from '@loopback/core';

/**
 * Landing page for the deliberately vulnerable demo branch
 * (`demo/wildcard-oracle`).
 *
 * Serves a single, self-contained HTML page at `/` that lets a reviewer:
 *   - pick a fixture identity (alice or bob) with a button,
 *   - click through the resolver cases and watch the 403/404 differential,
 *   - type a reconstructed access ID into the protected document endpoint,
 *   - copy the equivalent curl command for each request,
 *   - intercept the traffic with Burp Suite while clicking.
 *
 * The page is presentation only: it calls the same HTTP endpoints a manual
 * tester would and holds no secrets. `X-Demo-User` remains a fixture actor
 * selector, NOT authentication.
 */
export class LandingController {
  @get('/', {
    responses: {
      '200': {
        description: 'Demo landing page',
        content: {'text/html': {schema: {type: 'string'}}},
      },
    },
  })
  landing(@inject(RestBindings.Http.RESPONSE) res: Response): void {
    // Send directly on the response object: LB4's WRITE middleware would
    // otherwise force `text/plain` for string return values.
    res.status(200).contentType('text/html').send(LANDING_HTML);
  }
}

const LANDING_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>LoopBack 4 Oracle Lab — demo/wildcard-oracle</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, sans-serif;
         background: #0f1420; color: #e6e8ee; }
  header { padding: 20px 32px; background: linear-gradient(135deg,#1b2436,#0f1420);
           border-bottom: 1px solid #2a3450; }
  h1 { margin: 0 0 4px; font-size: 22px; }
  h1 .branch { font-size: 13px; font-weight: 400; color: #9fb3d9;
               border: 1px solid #2a3450; border-radius: 6px; padding: 2px 8px;
               vertical-align: middle; margin-left: 8px; }
  header p { margin: 0 0 14px; color: #9fb3d9; font-size: 14px; max-width: 72ch; }
  .actors { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .actors .label { font-size: 14px; color: #9fb3d9; }
  button { font: inherit; cursor: pointer; border-radius: 8px; border: 1px solid #2a3450;
           background: #1b2436; color: #e6e8ee; padding: 8px 14px; transition: .15s; }
  button:hover { border-color: #4a6cc0; }
  button.on { background: #2d4a8a; border-color: #4a6cc0; font-weight: 600; }
  #current-actor { color: #7ea6e0; font-size: 14px; }
  main { padding: 20px 32px 40px; display: grid; gap: 18px;
         grid-template-columns: repeat(auto-fit, minmax(430px, 1fr)); }
  .card { background: #141b2c; border: 1px solid #2a3450; border-radius: 12px; padding: 18px 20px; }
  .card h2 { margin: 0 0 6px; font-size: 16px; color: #cdd9f0; }
  .card.wide { grid-column: 1 / -1; }
  .hint { color: #9fb3d9; font-size: 13px; margin: 0 0 12px; line-height: 1.5; }
  code { background: #0d1220; border: 1px solid #26314e; border-radius: 5px;
         padding: 1px 5px; font-size: 12px; }
  .row { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; margin-bottom: 10px; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #9fb3d9; }
  select, input { font: inherit; background: #0d1220; color: #e6e8ee;
                  border: 1px solid #2a3450; border-radius: 8px; padding: 7px 9px; }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; align-items: center;
           margin-bottom: 12px; font-size: 12px; color: #9fb3d9; }
  .chip { padding: 4px 10px; border-radius: 999px; background: #182238; }
  .curl { position: relative; background: #0d1220; border: 1px solid #26314e;
          border-radius: 8px; padding: 12px 46px 12px 12px; font: 12px/1.6
          ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          color: #a8e0a0; overflow-x: auto; white-space: pre-wrap; word-break: break-all; }
  .copy { position: absolute; top: 8px; right: 8px; padding: 2px 9px; font-size: 11px; }
  .out { font: 13px/1.6 ui-monospace, Menlo, Consolas, monospace; margin-top: 10px; }
  .status { display: inline-block; min-width: 42px; text-align: center;
            border-radius: 6px; padding: 1px 8px; font-weight: 700; }
  .s200 { background: #1d4a2e; color: #7ee2a8; }
  .s403 { background: #4a3a1d; color: #ffd166; }
  .s404 { background: #43202d; color: #ff8fab; }
  .s4xx { background: #333d55; color: #b9c6e4; }
  .meaning { margin-left: 8px; color: #9fb3d9; }
  table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 13px; }
  th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #26314e; }
  th { color: #9fb3d9; font-weight: 600; }
  .flash { animation: flash .6s; }
  @keyframes flash { 0% { background: #22304e; } 100% { background: transparent; } }
  .note { border-left: 3px solid #7ea6e0; padding: 8px 12px; background: #101a30;
          border-radius: 0 8px 8px 0; font-size: 13px; color: #b9c6e4; line-height: 1.6; }
  body {
  background: #0b0d10;
  color: #e2e4e8;
}

header {
  padding: 28px 24px;
  background: #0b0d10;
  border-bottom: 1px solid #272b33;
}

header h1,
header p,
.actors {
  max-width: 1000px;
  margin-left: auto;
  margin-right: auto;
}

header p {
  margin-top: 8px;
  margin-bottom: 18px;
  line-height: 1.6;
}

main {
  max-width: 1048px;
  margin: 0 auto;
  padding: 24px;
  grid-template-columns: 1fr;
}

.card {
  background: #13161b;
  border-color: #2b3038;
  border-radius: 8px;
  padding: 22px;
}

button {
  border-radius: 6px;
  background: #20242b;
}

button.on {
  background: #26476f;
}

.hint {
  max-width: 85ch;
  line-height: 1.65;
}

.curl {
  white-space: pre;
  overflow-x: auto;
  word-break: normal;
}
</style>
</head>
<body>
<header>
  <h1>LoopBack 4 Oracle Lab <span class="branch">demo/wildcard-oracle</span></h1>
  <p>Deliberately vulnerable educational demo. Pick a fixture identity, click
     through the resolver cases, and watch what the status codes reveal. All
     traffic is plain HTTP — point your browser at a Burp Suite proxy to
     intercept and repeat any request. <code>X-Demo-User</code> is a fixture
     actor selector, <b>not</b> authentication.</p>
  <div class="actors">
    <span class="label">Choose your fixture identity:</span>
    <button id="btn-alice">Alice</button>
    <button id="btn-bob">Bob</button>
    <span id="current-actor"></span>
  </div>
</header>
<main>
  <section class="card">
    <h2>1 · POST /demo/identities/resolve</h2>
    <p class="hint">The server matches your <code>accessId</code> pattern against
       a stored secret. <span class="status s404">404</span> no match ·
       <span class="status s403">403</span> <b>matched, but it is not your
       identity</b> · <span class="status s200">200</span> matched and yours.
       Probing someone else's identity makes the difference between 403 and 404
       a disclosure signal.</p>
    <div class="row">
      <label>Target owner
        <select id="target-owner"><option>alice</option><option>bob</option></select>
      </label>
      <label>accessId pattern
        <input id="pattern" value="A%" size="14" placeholder="e.g. B%, BL_G, %">
      </label>
      <button id="resolve-go">Resolve</button>
    </div>
    <div class="chips">presets:
      <button class="chip" data-p="A%">A%</button>
      <button class="chip" data-p="B%">B%</button>
      <button class="chip" data-p="BL%">BL%</button>
      <button class="chip" data-p="BA%">BA%</button>
      <button class="chip" data-p="BL_G">BL_G</button>
      <button class="chip" data-p="%">%</button>
      <button class="chip" data-p="LOG">LOG</button>
    </div>
    <pre class="curl" id="resolver-curl"></pre>
    <div class="out" id="resolver-out">— no request yet —</div>
    <table id="log">
      <thead><tr><th>#</th><th>actor</th><th>target</th><th>pattern</th>
                 <th>status</th><th>meaning</th></tr></thead>
      <tbody></tbody>
    </table>
  </section>

  <section class="card">
    <h2>2 · GET /demo/users/{ownerId}/documents</h2>
    <p class="hint">This route wants the <b>exact</b> access ID as the sole
       credential (<code>X-Access-Id</code> header — it ignores
       <code>X-Demo-User</code>). Type the ID you reconstructed from the
       resolver's status codes and collect the documents.</p>
    <div class="row">
      <label>Owner
        <select id="doc-owner"><option>alice</option><option>bob</option></select>
      </label>
      <label>X-Access-Id
        <input id="access-id" value="B%" size="14" placeholder="the ID you reconstructed">
      </label>
      <button id="doc-go">Fetch documents</button>
    </div>
    <div class="chips">try:
      <button class="chip" data-id="B%">B%</button>
      <button class="chip" data-id="BL_G">BL_G</button>
      <button class="chip" data-id="blog">blog</button>
      <button class="chip" data-id="NOPE">NOPE</button>
      <button class="chip" data-id="">no header</button>
    </div>
    <pre class="curl" id="doc-curl"></pre>
    <div class="out" id="doc-out">— no request yet —</div>
  </section>

  <section class="card wide">
    <h2>Manual testing &amp; Burp Suite</h2>
    <p class="hint">Every button above issues an ordinary HTTP request you can
       capture: configure your browser (or system) proxy to Burp
       (default <code>127.0.0.1:8080</code>), then click the cases and inspect,
       repeat, and modify them in Burp's Repeater. The equivalent curl commands
       (copy button in the top-right corner of each box):</p>
    <pre class="curl" id="curl-manual-resolver"></pre>
    <p class="hint" style="margin-top:12px">Protected documents:</p>
    <pre class="curl" id="curl-manual-docs"></pre>
    <p class="note">If nothing works, check that you are browsing
       <code>http://127.0.0.1:3000/</code> and that the server has been
       restarted after the latest build — a stale process keeps serving the
       old routes.</p>
  </section>
</main>
<script>
(function () {
  'use strict';
  var ORIGIN = window.location.origin;
  var actor = 'alice';
  var counter = 0;

  function el(id) { return document.getElementById(id); }

  function setCurl(pre, text) {
    pre.dataset.command = text;
    pre.textContent = text;

    if (!pre.querySelector('.copy')) {
      var b = document.createElement('button');
      b.className = 'copy';
      b.textContent = 'copy';

      b.onclick = function () {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(pre.dataset.command);
        }
        b.textContent = 'copied';
        setTimeout(function () {
          b.textContent = 'copy';
        }, 900);
      };

      pre.appendChild(b);
    }
  }

  function resolverCurl(owner, pattern, act) {
    var body = JSON.stringify({ownerId: owner, accessId: pattern});

    return 'curl -sS -i -X POST ' +
      '-H ' + JSON.stringify('X-Demo-User: ' + act) + ' ' +
      '-H ' + JSON.stringify('Content-Type: application/json') + ' ' +
      '--data ' + JSON.stringify(body) + ' ' +
      ORIGIN + '/demo/identities/resolve';
  }

  function docsCurl(owner, id) {
    var header = id === ''
      ? ''
      : ' -H ' + JSON.stringify('X-Access-Id: ' + id);

    return 'curl -sS -i' + header + ' ' +
      ORIGIN + '/demo/users/' + owner + '/documents';
  }

  function meaning(status) {
    if (status === 200) return 'match — and it is your identity';
    if (status === 403) return 'pattern MATCHED the secret — but not your identity (the oracle)';
    if (status === 404) return 'pattern did not match the secret';
    return 'controlled rejection';
  }

  function setStatusOut(node, status, body) {
    var cls = status === 200 ? 's200' : status === 403 ? 's403' :
              status === 404 ? 's404' : 's4xx';
    node.innerHTML = '<span class="status ' + cls + '">' + status + '</span>' +
      '<span class="meaning">' + meaning(status) + '</span>' +
      '<div>' + body.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</div>';
    node.classList.remove('flash');
    void node.offsetWidth;
    node.classList.add('flash');
  }

  function setActor(a) {
    actor = a;
    el('btn-alice').classList.toggle('on', a === 'alice');
    el('btn-bob').classList.toggle('on', a === 'bob');
    el('current-actor').textContent = '→ acting as ' + a;

    setCurl(
      el('resolver-curl'),
      resolverCurl(el('target-owner').value, el('pattern').value, actor),
    );
  }

  function doResolve(pattern) {
    var owner = el('target-owner').value;
    var act = actor;
    el('pattern').value = pattern;
    setCurl(el('resolver-curl'), resolverCurl(owner, pattern, act));
    fetch(ORIGIN + '/demo/identities/resolve', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'X-Demo-User': act},
      body: JSON.stringify({ownerId: owner, accessId: pattern}),
    }).then(function (r) {
      return r.text().then(function (t) { return {s: r.status, t: t}; });
    }).then(function (res) {
      setStatusOut(el('resolver-out'), res.s, res.t || '(empty body)');
      counter++;
      var cls = res.s === 200 ? 's200' : res.s === 403 ? 's403' :
                res.s === 404 ? 's404' : 's4xx';
      var row = el('log').getElementsByTagName('tbody')[0].insertRow(-1);
      row.innerHTML = '<td>' + counter + '</td><td>' + act + '</td><td>' +
        owner + '</td><td><code>' + pattern.replace(/</g, '&lt;') +
        '</code></td><td><span class="status ' + cls + '">' + res.s +
        '</span></td><td>' + meaning(res.s) + '</td>';
    }).catch(function (e) {
      el('resolver-out').textContent = 'request failed: ' + e;
    });
  }

  function doDocs(id) {
    var owner = el('doc-owner').value;
    el('access-id').value = id;
    setCurl(el('doc-curl'), docsCurl(owner, id));
    var headers = {};
    if (id !== '') { headers['X-Access-Id'] = id; }
    fetch(ORIGIN + '/demo/users/' + owner + '/documents', {headers: headers})
      .then(function (r) {
        return r.text().then(function (t) { return {s: r.status, t: t}; });
      }).then(function (res) {
        var pretty = res.t;
        try {
          var docs = JSON.parse(res.t);
          if (Array.isArray(docs)) {
            pretty = docs.map(function (d) {
              return d.title + ' (' + d.visibility + ', owner ' + d.ownerId + ')';
            }).join(' | ') || '(empty list)';
          }
        } catch (ignore) { /* keep raw body */ }
        setStatusOut(el('doc-out'), res.s, pretty);
      }).catch(function (e) {
        el('doc-out').textContent = 'request failed: ' + e;
      });
  }

  el('btn-alice').onclick = function () { setActor('alice'); };
  el('btn-bob').onclick = function () { setActor('bob'); };
  el('resolve-go').onclick = function () { doResolve(el('pattern').value); };
  el('doc-go').onclick = function () { doDocs(el('access-id').value); };
  el('pattern').oninput = function () {
    setCurl(el('resolver-curl'),
      resolverCurl(el('target-owner').value, el('pattern').value, actor));
  };
  el('access-id').oninput = function () {
    setCurl(el('doc-curl'), docsCurl(el('doc-owner').value, el('access-id').value));
  };
  el('target-owner').onchange = el('pattern').oninput;
  el('doc-owner').onchange = el('access-id').oninput;

  var chips = document.querySelectorAll('.chip[data-p]');
  for (var i = 0; i < chips.length; i++) {
    chips[i].onclick = function () { doResolve(this.getAttribute('data-p')); };
  }
  var chips2 = document.querySelectorAll('.chip[data-id]');
  for (var j = 0; j < chips2.length; j++) {
    chips2[j].onclick = function () { doDocs(this.getAttribute('data-id')); };
  }

  setActor('alice');
  setCurl(el('resolver-curl'), resolverCurl('alice', 'A%', 'alice'));
  setCurl(el('doc-curl'), docsCurl('alice', 'B%'));
  setCurl(el('curl-manual-resolver'), resolverCurl('alice', 'BL%', 'bob'));
  setCurl(el('curl-manual-docs'), docsCurl('alice', '<reconstructed-id>'));
})();
</script>
</body>
</html>
`;
