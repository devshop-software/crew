#!/usr/bin/env node
// crew fidelity — comparator + verdict.
//
// Pure Node, zero dependencies. Reads the build extract (and, when available, a
// design extract from the rendered preview and/or the design's token CSS) and
// emits a structured fidelity verdict as JSON on stdout.
//
// Measurement holds the verdict: the load-bearing check is the token-anchored
// font-load assertion (a font face the design declares and expects on this route
// must actually load and be used in the build) — it needs only the build extract
// + the design tokens, and it catches the exact class of bug a geometry/eyeball
// gate misses.
//
//   node compare.cjs --build build.json [--design-extract design.json]
//                    [--design-css tokens.css]
//   node compare.cjs --selftest
//
// A measured MAJOR always gates: `status` is FAIL. There is no advisory mode.
// Exit code: 0 on PASS, 1 on FAIL, 2 on a usage/IO error. The JSON `status` is
// the source of truth; the agent maps it to the MR-comment verdict and owns the
// separate BLOCKED case (design source unreachable).

'use strict';
const fs = require('fs');

// ---------- helpers ----------
function readJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function ci(s) { return String(s || '').toLowerCase().trim(); }
function primaryFamily(stack) {
  if (!stack) return '';
  return String(stack).split(',')[0].trim().replace(/^["']|["']$/g, '').trim();
}
function weightNum(w) {
  if (w === 'normal') return 400;
  if (w === 'bold') return 700;
  const n = parseInt(w, 10);
  return isNaN(n) ? 400 : n;
}
function iou(a, b) {
  if (!a || !b) return 0;
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const uni = a.w * a.h + b.w * b.h - inter;
  return uni > 0 ? inter / uni : 0;
}

// Parse design token CSS text into a { --name: value } map and derive font intent.
function parseDesignCss(text) {
  const vars = {};
  // value runs to the next ';' OR '}', so a final declaration with no trailing ';' still parses.
  const re = /(--[A-Za-z0-9-]+)\s*:\s*([^;}]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) vars[m[1].trim()] = m[2].trim();
  const families = {};
  for (const name in vars) {
    // font-FAMILY tokens only — exclude --font-size / -weight / -feature / -variation / etc.
    if (!/--font/i.test(name) || /--font-(size|weight|feature|variation|smoothing|style|variant|stretch|kerning|synthesis|optical|language|palette)/i.test(name)) continue;
    const fam = primaryFamily(vars[name]);
    if (fam && !/^var\(/.test(fam) && !/^[\d.]/.test(fam)) families[ci(fam)] = { family: fam, token: name };
  }
  const display = vars['--font-display'] ? primaryFamily(vars['--font-display']) : null;
  return { vars, families, display: display && !/^var\(/.test(display) ? display : null };
}

// ---------- the font-load assertion (the spine) ----------
// designUsed: the set of families the design actually paints on this route (from a render);
// empty in tokens-only mode, where we assert only the display face.
function fontAssertions(build, design, designUsed) {
  const deltas = [];
  const loadedFams = {}, bundledFams = {}, erroredFams = {};
  (build.fonts || []).forEach(f => {
    const fam = ci(f.family);
    bundledFams[fam] = true;
    if (f.status === 'loaded') loadedFams[fam] = true;
    if (f.status === 'error') erroredFams[fam] = true;
  });
  const usedFams = {};
  (build.usedFamilies || []).forEach(f => { usedFams[ci(f)] = true; });
  (build.elements || []).forEach(e => { if (e.font && e.font.primary) usedFams[ci(e.font.primary)] = true; });

  const display = design && design.display ? ci(design.display) : null;
  const declared = design && design.families ? Object.values(design.families) : [];
  declared.forEach(({ family, token }) => {
    const fam = ci(family);
    // Assert load only for a face the design expects on THIS route: the display face always,
    // plus (with a design render) any family the design paints. Avoids false-failing a
    // bundled-but-unused secondary/mono face the route legitimately never paints.
    const expected = fam === display || (designUsed && designUsed.has(fam));
    if (expected && bundledFams[fam] && !loadedFams[fam]) {
      deltas.push({
        severity: 'MAJOR', dimension: 'font-load',
        title: `Design face "${family}" never loads`,
        detail: `Design token ${token} declares "${family}" (expected on this route), it is bundled in the build (document.fonts), but no face reports status=loaded — ${erroredFams[fam] ? 'a face was requested but failed to load (check the @font-face src / network).' : 'the page never requests it.'}`
      });
    }
  });
  if (display && !usedFams[display]) {
    deltas.push({
      severity: 'MAJOR', dimension: 'font-load',
      title: `Display face "${design.display}" is declared but unused`,
      detail: `--font-display is "${design.display}", but no built text element computes it (built type falls back to another family).`
    });
  }
  return deltas;
}

// ---------- per-element type comparison (needs a design extract) ----------
function alignAndDiff(build, design) {
  const deltas = [];
  const buildByKey = {};
  (build.elements || []).forEach((e, i) => { (buildByKey[e.key] = buildByKey[e.key] || []).push({ e, i, taken: false }); });

  function claim(d) {
    const bucket = buildByKey[d.key];
    if (!bucket) return null;
    let best = null, bestScore = -1;
    for (const cand of bucket) {
      if (cand.taken) continue;
      // role is the secondary key (dominates); bbox-IoU (0..1) only separates same-role candidates.
      const score = (cand.e.role === d.role ? 2 : 0) + iou(d.rect, cand.e.rect);
      if (score > bestScore) { bestScore = score; best = cand; }
    }
    if (best) best.taken = true;
    return best ? best.e : null;
  }

  (design.elements || []).forEach(d => {
    if (!d.key) return;
    const b = claim(d);
    if (!b) {
      deltas.push({
        severity: 'MAJOR', dimension: 'completeness',
        title: `Missing element: "${d.text}"`,
        detail: `The design renders "${d.text}" (${d.role}); no matching element was found in the build at the same place.`,
        surface: d.text
      });
      return;
    }
    const df = d.font, bf = b.font;
    if (!df || !bf) return; // malformed element — skip rather than crash the gate
    if (ci(df.primary) && ci(bf.primary) && ci(df.primary) !== ci(bf.primary)) {
      deltas.push({
        severity: 'MAJOR', dimension: 'typography',
        title: `Wrong font on "${d.text}"`,
        detail: `design ${df.primary} vs built ${bf.primary}`, surface: d.text
      });
    }
    if (df.size != null && bf.size != null) {
      const diff = Math.abs(df.size - bf.size);
      if (diff > Math.max(2, df.size * 0.1)) {
        deltas.push({ severity: 'MAJOR', dimension: 'typography', title: `Wrong font-size on "${d.text}"`, detail: `design ${df.size}px vs built ${bf.size}px`, surface: d.text });
      } else if (diff >= 1) {
        deltas.push({ severity: 'MINOR', dimension: 'typography', title: `Near-miss font-size on "${d.text}"`, detail: `design ${df.size}px vs built ${bf.size}px`, surface: d.text });
      }
    }
    const dw = weightNum(df.weight), bw = weightNum(bf.weight);
    if (Math.abs(dw - bw) >= 100) {
      deltas.push({ severity: 'MAJOR', dimension: 'typography', title: `Wrong font-weight on "${d.text}"`, detail: `design ${dw} vs built ${bw}`, surface: d.text });
    }
    if (df.lineHeight != null && bf.lineHeight != null && Math.abs(df.lineHeight - bf.lineHeight) > 2) {
      deltas.push({ severity: 'MINOR', dimension: 'typography', title: `Line-height drift on "${d.text}"`, detail: `design ${df.lineHeight}px vs built ${bf.lineHeight}px`, surface: d.text });
    }
    if (Math.abs((df.letterSpacing || 0) - (bf.letterSpacing || 0)) > 0.5) {
      deltas.push({ severity: 'MINOR', dimension: 'typography', title: `Letter-spacing drift on "${d.text}"`, detail: `design ${df.letterSpacing}px vs built ${bf.letterSpacing}px`, surface: d.text });
    }
  });

  // Extra elements — build text the design render has no match for (a hand-rolled addition). MINOR,
  // capped so a content-rich build route can't drown the real signal against a leaner design preview.
  const EXTRA_CAP = 5;
  const extras = [];
  Object.keys(buildByKey).forEach(k => { buildByKey[k].forEach(c => { if (!c.taken) extras.push(c.e); }); });
  extras.slice(0, EXTRA_CAP).forEach(e => deltas.push({
    severity: 'MINOR', dimension: 'completeness',
    title: `Extra element: "${e.text}"`,
    detail: `The build renders "${e.text}" (${e.role}); the design render has no matching element.`,
    surface: e.text
  }));
  if (extras.length > EXTRA_CAP) deltas.push({
    severity: 'MINOR', dimension: 'completeness',
    title: `${extras.length - EXTRA_CAP} more extra build elements`,
    detail: `${extras.length} build text elements have no design match; the first ${EXTRA_CAP} are listed above.`
  });
  return deltas;
}

// ---------- run ----------
function evaluate({ build, design, designExtract }) {
  const designUsed = new Set();
  if (designExtract) {
    (designExtract.usedFamilies || []).forEach(f => designUsed.add(ci(f)));
    (designExtract.elements || []).forEach(e => { if (e.font && e.font.primary) designUsed.add(ci(e.font.primary)); });
  }
  let deltas = [];
  deltas = deltas.concat(fontAssertions(build, design, designUsed));
  if (designExtract) deltas = deltas.concat(alignAndDiff(build, designExtract));

  const major = deltas.filter(d => d.severity === 'MAJOR');
  const minor = deltas.filter(d => d.severity === 'MINOR');
  // A measured MAJOR always gates — there is no advisory mode.
  const status = major.length > 0 ? 'FAIL' : 'PASS';
  return {
    status,
    checks: {
      fontLoad: !!design,
      perElement: !!designExtract,
      perElementNote: designExtract ? null : 'No design render provided — per-element type comparison skipped (font-load assertion + token check only). Token→element ownership not closed in this mode.'
    },
    counts: { major: major.length, minor: minor.length },
    deltas: major.concat(minor),
    summary: status === 'FAIL'
      ? `${major.length} MAJOR fidelity delta(s) — gate FAIL.`
      : `No MAJOR fidelity delta. ${minor.length} MINOR note(s).`
  };
}

function loadArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--selftest') a.selftest = true;
    else if (k === '--build') a.build = argv[++i];
    else if (k === '--design-extract') a.designExtract = argv[++i];
    else if (k === '--design-css') a.designCss = argv[++i];
  }
  return a;
}

function main() {
  const a = loadArgs(process.argv);
  if (a.selftest) return selftest();
  if (!a.build) { process.stderr.write('usage: compare.cjs --build build.json [--design-extract d.json] [--design-css t.css]\n'); process.exit(2); }
  let build, design = null, designExtract = null;
  try {
    build = readJSON(a.build);
    if (a.designCss) design = parseDesignCss(fs.readFileSync(a.designCss, 'utf8'));
    if (a.designExtract) designExtract = readJSON(a.designExtract);
  } catch (e) { process.stderr.write('IO error: ' + e.message + '\n'); process.exit(2); }
  const out = evaluate({ build, design, designExtract });
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  process.exit(out.status === 'FAIL' ? 1 : 0);
}

// ---------- embedded self-test (the login regression + the false-positive guards) ----------
function selftest() {
  const buildLogin = {
    fonts: [
      { family: 'Inter', weight: '100 900', status: 'loaded' },
      { family: 'Schibsted Grotesk', weight: '400 900', status: 'unloaded' }
    ],
    usedFamilies: ['Inter'],
    elements: [{ text: 'Sign in', key: 'sign in', role: 'text', tag: 'div', rect: { x: 600, y: 300, w: 120, h: 32 },
      font: { family: 'Inter, "Inter Fallback"', primary: 'Inter', size: 24, weight: 700, lineHeight: 32, letterSpacing: -0.48 } }]
  };
  const designCss = `:root { --font-display: 'Schibsted Grotesk', 'Inter', ui-sans-serif; --t-h1: 600 22px/1.18 var(--font-display); }`;
  const designExtract = {
    elements: [{ text: 'Sign in', key: 'sign in', role: 'heading', tag: 'h1', rect: { x: 604, y: 300, w: 118, h: 26 },
      font: { family: '"Schibsted Grotesk"', primary: 'Schibsted Grotesk', size: 22, weight: 600, lineHeight: 26, letterSpacing: 0 } }]
  };
  const design = parseDesignCss(designCss);

  let pass = true; const log = [];
  function check(name, cond) { log.push((cond ? 'ok   ' : 'FAIL ') + name); if (!cond) pass = false; }

  // 1. Token parse
  check('parses --font-display -> Schibsted Grotesk', design.display === 'Schibsted Grotesk');
  check('derives declared family from token', !!design.families['schibsted grotesk']);

  // 2. the real login build -> FAIL, with the font-load MAJOR
  const v1 = evaluate({ build: buildLogin, design, designExtract });
  check('login build FAILs', v1.status === 'FAIL');
  check('flags Schibsted bundled-but-never-loaded', v1.deltas.some(d => d.dimension === 'font-load' && /never loads/i.test(d.title)));
  check('flags display face unused', v1.deltas.some(d => /unused/i.test(d.title)));
  check('flags wrong font on heading (per-element)', v1.deltas.some(d => d.dimension === 'typography' && /Wrong font on/i.test(d.title)));

  // 3. a correct build (Schibsted loaded + used, heading matches) -> PASS
  const buildGood = {
    fonts: [{ family: 'Schibsted Grotesk', weight: '400 900', status: 'loaded' }, { family: 'Inter', weight: '100 900', status: 'loaded' }],
    usedFamilies: ['Schibsted Grotesk', 'Inter'],
    elements: [{ text: 'Sign in', key: 'sign in', role: 'heading', tag: 'h1', rect: { x: 604, y: 300, w: 118, h: 26 },
      font: { family: '"Schibsted Grotesk"', primary: 'Schibsted Grotesk', size: 22, weight: 600, lineHeight: 26, letterSpacing: 0 } }]
  };
  const v3 = evaluate({ build: buildGood, design, designExtract });
  check('correct build PASSes', v3.status === 'PASS' && v3.counts.major === 0);

  // 4. tokens-only mode still catches the never-loaded face (no design render)
  const v4 = evaluate({ build: buildLogin, design, designExtract: null });
  check('tokens-only still FAILs on never-loaded face', v4.status === 'FAIL' && v4.checks.perElement === false);

  // 5. token CSS with NO trailing ';' on the last declaration still parses (the CRITICAL regression)
  const designNoSemi = parseDesignCss(`:root { --font-sans: 'Inter'; --font-display: 'Schibsted Grotesk', 'Inter' }`);
  check('parses display token without trailing semicolon', designNoSemi.display === 'Schibsted Grotesk');
  const v5 = evaluate({ build: buildLogin, design: designNoSemi, designExtract: null });
  check('no-trailing-semicolon tokens still FAIL the login build', v5.status === 'FAIL' && v5.deltas.some(d => /never loads/i.test(d.title)));

  // 6. a bundled-but-unused secondary face (mono on a login route) does NOT false-fire (tokens-only)
  const designMulti = parseDesignCss(`:root { --font-display: 'Schibsted Grotesk'; --font-sans: 'Inter'; --font-mono: 'JetBrains Mono'; --font-size-h1: 22px; }`);
  check('does not register --font-size-* as a family', !designMulti.families['22px']);
  const buildMono = {
    fonts: [{ family: 'Inter', status: 'loaded' }, { family: 'Schibsted Grotesk', status: 'loaded' }, { family: 'JetBrains Mono', status: 'unloaded' }],
    usedFamilies: ['Schibsted Grotesk', 'Inter'],
    elements: [{ text: 'Sign in', key: 'sign in', role: 'heading', tag: 'h1', rect: { x: 0, y: 0, w: 10, h: 10 }, font: { primary: 'Schibsted Grotesk', size: 22, weight: 600 } }]
  };
  const v6 = evaluate({ build: buildMono, design: designMulti, designExtract: null });
  check('bundled-but-unused mono does not false-fire', v6.status === 'PASS' && !v6.deltas.some(d => /JetBrains/i.test(d.title)));

  // 7. role dominates the IoU tie-break: a high-IoU wrong-role element does not steal the match
  const dBtn = { elements: [{ text: 'Save', key: 'save', role: 'button', rect: { x: 0, y: 0, w: 60, h: 20 }, font: { primary: 'Inter', size: 14, weight: 600 } }] };
  const buildTwoSave = {
    fonts: [{ family: 'Inter', status: 'loaded' }], usedFamilies: ['Inter'],
    elements: [
      { text: 'Save', key: 'save', role: 'heading', tag: 'h1', rect: { x: 0, y: 0, w: 60, h: 22 }, font: { primary: 'Inter', size: 40, weight: 700 } },
      { text: 'Save', key: 'save', role: 'button', tag: 'button', rect: { x: 300, y: 300, w: 60, h: 20 }, font: { primary: 'Inter', size: 14, weight: 600 } }
    ]
  };
  const v7 = evaluate({ build: buildTwoSave, design: parseDesignCss(":root{--font-display:'Inter'}"), designExtract: dBtn });
  check('role match beats high-IoU wrong-role element', !v7.deltas.some(d => /Wrong font-size/i.test(d.title)));

  // 8. a matched element missing its font object is skipped, not a crash
  let crashed = false, v8;
  try {
    v8 = evaluate({
      build: { fonts: [], usedFamilies: [], elements: [{ text: 'x', key: 'x', role: 'text', rect: { x: 0, y: 0, w: 1, h: 1 } }] },
      design: parseDesignCss(":root{--font-display:'Inter'}"),
      designExtract: { elements: [{ text: 'x', key: 'x', role: 'text', rect: { x: 0, y: 0, w: 1, h: 1 } }] }
    });
  } catch (e) { crashed = true; }
  check('missing font object does not crash the gate', !crashed && v8 && (v8.status === 'PASS' || v8.status === 'FAIL'));

  // 9. extra-element completeness is reported (MINOR) when the build has an element the design lacks
  const v9 = evaluate({
    build: { fonts: [{ family: 'Inter', status: 'loaded' }], usedFamilies: ['Inter'],
      elements: [{ text: 'Surprise', key: 'surprise', role: 'text', rect: { x: 0, y: 0, w: 1, h: 1 }, font: { primary: 'Inter', size: 14, weight: 400 } }] },
    design: parseDesignCss(":root{--font-display:'Inter'}"),
    designExtract: { elements: [] }
  });
  check('reports an extra element as MINOR', v9.deltas.some(d => d.dimension === 'completeness' && /Extra element/i.test(d.title)) && v9.status === 'PASS');

  // 10. extra-element output is capped (a content-rich build can't flood the deltas)
  const manyExtras = { fonts: [{ family: 'Inter', status: 'loaded' }], usedFamilies: ['Inter'],
    elements: Array.from({ length: 9 }, (_, i) => ({ text: 'row' + i, key: 'row' + i, role: 'text', rect: { x: 0, y: i, w: 1, h: 1 }, font: { primary: 'Inter', size: 14, weight: 400 } })) };
  const v10 = evaluate({ build: manyExtras, design: parseDesignCss(":root{--font-display:'Inter'}"), designExtract: { elements: [] } });
  const extraDeltas = v10.deltas.filter(d => /Extra element|more extra/i.test(d.title));
  check('extra-element output is capped', extraDeltas.length <= 6 && v10.deltas.some(d => /more extra/i.test(d.title)));

  // 11. an errored (404) face is reported with accurate wording (requested but failed, not "never requests")
  const buildErr = { fonts: [{ family: 'Schibsted Grotesk', status: 'error' }, { family: 'Inter', status: 'loaded' }], usedFamilies: ['Inter'],
    elements: [{ text: 'Sign in', key: 'sign in', role: 'heading', rect: { x: 0, y: 0, w: 1, h: 1 }, font: { primary: 'Inter', size: 24, weight: 700 } }] };
  const v11 = evaluate({ build: buildErr, design, designExtract: null });
  check('errored face wording mentions failed to load', v11.deltas.some(d => /never loads/i.test(d.title) && /failed to load/i.test(d.detail)));

  process.stdout.write(log.join('\n') + '\n' + (pass ? 'ALL PASS' : 'SELFTEST FAILED') + '\n');
  process.exit(pass ? 0 : 1);
}

main();
