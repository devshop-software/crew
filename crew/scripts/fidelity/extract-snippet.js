// crew fidelity — in-page extraction snippet.
//
// A single self-contained arrow function. The crew:ui-review agent reads this
// file verbatim and passes its contents to the Playwright MCP `browser_evaluate`
// tool, on both the running build's route and (when available) the design's
// rendered preview. It runs IN the page, so it sees real computed styles and the
// real FontFaceSet — the two things a screenshot or a VLM cannot measure.
//
// Returns a JSON-serialisable object consumed by compare.cjs. No imports, no
// page mutation, read-only. Async so it can await font settling first — without
// it a genuinely-used face still loading would read "unloaded" and trip a false
// "never loads" delta.
async () => {
  try { await document.fonts.ready; } catch (e) {}
  var MAX_ELEMENTS = 500;

  function primaryFamily(stack) {
    // "Inter, \"Inter Fallback\"" -> "Inter"; "'Schibsted Grotesk', ui-sans" -> "Schibsted Grotesk"
    if (!stack) return '';
    var first = String(stack).split(',')[0].trim();
    return first.replace(/^["']|["']$/g, '').trim();
  }

  function pxNum(v) {
    var n = parseFloat(v);
    return isNaN(n) ? null : Math.round(n * 100) / 100;
  }

  function normKey(t) {
    // lowercase + collapse whitespace; digit-runs -> '#' so version/date/count
    // text aligns by shape, not by volatile value.
    return String(t).toLowerCase().replace(/\s+/g, ' ').trim().replace(/\d+/g, '#');
  }

  function implicitRole(el) {
    var r = el.getAttribute && el.getAttribute('role');
    if (r) return r;
    var tag = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) return 'heading';
    if (tag === 'a' && el.getAttribute('href') != null) return 'link';
    if (tag === 'button') return 'button';
    if (tag === 'label') return 'label';
    if (tag === 'p') return 'paragraph';
    if (tag === 'li') return 'listitem';
    return 'text';
  }

  function ownText(el) {
    var t = '';
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3) t += n.textContent;
    }
    t = t.replace(/\s+/g, ' ').trim();
    if (!t) {
      var aria = el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('alt'));
      if (aria) t = String(aria).replace(/\s+/g, ' ').trim();
    }
    return t;
  }

  function isVisible(el, cs) {
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    if (parseFloat(cs.opacity) === 0) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0.5 && r.height > 0.5;
  }

  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, HEAD: 1, META: 1, LINK: 1, TITLE: 1 };

  var elements = [];
  var usedFamilies = {};
  var all = document.querySelectorAll('*');
  for (var i = 0; i < all.length && elements.length < MAX_ELEMENTS; i++) {
    var el = all[i];
    if (SKIP[el.tagName]) continue;
    var cs;
    try { cs = getComputedStyle(el); } catch (e) { continue; }
    if (!isVisible(el, cs)) continue;
    var text = ownText(el);
    if (!text) continue; // text-bearing leaves only — drops wrappers / RSC / script noise

    var rect = el.getBoundingClientRect();
    var prim = primaryFamily(cs.fontFamily);
    if (prim) usedFamilies[prim.toLowerCase()] = prim;
    var tag = el.tagName.toLowerCase();
    elements.push({
      text: text.length > 160 ? text.slice(0, 160) : text,
      key: normKey(text),
      role: implicitRole(el),
      tag: tag,
      level: /^h[1-6]$/.test(tag) ? parseInt(tag[1], 10) : null,
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
      font: {
        family: cs.fontFamily,
        primary: prim,
        size: pxNum(cs.fontSize),
        weight: parseInt(cs.fontWeight, 10) || cs.fontWeight,
        style: cs.fontStyle,
        lineHeight: pxNum(cs.lineHeight),
        letterSpacing: cs.letterSpacing === 'normal' ? 0 : pxNum(cs.letterSpacing),
        transform: cs.textTransform
      },
      color: cs.color,
      bg: cs.backgroundColor
    });
  }

  // FontFaceSet — the load fact (loaded vs unloaded), the measurement a VLM cannot do.
  var fonts = [];
  try {
    document.fonts.forEach(function (f) {
      fonts.push({ family: f.family.replace(/^["']|["']$/g, ''), weight: f.weight, style: f.style, status: f.status });
    });
  } catch (e) {}

  // Best-effort scan of :root custom properties that look type-related (same-origin sheets only).
  var rootVars = {};
  try {
    var rootCS = getComputedStyle(document.documentElement);
    var seen = {};
    for (var s = 0; s < document.styleSheets.length; s++) {
      var rules;
      try { rules = document.styleSheets[s].cssRules; } catch (e) { continue; }
      if (!rules) continue;
      for (var r2 = 0; r2 < rules.length; r2++) {
        var rule = rules[r2];
        if (!rule.style) continue;
        for (var p = 0; p < rule.style.length; p++) {
          var name = rule.style[p];
          if (name.indexOf('--') !== 0 || seen[name]) continue;
          if (!/font|--t-|text|type|leading|tracking/i.test(name)) continue;
          seen[name] = 1;
          var val = rootCS.getPropertyValue(name).trim();
          if (val) rootVars[name] = val;
        }
      }
    }
  } catch (e) {}

  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    elements: elements,
    fonts: fonts,
    usedFamilies: Object.keys(usedFamilies).map(function (k) { return usedFamilies[k]; }),
    rootVars: rootVars
  };
}
