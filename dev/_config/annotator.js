// annotator.js — the crew feedback annotator (dev-only, injected by serve.mjs).
//
// Loaded only on rendered component pages (never on the index/view chrome). Toggle
// "Annotate" mode, select text in the skill body, and leave a tagged comment — or add
// a whole-component note. Comments POST to the dev server (/__annotate) and persist in
// dev/feedback/annotations.json. When you tell the agent to "implement the feedback",
// it reads that sidecar and edits the source files.
//
// Anchoring is content-addressed: each comment stores the selected text + its nearest
// heading/step + which occurrence it is. That survives a re-render and lets the
// renderer stay byte-identical (no data-* line markers baked into the HTML). On load,
// saved comments re-anchor to the live text and show as highlights; text that has since
// changed is flagged "stale" rather than mis-placed.

(function () {
  if (window.__crewAnnotatorLoaded) return;
  window.__crewAnnotatorLoaded = true;

  var CFG = window.__CREW_FB;
  if (!CFG || !CFG.page) return; // only where the server injected page context
  // root spans the whole page (frontmatter readout + title + body) so anything on the
  // page is annotatable, including the generated preview text.
  var article = document.querySelector('.page') || document.querySelector('.skill-body');
  if (!article) return;

  var CTX = 48; // chars of prefix/suffix kept for disambiguation
  var hasHL = !!(window.CSS && CSS.highlights && window.Highlight);
  var annotations = [];
  var ranges = {}; // id -> Range (for scroll + highlight)

  // ── text model: flat string + text-node offset map over .skill-body ───────────
  function buildText() {
    var walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT, null);
    var nodes = [], text = '', n;
    while ((n = walker.nextNode())) {
      nodes.push({ node: n, start: text.length });
      text += n.nodeValue;
    }
    return { text: text, nodes: nodes };
  }
  function pointToOffset(model, node, offsetInNode) {
    for (var i = 0; i < model.nodes.length; i++) {
      if (model.nodes[i].node === node) return model.nodes[i].start + offsetInNode;
    }
    return -1;
  }
  function offsetToPoint(model, offset) {
    for (var i = 0; i < model.nodes.length; i++) {
      var e = model.nodes[i], len = e.node.nodeValue.length;
      if (offset <= e.start + len) return { node: e.node, offset: Math.max(0, offset - e.start) };
    }
    var last = model.nodes[model.nodes.length - 1];
    return last ? { node: last.node, offset: last.node.nodeValue.length } : null;
  }
  function offsetsToRange(model, start, end) {
    var a = offsetToPoint(model, start), b = offsetToPoint(model, end);
    if (!a || !b) return null;
    var r = document.createRange();
    r.setStart(a.node, a.offset);
    r.setEnd(b.node, b.offset);
    return r;
  }

  // nearest heading / step whose id names the anchor's section (a real source heading)
  function sectionFor(node) {
    var cands = article.querySelectorAll('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id],details.step[id]');
    var best = null;
    for (var i = 0; i < cands.length; i++) {
      var pos = cands[i].compareDocumentPosition(node);
      // node follows cands[i], or node is inside cands[i] (a step body) → cands[i] scopes it
      if ((pos & Node.DOCUMENT_POSITION_FOLLOWING) || (pos & Node.DOCUMENT_POSITION_CONTAINED_BY)) best = cands[i];
    }
    if (!best) return { section: '', sectionText: '' };
    var t = best.tagName === 'DETAILS' ? (best.querySelector('.step__title') || best).textContent : best.textContent;
    return { section: best.id, sectionText: (t || '').trim().replace(/\s+/g, ' ').slice(0, 120) };
  }

  // which region the selection sits in — a routing hint for the agent, since generated
  // preview text resolves to a different place than body prose (see CLAUDE.md): the
  // frontmatter readout maps to the file's YAML, a section-desc note to render.mjs.
  function regionOf(node) {
    var el = node && node.nodeType === 3 ? node.parentElement : node;
    if (el && el.closest) {
      if (el.closest('.skill-frontmatter')) return 'frontmatter';
      if (el.closest('.section-desc')) return 'section-desc';
    }
    return 'body';
  }

  function anchorFromSelection(sel) {
    var range = sel.getRangeAt(0);
    var model = buildText();
    var start = pointToOffset(model, range.startContainer, range.startOffset);
    var end = pointToOffset(model, range.endContainer, range.endOffset);
    if (start < 0 || end < 0) return null;
    if (start > end) { var tmp = start; start = end; end = tmp; }
    var quote = model.text.slice(start, end);
    if (!quote.trim()) return null;
    // occurrence = how many identical quotes precede this one (disambiguates dupes)
    var occ = 0, idx = model.text.indexOf(quote);
    while (idx !== -1 && idx < start) { occ++; idx = model.text.indexOf(quote, idx + 1); }
    var sec = sectionFor(range.startContainer);
    return {
      section: sec.section,
      sectionText: sec.sectionText,
      region: regionOf(range.startContainer),
      quote: quote,
      prefix: model.text.slice(Math.max(0, start - CTX), start),
      suffix: model.text.slice(end, end + CTX),
      occurrence: occ,
    };
  }

  // re-find an anchor's text in the current DOM → a Range (null if the text is gone)
  function locate(model, anchor) {
    if (!anchor || !anchor.quote) return null;
    var q = anchor.quote, starts = [], idx = model.text.indexOf(q);
    while (idx !== -1) { starts.push(idx); idx = model.text.indexOf(q, idx + 1); }
    if (!starts.length) return null;
    var pick = starts[anchor.occurrence] != null ? starts[anchor.occurrence] : starts[0];
    if (starts.length > 1 && (anchor.prefix || anchor.suffix)) {
      for (var i = 0; i < starts.length; i++) {
        var s = starts[i];
        var pre = model.text.slice(Math.max(0, s - anchor.prefix.length), s);
        var suf = model.text.slice(s + q.length, s + q.length + anchor.suffix.length);
        if ((!anchor.prefix || pre.endsWith(anchor.prefix)) && (!anchor.suffix || suf.startsWith(anchor.suffix))) { pick = s; break; }
      }
    }
    return offsetsToRange(model, pick, pick + q.length);
  }

  // ── highlights (CSS Custom Highlight API; gracefully absent if unsupported) ────
  var hlAll = hasHL ? new Highlight() : null;
  var hlActive = hasHL ? new Highlight() : null;
  if (hasHL) { CSS.highlights.set('crew-fb', hlAll); CSS.highlights.set('crew-fb-active', hlActive); }

  function renderHighlights() {
    ranges = {};
    if (hasHL) { hlAll.clear(); hlActive.clear(); }
    var model = buildText();
    annotations.forEach(function (a) {
      a._stale = false;
      if (a.kind === 'note' || !a.anchor) return;
      var r = locate(model, a.anchor);
      if (r) { ranges[a.id] = r; if (hasHL) hlAll.add(r); }
      else a._stale = true;
    });
  }

  // ── styles ────────────────────────────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = [
    '.cfb-btn{position:fixed;right:18px;bottom:18px;z-index:2147483000;font:700 12px/1 var(--sans);letter-spacing:.12em;text-transform:uppercase;color:var(--paper);background:var(--ink);border:0;padding:11px 15px;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.25)}',
    '.cfb-btn.is-on{background:var(--red)}',
    '.cfb-panel{position:fixed;top:0;right:0;bottom:0;width:340px;max-width:86vw;z-index:2147482000;background:var(--paper);border-left:1px solid var(--rule);display:flex;flex-direction:column;transform:translateX(100%);transition:transform .18s ease;box-shadow:-2px 0 18px rgba(0,0,0,.15)}',
    '.cfb-panel.is-open{transform:none}',
    '.cfb-head{display:flex;align-items:baseline;justify-content:space-between;padding:16px 16px 12px;border-bottom:2px solid var(--rule)}',
    '.cfb-title{font:700 .8rem/1 var(--sans);letter-spacing:.14em;text-transform:uppercase}',
    '.cfb-title b{color:var(--red)}',
    '.cfb-add{font:700 .66rem/1 var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--ink);background:none;border:1px solid var(--rule);padding:6px 9px;cursor:pointer}',
    '.cfb-add:hover{background:var(--ink);color:var(--paper)}',
    '.cfb-list{flex:1;overflow:auto;padding:10px 12px 40px}',
    '.cfb-empty{color:var(--muted);font-size:.82rem;padding:14px 4px;line-height:1.5}',
    '.cfb-card{border:1px solid var(--rule-soft);border-left:3px solid var(--red);padding:9px 10px;margin:0 0 9px}',
    '.cfb-card.is-stale{border-left-color:var(--muted);opacity:.75}',
    '.cfb-region{display:inline-block;font:700 .56rem/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--muted);border:1px solid var(--rule-soft);padding:2px 6px;margin-bottom:6px}',
    '.cfb-quote{font:.74rem/1.4 var(--mono);color:var(--muted);border-left:2px solid var(--rule-soft);padding-left:7px;margin:5px 0;cursor:pointer}',
    '.cfb-warn{font:.72rem/1.4 var(--sans);color:var(--red);margin:5px 0}',
    '.cfb-note{font-size:.84rem;line-height:1.45;white-space:pre-wrap;word-break:break-word}',
    '.cfb-acts{display:flex;gap:12px;margin-top:8px}',
    '.cfb-act{font:700 .6rem/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);background:none;border:0;padding:2px 0;cursor:pointer}',
    '.cfb-act:hover{color:var(--red)}',
    '.cfb-pop{position:fixed;z-index:2147483500;width:290px;max-width:92vw;background:var(--paper);border:1px solid var(--rule);box-shadow:0 6px 26px rgba(0,0,0,.3);padding:12px}',
    '.cfb-pop .cfb-quote{max-height:66px;overflow:auto;cursor:default}',
    '.cfb-ta{width:100%;min-height:66px;font:.86rem/1.45 var(--sans);color:var(--ink);background:var(--paper);border:1px solid var(--rule);padding:7px;resize:vertical;box-sizing:border-box}',
    '.cfb-row{display:flex;justify-content:flex-end;gap:8px;margin-top:9px}',
    '.cfb-save{font:700 .66rem/1 var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--paper);background:var(--red);border:0;padding:8px 12px;cursor:pointer}',
    '.cfb-cancel{font:700 .66rem/1 var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--muted);background:none;border:1px solid var(--rule-soft);padding:8px 12px;cursor:pointer}',
    '.cfb-toast{position:fixed;left:50%;bottom:70px;transform:translateX(-50%);z-index:2147483600;background:var(--ink);color:var(--paper);font:600 .78rem/1.35 var(--sans);padding:9px 14px;max-width:80vw;text-align:center;opacity:0;transition:opacity .2s;pointer-events:none}',
    '.cfb-toast.is-on{opacity:1}',
    '::highlight(crew-fb){background-color:rgba(226,35,26,.18)}',
    '::highlight(crew-fb-active){background-color:rgba(226,35,26,.42)}',
    '@media (prefers-color-scheme:dark){::highlight(crew-fb){background-color:rgba(255,59,48,.26)}::highlight(crew-fb-active){background-color:rgba(255,59,48,.5)}}',
  ].join('');
  document.head.appendChild(style);

  // ── chrome: toast, toggle button, sidebar panel ───────────────────────────────
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  var toast, toastT;
  function showToast(msg) {
    if (!toast) { toast = document.createElement('div'); toast.className = 'cfb-toast'; document.body.appendChild(toast); }
    toast.textContent = msg;
    toast.classList.add('is-on');
    clearTimeout(toastT);
    toastT = setTimeout(function () { toast.classList.remove('is-on'); }, 2400);
  }

  var btn = document.createElement('button');
  btn.className = 'cfb-btn';
  btn.type = 'button';

  var panel = document.createElement('aside');
  panel.className = 'cfb-panel';
  panel.innerHTML =
    '<div class="cfb-head"><span class="cfb-title">Feedback <b class="cfb-count">0</b></span>' +
    '<button class="cfb-add" type="button">＋ Note</button></div>' +
    '<div class="cfb-list"></div>';
  var listEl = panel.querySelector('.cfb-list');
  var countEl = panel.querySelector('.cfb-count');
  document.body.appendChild(panel);
  document.body.appendChild(btn);

  var mode = sessionStorage.getItem('cfbMode') === '1';
  function setMode(on) {
    mode = on;
    sessionStorage.setItem('cfbMode', on ? '1' : '0');
    btn.classList.toggle('is-on', on);
    btn.textContent = on ? '✎ Annotating' : '✎ Annotate';
    panel.classList.toggle('is-open', on);
    if (!on) closePopover();
  }
  btn.addEventListener('click', function () { setMode(!mode); });
  panel.querySelector('.cfb-add').addEventListener('click', function () {
    openPopover({ kind: 'note', anchor: null, atRect: null });
  });

  // ── comment popover ───────────────────────────────────────────────────────────
  var pop = null;
  function closePopover() { if (pop) { pop.remove(); pop = null; } }

  function openPopover(opts) {
    closePopover();
    pop = document.createElement('div');
    pop.className = 'cfb-pop';
    var quoteHtml = opts.anchor && opts.anchor.quote ? '<div class="cfb-quote"></div>' : '';
    pop.innerHTML = quoteHtml +
      '<textarea class="cfb-ta" placeholder="Your feedback…"></textarea>' +
      '<div class="cfb-row"><button class="cfb-cancel" type="button">Cancel</button>' +
      '<button class="cfb-save" type="button">Save</button></div>';
    if (opts.anchor && opts.anchor.quote) pop.querySelector('.cfb-quote').textContent = truncate(opts.anchor.quote, 180);
    var ta = pop.querySelector('.cfb-ta');
    if (opts.existing) ta.value = opts.existing.note || '';
    pop.querySelector('.cfb-cancel').addEventListener('click', closePopover);
    pop.querySelector('.cfb-save').addEventListener('click', function () {
      var note = ta.value.trim();
      if (!note) { ta.focus(); return; }
      if (opts.existing) update(opts.existing.id, { note: note });
      else if (opts.kind === 'note') create({ kind: 'note', note: note });
      else create({ kind: 'anchored', note: note, anchor: opts.anchor });
      var s = window.getSelection(); if (s) s.removeAllRanges();
      closePopover();
    });
    document.body.appendChild(pop);
    positionPopover(pop, opts.atRect);
    ta.focus();
  }

  function positionPopover(el, rect) {
    var w = el.offsetWidth, h = el.offsetHeight, pad = 10;
    var vw = window.innerWidth, vh = window.innerHeight, left, top;
    if (rect) {
      left = Math.min(Math.max(pad, rect.left), vw - w - pad);
      top = rect.bottom + 8;
      if (top + h > vh - pad) top = Math.max(pad, rect.top - h - 8);
    } else {
      left = (vw - w) / 2; top = Math.max(pad, (vh - h) / 2);
    }
    el.style.left = left + 'px';
    el.style.top = top + 'px';
  }

  // ── selection → comment ───────────────────────────────────────────────────────
  document.addEventListener('mouseup', function () {
    if (!mode) return;
    setTimeout(function () { // let the selection settle
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) return;
      if (sel.anchorNode && (panel.contains(sel.anchorNode) || (pop && pop.contains(sel.anchorNode)))) return;
      var a = anchorFromSelection(sel);
      if (!a) return;
      var rect = sel.getRangeAt(0).getBoundingClientRect();
      openPopover({ kind: 'anchored', anchor: a, atRect: rect });
    }, 10);
  });

  // ── server calls ──────────────────────────────────────────────────────────────
  function api(path, opts) {
    return fetch(path, opts).then(function (r) {
      if (!r.ok) return r.json().then(function (e) { throw new Error(e.error || r.status); });
      return r.json();
    });
  }
  function create(payload) {
    payload.page = CFG.page;
    api('/__annotate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (rec) { annotations.push(rec); refresh(); showToast('Saved'); })
      .catch(function (e) { showToast('Save failed: ' + e.message); });
  }
  function update(id, patch) {
    patch.id = id;
    api('/__annotate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
      .then(function (rec) { annotations = annotations.map(function (a) { return a.id === id ? rec : a; }); refresh(); })
      .catch(function (e) { showToast('Update failed: ' + e.message); });
  }
  function del(id) {
    api('/__annotate?id=' + encodeURIComponent(id), { method: 'DELETE' })
      .then(function () { annotations = annotations.filter(function (a) { return a.id !== id; }); refresh(); })
      .catch(function (e) { showToast('Delete failed: ' + e.message); });
  }
  function resolveItem(id) {
    api('/__resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id }) })
      .then(function () { annotations = annotations.filter(function (a) { return a.id !== id; }); refresh(); showToast('Resolved'); })
      .catch(function (e) { showToast('Resolve failed: ' + e.message); });
  }

  // ── sidebar list ──────────────────────────────────────────────────────────────
  function refresh() {
    renderHighlights();
    renderList();
    countEl.textContent = String(annotations.length);
  }
  function renderList() {
    listEl.innerHTML = '';
    if (!annotations.length) {
      var e = document.createElement('div');
      e.className = 'cfb-empty';
      e.textContent = 'No feedback yet. Select text in the skill and leave a comment, or add a component note.';
      listEl.appendChild(e);
      return;
    }
    annotations.forEach(function (a) {
      var card = document.createElement('div');
      card.className = 'cfb-card' + (a._stale ? ' is-stale' : '');
      var region = (a.anchor && a.anchor.region && a.anchor.region !== 'body')
        ? '<span class="cfb-region">' + esc(a.anchor.region) + '</span>' : '';
      var quote = a.kind === 'note'
        ? '<div class="cfb-quote">Component note</div>'
        : (a.anchor && a.anchor.quote ? '<div class="cfb-quote" data-goto="1">' + esc(truncate(a.anchor.quote, 120)) + '</div>' : '');
      var warn = a._stale ? '<div class="cfb-warn">⚠ text changed — re-anchor manually</div>' : '';
      card.innerHTML = region + quote + warn + '<div class="cfb-note">' + esc(a.note || '') + '</div>' +
        '<div class="cfb-acts"><button class="cfb-act" data-a="edit">Edit</button>' +
        '<button class="cfb-act" data-a="resolve">Resolve</button>' +
        '<button class="cfb-act" data-a="del">Delete</button></div>';
      card.addEventListener('click', function (ev) {
        var act = ev.target.getAttribute && ev.target.getAttribute('data-a');
        if (act === 'edit') { openPopover({ kind: a.kind, anchor: a.anchor, existing: a, atRect: null }); return; }
        if (act === 'resolve') { resolveItem(a.id); return; }
        if (act === 'del') { del(a.id); return; }
        focusAnnotation(a);
      });
      listEl.appendChild(card);
    });
  }
  function focusAnnotation(a) {
    var r = ranges[a.id];
    if (!r) return;
    if (hasHL) { hlActive.clear(); hlActive.add(r); setTimeout(function () { hlActive.clear(); }, 1600); }
    var rect = r.getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + rect.top - 120, behavior: 'smooth' });
  }

  // ── load ──────────────────────────────────────────────────────────────────────
  api('/__annotations?page=' + encodeURIComponent(CFG.page), {})
    .then(function (data) { annotations = data.annotations || []; })
    .catch(function () { annotations = []; })
    .then(function () { setMode(mode); refresh(); });
})();
