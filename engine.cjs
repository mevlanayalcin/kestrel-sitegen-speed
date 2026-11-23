'use strict';
// kestrel-sitegen-speed v3: Zero-new-Function 6-Kernel TurboFan + OP_BLAST_TAGS + Hoisted VM + Zero-String FM + U8 Markdown
const { closeSync, openSync, readFileSync, writeSync } = require('node:fs');

let _fb = null;
function getFallback() {
  if (_fb === null) _fb = require('./fallback.cjs');
  return _fb;
}

const RESERVED = ['index.html', 'posts', 'tags', 'page', 'build-report.txt'];
const REPORT_FILE = 'build-report.txt';
const INCLUDE_DEPTH = 16;
const EMPTY_ARR = Object.freeze([]);
const EMPTY_U8 = new Uint8Array(0);
const FM_ERR = Symbol('FM_ERR');

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const JSON_ASCII_SAFE_TEST = /["\\&<>'\x00-\x1f\u2028\u2029\x80-\uFFFF]/;
const JSON_ANY_RE = /["\\\x00-\x1f]/;
const JSON_NO_QUOT_RE = /[\\\x00-\x1f]/;
const ESC_HTML_RE = /[&<>"']/g;
const ESC_HTML_TEST = /[&<>"']/;
const ESC_HTML_JSON_TEST = /[&<>"'\\\x00-\x1f]/;

const SLUG_L1 = new Uint8Array([
  0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
  0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,48,49,50,51,52,53,54,55,56,57,0,0,0,0,0,0,
  0,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,0,0,0,0,0,
  0,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,0,0,0,0,0,
  0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
  0,0,0,0,0,0,0,0,0,0,97,0,0,0,0,0,0,0,50,51,0,0,0,0,0,49,111,0,255,255,255,0,
  97,97,97,97,97,97,0,99,101,101,101,101,105,105,105,105,0,110,111,111,111,111,111,0,0,117,117,117,117,121,0,0,
  97,97,97,97,97,97,0,99,101,101,101,101,105,105,105,105,0,110,111,111,111,111,111,0,0,117,117,117,117,121,0,121,
]);
const SLUG_EXT_A = new Uint8Array([
  97,97,97,97,97,97,99,99,99,99,99,99,99,99,100,100,0,0,101,101,101,101,101,101,101,101,101,101,103,103,103,103,
  103,103,103,103,104,104,0,0,105,105,105,105,105,105,105,105,105,0,255,255,106,106,107,107,0,108,108,108,108,108,108,255,
  255,0,0,110,110,110,110,110,110,255,0,0,111,111,111,111,111,111,0,0,114,114,114,114,114,114,115,115,115,115,115,115,
  115,115,116,116,116,116,0,0,117,117,117,117,117,117,117,117,117,117,117,117,119,119,121,121,121,122,122,122,122,122,122,115,
]);

const ESCAPABLE_U8 = new Uint8Array(128);
for (const ch of '\\`*_[]()#+-.!>') ESCAPABLE_U8[ch.charCodeAt(0)] = 1;

const SCHEME_LUT = new Uint8Array(128);
for (let c = 65; c <= 90; c++) SCHEME_LUT[c] = 1;
for (let c = 97; c <= 122; c++) SCHEME_LUT[c] = 1;
for (let c = 48; c <= 57; c++) SCHEME_LUT[c] = 1;
SCHEME_LUT[43] = 1; SCHEME_LUT[45] = 1; SCHEME_LUT[46] = 1;

const FENCE_LANG_LUT = new Uint8Array(128);
for (let c = 65; c <= 90; c++) FENCE_LANG_LUT[c] = 1;
for (let c = 97; c <= 122; c++) FENCE_LANG_LUT[c] = 1;
for (let c = 48; c <= 57; c++) FENCE_LANG_LUT[c] = 1;
FENCE_LANG_LUT[45] = 1; FENCE_LANG_LUT[95] = 1; FENCE_LANG_LUT[43] = 1; FENCE_LANG_LUT[35] = 1;

const INL_ACT = new Uint8Array(256);
INL_ACT[38] = 1; INL_ACT[60] = 2; INL_ACT[62] = 3; INL_ACT[34] = 4; INL_ACT[39] = 5;
INL_ACT[10] = 6; INL_ACT[92] = 7; INL_ACT[96] = 8; INL_ACT[42] = 9; INL_ACT[91] = 10;
for (let c = 0; c < 32; c++) if (INL_ACT[c] === 0) INL_ACT[c] = 11;

const CODE_ACT = new Uint8Array(256);
CODE_ACT[38] = 1; CODE_ACT[60] = 2; CODE_ACT[62] = 3; CODE_ACT[34] = 4; CODE_ACT[39] = 5;
CODE_ACT[10] = 6; CODE_ACT[92] = 7;
for (let c = 0; c < 32; c++) if (CODE_ACT[c] === 0) CODE_ACT[c] = 11;

const URL_ACT = new Uint8Array(256);
URL_ACT[9] = 1; URL_ACT[10] = 1; URL_ACT[11] = 1; URL_ACT[12] = 1; URL_ACT[13] = 1; URL_ACT[32] = 1;
URL_ACT[38] = 2; URL_ACT[60] = 2; URL_ACT[62] = 2; URL_ACT[34] = 2; URL_ACT[39] = 2; URL_ACT[92] = 2;
for (let c = 0; c < 32; c++) URL_ACT[c] |= 2;
URL_ACT[58] = 4; URL_ACT[35] = 8;
for (let c = 0xC2; c < 256; c++) URL_ACT[c] = 16;

const BLK_C0 = new Uint8Array(256);
BLK_C0[32] = 1; BLK_C0[9] = 1; BLK_C0[96] = 2; BLK_C0[35] = 3; BLK_C0[45] = 4; BLK_C0[42] = 4; BLK_C0[62] = 5;
for (let c = 48; c <= 57; c++) BLK_C0[c] = 6;

const PARA_END_C0 = new Uint8Array(256);
PARA_END_C0[32] = 1; PARA_END_C0[9] = 1; PARA_END_C0[96] = 1; PARA_END_C0[35] = 1; PARA_END_C0[45] = 1; PARA_END_C0[42] = 1;

const WC_BIT = new Uint8Array(256);
for (let c = 0; c < 128; c++) WC_BIT[c] = (c === 32 || c === 10 || c === 9 || c === 13 || c === 11 || c === 12) ? 0 : 1;
for (let c = 128; c < 256; c++) WC_BIT[c] = (c === 0xC2 || c === 0xE1 || c === 0xE2 || c === 0xE3 || c === 0xEF) ? 2 : 1;

const ESC_BYTES = new Uint8Array(Buffer.from('&amp;&lt;&gt;&quot;&#39;', 'latin1'));
const ESC_OFF = new Uint8Array([0, 0, 5, 9, 13, 19]);
const ESC_LEN = new Uint8Array([0, 5, 4, 4, 6, 5]);

function asciiU8(s) {
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

const T_PRE_OPEN = asciiU8('<pre><code>');
const T_PRE_LANG_J = asciiU8('<pre><code class=\\"language-');
const T_PRE_CLOSE_J = asciiU8('</code></pre>\\n');
const T_PRE_NL_CLOSE_J = asciiU8('\\n</code></pre>\\n');
const T_HR_J = asciiU8('<hr>\\n');
const T_BQ_OPEN_J = asciiU8('<blockquote>\\n');
const T_BQ_CLOSE_J = asciiU8('</blockquote>\\n');
const T_UL_OPEN_J = asciiU8('<ul>\\n');
const T_UL_CLOSE_J = asciiU8('</ul>\\n');
const T_OL_OPEN_J = asciiU8('<ol>\\n');
const T_OL_CLOSE_J = asciiU8('</ol>\\n');
const T_EM_OPEN = asciiU8('<em>');
const T_EM_CLOSE = asciiU8('</em>');
const T_STRONG_OPEN = asciiU8('<strong>');
const T_STRONG_CLOSE = asciiU8('</strong>');
const T_CODE_OPEN = asciiU8('<code>');
const T_CODE_CLOSE = asciiU8('</code>');
const T_A_OPEN_J = asciiU8('<a href=\\"');
const T_LI_CLOSE_J = asciiU8('</li>\\n');
const T_P_CLOSE_J = asciiU8('</p>\\n');
const T_IDX_KEY_SUF = asciiU8('/index.html":"');
const H_OPEN_JU8 = [null, asciiU8('<h1 id=\\"'), asciiU8('<h2 id=\\"'), asciiU8('<h3 id=\\"'), asciiU8('<h4 id=\\"'), asciiU8('<h5 id=\\"'), asciiU8('<h6 id=\\"')];
const H_CLOSE_JU8 = [null, asciiU8('</h1>\\n'), asciiU8('</h2>\\n'), asciiU8('</h3>\\n'), asciiU8('</h4>\\n'), asciiU8('</h5>\\n'), asciiU8('</h6>\\n')];

let DST_CAP = 262144;
let DST_BUF = Buffer.allocUnsafe(DST_CAP);
let DST_U8 = new Uint8Array(DST_BUF.buffer, DST_BUF.byteOffset, DST_BUF.byteLength);

let BQ_CAP = 32768;
let BQ_BUF = Buffer.allocUnsafe(BQ_CAP);
let BQ_U8 = new Uint8Array(BQ_BUF.buffer, BQ_BUF.byteOffset, BQ_BUF.byteLength);

let EX_ARENA_CAP = 131072;
let EX_ARENA_U8 = new Uint8Array(EX_ARENA_CAP);
let exArenaOff = 0;

let CARD_ARENA_CAP = 262144;
let CARD_ARENA_U8 = new Uint8Array(CARD_ARENA_CAP);
let cardArenaOff = 0;

let STR_ARENA_CAP = 262144;
let STR_ARENA_BUF = Buffer.allocUnsafe(STR_ARENA_CAP);
let STR_ARENA_U8 = new Uint8Array(STR_ARENA_BUF.buffer, STR_ARENA_BUF.byteOffset, STR_ARENA_BUF.byteLength);
STR_ARENA_BUF.latin1Write('truefalse0123456789', 0);
const SLOT_DYN_BASE = 48;
let strArenaOff = SLOT_DYN_BASE;

const S_OFF = new Int32Array(32);
const S_LEN = new Int32Array(32);

let TAG_NOFF = new Int32Array(128), TAG_NLEN = new Int32Array(128);
let TAG_SOFF = new Int32Array(128), TAG_SLEN = new Int32Array(128);
let TAG_UOFF = new Int32Array(128), TAG_ULEN = new Int32Array(128);
let tagArenaCount = 0;

let TOC_CAP = 128;
let TOC_LVL = new Uint8Array(TOC_CAP);
let TOC_ID_OFF = new Int32Array(TOC_CAP);
let TOC_ID_LEN = new Int32Array(TOC_CAP);
let TOC_HTML_OFF = new Int32Array(TOC_CAP);
let TOC_HTML_LEN = new Int32Array(TOC_CAP);
let tocCount = 0;

const SLUG_TMP_BUF = Buffer.allocUnsafe(64);
const SLUG_TMP_U8 = new Uint8Array(SLUG_TMP_BUF.buffer, SLUG_TMP_BUF.byteOffset, 64);
const HEADING_IDS = new Set();
const VISITING_SET = new Set();

function ensureDst(need) {
  if (need <= DST_CAP) return;
  while (DST_CAP < need) DST_CAP <<= 1;
  const nb = Buffer.allocUnsafe(DST_CAP), nu = new Uint8Array(nb.buffer, nb.byteOffset, nb.byteLength);
  nu.set(DST_U8); DST_BUF = nb; DST_U8 = nu;
}
function ensureBq(need) {
  if (need <= BQ_CAP) return;
  while (BQ_CAP < need) BQ_CAP <<= 1;
  BQ_BUF = Buffer.allocUnsafe(BQ_CAP);
  BQ_U8 = new Uint8Array(BQ_BUF.buffer, BQ_BUF.byteOffset, BQ_BUF.byteLength);
}
function ensureExArena(need) {
  if (need <= EX_ARENA_CAP) return;
  while (EX_ARENA_CAP < need) EX_ARENA_CAP <<= 1;
  const nu = new Uint8Array(EX_ARENA_CAP);
  nu.set(EX_ARENA_U8.subarray(0, exArenaOff)); EX_ARENA_U8 = nu;
}
function ensureCardArena(need) {
  if (need <= CARD_ARENA_CAP) return;
  while (CARD_ARENA_CAP < need) CARD_ARENA_CAP <<= 1;
  const nu = new Uint8Array(CARD_ARENA_CAP);
  nu.set(CARD_ARENA_U8.subarray(0, cardArenaOff)); CARD_ARENA_U8 = nu;
}
function ensureStrArena(need) {
  if (need <= STR_ARENA_CAP) return;
  while (STR_ARENA_CAP < need) STR_ARENA_CAP <<= 1;
  const nb = Buffer.allocUnsafe(STR_ARENA_CAP), nu = new Uint8Array(nb.buffer, nb.byteOffset, nb.byteLength);
  nu.set(STR_ARENA_U8.subarray(0, strArenaOff)); STR_ARENA_BUF = nb; STR_ARENA_U8 = nu;
}
function ensureTagCap(needCount) {
  if (needCount <= TAG_NOFF.length) return;
  let nc = TAG_NOFF.length; while (nc < needCount) nc <<= 1;
  const g = (a) => { const b = new Int32Array(nc); b.set(a); return b; };
  TAG_NOFF = g(TAG_NOFF); TAG_NLEN = g(TAG_NLEN);
  TAG_SOFF = g(TAG_SOFF); TAG_SLEN = g(TAG_SLEN);
  TAG_UOFF = g(TAG_UOFF); TAG_ULEN = g(TAG_ULEN);
}
function ensureTocCap(needCount) {
  if (needCount <= TOC_CAP) return;
  while (TOC_CAP < needCount) TOC_CAP <<= 1;
  const nl = new Uint8Array(TOC_CAP); nl.set(TOC_LVL); TOC_LVL = nl;
  const g = (a) => { const b = new Int32Array(TOC_CAP); b.set(a); return b; };
  TOC_ID_OFF = g(TOC_ID_OFF); TOC_ID_LEN = g(TOC_ID_LEN);
  TOC_HTML_OFF = g(TOC_HTML_OFF); TOC_HTML_LEN = g(TOC_HTML_LEN);
}

// ---------------------------------------------------------------- Comparators, Escaping & Slugging

function byCodeUnits(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function cmpFilePath(x, y) { const a = x.path, b = y.path; return a < b ? -1 : a > b ? 1 : 0; }
function cmpPost(x, y) {
  if (x.dateInt !== y.dateInt) return y.dateInt - x.dateInt;
  return x.slug < y.slug ? -1 : x.slug > y.slug ? 1 : 0;
}
function cmpTag(x, y) {
  const d = y.posts.length - x.posts.length;
  if (d !== 0) return d;
  return x.slug < y.slug ? -1 : x.slug > y.slug ? 1 : 0;
}
function isMdPath(p) {
  const n = p.length;
  return n >= 3 && p.charCodeAt(n - 1) === 100 && p.charCodeAt(n - 2) === 109 && p.charCodeAt(n - 3) === 46;
}

function esc5(text) {
  return text.replace(ESC_HTML_RE, (c) => c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;');
}
function escapeHtml(text) { return ESC_HTML_TEST.test(text) ? esc5(text) : text; }
function escHtmlJsonStr(s) {
  if (!ESC_HTML_JSON_TEST.test(s)) return s;
  const h = ESC_HTML_TEST.test(s) ? esc5(s) : s;
  return JSON_NO_QUOT_RE.test(h) ? JSON.stringify(h).slice(1, -1) : h;
}

function slugifySlow(text) {
  const norm = text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  let out = '', dash = false;
  for (let i = 0; i < norm.length; i++) {
    const c = norm.charCodeAt(i);
    if ((c >= 97 && c <= 122) || (c >= 48 && c <= 57)) {
      if (dash && out.length > 0) { out += '-'; if (out.length === 64) break; }
      dash = false; out += norm[i]; if (out.length === 64) break;
    } else if (out.length > 0) dash = true;
  }
  let end = out.length;
  while (end > 0 && out.charCodeAt(end - 1) === 45) end--;
  return end === 0 ? 'untitled' : (end === out.length ? out : out.slice(0, end));
}

function slugNonL1(cp) {
  if (cp >= 0x0100 && cp <= 0x017F) return SLUG_EXT_A[cp - 0x0100];
  if ((cp >= 0x0370 && cp <= 0x0482) || (cp >= 0x048A && cp <= 0x052F) || (cp >= 0x2000 && cp <= 0x206F) || (cp >= 0x4E00 && cp <= 0x9FFF)) return 0;
  if (cp >= 0xFF00 && cp <= 0xFF60) {
    if (cp >= 0xFF10 && cp <= 0xFF19) return cp - 0xFF10 + 48;
    if (cp >= 0xFF21 && cp <= 0xFF3A) return cp - 0xFF21 + 97;
    if (cp >= 0xFF41 && cp <= 0xFF5A) return cp - 0xFF41 + 97;
    return 0;
  }
  return 255;
}

const SLUG_LIG = [[102,102],[102,105],[102,108],[102,102,105],[102,102,108],[115,116],[115,116]];
function slugify(text) {
  const len = text.length, lut = SLUG_L1, out = SLUG_TMP_U8;
  let o = 0, dash = 0;
  for (let i = 0; i < len; i++) {
    const c = text.charCodeAt(i);
    let b;
    if (c < 256) b = lut[c];
    else if (c >= 0xFB00 && c <= 0xFB06) {
      const lig = SLUG_LIG[c - 0xFB00];
      if (dash !== 0 && o > 0) { out[o++] = 45; if (o === 64) break; }
      dash = 0;
      for (let k = 0; k < lig.length; k++) { out[o++] = lig[k]; if (o === 64) break; }
      if (o === 64) break;
      continue;
    } else b = slugNonL1(c);
    if (b === 255) return slugifySlow(text);
    if (b !== 0) {
      if (dash !== 0 && o > 0) { out[o++] = 45; if (o === 64) break; }
      dash = 0; out[o++] = b; if (o === 64) break;
    } else if (o > 0) dash = 1;
  }
  while (o > 0 && out[o - 1] === 45) o--;
  return o === 0 ? 'untitled' : SLUG_TMP_BUF.latin1Slice(0, o);
}

function slugifyU8(u, buf, bufOff, a, b) {
  const lut = SLUG_L1, out = SLUG_TMP_U8;
  let o = 0, dash = 0, i = a;
  while (i < b) {
    const c = u[i++];
    let v;
    if (c < 128) v = lut[c];
    else if (c >= 0xC2 && c <= 0xDF && i < b) {
      const cp = ((c & 0x1F) << 6) | (u[i++] & 0x3F);
      v = cp < 256 ? lut[cp] : slugNonL1(cp);
      if (v === 255) return slugifySlow(buf.utf8Slice(bufOff + a, bufOff + b));
    } else if (c >= 0xE0 && c <= 0xEF && i + 1 < b) {
      const cp = ((c & 0x0F) << 12) | ((u[i] & 0x3F) << 6) | (u[i + 1] & 0x3F); i += 2;
      if (cp >= 0xFB00 && cp <= 0xFB06) {
        const lig = SLUG_LIG[cp - 0xFB00];
        if (dash !== 0 && o > 0) { out[o++] = 45; if (o === 64) break; }
        dash = 0;
        for (let k = 0; k < lig.length; k++) { out[o++] = lig[k]; if (o === 64) break; }
        if (o === 64) break;
        continue;
      }
      v = slugNonL1(cp);
      if (v === 255) return slugifySlow(buf.utf8Slice(bufOff + a, bufOff + b));
    } else return slugifySlow(buf.utf8Slice(bufOff + a, bufOff + b));
    if (v !== 0) {
      if (dash !== 0 && o > 0) { out[o++] = 45; if (o === 64) break; }
      dash = 0; out[o++] = v; if (o === 64) break;
    } else if (o > 0) dash = 1;
  }
  while (o > 0 && out[o - 1] === 45) o--;
  return o === 0 ? 'untitled' : SLUG_TMP_BUF.latin1Slice(0, o);
}

function uniqueSlug(slug, taken) {
  if (!taken.has(slug)) { taken.add(slug); return slug; }
  for (let n = 2; ; n++) {
    const suffix = '-' + n;
    const base = slug.length + suffix.length > 64 ? slug.slice(0, 64 - suffix.length) : slug;
    let bEnd = base.length;
    while (bEnd > 0 && base.charCodeAt(bEnd - 1) === 45) bEnd--;
    const candidate = (bEnd === base.length ? base : base.slice(0, bEnd)) + suffix;
    if (!taken.has(candidate)) { taken.add(candidate); return candidate; }
  }
}

// ---------------------------------------------------------------- Word count (TF #2: 4x branchless + 0xEF fast-skip)

function utf8WsLen(u, i, n) {
  const b0 = u[i];
  if (b0 === 0xC2 && i + 1 < n && u[i + 1] === 0xA0) return 2;
  if (b0 === 0xE1 && i + 2 < n && u[i + 1] === 0x9A && u[i + 2] === 0x80) return 3;
  if (b0 === 0xE2 && i + 2 < n) {
    const b1 = u[i + 1], b2 = u[i + 2];
    if (b1 === 0x80 && ((b2 >= 0x80 && b2 <= 0x8A) || b2 === 0xA8 || b2 === 0xA9 || b2 === 0xAF)) return 3;
    if (b1 === 0x81 && b2 === 0x9F) return 3;
  }
  if (b0 === 0xE3 && i + 2 < n && u[i + 1] === 0x80 && u[i + 2] === 0x80) return 3;
  if (b0 === 0xEF && i + 2 < n && u[i + 1] === 0xBB && u[i + 2] === 0xBF) return 3;
  return 0;
}

function tf_wcU8(u, n) {
  const wc = WC_BIT;
  let count = 0, prev = 0, i = 0;
  const lim4 = n - 3;
  while (i < lim4) {
    const c0 = wc[u[i]], c1 = wc[u[i + 1]], c2 = wc[u[i + 2]], c3 = wc[u[i + 3]];
    if ((c0 | c1 | c2 | c3) < 2) {
      count += (c0 & (prev ^ 1)) + (c1 & (c0 ^ 1)) + (c2 & (c1 ^ 1)) + (c3 & (c2 ^ 1));
      prev = c3; i += 4;
    } else if (c0 < 2) {
      count += c0 & (prev ^ 1); prev = c0; i++;
    } else if (u[i] === 0xEF && u[i + 1] !== 0xBB) {
      count += prev ^ 1; prev = 1; i += 3;
    } else {
      const ws = utf8WsLen(u, i, n);
      if (ws > 0) { prev = 0; i += ws; } else { count += prev ^ 1; prev = 1; i++; }
    }
  }
  while (i < n) {
    const c = wc[u[i]];
    if (c < 2) { count += c & (prev ^ 1); prev = c; i++; }
    else { const ws = utf8WsLen(u, i, n); if (ws > 0) { prev = 0; i += ws; } else { count += prev ^ 1; prev = 1; i++; } }
  }
  return count;
}

// ---------------------------------------------------------------- Direct U8 Front Matter (Byte fast paths + Caches)

let _fmErr = '';
let _fmTA = -1, _fmTB = 0, _fmTStr = null;
let _fmSA = -1, _fmSB = 0, _fmSStr = null;
let _fmDateInt = 0, _fmDateOff = 0;
let _fmTags = null, _fmDraft = false, _fmLayout = null, _fmSlug = null;

function daysIn(y, m) {
  if (m === 2) return (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28;
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;
}
function parseFmString(raw, key) {
  const len = raw.length, c0 = raw.charCodeAt(0);
  if (c0 === 34) {
    if (len < 2 || raw.charCodeAt(len - 1) !== 34) { _fmErr = `key "${key}": a quoted string is not closed`; return FM_ERR; }
    let hasEsc = false;
    for (let i = 1; i < len - 1; i++) {
      const c = raw.charCodeAt(i);
      if (c === 92) {
        const n = raw.charCodeAt(i + 1);
        if ((n !== 34 && n !== 92) || i + 1 === len - 1) { _fmErr = `key "${key}": a quoted string holds an escape other than \\" or \\\\`; return FM_ERR; }
        hasEsc = true; i++;
      } else if (c === 34) { _fmErr = `key "${key}": a quoted string holds a stray quote`; return FM_ERR; }
    }
    if (!hasEsc) return raw.slice(1, len - 1);
    let out = '', last = 1;
    for (let i = 1; i < len - 1; i++) {
      if (raw.charCodeAt(i) === 92) { if (i > last) out += raw.slice(last, i); out += raw[i + 1]; i++; last = i + 1; }
    }
    if (last < len - 1) out += raw.slice(last, len - 1);
    return out;
  }
  if (c0 === 91) { _fmErr = `key "${key}": a bare string opens on [`; return FM_ERR; }
  return raw;
}
function parseFmTags(raw) {
  const len = raw.length;
  if (raw.charCodeAt(0) !== 91 || raw.charCodeAt(len - 1) !== 93) { _fmErr = 'key "tags": not a list [a, b]'; return FM_ERR; }
  if (len === 2) return EMPTY_ARR;
  const inner = raw.slice(1, len - 1);
  if (inner.trim() === '') return EMPTY_ARR;
  const parts = inner.split(',');
  for (let k = 0; k < parts.length; k++) {
    const t = parts[k].trim();
    if (t === '' || t.indexOf('"') !== -1 || t.indexOf('[') !== -1 || t.indexOf(']') !== -1) {
      _fmErr = 'key "tags": an empty tag, or one holding " [ or ]'; return FM_ERR;
    }
    parts[k] = t;
  }
  return parts;
}
function parseFmLayoutOrSlug(isLayout, raw) {
  if (isLayout) {
    for (let k = 0; k < raw.length; k++) { const c = raw.charCodeAt(k); if (!((c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 45)) { _fmErr = 'key "layout": not a template name'; return FM_ERR; } }
    return raw;
  }
  if (raw.length > 64) { _fmErr = 'key "slug": not a slug'; return FM_ERR; }
  let prevDash = true;
  for (let k = 0; k < raw.length; k++) {
    const c = raw.charCodeAt(k);
    if ((c >= 97 && c <= 122) || (c >= 48 && c <= 57)) prevDash = false;
    else if (c === 45 && !prevDash) prevDash = true;
    else { _fmErr = 'key "slug": not a slug'; return FM_ERR; }
  }
  if (prevDash) { _fmErr = 'key "slug": not a slug'; return FM_ERR; }
  return raw;
}
const FM_KEY_NAMES = ['title', 'date', 'tags', 'draft', 'layout', 'slug', 'summary'];
function identifyFmKeyU8(u, pos, kLen) {
  const c0 = u[pos];
  if (kLen === 4) {
    if (c0 === 100 && u[pos + 1] === 97 && u[pos + 2] === 116 && u[pos + 3] === 101) return 1;
    if (c0 === 116 && u[pos + 1] === 97 && u[pos + 2] === 103 && u[pos + 3] === 115) return 2;
    if (c0 === 115 && u[pos + 1] === 108 && u[pos + 2] === 117 && u[pos + 3] === 103) return 5;
  } else if (kLen === 5) {
    if (c0 === 116 && u[pos + 1] === 105 && u[pos + 2] === 116 && u[pos + 3] === 108 && u[pos + 4] === 101) return 0;
    if (c0 === 100 && u[pos + 1] === 114 && u[pos + 2] === 97 && u[pos + 3] === 102 && u[pos + 4] === 116) return 3;
  } else if (kLen === 6) {
    if (c0 === 108 && u[pos + 1] === 97 && u[pos + 2] === 121 && u[pos + 3] === 111 && u[pos + 4] === 117 && u[pos + 5] === 116) return 4;
  } else if (kLen === 7) {
    if (c0 === 115 && u[pos + 1] === 117 && u[pos + 2] === 109 && u[pos + 3] === 109 && u[pos + 4] === 97 && u[pos + 5] === 114 && u[pos + 6] === 121) return 6;
  }
  return -1;
}
function normalizeCrInPlace(u, uOff, uLen) {
  const end = uOff + uLen;
  let r = u.indexOf(13, uOff);
  if (r === -1 || r >= end) return uLen;
  let w = r;
  while (r < end) {
    u[w++] = 10; r++;
    if (r < end && u[r] === 10) r++;
    const next = u.indexOf(13, r), stop = (next === -1 || next >= end) ? end : next;
    if (stop > r) { u.copyWithin(w, r, stop); w += stop - r; r = stop; }
  }
  return w - uOff;
}
function parseFmTagsU8(u, buf, vStart, vEnd, rawTagsCache) {
  const vLen = vEnd - vStart;
  if (u[vStart] !== 91 || u[vEnd - 1] !== 93) { _fmErr = 'key "tags": not a list [a, b]'; return FM_ERR; }
  if (vLen === 2) return EMPTY_ARR;
  let a = vStart + 1, b = vEnd - 1;
  while (a < b && (u[a] === 32 || u[a] === 9)) a++;
  while (b > a && (u[b - 1] === 32 || u[b - 1] === 9)) b--;
  if (a === b) return EMPTY_ARR;
  const out = [];
  let p = a;
  while (p <= b) {
    let comma = u.indexOf(44, p);
    if (comma === -1 || comma > b) comma = b;
    let ta = p, tb = comma;
    while (ta < tb && (u[ta] === 32 || u[ta] === 9)) ta++;
    while (tb > ta && (u[tb - 1] === 32 || u[tb - 1] === 9)) tb--;
    if (ta === tb) { _fmErr = 'key "tags": an empty tag, or one holding " [ or ]'; return FM_ERR; }
    let nonAscii = 0;
    for (let k = ta; k < tb; k++) {
      const c = u[k];
      if (c === 34 || c === 91 || c === 93) { _fmErr = 'key "tags": an empty tag, or one holding " [ or ]'; return FM_ERR; }
      if (c >= 128 || c < 32) { nonAscii = 1; break; }
    }
    if (nonAscii !== 0) {
      const raw = buf.utf8Slice(vStart, vEnd);
      const c = rawTagsCache.get(raw);
      if (c !== undefined) return c;
      const res = parseFmTags(raw);
      if (res !== FM_ERR) rawTagsCache.set(raw, res);
      return res;
    }
    out.push(buf.latin1Slice(ta, tb));
    if (comma === b) break;
    p = comma + 1;
  }
  return out;
}
function parseFrontMatterU8(u, buf, uOff, uLen, rawTagsCache) {
  if (uLen < 3 || u[uOff] !== 45 || u[uOff + 1] !== 45 || u[uOff + 2] !== 45) { _fmErr = 'no front matter'; return -1; }
  if (uLen === 3) { _fmErr = 'the front matter is not closed'; return -1; }
  if (u[uOff + 3] !== 10) { _fmErr = 'no front matter'; return -1; }
  const end = uOff + uLen;
  _fmTA = -1; _fmTB = 0; _fmTStr = null;
  _fmSA = -1; _fmSB = 0; _fmSStr = null;
  _fmDateInt = 0; _fmDateOff = 0;
  _fmTags = null; _fmDraft = false; _fmLayout = null; _fmSlug = null;
  let seenMask = 0, lineNo = 2, p = uOff + 4;
  while (p <= end) {
    if (p + 3 <= end && u[p] === 45 && u[p + 1] === 45 && u[p + 2] === 45) {
      if (p + 3 === end) { if ((seenMask & 1) === 0) { _fmErr = 'no title'; return -1; } return end; }
      if (u[p + 3] === 10) { if ((seenMask & 1) === 0) { _fmErr = 'no title'; return -1; } return p + 4; }
    }
    const nl = u.indexOf(10, p);
    if (nl === -1 || nl >= end) { _fmErr = 'the front matter is not closed'; return -1; }
    const lEnd = nl, nextPos = nl + 1;
    if (p === lEnd) { p = nextPos; lineNo++; continue; }
    const c0 = u[p];
    if (c0 < 97 || c0 > 122) {
      if (c0 === 35) { p = nextPos; lineNo++; continue; }
      let q = p; while (q < lEnd && (u[q] === 32 || u[q] === 9)) q++;
      if (q === lEnd) { p = nextPos; lineNo++; continue; }
    }
    const colon = u.indexOf(58, p);
    let kid = -1, kEnd = p;
    if (colon !== -1 && colon < lEnd) { kid = identifyFmKeyU8(u, p, colon - p); kEnd = colon; }
    if (kid === -1) {
      kEnd = p; while (kEnd < lEnd) { const c = u[kEnd]; if ((c >= 97 && c <= 122) || c === 95) kEnd++; else break; }
      if (kEnd === p || kEnd >= lEnd || u[kEnd] !== 58) { _fmErr = `line ${lineNo} is not "key: value"`; return -1; }
    }
    let vStart = kEnd + 1;
    if (vStart < lEnd) { if (u[vStart] !== 32) { _fmErr = `line ${lineNo} is not "key: value"`; return -1; } vStart++; }
    if (kid === -1) { _fmErr = `unknown key "${buf.utf8Slice(p, kEnd)}"`; return -1; }
    let vEnd = lEnd;
    while (vEnd > vStart && (u[vEnd - 1] === 32 || u[vEnd - 1] === 9)) vEnd--;
    const bit = 1 << kid;
    if ((seenMask & bit) !== 0) { _fmErr = `key "${FM_KEY_NAMES[kid]}" is given twice`; return -1; }
    if (vStart === vEnd) { _fmErr = `key "${FM_KEY_NAMES[kid]}" has no value`; return -1; }
    const vLen = vEnd - vStart, vc0 = u[vStart];
    if (kid === 0) {
      if (vc0 !== 34 && vc0 !== 91) { _fmTA = vStart; _fmTB = vEnd; }
      else { const v = parseFmString(buf.utf8Slice(vStart, vEnd), 'title'); if (v === FM_ERR) return -1; _fmTStr = v; }
    } else if (kid === 1) {
      if (vLen !== 10 || u[vStart + 4] !== 45 || u[vStart + 7] !== 45) { _fmErr = 'key "date": not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)'; return -1; }
      const d0 = vc0 - 48, d1 = u[vStart + 1] - 48, d2 = u[vStart + 2] - 48, d3 = u[vStart + 3] - 48;
      const m0 = u[vStart + 5] - 48, m1 = u[vStart + 6] - 48, dy0 = u[vStart + 8] - 48, dy1 = u[vStart + 9] - 48;
      if ((d0 | d1 | d2 | d3 | m0 | m1 | dy0 | dy1) < 0 || d0 > 9 || d1 > 9 || d2 > 9 || d3 > 9 || m0 > 9 || m1 > 9 || dy0 > 9 || dy1 > 9) { _fmErr = 'key "date": not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)'; return -1; }
      const y = d0 * 1000 + d1 * 100 + d2 * 10 + d3, mo = m0 * 10 + m1, day = dy0 * 10 + dy1;
      if (y < 1970 || y > 2099 || mo < 1 || mo > 12 || day < 1 || day > daysIn(y, mo)) { _fmErr = 'key "date": not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)'; return -1; }
      _fmDateInt = y * 10000 + mo * 100 + day; _fmDateOff = vStart;
    } else if (kid === 2) {
      const v = parseFmTagsU8(u, buf, vStart, vEnd, rawTagsCache);
      if (v === FM_ERR) return -1;
      _fmTags = v;
    } else if (kid === 3) {
      if (vLen === 4 && vc0 === 116 && u[vStart + 1] === 114 && u[vStart + 2] === 117 && u[vStart + 3] === 101) _fmDraft = true;
      else if (vLen === 5 && vc0 === 102 && u[vStart + 1] === 97 && u[vStart + 2] === 108 && u[vStart + 3] === 115 && u[vStart + 4] === 101) _fmDraft = false;
      else { _fmErr = 'key "draft": true or false'; return -1; }
    } else if (kid === 4) {
      if (vLen === 4 && vc0 === 112 && u[vStart + 1] === 111 && u[vStart + 2] === 115 && u[vStart + 3] === 116) _fmLayout = 'post';
      else if (vLen === 4 && vc0 === 112 && u[vStart + 1] === 97 && u[vStart + 2] === 103 && u[vStart + 3] === 101) _fmLayout = 'page';
      else { const v = parseFmLayoutOrSlug(true, buf.latin1Slice(vStart, vEnd)); if (v === FM_ERR) return -1; _fmLayout = v; }
    } else if (kid === 5) {
      const v = parseFmLayoutOrSlug(false, buf.latin1Slice(vStart, vEnd));
      if (v === FM_ERR) return -1;
      _fmSlug = v;
    } else {
      if (vc0 !== 34 && vc0 !== 91) { _fmSA = vStart; _fmSB = vEnd; }
      else { const v = parseFmString(buf.utf8Slice(vStart, vEnd), 'summary'); if (v === FM_ERR) return -1; _fmSStr = v; }
    }
    seenMask |= bit; p = nextPos; lineNo++;
  }
  _fmErr = 'the front matter is not closed';
  return -1;
}

// ---------------------------------------------------------------- Lean Sparkplug Link Resolution

function dirOf(path) { const idx = path.lastIndexOf('/'); return idx === -1 ? '' : path.slice(0, idx); }

function resolvePathFast(dirStr, dirParts, rel) {
  const len = rel.length;
  if (len === 0) return null;
  const dLen = dirParts.length;
  if (rel.charCodeAt(0) === 46 && rel.charCodeAt(1) === 46 && rel.charCodeAt(2) === 47) {
    if (dLen >= 2 && len > 6 && rel.charCodeAt(3) === 46 && rel.charCodeAt(4) === 46 && rel.charCodeAt(5) === 47 && rel.charCodeAt(6) !== 46 && rel.charCodeAt(6) !== 47 && rel.charCodeAt(len - 1) !== 47 && rel.indexOf('/.', 5) === -1 && rel.indexOf('//', 5) === -1) {
      if (dLen === 2) return rel.slice(6);
      if (dLen === 3) return dirParts[0] + '/' + rel.slice(6);
    }
    if (dLen >= 1 && len > 3 && rel.charCodeAt(3) !== 46 && rel.charCodeAt(3) !== 47 && rel.charCodeAt(len - 1) !== 47 && rel.indexOf('/.', 2) === -1 && rel.indexOf('//', 2) === -1) {
      if (dLen === 1) return rel.slice(3);
      if (dLen === 2) return dirParts[0] + '/' + rel.slice(3);
    }
  }
  if (rel.indexOf('/') === -1 && rel !== '.' && rel !== '..') return dirStr === '' ? rel : dirStr + '/' + rel;
  const parts = dLen === 0 ? [] : dirParts.slice();
  let pos = 0;
  while (pos <= len) {
    let slash = rel.indexOf('/', pos); if (slash === -1) slash = len;
    const segLen = slash - pos;
    if (segLen === 0 || (segLen === 1 && rel.charCodeAt(pos) === 46)) {}
    else if (segLen === 2 && rel.charCodeAt(pos) === 46 && rel.charCodeAt(pos + 1) === 46) { if (parts.length === 0) return null; parts.pop(); }
    else parts.push(rel.slice(pos, slash));
    pos = slash + 1;
  }
  return parts.join('/');
}

function hasSchemeU8(u, a, b) {
  if (b - a < 2) return false;
  const c0 = u[a];
  if (!((c0 >= 65 && c0 <= 90) || (c0 >= 97 && c0 <= 122))) return false;
  for (let i = a + 1; i < b; i++) {
    const c = u[i];
    if (c === 58) return true;
    if (c >= 128 || SCHEME_LUT[c] === 0) return false;
  }
  return false;
}

let _curFileBuf = null, _curFileOff = 0;
let _iSrc = null, _iSrcBuf = null, _iSrcBufOff = 0, _iDst = null, _iCtx = null;

function writeRelLinkHrefU8(a, b, hashPos, hasSpec, isNonAscii, o) {
  const src = _iSrc, dst = _iDst, linkCtx = _iCtx;
  let cache = linkCtx.dirCache;
  if (b - a >= 3 && src[a] === 46 && src[a + 1] === 46 && src[a + 2] === 47) {
    if (b - a >= 6 && src[a + 3] === 46 && src[a + 4] === 46 && src[a + 5] === 47) {
      if (linkCtx.rel2Cache !== null) cache = linkCtx.rel2Cache;
    } else if (linkCtx.rel1Cache !== null) cache = linkCtx.rel1Cache;
  }
  const target = isNonAscii === 0 ? _iSrcBuf.latin1Slice(_iSrcBufOff + a, _iSrcBufOff + b) : _iSrcBuf.utf8Slice(_iSrcBufOff + a, _iSrcBufOff + b);
  let cached = cache.get(target);
  if (cached !== undefined) {
    if (typeof cached === 'number') {
      if (cached !== 0) {
        const ao = cached >>> 12, an = cached & 4095;
        dst.set(STR_ARENA_U8.subarray(ao, ao + an), o);
        return o + an;
      }
      linkCtx.broken.add('broken-link ' + linkCtx.sourcePath + ' -> ' + target);
      if (hasSpec === 0) { dst.set(src.subarray(a, b), o); return o + (b - a); }
      return tf_copyCodeU8(a, b, o);
    }
    dst.set(STR_ARENA_U8.subarray(cached.o, cached.o + cached.n), o);
    return o + cached.n;
  }

  const rel = hashPos === -1 ? target : (isNonAscii === 0 ? _iSrcBuf.latin1Slice(_iSrcBufOff + a, _iSrcBufOff + hashPos) : _iSrcBuf.utf8Slice(_iSrcBufOff + a, _iSrcBufOff + hashPos));
  const path = rel.length === 0 ? null : resolvePathFast(linkCtx.dirStr, linkCtx.dirParts, rel);
  if (path !== null) {
    const dest = linkCtx.bySource.get(path);
    if (dest !== undefined) {
      if (hasSpec === 0) {
        const uo = dest.urlOff, un = dest.urlLen;
        if (hashPos === -1) {
          dst.set(STR_ARENA_U8.subarray(uo, uo + un), o);
          cache.set(target, (uo < 0x80000 && un < 4096) ? ((uo << 12) | un) : { o: uo, n: un });
          return o + un;
        }
        const fLen = b - hashPos, tot = un + fLen;
        ensureStrArena(strArenaOff + tot);
        const ao = strArenaOff;
        const uSlice = STR_ARENA_U8.subarray(uo, uo + un), fSlice = src.subarray(hashPos, b);
        STR_ARENA_U8.set(uSlice, ao); STR_ARENA_U8.set(fSlice, ao + un);
        dst.set(uSlice, o); dst.set(fSlice, o + un);
        strArenaOff = ao + tot;
        cache.set(target, (ao < 0x80000 && tot < 4096) ? ((ao << 12) | tot) : { o: ao, n: tot });
        return o + tot;
      }
      const frag = hashPos === -1 ? '' : target.slice(hashPos - a);
      const jh = escHtmlJsonStr(STR_ARENA_BUF.latin1Slice(dest.urlOff, dest.urlOff + dest.urlLen) + frag);
      ensureStrArena(strArenaOff + jh.length * 3 + 8);
      const ao = strArenaOff, an = STR_ARENA_BUF.utf8Write(jh, ao);
      strArenaOff = ao + an;
      cache.set(target, (ao < 0x80000 && an < 4096) ? ((ao << 12) | an) : { o: ao, n: an });
      dst.set(STR_ARENA_U8.subarray(ao, ao + an), o);
      return o + an;
    }
    if (linkCtx.staticPaths.has(path)) {
      const frag = hashPos === -1 ? '' : target.slice(hashPos - a);
      const rawUrl = linkCtx.base + '/' + path + frag;
      const jh = !JSON_ASCII_SAFE_TEST.test(rawUrl) ? rawUrl : escHtmlJsonStr(rawUrl);
      ensureStrArena(strArenaOff + jh.length * 3 + 8);
      const ao = strArenaOff, an = jh === rawUrl ? STR_ARENA_BUF.latin1Write(jh, ao) : STR_ARENA_BUF.utf8Write(jh, ao);
      strArenaOff = ao + an;
      cache.set(target, (ao < 0x80000 && an < 4096) ? ((ao << 12) | an) : { o: ao, n: an });
      dst.set(STR_ARENA_U8.subarray(ao, ao + an), o);
      return o + an;
    }
  }
  linkCtx.broken.add('broken-link ' + linkCtx.sourcePath + ' -> ' + target);
  cache.set(target, 0);
  if (hasSpec === 0) { dst.set(src.subarray(a, b), o); return o + (b - a); }
  return tf_copyCodeU8(a, b, o);
}

// ---------------------------------------------------------------- Lean 3-fn TurboFan Markdown Kernels

function writeCtrlJsonU8(dst, o, b) {
  dst[o++] = 92;
  if (b === 9) { dst[o++] = 116; return o; }
  if (b === 13) { dst[o++] = 114; return o; }
  if (b === 8) { dst[o++] = 98; return o; }
  if (b === 12) { dst[o++] = 102; return o; }
  dst[o++] = 117; dst[o++] = 48; dst[o++] = 48;
  dst[o++] = b < 16 ? 48 : 49;
  const lo = b & 15;
  dst[o++] = lo < 10 ? 48 + lo : 87 + lo;
  return o;
}
function copyCodeOther(dst, o, c, act) {
  if (act === 6) { dst[o++] = 92; dst[o++] = 110; return o; }
  if (act === 7) { dst[o++] = 92; dst[o++] = 92; return o; }
  return writeCtrlJsonU8(dst, o, c);
}

function tf_copyCodeU8(a, b, o) {
  const src = _iSrc, dst = _iDst, tbl = CODE_ACT;
  let i = a;
  while (i < b) {
    let c = src[i], act = tbl[c];
    while (act === 0) { dst[o++] = c; if (++i >= b) return o; c = src[i]; act = tbl[c]; }
    if (act <= 5) { let ep = ESC_OFF[act], ee = ep + ESC_LEN[act]; while (ep < ee) dst[o++] = ESC_BYTES[ep++]; }
    else o = copyCodeOther(dst, o, c, act);
    i++;
  }
  return o;
}

function tf_scanUrlU8(a, b) {
  const src = _iSrc, tbl = URL_ACT;
  let m = 0, p = a;
  const lim = b - 1;
  while (p < lim) { m |= tbl[src[p]] | tbl[src[p + 1]]; p += 2; }
  if (p < b) m |= tbl[src[p]];
  return m;
}

function isEscU8(u, pos, minPos) { let bs = 0; for (let p = pos - 1; p >= minPos && u[p] === 92; p--) bs++; return (bs & 1) === 1; }
function hasUtf8WsU8(src, a, b) { for (let p = a; p < b; p++) if (src[p] >= 0xC2 && utf8WsLen(src, p, b) > 0) return true; return false; }

let _spNext = 0;

function handleCodeOrLinkU8(i, b, o, act) {
  const src = _iSrc, dst = _iDst;
  if (act === 8) {
    const j = src.indexOf(96, i + 1);
    if (j > i + 1 && j < b) {
      dst.set(T_CODE_OPEN, o); o += 6;
      o = tf_copyCodeU8(i + 1, j, o);
      dst.set(T_CODE_CLOSE, o); o += 7;
      _spNext = j + 1; return o;
    }
    dst[o++] = 96; _spNext = i + 1; return o;
  }
  let pB = i + 1, k = -1;
  while (pB < b) {
    const j = src.indexOf(93, pB); if (j === -1 || j >= b) break;
    if (j === i + 1 || src[j - 1] !== 92 || !isEscU8(src, j, i + 1)) { k = j; break; }
    pB = j + 1;
  }
  if (k !== -1 && k + 1 < b && src[k + 1] === 40) {
    const closeP = src.indexOf(41, k + 2);
    if (closeP > k + 2 && closeP < b) {
      const m = tf_scanUrlU8(k + 2, closeP);
      if ((m & 1) === 0 && ((m & 16) === 0 || !hasUtf8WsU8(src, k + 2, closeP))) {
        const hasSpec = m & 2;
        dst.set(T_A_OPEN_J, o); o += 10;
        const u0 = src[k + 2];
        if (u0 === 47 || u0 === 35 || ((m & 4) !== 0 && hasSchemeU8(src, k + 2, closeP))) {
          if (hasSpec === 0) { dst.set(src.subarray(k + 2, closeP), o); o += closeP - (k + 2); }
          else o = tf_copyCodeU8(k + 2, closeP, o);
        } else {
          const hashPos = (m & 8) !== 0 ? src.indexOf(35, k + 2) : -1;
          o = writeRelLinkHrefU8(k + 2, closeP, hashPos, hasSpec, m & 16, o);
        }
        dst[o++]=92;dst[o++]=34;dst[o++]=62;
        o = tf_inlineU8(i + 1, k, o);
        dst[o++]=60;dst[o++]=47;dst[o++]=97;dst[o++]=62;
        _spNext = closeP + 1; return o;
      }
    }
  }
  dst[o++] = 91; _spNext = i + 1; return o;
}

function handleMdTokU8(i, b, o, act) {
  if (act === 8 || act === 10) return handleCodeOrLinkU8(i, b, o, act);
  const src = _iSrc, dst = _iDst;
  if (act === 9) {
    if (i + 1 < b && src[i + 1] === 42) {
      let p = i + 2, j = -1; const lim = b - 1;
      while (p < lim) {
        const f = src.indexOf(42, p); if (f === -1 || f >= lim) break;
        if (src[f + 1] === 42 && (f === i + 2 || src[f - 1] !== 92 || !isEscU8(src, f, i + 2))) { j = f; break; }
        p = f + 1;
      }
      if (j > i + 2) {
        dst.set(T_STRONG_OPEN, o); o += 8;
        o = tf_inlineU8(i + 2, j, o);
        dst.set(T_STRONG_CLOSE, o); o += 9;
        _spNext = j + 2;
      } else { dst[o++] = 42; dst[o++] = 42; _spNext = i + 2; }
      return o;
    }
    let p = i + 1, j = -1;
    while (p < b) {
      const f = src.indexOf(42, p); if (f === -1 || f >= b) break;
      if (f > i + 1 && src[f - 1] === 92 && isEscU8(src, f, i + 1)) { p = f + 1; continue; }
      if (f + 1 < b && src[f + 1] === 42) { p = f + 2; continue; }
      j = f; break;
    }
    if (j > i + 1) {
      dst.set(T_EM_OPEN, o); o += 4;
      o = tf_inlineU8(i + 1, j, o);
      dst.set(T_EM_CLOSE, o); o += 5;
      _spNext = j + 1;
    } else { dst[o++] = 42; _spNext = i + 1; }
    return o;
  }
  if (act === 7) {
    if (i + 1 < b) {
      const n = src[i + 1];
      if (n < 128 && ESCAPABLE_U8[n] === 1) {
        if (n === 62) { dst[o++] = 38; dst[o++] = 103; dst[o++] = 116; dst[o++] = 59; }
        else if (n === 92) { dst[o++] = 92; dst[o++] = 92; }
        else dst[o++] = n;
        _spNext = i + 2; return o;
      }
    }
    dst[o++] = 92; dst[o++] = 92; _spNext = i + 1; return o;
  }
  o = writeCtrlJsonU8(dst, o, src[i]);
  _spNext = i + 1; return o;
}

function tf_inlineU8(a, b, o) {
  const src = _iSrc, dst = _iDst, tbl = INL_ACT;
  let i = a;
  while (i < b) {
    let c = src[i], act = tbl[c];
    while (act === 0) { dst[o++] = c; if (++i >= b) return o; c = src[i]; act = tbl[c]; }
    if (act === 6) { dst[o++] = 92; dst[o++] = 110; i++; }
    else if (act <= 5) { let ep = ESC_OFF[act], ee = ep + ESC_LEN[act]; while (ep < ee) dst[o++] = ESC_BYTES[ep++]; i++; }
    else if (act === 9) {
      let p = i + 1, o2 = o + 4, is2 = 0, ok = 0;
      if (p < b && src[p] === 42) { p++; o2 += 4; is2 = 1; }
      const s0 = p;
      while (p < b) {
        const ch = src[p];
        if (tbl[ch] === 0) { dst[o2++] = ch; p++; continue; }
        if (ch === 42 && p > s0) {
          if (is2 !== 0) {
            if (p + 1 < b && src[p + 1] === 42) { dst.set(T_STRONG_OPEN, o); dst.set(T_STRONG_CLOSE, o2); o = o2 + 9; i = p + 2; ok = 1; }
          } else if (p + 1 >= b || src[p + 1] !== 42) { dst.set(T_EM_OPEN, o); dst.set(T_EM_CLOSE, o2); o = o2 + 5; i = p + 1; ok = 1; }
        }
        break;
      }
      if (ok === 0) { o = handleMdTokU8(i, b, o, 9); i = _spNext; }
    } else if (act === 8 || act === 10) { o = handleCodeOrLinkU8(i, b, o, act); i = _spNext; }
    else { o = handleMdTokU8(i, b, o, act); i = _spNext; }
  }
  return o;
}

// Block scanner helpers (Sparkplug — 0 TF compile!)
function isBlankU8(u, a, b) { for (let i = a; i < b; i++) { const c = u[i]; if (c !== 32 && c !== 9) return false; } return true; }
let _flEnd = 0;
function matchFenceOpenU8(u, a, b) {
  if (b - a < 3 || u[a] !== 96 || u[a + 1] !== 96 || u[a + 2] !== 96) return false;
  let p = a + 3;
  while (p < b) { const c = u[p]; if (c < 128 && FENCE_LANG_LUT[c] === 1) p++; else break; }
  _flEnd = p;
  while (p < b) { const c = u[p]; if (c !== 32 && c !== 9) return false; p++; }
  return true;
}
function isFenceCloseU8(u, a, b) {
  if (b - a < 3 || u[a] !== 96 || u[a + 1] !== 96 || u[a + 2] !== 96) return false;
  for (let p = a + 3; p < b; p++) { const c = u[p]; if (c !== 32 && c !== 9) return false; }
  return true;
}
let _hdDepth = 0, _hdStart = 0, _hdEnd = 0;
function matchHeadingU8(u, a, b) {
  if (a >= b || u[a] !== 35) return 0;
  let p = a; while (p < b && u[p] === 35) p++;
  const depth = p - a; if (depth > 6 || p >= b) return 0;
  const c = u[p]; if (c !== 32 && c !== 9) return 0;
  while (p < b && (u[p] === 32 || u[p] === 9)) p++;
  let tEnd = b; while (tEnd > p && (u[tEnd - 1] === 32 || u[tEnd - 1] === 9)) tEnd--;
  if (p >= tEnd) return 0;
  _hdDepth = depth; _hdStart = p; _hdEnd = tEnd; return depth;
}
function isHrU8(u, a, b) {
  if (b - a < 3) return false;
  const c0 = u[a]; if (c0 !== 45 && c0 !== 42) return false;
  if (u[a + 1] !== c0 || u[a + 2] !== c0) return false;
  for (let p = a + 3; p < b; p++) { const c = u[p]; if (c !== 32 && c !== 9) return false; }
  return true;
}
let _ordNum = 0;
function matchOrderedU8(u, a, b) {
  if (a >= b) return -1;
  let p = a, num = 0;
  while (p < b) { const d = u[p] - 48; if (d >= 0 && d <= 9) { num = num * 10 + d; p++; if (p - a > 9) return -1; } else break; }
  if (p === a || p + 1 >= b || u[p] !== 46 || u[p + 1] !== 32) return -1;
  _ordNum = num; return p + 2;
}
function isContinuedU8(u, a, b) {
  if (b - a < 3 || u[a] !== 32 || u[a + 1] !== 32) return false;
  let p = a + 2; while (p < b && u[p] === 32) p++;
  return p < b && utf8WsLen(u, p, b) === 0;
}
function endsParaU8(u, a, b, c0) {
  if (c0 === 32 || c0 === 9) return isBlankU8(u, a, b);
  if (c0 === 96) return matchFenceOpenU8(u, a, b);
  if (c0 === 35) return matchHeadingU8(u, a, b) !== 0;
  if (c0 === 45 || c0 === 42) return isHrU8(u, a, b);
  return false;
}

let _paraLastEnd = 0, _paraClean = 1;
function scanParaU8(fileU8, c0, lEnd, nextPos, len) {
  const pec = PARA_END_C0;
  let lastEnd = lEnd;
  let clean = (c0 !== 32 && c0 !== 9 && fileU8[lEnd - 1] !== 32 && fileU8[lEnd - 1] !== 9) ? 1 : 0;
  let p = nextPos;
  while (p < len) {
    const lc0 = fileU8[p];
    if (lc0 === 10) { p++; break; }
    const pnl = fileU8.indexOf(10, p), plEnd = pnl === -1 ? len : pnl;
    if (pec[lc0] !== 0 && endsParaU8(fileU8, p, plEnd, lc0)) break;
    if (clean !== 0) { const lc1 = fileU8[plEnd - 1]; if (lc0 === 32 || lc0 === 9 || lc1 === 32 || lc1 === 9) clean = 0; }
    lastEnd = plEnd; p = pnl === -1 ? len : pnl + 1;
  }
  _paraLastEnd = lastEnd; _paraClean = clean;
  return p;
}

function trimParaToBq(u, pos, lastEnd) {
  const bq = BQ_U8; let qLen = 0, q = pos;
  while (q <= lastEnd) {
    const _qnl = u.indexOf(10, q), qnl = (_qnl === -1 || _qnl >= lastEnd) ? -1 : _qnl, qlEnd = qnl === -1 ? lastEnd : qnl;
    let ta = q, tb = qlEnd;
    while (ta < tb && (u[ta] === 32 || u[ta] === 9)) ta++;
    while (tb > ta && (u[tb - 1] === 32 || u[tb - 1] === 9)) tb--;
    if (q > pos) bq[qLen++] = 10;
    bq.set(u.subarray(ta, tb), qLen); qLen += tb - ta;
    if (qnl === -1) break; q = qnl + 1;
  }
  return qLen;
}

let _mdPos = 0, _mdExStart = -1, _mdExEnd = -1;

function consumeFenceU8(fileU8, len, pos, nextPos, dst, o) {
  const langStart = pos + 3, langEnd = _flEnd, codeStart = nextPos;
  let codeEnd = -1;
  if (nextPos > len) _mdPos = nextPos;
  else {
    let q = nextPos, found = false;
    while (q < len) {
      const idx = fileU8.indexOf(96, q); if (idx === -1) break;
      if (idx === nextPos || fileU8[idx - 1] === 10) {
        const cnl = fileU8.indexOf(10, idx), clEnd = cnl === -1 ? len : cnl;
        if (isFenceCloseU8(fileU8, idx, clEnd)) {
          codeEnd = idx === nextPos ? -1 : idx - 1; _mdPos = cnl === -1 ? len : cnl + 1; found = true; break;
        }
        q = cnl === -1 ? len : cnl + 1;
      } else q = idx + 1;
    }
    if (!found) { codeEnd = len; _mdPos = len; }
  }
  if (langEnd === langStart) { dst.set(T_PRE_OPEN, o); o += T_PRE_OPEN.length; }
  else {
    dst.set(T_PRE_LANG_J, o); o += T_PRE_LANG_J.length;
    for (let k = langStart; k < langEnd; k++) dst[o++] = fileU8[k];
    dst[o++] = 92; dst[o++] = 34; dst[o++] = 62;
  }
  if (codeEnd === -1) { dst.set(T_PRE_CLOSE_J, o); o += T_PRE_CLOSE_J.length; }
  else { o = tf_copyCodeU8(codeStart, codeEnd, o); dst.set(T_PRE_NL_CLOSE_J, o); o += T_PRE_NL_CLOSE_J.length; }
  return o;
}

function consumeHeadingU8(fileU8, dst, o) {
  const depth = _hdDepth, hStart = _hdStart, hEnd = _hdEnd;
  const id = uniqueSlug(slugifyU8(fileU8, _curFileBuf, _curFileOff, hStart, hEnd), HEADING_IDS);
  const ho = H_OPEN_JU8[depth];
  dst.set(ho, o); o += ho.length;
  const idLen = DST_BUF.latin1Write(id, o);
  o += idLen;
  dst[o++] = 92; dst[o++] = 34; dst[o++] = 62;
  const hO0 = o;
  o = tf_inlineU8(hStart, hEnd, o);
  if (depth === 2 || depth === 3) {
    ensureTocCap(tocCount + 1);
    ensureStrArena(strArenaOff + idLen);
    const idOff = strArenaOff;
    STR_ARENA_BUF.latin1Write(id, idOff);
    strArenaOff = idOff + idLen;
    TOC_LVL[tocCount] = depth;
    TOC_ID_OFF[tocCount] = idOff;
    TOC_ID_LEN[tocCount] = idLen;
    TOC_HTML_OFF[tocCount] = hO0;
    TOC_HTML_LEN[tocCount] = o - hO0;
    tocCount++;
  }
  const hc = H_CLOSE_JU8[depth];
  dst.set(hc, o); o += hc.length;
  return o;
}

function consumeBlockquoteU8(fileU8, len, pos, lEnd, nextPos, dst, o) {
  let a0 = pos + 1, b0 = lEnd;
  while (a0 < b0 && (fileU8[a0] === 32 || fileU8[a0] === 9)) a0++;
  while (b0 > a0 && (fileU8[b0 - 1] === 32 || fileU8[b0 - 1] === 9)) b0--;
  if (nextPos >= len || fileU8[nextPos] !== 62) {
    _mdPos = nextPos;
    dst.set(T_BQ_OPEN_J, o); o += T_BQ_OPEN_J.length;
    if (a0 < b0) {
      dst[o++] = 60; dst[o++] = 112; dst[o++] = 62;
      o = tf_inlineU8(a0, b0, o);
      dst.set(T_P_CLOSE_J, o); o += 6;
    }
    dst.set(T_BQ_CLOSE_J, o); o += T_BQ_CLOSE_J.length;
    return o;
  }
  const bq = BQ_U8; let bqLen = 0, p = nextPos;
  if (a0 < b0) { bq.set(fileU8.subarray(a0, b0), 0); bqLen = b0 - a0; }
  while (p < len && fileU8[p] === 62) {
    const qnl = fileU8.indexOf(10, p), qlEnd = qnl === -1 ? len : qnl;
    let a = p + 1, b = qlEnd;
    while (a < b && (fileU8[a] === 32 || fileU8[a] === 9)) a++;
    while (b > a && (fileU8[b - 1] === 32 || fileU8[b - 1] === 9)) b--;
    if (a < b) { if (bqLen > 0) bq[bqLen++] = 10; bq.set(fileU8.subarray(a, b), bqLen); bqLen += b - a; }
    p = qnl === -1 ? len : qnl + 1;
  }
  _mdPos = p; dst.set(T_BQ_OPEN_J, o); o += T_BQ_OPEN_J.length;
  if (bqLen > 0) {
    dst[o++] = 60; dst[o++] = 112; dst[o++] = 62;
    _iSrc = bq.subarray(0, bqLen); _iSrcBuf = BQ_BUF; _iSrcBufOff = 0;
    o = tf_inlineU8(0, bqLen, o);
    _iSrc = fileU8; _iSrcBuf = _curFileBuf; _iSrcBufOff = _curFileOff;
    dst.set(T_P_CLOSE_J, o); o += 6;
  }
  dst.set(T_BQ_CLOSE_J, o); o += T_BQ_CLOSE_J.length;
  return o;
}

function consumeListU8(fileU8, len, isOrd, firstA, startNum, lEnd, nextPos, dst, o) {
  const bq = BQ_U8;
  if (!isOrd) { dst.set(T_UL_OPEN_J, o); o += T_UL_OPEN_J.length; }
  else if (startNum === 1) { dst.set(T_OL_OPEN_J, o); o += T_OL_OPEN_J.length; }
  else { o += DST_BUF.latin1Write('<ol start=\\"' + startNum + '\\">\\n', o); }
  let a = firstA, b = lEnd;
  while (a < b && (fileU8[a] === 32 || fileU8[a] === 9)) a++;
  while (b > a && (fileU8[b - 1] === 32 || fileU8[b - 1] === 9)) b--;
  let bqLen = 0, inBq = false, itemA = a, itemB = b, p = nextPos;
  while (p < len) {
    const c = fileU8[p];
    if (c !== 32 && (isOrd ? (c < 48 || c > 57) : (c !== 45 && c !== 42))) break;
    const lnl = fileU8.indexOf(10, p), llEnd = lnl === -1 ? len : lnl, lNext = lnl === -1 ? len : lnl + 1;
    const nextItemA = isOrd
      ? (p < llEnd && fileU8[p] >= 48 && fileU8[p] <= 57 ? matchOrderedU8(fileU8, p, llEnd) : -1)
      : (p + 1 < llEnd && (fileU8[p] === 45 || fileU8[p] === 42) && fileU8[p + 1] === 32 ? p + 2 : -1);
    if (nextItemA !== -1) {
      dst[o++] = 60; dst[o++] = 108; dst[o++] = 105; dst[o++] = 62;
      if (inBq) { _iSrc = bq.subarray(0, bqLen); _iSrcBuf = BQ_BUF; _iSrcBufOff = 0; o = tf_inlineU8(0, bqLen, o); _iSrc = fileU8; _iSrcBuf = _curFileBuf; _iSrcBufOff = _curFileOff; }
      else o = tf_inlineU8(itemA, itemB, o);
      dst.set(T_LI_CLOSE_J, o); o += 7;
      a = nextItemA; b = llEnd;
      while (a < b && (fileU8[a] === 32 || fileU8[a] === 9)) a++;
      while (b > a && (fileU8[b - 1] === 32 || fileU8[b - 1] === 9)) b--;
      itemA = a; itemB = b; inBq = false; bqLen = 0; p = lNext;
    } else if (isContinuedU8(fileU8, p, llEnd)) {
      if (!inBq) { bq.set(fileU8.subarray(itemA, itemB), 0); bqLen = itemB - itemA; inBq = true; }
      bq[bqLen++] = 10;
      let ca = p, cb = llEnd;
      while (ca < cb && (fileU8[ca] === 32 || fileU8[ca] === 9)) ca++;
      while (cb > ca && (fileU8[cb - 1] === 32 || fileU8[cb - 1] === 9)) cb--;
      bq.set(fileU8.subarray(ca, cb), bqLen); bqLen += cb - ca; p = lNext;
    } else break;
  }
  _mdPos = p;
  dst[o++] = 60; dst[o++] = 108; dst[o++] = 105; dst[o++] = 62;
  if (inBq) { _iSrc = bq.subarray(0, bqLen); _iSrcBuf = BQ_BUF; _iSrcBufOff = 0; o = tf_inlineU8(0, bqLen, o); _iSrc = fileU8; _iSrcBuf = _curFileBuf; _iSrcBufOff = _curFileOff; }
  else o = tf_inlineU8(itemA, itemB, o);
  dst.set(T_LI_CLOSE_J, o); o += 7;
  const cl = isOrd ? T_OL_CLOSE_J : T_UL_CLOSE_J;
  dst.set(cl, o); o += cl.length;
  return o;
}

function renderMarkdownFast(fileU8, len, dst) {
  const blk = BLK_C0;
  let pos = 0, o = 0, exSeen = false;
  _mdExStart = -1; _mdExEnd = -1;
  tocCount = 0;
  while (pos < len) {
    const c0 = fileU8[pos];
    if (c0 === 10) { pos++; continue; }
    const nl = fileU8.indexOf(10, pos), lEnd = nl === -1 ? len : nl, nextPos = nl === -1 ? len : nl + 1;
    const bk = blk[c0];
    if (bk !== 0) {
      if (bk === 3) { if (matchHeadingU8(fileU8, pos, lEnd) !== 0) { o = consumeHeadingU8(fileU8, dst, o); pos = nextPos; continue; } }
      else if (bk === 4) {
        if (isHrU8(fileU8, pos, lEnd)) { dst.set(T_HR_J, o); o += T_HR_J.length; pos = nextPos; continue; }
        if (pos + 1 < lEnd && fileU8[pos + 1] === 32) { o = consumeListU8(fileU8, len, false, pos + 2, 0, lEnd, nextPos, dst, o); pos = _mdPos; continue; }
      } else if (bk === 5) { o = consumeBlockquoteU8(fileU8, len, pos, lEnd, nextPos, dst, o); pos = _mdPos; continue; }
      else if (bk === 6) { const oc = matchOrderedU8(fileU8, pos, lEnd); if (oc !== -1) { o = consumeListU8(fileU8, len, true, oc, _ordNum, lEnd, nextPos, dst, o); pos = _mdPos; continue; } }
      else if (bk === 2) { if (matchFenceOpenU8(fileU8, pos, lEnd)) { o = consumeFenceU8(fileU8, len, pos, nl === -1 ? len + 1 : nextPos, dst, o); pos = _mdPos; continue; } }
      else if (isBlankU8(fileU8, pos, lEnd)) { pos = nextPos; continue; }
    }
    let p, lastEnd, trimmed;
    if (nextPos >= len || fileU8[nextPos] === 10) {
      p = nextPos >= len ? len : nextPos + 1; lastEnd = lEnd;
      trimmed = (c0 === 32 || c0 === 9 || fileU8[lEnd - 1] === 32 || fileU8[lEnd - 1] === 9);
    } else {
      p = scanParaU8(fileU8, c0, lEnd, nextPos, len);
      lastEnd = _paraLastEnd; trimmed = _paraClean === 0;
    }
    let pA = pos, pB = lastEnd;
    if (trimmed) {
      const qLen = trimParaToBq(fileU8, pos, lastEnd);
      _iSrc = BQ_U8.subarray(0, qLen); _iSrcBuf = BQ_BUF; _iSrcBufOff = 0; pA = 0; pB = qLen;
    }
    pos = p;
    dst[o++] = 60; dst[o++] = 112; dst[o++] = 62;
    if (!exSeen) { exSeen = true; _mdExStart = o; o = tf_inlineU8(pA, pB, o); _mdExEnd = o; }
    else o = tf_inlineU8(pA, pB, o);
    if (trimmed) { _iSrc = fileU8; _iSrcBuf = _curFileBuf; _iSrcBufOff = _curFileOff; }
    dst.set(T_P_CLOSE_J, o); o += 6;
  }
  return o;
}

// ---------------------------------------------------------------- Template Parser + Hoisted Zero-Deopt VM + OP_BLAST_TAGS (TF #6!)

class TemplateError extends Error {}
const PATH_RE = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const FOR_RE = /^for ([A-Za-z_][A-Za-z0-9_]*) in (\S+)$/;
const IF_RE = /^if (not )?(\S+)$/;
const INCLUDE_RE = /^include "([a-z0-9-]+)"$/;

function pathOf(name, text) {
  if (!PATH_RE.test(text)) throw new TemplateError(`template "${name}": ${JSON.stringify(text)} is not a path`);
  return text.split('.');
}
function isSpacesTabs(src, start, end) {
  for (let i = start; i < end; i++) { const c = src.charCodeAt(i); if (c !== 32 && c !== 9) return false; }
  return true;
}

function parseTemplate(name, src) {
  const root = { kind: 'root', body: [] }, stack = [root];
  let body = root.body, text = '', i = 0; const len = src.length;
  while (i < len) {
    const open = src.indexOf('{', i);
    if (open === -1 || open === len - 1) { text += src.slice(i); break; }
    const next = src.charCodeAt(open + 1);
    if (next !== 123 && next !== 37) { text += src.slice(i, open + 1); i = open + 1; continue; }
    if (open > i) text += src.slice(i, open);
    if (next === 123) {
      const raw = open + 2 < len && src.charCodeAt(open + 2) === 123;
      const close = src.indexOf(raw ? '}}}' : '}}', open + (raw ? 3 : 2));
      if (close === -1) throw new TemplateError(`template "${name}": a ${raw ? '{{{' : '{{'} is not closed`);
      if (text !== '') { body.push({ k: 0, v: text }); text = ''; }
      body.push({ k: raw ? 2 : 1, p: pathOf(name, src.slice(open + (raw ? 3 : 2), close).trim()) });
      i = close + (raw ? 3 : 2); continue;
    }
    const close = src.indexOf('%}', open + 2);
    if (close === -1) throw new TemplateError(`template "${name}": a {% is not closed`);
    const end = close + 2, lineStart = open === 0 ? 0 : src.lastIndexOf('\n', open - 1) + 1;
    const nl = src.indexOf('\n', end), lineEnd = nl === -1 ? len : nl;
    const standalone = isSpacesTabs(src, lineStart, open) && isSpacesTabs(src, end, lineEnd);
    if (standalone) text = text.slice(0, text.length - (open - lineStart));
    if (text !== '') { body.push({ k: 0, v: text }); text = ''; }
    const tag = src.slice(open + 2, close).trim(), top = stack[stack.length - 1];
    let m;
    if ((m = FOR_RE.exec(tag)) !== null) { const node = { k: 4, kind: 'for', n: m[1], p: pathOf(name, m[2]), b: [] }; body.push(node); stack.push(node); body = node.b; }
    else if ((m = IF_RE.exec(tag)) !== null) { const node = { k: 3, kind: 'if', not: m[1] !== undefined, p: pathOf(name, m[2]), t: [], e: null }; body.push(node); stack.push(node); body = node.t; }
    else if (tag === 'else') { if (top.kind !== 'if' || top.e !== null) throw new TemplateError(`template "${name}": an else outside an if`); top.e = []; body = top.e; }
    else if (tag === 'endfor' || tag === 'endif') {
      if (top.kind !== (tag === 'endfor' ? 'for' : 'if')) throw new TemplateError(`template "${name}": an ${tag} with no open ${tag.slice(3)}`);
      stack.pop(); const parent = stack[stack.length - 1];
      body = parent.kind === 'root' ? parent.body : parent.kind === 'for' ? parent.b : (parent.e ?? parent.t);
    } else if ((m = INCLUDE_RE.exec(tag)) !== null) body.push({ k: 5, n: m[1] });
    else throw new TemplateError(`template "${name}": {% ${tag} %} is not a tag`);
    i = standalone ? (nl === -1 ? len : nl + 1) : end;
  }
  if (text !== '') body.push({ k: 0, v: text });
  if (stack.length > 1) throw new TemplateError(`template "${name}": a ${stack[stack.length - 1].kind} is not closed`);
  return root.body;
}

function scanTemplateEscapes(nodes) {
  let mask = 0;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.k === 1) { const last = n.p[n.p.length - 1]; if (last === 'content') mask |= 1; else if (last === 'excerpt') mask |= 2; else if (last === 'html') mask |= 4; }
    else if (n.k === 3) { mask |= scanTemplateEscapes(n.t); if (n.e !== null) mask |= scanTemplateEscapes(n.e); }
    else if (n.k === 4) mask |= scanTemplateEscapes(n.b);
  }
  return mask;
}
function countExpandedNodes(templates, name, depth) {
  if (depth > INCLUDE_DEPTH) return 0;
  const nodes = templates.get(name); if (nodes === undefined) return 0;
  let total = 0;
  function walk(arr) {
    for (let i = 0; i < arr.length; i++) {
      const n = arr[i]; total++; if (total > 2000) return;
      if (n.k === 3) { walk(n.t); if (n.e !== null) walk(n.e); }
      else if (n.k === 4) walk(n.b);
      else if (n.k === 5 && depth < INCLUDE_DEPTH) total += countExpandedNodes(templates, n.n, depth + 1);
    }
  }
  walk(nodes); return total;
}
function layoutNeedsReadingMinutes(tplName, rawTemplates, parsedTemplates, memo) {
  const cached = memo.get(tplName); if (cached !== undefined) return cached;
  const raw = rawTemplates[tplName]; if (raw === undefined) { memo.set(tplName, false); return false; }
  if (raw.indexOf('reading_minutes') !== -1) { memo.set(tplName, true); return true; }
  memo.set(tplName, false);
  const nodes = parsedTemplates.get(tplName); if (nodes === undefined) return false;
  function walk(arr) {
    for (let i = 0; i < arr.length; i++) {
      const n = arr[i];
      if (n.k === 5) { if (layoutNeedsReadingMinutes(n.n, rawTemplates, parsedTemplates, memo)) return true; }
      else if (n.k === 3) { if (walk(n.t) || (n.e !== null && walk(n.e))) return true; }
      else if (n.k === 4) { if (walk(n.b)) return true; }
    }
    return false;
  }
  const res = walk(nodes); memo.set(tplName, res); return res;
}

function textOf(v) { if (v === undefined || v === null || v === false) return ''; if (typeof v === 'string') return v; if (typeof v === 'number' || typeof v === 'boolean') return String(v); return ''; }
function truthy(v) { if (v === undefined || v === null || v === false || v === 0 || v === '') return false; return Array.isArray(v) ? v.length > 0 : true; }
function resolvePropPath(v, path, from) { for (let i = from; i < path.length; i++) { if (v === null || v === undefined || typeof v !== 'object') return undefined; v = v[path[i]]; } return v; }

function getFreeVarsLazy(rctx, name) {
  const c = rctx.freeCache.get(name); if (c !== undefined) return c;
  if (VISITING_SET.has(name)) return null;
  const nodes = rctx.templates.get(name); if (nodes === undefined) return new Set();
  VISITING_SET.add(name); const free = new Set(); let ok = true;
  function walk(arr, bound) {
    for (let i = 0; i < arr.length && ok; i++) {
      const n = arr[i];
      if (n.k === 1 || n.k === 2) { if (!bound.has(n.p[0])) free.add(n.p[0]); }
      else if (n.k === 3) { if (!bound.has(n.p[0])) free.add(n.p[0]); walk(n.t, bound); if (n.e !== null) walk(n.e, bound); }
      else if (n.k === 4) { if (!bound.has(n.p[0])) free.add(n.p[0]); const nb = new Set(bound); nb.add(n.n); nb.add('loop'); walk(n.b, nb); }
      else if (n.k === 5) { const sub = getFreeVarsLazy(rctx, n.n); if (sub === null) { ok = false; break; } for (const v of sub) if (!bound.has(v)) free.add(v); }
    }
  }
  walk(nodes, new Set()); VISITING_SET.delete(name);
  const res = ok ? free : null; rctx.freeCache.set(name, res); return res;
}
function getMaxDepthLazy(rctx, name) {
  const c = rctx.depthCache.get(name); if (c !== undefined) return c;
  if (VISITING_SET.has(name)) return 999;
  const nodes = rctx.templates.get(name); if (nodes === undefined) return 0;
  VISITING_SET.add(name); let maxD = 0;
  function walk(arr) {
    for (let i = 0; i < arr.length; i++) {
      const n = arr[i];
      if (n.k === 5) { const d = 1 + getMaxDepthLazy(rctx, n.n); if (d > maxD) maxD = d; }
      else if (n.k === 3) { walk(n.t); if (n.e !== null) walk(n.e); }
      else if (n.k === 4) walk(n.b);
    }
  }
  walk(nodes); VISITING_SET.delete(name); rctx.depthCache.set(name, maxD); return maxD;
}
function evalSiteConstFast(rctx, tplName) {
  let s = rctx.siteConstIncludeCache.get(tplName); if (s !== undefined) return s;
  const templates = rctx.templates, siteRoot = rctx.siteRoot;
  function evalNodes(nodes, scope, depth) {
    let out = '';
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.k === 0) out += n.v;
      else if (n.k === 1 || n.k === 2) {
        let cur = scope, v; while (cur !== null) { if (Object.hasOwn(cur.vars, n.p[0])) { v = resolvePropPath(cur.vars[n.p[0]], n.p, 1); break; } cur = cur.parent; }
        const t = textOf(v); if (t !== '') out += n.k === 1 ? escapeHtml(t) : t;
      } else if (n.k === 3) {
        let cur = scope, v; while (cur !== null) { if (Object.hasOwn(cur.vars, n.p[0])) { v = resolvePropPath(cur.vars[n.p[0]], n.p, 1); break; } cur = cur.parent; }
        const br = truthy(v) !== n.not ? n.t : n.e; if (br !== null) out += evalNodes(br, scope, depth);
      } else if (n.k === 4) {
        let cur = scope, v; while (cur !== null) { if (Object.hasOwn(cur.vars, n.p[0])) { v = resolvePropPath(cur.vars[n.p[0]], n.p, 1); break; } cur = cur.parent; }
        if (Array.isArray(v) && v.length > 0) for (let k = 0; k < v.length; k++) out += evalNodes(n.b, { vars: { [n.n]: v[k], loop: { index: k + 1, first: k === 0, last: k === v.length - 1, length: v.length } }, parent: scope }, depth);
      } else if (n.k === 5 && depth < INCLUDE_DEPTH) { const sub = templates.get(n.n); if (sub !== undefined) out += evalNodes(sub, scope, depth + 1); }
    }
    return out;
  }
  s = evalNodes(templates.get(tplName), { vars: siteRoot, parent: null }, 1);
  rctx.siteConstIncludeCache.set(tplName, s); return s;
}

const SL_TITLE = 0, SL_URL = 1, SL_DATE = 2, SL_DATE_LONG = 3, SL_SUMMARY = 4, SL_RM = 5, SL_SLUG = 6;
const SL_NEWER_URL = 7, SL_NEWER_TITLE = 8, SL_OLDER_URL = 9, SL_OLDER_TITLE = 10;
const SL_HAS_TAGS = 11, SL_HAS_TOC = 12, SL_IS_POST = 13;
const SL_TAG_NAME = 14, SL_TAG_SLUG = 15, SL_TAG_URL = 16, SL_TAG_COUNT = 17;
const SL_PAGER_NUM = 18, SL_PAGER_TOT = 19, SL_PAGER_URL = 20, SL_PAGER_NEW = 21, SL_PAGER_OLD = 22, SL_HAS_POSTS = 23;
const SL_L_A = 24, SL_L_B = 25, SL_L_URL = 26, SL_L_IDX = 27, SL_L_FIRST = 28, SL_L_LAST = 29, SL_L_LEN = 30;
const RP_TRUE = { kind: 'alwaysTrue' }, RP_UNSUP = { kind: 'unsupported' }, RP_UNDEF = { kind: 'static', val: undefined };
const RP_BODY = { kind: 'body' }, RP_EXCERPT = { kind: 'excerpt' }, RP_TOC_HTML = { kind: 'tocHtml' };
const RP_SL = new Array(32), RP_SL_ESC = new Array(32);
for (let i = 0; i < 32; i++) { RP_SL[i] = { kind: 'slot', id: i, needEsc: false, isArr: false, isObj: false }; RP_SL_ESC[i] = { kind: 'slot', id: i, needEsc: true, isArr: false, isObj: false }; }
const RP_SL_TAGS = { kind: 'slot', id: SL_HAS_TAGS, needEsc: false, isArr: true, isObj: false };
const RP_SL_TOC = { kind: 'slot', id: SL_HAS_TOC, needEsc: false, isArr: true, isObj: false };
const RP_SL_POSTS = { kind: 'slot', id: SL_HAS_POSTS, needEsc: false, isArr: true, isObj: false };
const RP_SL_NEWER = { kind: 'slot', id: SL_NEWER_URL, needEsc: false, isArr: false, isObj: true };
const RP_SL_OLDER = { kind: 'slot', id: SL_OLDER_URL, needEsc: false, isArr: false, isObj: true };

function compileTplToVm(rctx, nodes, roleKind, cardVarName) {
  const ops = [], lits = [];
  let pendingLit = '', cardTplName = null, activeLoop = 0, loopVar = '', supported = true;
  let loopFlags = 0;

  function flushLit() {
    if (pendingLit === '') return;
    const j = JSON_ANY_RE.test(pendingLit) ? JSON.stringify(pendingLit).slice(1, -1) : pendingLit;
    pendingLit = '';
    const b = Buffer.from(j, 'utf8');
    lits.push(new Uint8Array(b.buffer, b.byteOffset, b.byteLength));
    ops.push(0, lits.length - 1, 0);
  }

  function resolveVmPath(p, staticFrames) {
    const r = p[0];
    for (let i = staticFrames.length - 1; i >= 0; i--) {
      const fr = staticFrames[i];
      if (fr.name === r) return { kind: 'static', val: resolvePropPath(fr.val, p, 1) };
      if (r === 'loop') return { kind: 'static', val: resolvePropPath(fr.loopVal, p, 1) };
    }
    if (activeLoop !== 0) {
      if (r === 'loop') {
        if (p.length === 1) return RP_TRUE;
        if (p.length === 2) {
          const k = p[1];
          if (k === 'index') { loopFlags |= 1; return RP_SL[SL_L_IDX]; }
          if (k === 'first') { loopFlags |= 2; return RP_SL[SL_L_FIRST]; }
          if (k === 'last') { loopFlags |= 2; return RP_SL[SL_L_LAST]; }
          if (k === 'length') { loopFlags |= 1; return RP_SL[SL_L_LEN]; }
        }
        return RP_UNDEF;
      }
      if (r === loopVar) {
        if (p.length === 1) return RP_TRUE;
        if (p.length === 2) {
          const k = p[1];
          if (activeLoop === 1) {
            if (k === 'name') return RP_SL_ESC[SL_L_A];
            if (k === 'slug') return RP_SL[SL_L_B];
            if (k === 'url') return RP_SL[SL_L_URL];
          } else {
            if (k === 'id') return RP_SL[SL_L_A];
            if (k === 'level') return RP_SL[SL_L_B];
            if (k === 'html') return RP_TOC_HTML;
          }
        }
        return RP_UNDEF;
      }
      loopFlags |= 4;
    }
    if ((roleKind === 'P' && r === 'page') || (roleKind === 'C' && r === cardVarName)) {
      if (p.length === 1) return RP_TRUE;
      const k = p[1];
      if (p.length === 2) {
        if (k === 'title') return RP_SL_ESC[SL_TITLE];
        if (k === 'url') return RP_SL[SL_URL];
        if (k === 'date') return RP_SL[SL_DATE];
        if (k === 'date_long') return RP_SL[SL_DATE_LONG];
        if (k === 'summary') return RP_SL_ESC[SL_SUMMARY];
        if (k === 'reading_minutes') return RP_SL[SL_RM];
        if (k === 'excerpt') return RP_EXCERPT;
        if (k === 'tags') return RP_SL_TAGS;
        if (roleKind === 'P') {
          if (k === 'slug') return RP_SL[SL_SLUG];
          if (k === 'content') return RP_BODY;
          if (k === 'toc') return RP_SL_TOC;
          if (k === 'newer') return RP_SL_NEWER;
          if (k === 'older') return RP_SL_OLDER;
          if (k === 'is_post') return RP_SL[SL_IS_POST];
        }
        return RP_UNDEF;
      }
      if (p.length === 3 && roleKind === 'P') {
        if (k === 'newer') { if (p[2] === 'url') return RP_SL[SL_NEWER_URL]; if (p[2] === 'title') return RP_SL_ESC[SL_NEWER_TITLE]; return RP_UNSUP; }
        if (k === 'older') { if (p[2] === 'url') return RP_SL[SL_OLDER_URL]; if (p[2] === 'title') return RP_SL_ESC[SL_OLDER_TITLE]; return RP_UNSUP; }
      }
      return RP_UNSUP;
    }
    if (roleKind === 'I') {
      if (r === 'posts' && p.length === 1) return RP_SL_POSTS;
      if (r === 'pager') {
        if (p.length === 1) return RP_TRUE;
        if (p.length === 2) {
          const k = p[1];
          if (k === 'number') return RP_SL[SL_PAGER_NUM];
          if (k === 'total') return RP_SL[SL_PAGER_TOT];
          if (k === 'url') return RP_SL[SL_PAGER_URL];
          if (k === 'newer_url') return RP_SL[SL_PAGER_NEW];
          if (k === 'older_url') return RP_SL[SL_PAGER_OLD];
        }
        return RP_UNDEF;
      }
    }
    if (roleKind === 'T' && r === 'tag') {
      if (p.length === 1) return RP_TRUE;
      if (p.length === 2) {
        const k = p[1];
        if (k === 'name') return RP_SL_ESC[SL_TAG_NAME];
        if (k === 'slug') return RP_SL[SL_TAG_SLUG];
        if (k === 'url') return RP_SL[SL_TAG_URL];
        if (k === 'count') return RP_SL[SL_TAG_COUNT];
        if (k === 'posts') return RP_SL_POSTS;
      }
      return RP_UNDEF;
    }
    if (Object.hasOwn(rctx.siteRoot, r)) return { kind: 'static', val: resolvePropPath(rctx.siteRoot[r], p, 1) };
    return RP_UNDEF;
  }

  function hasDynInStatic(arr, sf) {
    for (let i = 0; i < arr.length; i++) {
      const n = arr[i];
      if (n.k === 1 || n.k === 2 || n.k === 3) {
        if (resolveVmPath(n.p, sf).kind !== 'static') return true;
        if (n.k === 3 && (hasDynInStatic(n.t, sf) || (n.e !== null && hasDynInStatic(n.e, sf)))) return true;
      } else if (n.k === 4) {
        if (resolveVmPath(n.p, sf).kind !== 'static') return true;
        if (hasDynInStatic(n.b, sf.concat({ name: n.n, val: undefined, loopVal: undefined }))) return true;
      } else if (n.k === 5) {
        const free = getFreeVarsLazy(rctx, n.n); if (free === null) return true;
        for (const v of free) if (resolveVmPath([v], sf).kind !== 'static') return true;
      }
    }
    return false;
  }

  function emit(arr, sf, depth) {
    for (let i = 0; i < arr.length && supported; i++) {
      const n = arr[i];
      if (n.k === 0) { pendingLit += n.v; continue; }
      if (n.k === 1 || n.k === 2) {
        const info = resolveVmPath(n.p, sf);
        if (info.kind === 'unsupported') { supported = false; return; }
        if (info.kind === 'static') { const t = textOf(info.val); if (t !== '') pendingLit += n.k === 1 ? escapeHtml(t) : t; continue; }
        if (info.kind === 'alwaysTrue' || info.isArr || info.isObj) continue;
        if (info.kind === 'body') { if (n.k !== 2) { supported = false; return; } flushLit(); ops.push(2, 0, 0); continue; }
        if (info.kind === 'excerpt') { if (n.k !== 2) { supported = false; return; } flushLit(); ops.push(3, 0, 0); continue; }
        if (info.kind === 'tocHtml') { if (n.k !== 2) { supported = false; return; } flushLit(); ops.push(4, 0, 0); continue; }
        if (info.needEsc && n.k !== 1) { supported = false; return; }
        flushLit(); ops.push(1, info.id, 0); continue;
      }
      if (n.k === 3) {
        const info = resolveVmPath(n.p, sf);
        if (info.kind === 'unsupported') { supported = false; return; }
        if (info.kind === 'static') { const br = truthy(info.val) !== n.not ? n.t : n.e; if (br !== null) emit(br, sf, depth); continue; }
        if (info.kind === 'alwaysTrue') { const br = !n.not ? n.t : n.e; if (br !== null) emit(br, sf, depth); continue; }
        if (info.kind !== 'slot') { supported = false; return; }
        flushLit();
        const jIdx = ops.length; ops.push(5, info.id | (n.not ? 64 : 0), 0);
        emit(n.t, sf, depth); flushLit();
        if (n.e !== null && n.e.length > 0) {
          const jmpEnd = ops.length; ops.push(7, 0, 0);
          ops[jIdx + 2] = ops.length;
          emit(n.e, sf, depth); flushLit();
          ops[jmpEnd + 1] = ops.length;
        } else ops[jIdx + 2] = ops.length;
        continue;
      }
      if (n.k === 4) {
        const info = resolveVmPath(n.p, sf);
        if (info.kind === 'static') {
          const xs = info.val; if (!Array.isArray(xs) || xs.length === 0) continue;
          if (hasDynInStatic(n.b, sf.concat({ name: n.n, val: undefined, loopVal: undefined }))) { supported = false; return; }
          for (let k = 0; k < xs.length; k++) emit(n.b, sf.concat({ name: n.n, val: xs[k], loopVal: { index: k + 1, first: k === 0, last: k === xs.length - 1, length: xs.length } }), depth);
          continue;
        }
        if (activeLoop !== 0) { supported = false; return; }
        if (info.kind === 'slot' && (info.id === SL_HAS_TAGS || info.id === SL_HAS_TOC)) {
          const isTag = info.id === SL_HAS_TAGS;
          flushLit();
          const fIdx = ops.length; ops.push(isTag ? 8 : 10, 0, 0);
          const bodyIp = ops.length;
          activeLoop = isTag ? 1 : 2; loopVar = n.n; loopFlags = 0;
          emit(n.b, sf, depth); flushLit();
          const lf = loopFlags;
          activeLoop = 0; loopVar = '';
          if (isTag && lf === 0 && supported && ops.length > bodyIp) {
            const subOps = new Int32Array(ops.slice(bodyIp));
            for (let si = 0; si < subOps.length; si += 3) {
              const so = subOps[si];
              if (so === 5) subOps[si + 2] -= bodyIp;
              else if (so === 7) subOps[si + 1] -= bodyIp;
            }
            const snipId = rctx.tagSnips.length;
            rctx.tagSnips.push({ ops: subOps, lits });
            ops.length = fIdx;
            ops.push(13, snipId, 0);
            continue;
          }
          ops[fIdx + 2] = lf;
          ops.push(isTag ? 9 : 11, bodyIp, lf);
          ops[fIdx + 1] = ops.length;
          continue;
        }
        if (info.kind === 'slot' && info.id === SL_HAS_POSTS) {
          if (n.b.length === 1 && n.b[0].k === 5 && depth < INCLUDE_DEPTH) {
            const incName = n.b[0].n;
            const free = getFreeVarsLazy(rctx, incName), maxD = getMaxDepthLazy(rctx, incName);
            if (free !== null && maxD + depth + 1 <= INCLUDE_DEPTH && !free.has('loop')) {
              let okCard = true;
              for (const v of free) if (v !== n.n && v !== 'site' && v !== 'tags' && v !== 'recent') { okCard = false; break; }
              if (okCard && (cardTplName === null || cardTplName === incName)) {
                cardTplName = incName;
                if (!rctx.cardVarName) rctx.cardVarName = n.n;
                if (rctx.cardVarName === n.n) { flushLit(); ops.push(12, 0, 0); continue; }
              }
            }
          }
          supported = false; return;
        }
        supported = false; return;
      }
      if (n.k === 5) {
        if (depth >= INCLUDE_DEPTH) continue;
        const incNodes = rctx.templates.get(n.n); if (incNodes === undefined) continue;
        const free = getFreeVarsLazy(rctx, n.n), maxD = getMaxDepthLazy(rctx, n.n);
        if (free !== null && maxD + depth + 1 <= INCLUDE_DEPTH) {
          let siteOnly = true;
          for (const v of free) {
            if (v === 'site' || v === 'tags' || v === 'recent') {
              if (activeLoop !== 0 && loopVar === v) { siteOnly = false; break; }
              for (let f = 0; f < sf.length; f++) if (sf[f].name === v) { siteOnly = false; break; }
              if (!siteOnly) break; continue;
            }
            siteOnly = false; break;
          }
          if (siteOnly) { pendingLit += evalSiteConstFast(rctx, n.n); continue; }
        }
        emit(incNodes, sf, depth + 1);
      }
    }
  }

  emit(nodes, [], 0);
  if (!supported) return null;
  flushLit();
  return { ops: new Int32Array(ops), lits, cardTplName };
}

let _outU8 = null, _outCap = 0, _outOff = 0, _outFlush = null;
let _vmBodyU8 = EMPTY_U8, _vmBodyLen = 0, _vmExOff = 0, _vmExLen = 0;
let _vmTocSrc = EMPTY_U8, _vmTocCount = 0, _vmTagIds = EMPTY_ARR, _vmTagCount = 0;
let _vmCardOffs = null, _vmCardLens = null, _vmCardList = null, _vmCardCount = 0;
let _vmTagSnips = null;
let _vmIp = 0, _vmLi = 0, _vmLCount = 0;

function writeBigChunk(src, a, n) {
  let rem = n, pos = a;
  while (rem > 0) {
    const space = _outCap - _outOff;
    if (space === 0) { _outFlush(); continue; }
    const take = rem < space ? rem : space;
    _outU8.set(src.subarray(pos, pos + take), _outOff);
    _outOff += take; pos += take; rem -= take;
  }
}
function vmFlushWrite(src, a, n) {
  _outFlush();
  if (_outOff + n > _outCap) { writeBigChunk(src, a, n); return _outOff; }
  _outU8.set(a === 0 && n === src.length ? src : src.subarray(a, a + n), _outOff);
  _outOff += n; return _outOff;
}
function setLoopIntSlot(slotId, num) {
  if (num < 10) { S_OFF[slotId] = 9 + num; S_LEN[slotId] = 1; return; }
  const p = slotId === SL_L_IDX ? 24 : 36;
  if (num < 100) { STR_ARENA_U8[p] = 48 + ((num / 10) | 0); STR_ARENA_U8[p + 1] = 48 + (num % 10); S_OFF[slotId] = p; S_LEN[slotId] = 2; return; }
  const st = String(num), n = st.length;
  for (let k = 0; k < n; k++) STR_ARENA_U8[p + k] = st.charCodeAt(k);
  S_OFF[slotId] = p; S_LEN[slotId] = n;
}
function loadTagSlots(tid) {
  S_OFF[SL_L_A] = TAG_NOFF[tid]; S_LEN[SL_L_A] = TAG_NLEN[tid];
  S_OFF[SL_L_B] = TAG_SOFF[tid]; S_LEN[SL_L_B] = TAG_SLEN[tid];
  S_OFF[SL_L_URL] = TAG_UOFF[tid]; S_LEN[SL_L_URL] = TAG_ULEN[tid];
}
function loadTocSlots(li) {
  S_OFF[SL_L_A] = TOC_ID_OFF[li]; S_LEN[SL_L_A] = TOC_ID_LEN[li];
  S_OFF[SL_L_B] = 9 + TOC_LVL[li]; S_LEN[SL_L_B] = 1;
}

function vmExtOp(op, arg, arg2, ip, o) {
  const sLen = S_LEN;
  if (op === 8) {
    const c = _vmTagCount;
    if (c === 0) { _vmIp = arg; return o; }
    _vmLi = 0; _vmLCount = c; loadTagSlots(_vmTagIds[0]);
    if ((arg2 & 2) !== 0) { sLen[SL_L_FIRST] = 4; sLen[SL_L_LAST] = c === 1 ? 4 : 0; }
    if ((arg2 & 1) !== 0) { setLoopIntSlot(SL_L_IDX, 1); setLoopIntSlot(SL_L_LEN, c); }
    _vmIp = ip + 3; return o;
  }
  if (op === 9) {
    const li = _vmLi + 1;
    if (li < _vmLCount) {
      _vmLi = li; loadTagSlots(_vmTagIds[li]);
      if ((arg2 & 2) !== 0) { sLen[SL_L_FIRST] = 0; sLen[SL_L_LAST] = li === _vmLCount - 1 ? 4 : 0; }
      if ((arg2 & 1) !== 0) setLoopIntSlot(SL_L_IDX, li + 1);
      _vmIp = arg; return o;
    }
    _vmIp = ip + 3; return o;
  }
  if (op === 10) {
    const c = _vmTocCount;
    if (c === 0) { _vmIp = arg; return o; }
    _vmLi = 0; _vmLCount = c; loadTocSlots(0);
    if ((arg2 & 2) !== 0) { sLen[SL_L_FIRST] = 4; sLen[SL_L_LAST] = c === 1 ? 4 : 0; }
    if ((arg2 & 1) !== 0) { setLoopIntSlot(SL_L_IDX, 1); setLoopIntSlot(SL_L_LEN, c); }
    _vmIp = ip + 3; return o;
  }
  if (op === 11) {
    const li = _vmLi + 1;
    if (li < _vmLCount) {
      _vmLi = li; loadTocSlots(li);
      if ((arg2 & 2) !== 0) { sLen[SL_L_FIRST] = 0; sLen[SL_L_LAST] = li === _vmLCount - 1 ? 4 : 0; }
      if ((arg2 & 1) !== 0) setLoopIntSlot(SL_L_IDX, li + 1);
      _vmIp = arg; return o;
    }
    _vmIp = ip + 3; return o;
  }
  _vmIp = ip + 3; _outOff = o;
  if (op === 2) {
    const n = _vmBodyLen;
    if (n === 0) return o;
    if (o + n > _outCap) return vmFlushWrite(_vmBodyU8, 0, n);
    _outU8.set(_vmBodyU8.subarray(0, n), o); return o + n;
  }
  if (op === 3) {
    const n = _vmExLen;
    if (n === 0) return o;
    if (o + n > _outCap) return vmFlushWrite(EX_ARENA_U8, _vmExOff, n);
    _outU8.set(EX_ARENA_U8.subarray(_vmExOff, _vmExOff + n), o); return o + n;
  }
  if (op === 4) {
    const n = TOC_HTML_LEN[_vmLi];
    if (n === 0) return o;
    const a = TOC_HTML_OFF[_vmLi];
    if (o + n > _outCap) return vmFlushWrite(_vmTocSrc, a, n);
    _outU8.set(_vmTocSrc.subarray(a, a + n), o); return o + n;
  }
  if (op === 13) {
    const tc = _vmTagCount; if (tc === 0) return o;
    const tids = _vmTagIds, sn = _vmTagSnips[arg], offs = sn.offs, lens = sn.lens, sa = STR_ARENA_U8;
    for (let k = 0; k < tc; k++) {
      const tid = tids[k], to = offs[tid], tl = lens[tid];
      if (tl === 0) continue;
      if (o + tl > _outCap) { _outOff = o; o = vmFlushWrite(sa, to, tl); }
      else { _outU8.set(sa.subarray(to, to + tl), o); o += tl; }
    }
    return o;
  }
  const cc = _vmCardCount, cl = _vmCardList, co = _vmCardOffs, cn = _vmCardLens, ca = CARD_ARENA_U8;
  for (let k = 0; k < cc; k++) {
    const pid = cl[k], cOff = co[pid], cLen = cn[pid];
    if (o + cLen > _outCap) { _outOff = o; o = vmFlushWrite(ca, cOff, cLen); }
    else { _outU8.set(ca.subarray(cOff, cOff + cLen), o); o += cLen; }
  }
  return o;
}

function tf_execTpl(ops, opLen, lits) {
  let o = _outOff, out = _outU8, cap = _outCap;
  const sOff = S_OFF, sLen = S_LEN, sU8 = STR_ARENA_U8;
  let ip = 0;
  while (ip < opLen) {
    const op = ops[ip];
    if (op === 0) {
      const src = lits[ops[ip + 1]]; ip += 3;
      const n = src.length;
      if (o + n > cap) { _outOff = o; o = vmFlushWrite(src, 0, n); out = _outU8; cap = _outCap; }
      else if (n <= 64) { for (let k = 0; k < n; k++) out[o++] = src[k]; }
      else { out.set(src, o); o += n; }
    } else if (op === 1) {
      const idx = ops[ip + 1]; ip += 3;
      const n = sLen[idx];
      if (n === 0) continue;
      let a = sOff[idx];
      if (o + n > cap) { _outOff = o; o = vmFlushWrite(sU8, a, n); out = _outU8; cap = _outCap; }
      else { const e = a + n; while (a < e) out[o++] = sU8[a++]; }
    } else if (op === 5) {
      const a = ops[ip + 1];
      ip = ((sLen[a & 63] === 0) !== ((a & 64) !== 0)) ? ops[ip + 2] : ip + 3;
    } else if (op === 7) {
      ip = ops[ip + 1];
    } else {
      o = vmExtOp(op, ops[ip + 1], ops[ip + 2], ip, o);
      ip = _vmIp; out = _outU8; cap = _outCap;
    }
  }
  _outOff = o;
}

// ---------------------------------------------------------------- Streaming Case Runner

function writeSlotStr(slotId, str) {
  if (str.length === 0) { S_LEN[slotId] = 0; return; }
  const maxB = str.length * 3;
  if (strArenaOff + maxB + 64 > STR_ARENA_CAP) ensureStrArena(strArenaOff + maxB + 4096);
  const o = strArenaOff, n = STR_ARENA_BUF.utf8Write(str, o);
  strArenaOff = o + n; S_OFF[slotId] = o; S_LEN[slotId] = n;
}
function writeSlotAscii(slotId, str) {
  const n = str.length;
  if (n === 0) { S_LEN[slotId] = 0; return; }
  if (strArenaOff + n + 64 > STR_ARENA_CAP) ensureStrArena(strArenaOff + n + 4096);
  const o = strArenaOff; STR_ARENA_BUF.latin1Write(str, o);
  strArenaOff = o + n; S_OFF[slotId] = o; S_LEN[slotId] = n;
}
function writeSlotNum(slotId, num) {
  if (num >= 0 && num < 10) { S_OFF[slotId] = 9 + num; S_LEN[slotId] = 1; return; }
  writeSlotAscii(slotId, String(num));
}
function allocTagEntry(name, slug, url) {
  const escName = escHtmlJsonStr(name);
  const id = tagArenaCount++;
  ensureTagCap(tagArenaCount);
  ensureStrArena(strArenaOff + escName.length * 3 + slug.length + url.length + 16);
  const no = strArenaOff, nl = STR_ARENA_BUF.utf8Write(escName, no);
  const so = no + nl, sl = STR_ARENA_BUF.latin1Write(slug, so);
  const uo = so + sl, ul = url.length > 0 ? STR_ARENA_BUF.latin1Write(url, uo) : 0;
  strArenaOff = uo + ul;
  TAG_NOFF[id] = no; TAG_NLEN[id] = nl;
  TAG_SOFF[id] = so; TAG_SLEN[id] = sl;
  TAG_UOFF[id] = uo; TAG_ULEN[id] = ul;
  return { id, escName };
}

function invokeFallback(input, mainOut, rawU8, rawBuf) {
  const rawFiles = input.files;
  for (let j = 0; j < rawFiles.length; j++) {
    const sf = rawFiles[j];
    if (sf.rawQStart !== -1 && sf.content === null) sf.content = JSON.parse(rawBuf.utf8Slice(sf.rawQStart, sf.rawQEnd));
  }
  const mb = mainOut.buf, mu = mainOut.u8, mc = mainOut.cap, mf = mainOut.flush;
  const writer = {
    byte(b) { if (_outOff >= mc) mf(); mu[_outOff++] = b; },
    a(s) { const n = s.length; if (_outOff + n > mc) mf(); _outOff += mb.latin1Write(s, _outOff); },
    ka(s, comma) {
      const n = s.length; if (_outOff + n + 5 > mc) mf();
      if (comma) mu[_outOff++] = 44;
      mu[_outOff++] = 34; _outOff += mb.latin1Write(s, _outOff); mu[_outOff++] = 34; mu[_outOff++] = 58; mu[_outOff++] = 34;
    },
    kidx(dir, comma) {
      const n = dir.length; if (_outOff + n + 16 > mc) mf();
      if (comma) mu[_outOff++] = 44;
      mu[_outOff++] = 34; _outOff += mb.latin1Write(dir, _outOff); mu.set(T_IDX_KEY_SUF, _outOff); _outOff += 14;
    },
    s(str) {
      const n = str.length; if (n === 0) return;
      const need = n * 3;
      if (_outOff + need > mc) { mf(); if (need > mc) { writeSync(mainOut.fd, str); return; } }
      _outOff += mb.utf8Write(str, _outOff);
    },
    j(str) {
      const js = JSON_ANY_RE.test(str) ? JSON.stringify(str).slice(1, -1) : str;
      const n = js.length; if (n === 0) return;
      const need = n * 3;
      if (_outOff + need > mc) { mf(); if (need > mc) { writeSync(mainOut.fd, js); return; } }
      _outOff += mb.utf8Write(js, _outOff);
    },
    b(src) {
      const n = src.length; if (n === 0) return;
      if (_outOff + n > mc) { mf(); if (n > mc) { writeSync(mainOut.fd, src); return; } }
      mu.set(src, _outOff); _outOff += n;
    },
  };
  return getFallback().run(input, writer, rawU8, rawBuf);
}

function runStreamCase(input, mainOut, rawU8, rawBuf) {
  const rawFiles = input.files;
  for (let i = 0; i < rawFiles.length; i++) {
    const f = rawFiles[i];
    if (isMdPath(f.path) && f.uOff === -1) return invokeFallback(input, mainOut, rawU8, rawBuf);
  }

  const templates = new Map(), report = [], rawTemplates = input.templates;
  const tplNames = Object.keys(rawTemplates).sort(byCodeUnits);
  let tplEscMask = 0, anyHasReadingMinutes = false;
  for (let i = 0; i < tplNames.length; i++) {
    const name = tplNames[i], rawSrc = rawTemplates[name];
    if (!anyHasReadingMinutes && rawSrc.indexOf('reading_minutes') !== -1) anyHasReadingMinutes = true;
    try { const nodes = parseTemplate(name, rawSrc); templates.set(name, nodes); tplEscMask |= scanTemplateEscapes(nodes); }
    catch (err) { if (!(err instanceof TemplateError)) throw err; report.push(err.message); }
  }
  let fastOk = tplEscMask === 0;
  if (fastOk) for (let i = 0; i < tplNames.length; i++) if (countExpandedNodes(templates, tplNames[i], 0) > 2000) { fastOk = false; break; }
  let base = input.site.base_url, bEnd = base.length;
  while (bEnd > 0 && base.charCodeAt(bEnd - 1) === 47) bEnd--;
  if (bEnd !== base.length) base = base.slice(0, bEnd);
  if (!fastOk || JSON_ASCII_SAFE_TEST.test(base)) return invokeFallback(input, mainOut, rawU8, rawBuf);
  const maxExpand = base.length <= 40 ? 12 : Math.ceil((base.length + 160) / 4);
  const baseSkip = base.length + 1;

  rawFiles.sort(cmpFilePath);
  const sources = [], statics = [], staticPaths = new Set();
  const rawTagsCache = new Map();
  for (let i = 0; i < rawFiles.length; i++) {
    const f = rawFiles[i], path = f.path;
    if (isMdPath(path)) {
      let uOff = f.uOff, uLen = f.uLen;
      if (f.hasCR) uLen = normalizeCrInPlace(rawU8, uOff, uLen);
      const bodyOff = parseFrontMatterU8(rawU8, rawBuf, uOff, uLen, rawTagsCache);
      if (bodyOff === -1) { report.push('refused ' + path + ': ' + _fmErr); continue; }
      const bodyLen = (uOff + uLen) - bodyOff, post = path.startsWith('posts/');
      if (!post) {
        if (path.startsWith('tags/')) { report.push('refused ' + path + ": tags/ is the generator's own"); continue; }
        if (path.startsWith('page/')) { report.push('refused ' + path + ": page/ is the generator's own"); continue; }
      }
      if (post && _fmDateInt === 0) { report.push('refused ' + path + ': a post needs a date'); continue; }
      const layout = _fmLayout !== null ? _fmLayout : (post ? 'post' : 'page');
      if (!templates.has(layout)) { report.push('refused ' + path + ': layout "' + layout + '" is no template that parses'); continue; }
      if (_fmDraft) { report.push('draft ' + path); continue; }
      sources.push({
        path, srcDir: dirOf(path), uOff: bodyOff, uLen: bodyLen,
        tSrcA: _fmTA, tSrcB: _fmTB, tStr: _fmTStr, sSrcA: _fmSA, sSrcB: _fmSB, sStr: _fmSStr,
        rawTags: _fmTags, fmSlug: _fmSlug, dateInt: _fmDateInt, dateOff: _fmDateOff,
        post, layout, vm: null, slug: '', urlOff: 0, urlLen: 0, postIdx: -1,
        savedHtml: null, savedToc: null, exOff: 0, exLen: 0, readingMinutes: 1, rendered: false,
        newer: null, older: null, tagIds: EMPTY_ARR,
        tOff: 0, tLen: 0, sOff: 0, sLen: 0, dOff: 0, dLen: 0, dlOff: 0, dlLen: 0, slOff: 0, slLen: 0,
      });
    } else { statics.push(f); staticPaths.add(path); }
  }

  exArenaOff = 0; cardArenaOff = 0; strArenaOff = SLOT_DYN_BASE; tagArenaCount = 0;
  const taken = new Map(); taken.set('', new Set(RESERVED));
  const bySource = new Map();

  const baseU8 = asciiU8(base);
  const postsPreU8 = asciiU8(base + '/posts/');
  const postsDirSet = new Set(); taken.set('posts', postsDirSet);
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    let dirSet;
    if (s.post) dirSet = postsDirSet;
    else {
      const dir = s.srcDir;
      if (dir !== '' && JSON_ASCII_SAFE_TEST.test(dir)) return invokeFallback(input, mainOut, rawU8, rawBuf);
      dirSet = taken.get(dir);
      if (dirSet === undefined) { dirSet = new Set(); taken.set(dir, dirSet); }
    }
    const rawSlug = s.fmSlug !== null ? s.fmSlug : (s.tSrcA !== -1 ? slugifyU8(rawU8, rawBuf, 0, s.tSrcA, s.tSrcB) : slugify(s.tStr));
    const slug = uniqueSlug(rawSlug, dirSet);
    s.slug = slug;
    const slLen = slug.length;
    if (s.post) {
      const uLen = postsPreU8.length + slLen + 1;
      ensureStrArena(strArenaOff + uLen);
      const uo = strArenaOff;
      STR_ARENA_U8.set(postsPreU8, uo);
      const slOff = uo + postsPreU8.length;
      STR_ARENA_BUF.latin1Write(slug, slOff);
      STR_ARENA_U8[slOff + slLen] = 47;
      s.urlOff = uo; s.urlLen = uLen; s.slOff = slOff; s.slLen = slLen;
      strArenaOff = uo + uLen;
    } else {
      const dir = s.srcDir;
      const uLen = baseU8.length + 1 + (dir.length > 0 ? dir.length + 1 : 0) + slLen + 1;
      ensureStrArena(strArenaOff + uLen);
      let cur = strArenaOff;
      s.urlOff = cur;
      STR_ARENA_U8.set(baseU8, cur); cur += baseU8.length;
      STR_ARENA_U8[cur++] = 47;
      if (dir.length > 0) { cur += STR_ARENA_BUF.latin1Write(dir, cur); STR_ARENA_U8[cur++] = 47; }
      s.slOff = cur; s.slLen = slLen;
      cur += STR_ARENA_BUF.latin1Write(slug, cur);
      STR_ARENA_U8[cur++] = 47;
      s.urlLen = cur - s.urlOff;
      strArenaOff = cur;
    }
    bySource.set(s.path, s);
  }

  const posts = [];
  for (let i = 0; i < sources.length; i++) if (sources[i].post) posts.push(sources[i]);
  posts.sort(cmpPost);
  for (let k = 0; k < posts.length; k++) {
    const p = posts[k]; p.postIdx = k;
    p.newer = k === 0 ? null : posts[k - 1];
    p.older = k === posts.length - 1 ? null : posts[k + 1];
  }

  const tagSlugCache = new Map(), bySlug = new Map(), tagCardById = [];
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i], rawTags = p.rawTags;
    if (rawTags === null || rawTags.length === 0) continue;
    const tids = [];
    for (let j = 0; j < rawTags.length; j++) {
      const name = rawTags[j];
      let sl = tagSlugCache.get(name); if (sl === undefined) { sl = slugify(name); tagSlugCache.set(name, sl); }
      let tag = bySlug.get(sl);
      if (tag === undefined) {
        const url = base + '/tags/' + sl + '/';
        const te = allocTagEntry(name, sl, url);
        tag = { name, slug: sl, url, id: te.id, $n: te.escName, posts: [] };
        tagCardById[te.id] = { name, slug: sl, url };
        bySlug.set(sl, tag);
      }
      const tid = tag.id;
      let dup = false; for (let q = 0; q < tids.length; q++) if (tids[q] === tid) { dup = true; break; }
      if (dup) continue;
      tag.posts.push(p); tids.push(tid);
    }
    p.tagIds = tids;
  }
  const orphanTagCache = new Map();
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i]; if (s.post) continue;
    const rawTags = s.rawTags; if (rawTags === null || rawTags.length === 0) continue;
    const tids = [], seenSlugs = [];
    for (let j = 0; j < rawTags.length; j++) {
      const name = rawTags[j];
      let sl = tagSlugCache.get(name); if (sl === undefined) { sl = slugify(name); tagSlugCache.set(name, sl); }
      let dup = false; for (let q = 0; q < seenSlugs.length; q++) if (seenSlugs[q] === sl) { dup = true; break; }
      if (dup) continue;
      seenSlugs.push(sl);
      const tag = bySlug.get(sl);
      if (tag !== undefined) tids.push(tag.id);
      else {
        let oid = orphanTagCache.get(name + '\0' + sl);
        if (oid === undefined) { oid = allocTagEntry(name, sl, '').id; orphanTagCache.set(name + '\0' + sl, oid); }
        tids.push(oid);
      }
    }
    s.tagIds = tids;
  }
  const tags = Array.from(bySlug.values()).sort(cmpTag);

  const broken = new Set();
  const dirInfoCache = new Map(), rel1Caches = new Map(), rel2Caches = new Map();
  function getSharedCache(map, key) { let m = map.get(key); if (m === undefined) { m = new Map(); map.set(key, m); } return m; }
  dirInfoCache.set('', { parts: EMPTY_ARR, cache: new Map(), rel1Cache: null, rel2Cache: null });
  const rmMemo = new Map();
  const linkCtx = { sourcePath: '', dirStr: '', dirParts: EMPTY_ARR, dirCache: null, rel1Cache: null, rel2Cache: null, bySource, staticPaths, base, broken };

  let lastDir = null, lastDInfo = null;
  function renderSourceMd(s, saveCopy) {
    const dir = s.srcDir;
    let dInfo;
    if (dir === lastDir) dInfo = lastDInfo;
    else {
      dInfo = dirInfoCache.get(dir);
      if (dInfo === undefined) {
        const parts = dir.split('/');
        const r1 = getSharedCache(rel1Caches, parts.length === 1 ? '' : parts.slice(0, -1).join('/'));
        const r2 = parts.length >= 2 ? getSharedCache(rel2Caches, parts.length === 2 ? '' : parts.slice(0, -2).join('/')) : null;
        dInfo = { parts, cache: new Map(), rel1Cache: r1, rel2Cache: r2 };
        dirInfoCache.set(dir, dInfo);
      }
      lastDir = dir; lastDInfo = dInfo;
    }
    linkCtx.sourcePath = s.path; linkCtx.dirStr = dir; linkCtx.dirParts = dInfo.parts;
    linkCtx.dirCache = dInfo.cache; linkCtx.rel1Cache = dInfo.rel1Cache; linkCtx.rel2Cache = dInfo.rel2Cache;

    const srcLen = s.uLen;
    if (srcLen === 0) {
      _vmBodyU8 = EMPTY_U8; _vmBodyLen = 0; tocCount = 0; s.exOff = 0; s.exLen = 0;
      if (saveCopy) { s.savedHtml = EMPTY_U8; s.savedToc = null; }
      s.rendered = true; return;
    }
    const fileU8 = rawU8.subarray(s.uOff, s.uOff + srcLen);
    if (anyHasReadingMinutes && srcLen > 399 && (s.post || layoutNeedsReadingMinutes(s.layout, rawTemplates, templates, rmMemo))) {
      const words = tf_wcU8(fileU8, srcLen);
      s.readingMinutes = words <= 200 ? 1 : Math.ceil(words / 200);
    }
    ensureDst(srcLen * maxExpand + 131072);
    ensureBq(srcLen + 64);
    if (HEADING_IDS.size > 0) HEADING_IDS.clear();
    _curFileBuf = rawBuf; _curFileOff = s.uOff;
    _iSrc = fileU8; _iSrcBuf = rawBuf; _iSrcBufOff = s.uOff; _iDst = DST_U8; _iCtx = linkCtx;
    const htmlLen = renderMarkdownFast(fileU8, srcLen, DST_U8);
    if (_mdExStart !== -1 && _mdExEnd > _mdExStart) {
      const exLen = _mdExEnd - _mdExStart;
      if (s.post) {
        ensureExArena(exArenaOff + exLen);
        const eo = exArenaOff;
        EX_ARENA_U8.set(DST_U8.subarray(_mdExStart, _mdExEnd), eo);
        exArenaOff = eo + exLen;
        s.exOff = eo; s.exLen = exLen;
      } else { s.exOff = _mdExStart; s.exLen = exLen; }
    } else { s.exOff = 0; s.exLen = 0; }
    if (saveCopy) {
      s.savedHtml = DST_U8.slice(0, htmlLen);
      if (tocCount > 0) {
        s.savedToc = { n: tocCount, lvl: TOC_LVL.slice(0, tocCount), idOff: TOC_ID_OFF.slice(0, tocCount), idLen: TOC_ID_LEN.slice(0, tocCount), hOff: TOC_HTML_OFF.slice(0, tocCount), hLen: TOC_HTML_LEN.slice(0, tocCount) };
      }
    } else { _vmBodyU8 = DST_U8; _vmBodyLen = htmlLen; }
    s.rendered = true;
  }

  const recentCount = Math.min(input.site.recent, posts.length);
  for (let i = 0; i < recentCount; i++) renderSourceMd(posts[i], true);

  const dateArenaCache = new Map();
  function getDateArena(di, dSrcOff) {
    let da = dateArenaCache.get(di);
    if (da !== undefined) return da;
    const y = (di / 10000) | 0, mo = ((di / 100) | 0) % 100, day = di % 100;
    const dl = day + ' ' + MONTHS[mo - 1] + ' ' + y;
    ensureStrArena(strArenaOff + 48);
    const dOff = strArenaOff;
    for (let k = 0; k < 10; k++) STR_ARENA_U8[dOff + k] = rawU8[dSrcOff + k];
    const dlOff = dOff + 10, dlLen = STR_ARENA_BUF.latin1Write(dl, dlOff);
    strArenaOff = dlOff + dlLen;
    da = { dl, dOff, dLen: 10, dlOff, dlLen };
    dateArenaCache.set(di, da);
    return da;
  }
  _iSrc = rawU8;
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    const da = getDateArena(p.dateInt, p.dateOff);
    p.dOff = da.dOff; p.dLen = da.dLen; p.dlOff = da.dlOff; p.dlLen = da.dlLen;
    if (p.tSrcA !== -1) {
      const tSpan = p.tSrcB - p.tSrcA;
      ensureStrArena(strArenaOff + tSpan * 6 + 16);
      _iDst = STR_ARENA_U8;
      p.tOff = strArenaOff;
      const oEnd = tf_copyCodeU8(p.tSrcA, p.tSrcB, strArenaOff);
      p.tLen = oEnd - strArenaOff; strArenaOff = oEnd;
    } else {
      const tEsc = escHtmlJsonStr(p.tStr);
      ensureStrArena(strArenaOff + tEsc.length * 3 + 16);
      p.tOff = strArenaOff; p.tLen = STR_ARENA_BUF.utf8Write(tEsc, strArenaOff); strArenaOff += p.tLen;
    }
    if (p.sSrcA !== -1) {
      const sSpan = p.sSrcB - p.sSrcA;
      ensureStrArena(strArenaOff + sSpan * 6 + 16);
      _iDst = STR_ARENA_U8;
      p.sOff = strArenaOff;
      const oEnd = tf_copyCodeU8(p.sSrcA, p.sSrcB, strArenaOff);
      p.sLen = oEnd - strArenaOff; strArenaOff = oEnd;
    } else if (p.sStr !== null && p.sStr !== '') {
      const sEsc = escHtmlJsonStr(p.sStr);
      ensureStrArena(strArenaOff + sEsc.length * 3 + 16);
      p.sOff = strArenaOff; p.sLen = STR_ARENA_BUF.utf8Write(sEsc, strArenaOff); strArenaOff += p.sLen;
    }
  }

  const site = { title: input.site.title, base_url: base };
  const allTags = new Array(tags.length);
  for (let i = 0; i < tags.length; i++) { const t = tags[i]; allTags[i] = { name: t.name, slug: t.slug, url: t.url, count: t.posts.length }; }
  const recent = new Array(recentCount);
  for (let i = 0; i < recentCount; i++) {
    const p = posts[i];
    const exStr = p.exLen > 0 ? JSON.parse('"' + Buffer.from(EX_ARENA_U8.buffer, EX_ARENA_U8.byteOffset + p.exOff, p.exLen).toString('utf8') + '"') : '';
    const pTags = new Array(p.tagIds.length);
    for (let j = 0; j < p.tagIds.length; j++) pTags[j] = tagCardById[p.tagIds[j]];
    const titleStr = p.tSrcA !== -1 ? rawBuf.utf8Slice(p.tSrcA, p.tSrcB) : p.tStr;
    const sumStr = p.sSrcA !== -1 ? rawBuf.utf8Slice(p.sSrcA, p.sSrcB) : (p.sStr !== null ? p.sStr : '');
    recent[i] = {
      title: titleStr,
      url: STR_ARENA_BUF.latin1Slice(p.urlOff, p.urlOff + p.urlLen),
      date: STR_ARENA_BUF.latin1Slice(p.dOff, p.dOff + p.dLen),
      date_long: STR_ARENA_BUF.latin1Slice(p.dlOff, p.dlOff + p.dlLen),
      summary: sumStr, excerpt: exStr, reading_minutes: p.readingMinutes, tags: pTags,
    };
  }

  const rctx = { templates, siteRoot: { site, tags: allTags, recent }, freeCache: new Map(), depthCache: new Map(), siteConstIncludeCache: new Map(), cardVarName: null, tagSnips: [] };

  const vmLayouts = new Map();
  let allVmOk = true;
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    let vm = vmLayouts.get(s.layout);
    if (vm === undefined) {
      vm = compileTplToVm(rctx, templates.get(s.layout), 'P', '');
      if (vm === null) { allVmOk = false; break; }
      vmLayouts.set(s.layout, vm);
    }
    s.vm = vm;
  }
  let idxVm = null, tagVm = null, tagsVm = null, cardVm = null;
  if (allVmOk && templates.has('index')) { idxVm = compileTplToVm(rctx, templates.get('index'), 'I', ''); if (idxVm === null) allVmOk = false; }
  if (allVmOk && templates.has('tag')) { tagVm = compileTplToVm(rctx, templates.get('tag'), 'T', ''); if (tagVm === null) allVmOk = false; }
  if (allVmOk && templates.has('tags')) { tagsVm = compileTplToVm(rctx, templates.get('tags'), 'A', ''); if (tagsVm === null) allVmOk = false; }
  const cardTplName = (idxVm && idxVm.cardTplName) || (tagVm && tagVm.cardTplName) || null;
  if (allVmOk && cardTplName !== null) {
    if (idxVm && idxVm.cardTplName && tagVm && tagVm.cardTplName && idxVm.cardTplName !== tagVm.cardTplName) allVmOk = false;
    else { cardVm = compileTplToVm(rctx, templates.get(cardTplName), 'C', rctx.cardVarName || 'p'); if (cardVm === null) allVmOk = false; }
  }
  if (!allVmOk) return invokeFallback(input, mainOut, rawU8, rawBuf);

  const builtSnips = new Array(rctx.tagSnips.length);
  if (rctx.tagSnips.length > 0 && tagArenaCount > 0) {
    const savedOutU8 = _outU8, savedOutCap = _outCap, savedOutOff = _outOff, savedOutFlush = _outFlush;
    const strFlush = () => { ensureStrArena(_outOff + 32768); _outU8 = STR_ARENA_U8; _outCap = STR_ARENA_CAP; };
    for (let si = 0; si < rctx.tagSnips.length; si++) {
      const sn = rctx.tagSnips[si];
      const offs = new Int32Array(tagArenaCount), lens = new Int32Array(tagArenaCount);
      for (let tid = 0; tid < tagArenaCount; tid++) {
        loadTagSlots(tid);
        ensureStrArena(strArenaOff + 512);
        const startOff = strArenaOff;
        _outU8 = STR_ARENA_U8; _outCap = STR_ARENA_CAP; _outOff = startOff; _outFlush = strFlush;
        tf_execTpl(sn.ops, sn.ops.length, sn.lits);
        offs[tid] = startOff; lens[tid] = _outOff - startOff; strArenaOff = _outOff;
      }
      builtSnips[si] = { offs, lens };
    }
    _outU8 = savedOutU8; _outCap = savedOutCap; _outOff = savedOutOff; _outFlush = savedOutFlush;
  }
  _vmTagSnips = builtSnips;

  const needCards = cardVm !== null && posts.length > 0;
  const cardOffs = needCards ? new Int32Array(posts.length) : null;
  const cardLens = needCards ? new Int32Array(posts.length) : null;

  let hasIndexStatic = false;
  for (let i = 0; i < statics.length; i++) { const sp = statics[i].path; if (sp === 'index.html' || sp.endsWith('/index.html')) { hasIndexStatic = true; break; } }
  const writtenPaths = hasIndexStatic ? new Set() : null;
  let firstEntry = true;

  const mainBuf = mainOut.buf, mainU8 = mainOut.u8, mainCap = mainOut.cap, mainFlush = mainOut.flush;
  _outU8 = mainU8; _outCap = mainCap; _outFlush = mainFlush;
  if (_outOff >= mainCap) mainFlush();
  mainU8[_outOff++] = 123;

  function beginKey(path) {
    if (writtenPaths !== null) writtenPaths.add(path);
    const n = path.length; if (_outOff + n + 5 > mainCap) mainFlush();
    if (!firstEntry) mainU8[_outOff++] = 44; else firstEntry = false;
    mainU8[_outOff++] = 34; _outOff += mainBuf.latin1Write(path, _outOff);
    mainU8[_outOff++] = 34; mainU8[_outOff++] = 58; mainU8[_outOff++] = 34;
  }
  function cardArenaFlush() { ensureCardArena(_outOff + 65536); _outU8 = CARD_ARENA_U8; _outCap = CARD_ARENA_CAP; }

  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    if (!s.rendered) {
      renderSourceMd(s, false);
      _vmTocSrc = DST_U8; _vmTocCount = tocCount;
    } else {
      _vmBodyU8 = s.savedHtml; _vmBodyLen = s.savedHtml.length;
      if (s.savedToc !== null) {
        const st = s.savedToc; ensureTocCap(st.n);
        TOC_LVL.set(st.lvl); TOC_ID_OFF.set(st.idOff); TOC_ID_LEN.set(st.idLen); TOC_HTML_OFF.set(st.hOff); TOC_HTML_LEN.set(st.hLen);
        _vmTocSrc = s.savedHtml; _vmTocCount = st.n;
      } else _vmTocCount = 0;
    }

    if (s.post) {
      S_OFF[SL_TITLE] = s.tOff; S_LEN[SL_TITLE] = s.tLen;
      S_OFF[SL_URL] = s.urlOff; S_LEN[SL_URL] = s.urlLen;
      S_OFF[SL_DATE] = s.dOff; S_LEN[SL_DATE] = s.dLen;
      S_OFF[SL_DATE_LONG] = s.dlOff; S_LEN[SL_DATE_LONG] = s.dlLen;
      S_OFF[SL_SUMMARY] = s.sOff; S_LEN[SL_SUMMARY] = s.sLen;
      writeSlotNum(SL_RM, s.readingMinutes);
      S_OFF[SL_SLUG] = s.slOff; S_LEN[SL_SLUG] = s.slLen;
      const nw = s.newer;
      if (nw !== null) { S_OFF[SL_NEWER_URL] = nw.urlOff; S_LEN[SL_NEWER_URL] = nw.urlLen; S_OFF[SL_NEWER_TITLE] = nw.tOff; S_LEN[SL_NEWER_TITLE] = nw.tLen; }
      else { S_LEN[SL_NEWER_URL] = 0; S_LEN[SL_NEWER_TITLE] = 0; }
      const ol = s.older;
      if (ol !== null) { S_OFF[SL_OLDER_URL] = ol.urlOff; S_LEN[SL_OLDER_URL] = ol.urlLen; S_OFF[SL_OLDER_TITLE] = ol.tOff; S_LEN[SL_OLDER_TITLE] = ol.tLen; }
      else { S_LEN[SL_OLDER_URL] = 0; S_LEN[SL_OLDER_TITLE] = 0; }
      S_OFF[SL_IS_POST] = 0; S_LEN[SL_IS_POST] = 4;
    } else {
      if (s.tSrcA !== -1) {
        ensureStrArena(strArenaOff + (s.tSrcB - s.tSrcA) * 6 + 16);
        _iSrc = rawU8; _iDst = STR_ARENA_U8;
        const o0 = strArenaOff, o1 = tf_copyCodeU8(s.tSrcA, s.tSrcB, o0);
        S_OFF[SL_TITLE] = o0; S_LEN[SL_TITLE] = o1 - o0; strArenaOff = o1;
      } else writeSlotStr(SL_TITLE, escHtmlJsonStr(s.tStr));
      S_OFF[SL_URL] = s.urlOff; S_LEN[SL_URL] = s.urlLen;
      if (s.dateInt !== 0) {
        const da = getDateArena(s.dateInt, s.dateOff);
        S_OFF[SL_DATE] = da.dOff; S_LEN[SL_DATE] = da.dLen;
        S_OFF[SL_DATE_LONG] = da.dlOff; S_LEN[SL_DATE_LONG] = da.dlLen;
      } else { S_LEN[SL_DATE] = 0; S_LEN[SL_DATE_LONG] = 0; }
      if (s.sSrcA !== -1) {
        ensureStrArena(strArenaOff + (s.sSrcB - s.sSrcA) * 6 + 16);
        _iSrc = rawU8; _iDst = STR_ARENA_U8;
        const o0 = strArenaOff, o1 = tf_copyCodeU8(s.sSrcA, s.sSrcB, o0);
        S_OFF[SL_SUMMARY] = o0; S_LEN[SL_SUMMARY] = o1 - o0; strArenaOff = o1;
      } else if (s.sStr !== null && s.sStr !== '') writeSlotStr(SL_SUMMARY, escHtmlJsonStr(s.sStr)); else S_LEN[SL_SUMMARY] = 0;
      writeSlotNum(SL_RM, s.readingMinutes);
      S_OFF[SL_SLUG] = s.slOff; S_LEN[SL_SLUG] = s.slLen;
      S_LEN[SL_NEWER_URL] = 0; S_LEN[SL_NEWER_TITLE] = 0;
      S_LEN[SL_OLDER_URL] = 0; S_LEN[SL_OLDER_TITLE] = 0;
      S_OFF[SL_IS_POST] = 0; S_LEN[SL_IS_POST] = 0;
    }
    _vmTagIds = s.tagIds; _vmTagCount = s.tagIds.length;
    S_LEN[SL_HAS_TAGS] = _vmTagCount;
    S_LEN[SL_HAS_TOC] = _vmTocCount;
    if (s.post) { _vmExOff = s.exOff; _vmExLen = s.exLen; }
    else if (s.exLen > 0) { ensureExArena(exArenaOff + s.exLen); EX_ARENA_U8.set(DST_U8.subarray(s.exOff, s.exOff + s.exLen), exArenaOff); _vmExOff = exArenaOff; _vmExLen = s.exLen; exArenaOff += s.exLen; }
    else { _vmExOff = 0; _vmExLen = 0; }

    const dLen = s.urlLen - baseSkip - 1;
    if (writtenPaths !== null) writtenPaths.add(STR_ARENA_BUF.latin1Slice(s.urlOff + baseSkip, s.urlOff + s.urlLen - 1) + '/index.html');
    if (_outOff + dLen + 16 > mainCap) mainFlush();
    if (!firstEntry) mainU8[_outOff++] = 44; else firstEntry = false;
    mainU8[_outOff++] = 34;
    mainU8.set(STR_ARENA_U8.subarray(s.urlOff + baseSkip, s.urlOff + s.urlLen - 1), _outOff);
    _outOff += dLen;
    mainU8.set(T_IDX_KEY_SUF, _outOff);
    _outOff += 14;

    const vm = s.vm;
    tf_execTpl(vm.ops, vm.ops.length, vm.lits);
    if (_outOff >= mainCap) mainFlush();
    mainU8[_outOff++] = 34;

    if (needCards && s.post) {
      const savedMainOff = _outOff;
      ensureCardArena(cardArenaOff + 4096 + s.exLen);
      const cStart = cardArenaOff;
      _outU8 = CARD_ARENA_U8; _outCap = CARD_ARENA_CAP; _outOff = cStart; _outFlush = cardArenaFlush;
      tf_execTpl(cardVm.ops, cardVm.ops.length, cardVm.lits);
      cardOffs[s.postIdx] = cStart; cardLens[s.postIdx] = _outOff - cStart; cardArenaOff = _outOff;
      _outU8 = mainU8; _outCap = mainCap; _outOff = savedMainOff; _outFlush = mainFlush;
    }
    s.savedHtml = null; s.savedToc = null;
  }

  if (idxVm !== null) {
    const per = input.site.per_page, pages = Math.max(1, Math.ceil(posts.length / per)), rootUrl = base + '/';
    const cardList = new Int32Array(Math.min(per, posts.length));
    _vmCardOffs = cardOffs; _vmCardLens = cardLens; _vmCardList = cardList;
    for (let k = 1; k <= pages; k++) {
      const from = (k - 1) * per, to = Math.min(k * per, posts.length), cnt = to - from;
      for (let j = 0; j < cnt; j++) cardList[j] = from + j;
      _vmCardCount = cnt;
      writeSlotNum(SL_PAGER_NUM, k);
      writeSlotNum(SL_PAGER_TOT, pages);
      writeSlotAscii(SL_PAGER_URL, k === 1 ? rootUrl : base + '/page/' + k + '/');
      writeSlotAscii(SL_PAGER_NEW, k === 1 ? '' : (k === 2 ? rootUrl : base + '/page/' + (k - 1) + '/'));
      writeSlotAscii(SL_PAGER_OLD, k === pages ? '' : base + '/page/' + (k + 1) + '/');
      S_LEN[SL_HAS_POSTS] = cnt;
      beginKey(k === 1 ? 'index.html' : 'page/' + k + '/index.html');
      tf_execTpl(idxVm.ops, idxVm.ops.length, idxVm.lits);
      if (_outOff >= mainCap) mainFlush(); mainU8[_outOff++] = 34;
    }
  }

  if (tagVm !== null) {
    let maxTp = 0;
    for (let i = 0; i < tags.length; i++) if (tags[i].posts.length > maxTp) maxTp = tags[i].posts.length;
    const cardList = new Int32Array(maxTp);
    _vmCardOffs = cardOffs; _vmCardLens = cardLens; _vmCardList = cardList;
    for (let i = 0; i < tags.length; i++) {
      const t = tags[i], tPosts = t.posts, cnt = tPosts.length;
      for (let j = 0; j < cnt; j++) cardList[j] = tPosts[j].postIdx;
      _vmCardCount = cnt;
      S_OFF[SL_TAG_NAME] = TAG_NOFF[t.id]; S_LEN[SL_TAG_NAME] = TAG_NLEN[t.id];
      S_OFF[SL_TAG_SLUG] = TAG_SOFF[t.id]; S_LEN[SL_TAG_SLUG] = TAG_SLEN[t.id];
      S_OFF[SL_TAG_URL] = TAG_UOFF[t.id]; S_LEN[SL_TAG_URL] = TAG_ULEN[t.id];
      writeSlotNum(SL_TAG_COUNT, cnt);
      S_LEN[SL_HAS_POSTS] = cnt;
      beginKey('tags/' + t.slug + '/index.html');
      tf_execTpl(tagVm.ops, tagVm.ops.length, tagVm.lits);
      if (_outOff >= mainCap) mainFlush(); mainU8[_outOff++] = 34;
    }
  }

  if (tagsVm !== null) {
    beginKey('tags/index.html');
    tf_execTpl(tagsVm.ops, tagsVm.ops.length, tagsVm.lits);
    if (_outOff >= mainCap) mainFlush(); mainU8[_outOff++] = 34;
  }

  const seenStatic = writtenPaths !== null ? writtenPaths : new Set();
  for (let i = 0; i < statics.length; i++) {
    const f = statics[i];
    if (seenStatic.has(f.path)) report.push('shadowed ' + f.path + ': a built page has its path');
    else {
      seenStatic.add(f.path);
      if (f.path !== REPORT_FILE) {
        const keyJson = JSON.stringify(f.path);
        const kNeed = keyJson.length * 3 + 4;
        if (_outOff + kNeed > mainCap) mainFlush();
        if (!firstEntry) mainU8[_outOff++] = 44; else firstEntry = false;
        _outOff += mainBuf.utf8Write(keyJson, _outOff);
        mainU8[_outOff++] = 58;
        if (f.rawQStart !== -1 && f.content === null) {
          const sLen = f.rawQEnd - f.rawQStart;
          if (_outOff + sLen > mainCap) { mainFlush(); if (sLen > mainCap) { writeSync(mainOut.fd, rawU8.subarray(f.rawQStart, f.rawQEnd)); continue; } }
          mainU8.set(rawU8.subarray(f.rawQStart, f.rawQEnd), _outOff); _outOff += sLen;
        } else {
          const valJson = JSON.stringify(f.content);
          const vNeed = valJson.length * 3;
          if (_outOff + vNeed > mainCap) { mainFlush(); if (vNeed > mainCap) { writeSync(mainOut.fd, valJson); continue; } }
          _outOff += mainBuf.utf8Write(valJson, _outOff);
        }
      }
    }
  }

  for (const bLine of broken) report.push(bLine);
  report.sort(byCodeUnits);
  report.push('built ' + (sources.length - posts.length) + ' pages, ' + posts.length + ' posts, ' + tags.length + ' tags and ' + statics.length + ' static files');
  const repJson = JSON.stringify(report.join('\n') + '\n');
  const rNeed = repJson.length * 3 + 24;
  if (_outOff + rNeed > mainCap) mainFlush();
  if (!firstEntry) mainU8[_outOff++] = 44;
  _outOff += mainBuf.latin1Write('"build-report.txt":', _outOff);
  if (repJson.length * 3 > mainCap - _outOff) { mainFlush(); writeSync(mainOut.fd, repJson); }
  else _outOff += mainBuf.utf8Write(repJson, _outOff);
  if (_outOff >= mainCap) mainFlush();
  mainU8[_outOff++] = 125;
}

// ---------------------------------------------------------------- TF #1: JSON Unescaper & CLI Driver

let _jOut = 0, _jFlags = 0, _jNormCr = false, _jLoneCp = 0, _jp = 0;

function hexVal(c) {
  if (c >= 48 && c <= 57) return c - 48;
  if (c >= 97 && c <= 102) return c - 87;
  if (c >= 65 && c <= 70) return c - 55;
  return -1;
}
function handleJsonEsc(u, i, o) {
  const e = u[i + 1];
  if (e === 34) { u[o++] = 34; _jOut = o; return i + 2; }
  if (e === 92) { u[o++] = 92; _jOut = o; return i + 2; }
  if (e === 116) { u[o++] = 9; _jOut = o; return i + 2; }
  if (e === 114) {
    if (_jNormCr) {
      if (u[i + 2] === 92 && u[i + 3] === 110) { u[o++] = 10; _jOut = o; return i + 4; }
      if (u[i + 2] === 92 && u[i + 3] === 117) { u[o++] = 13; _jFlags |= 1; _jOut = o; return i + 2; }
      u[o++] = 10; _jOut = o; return i + 2;
    }
    u[o++] = 13; _jFlags |= 1; _jOut = o; return i + 2;
  }
  if (e === 47) { u[o++] = 47; _jOut = o; return i + 2; }
  if (e === 98) { u[o++] = 8; _jOut = o; return i + 2; }
  if (e === 102) { u[o++] = 12; _jOut = o; return i + 2; }
  if (e === 117) {
    let cp = (hexVal(u[i + 2]) << 12) | (hexVal(u[i + 3]) << 8) | (hexVal(u[i + 4]) << 4) | hexVal(u[i + 5]);
    let next = i + 6;
    if (cp >= 0xD800 && cp <= 0xDFFF) {
      if (cp <= 0xDBFF && u[next] === 92 && u[next + 1] === 117) {
        const lo = (hexVal(u[next + 2]) << 12) | (hexVal(u[next + 3]) << 8) | (hexVal(u[next + 4]) << 4) | hexVal(u[next + 5]);
        if (lo >= 0xDC00 && lo <= 0xDFFF) { cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00); next += 6; }
        else { _jFlags |= 2; _jLoneCp = cp; _jOut = o; return next; }
      } else { _jFlags |= 2; _jLoneCp = cp; _jOut = o; return next; }
    }
    if (cp < 0x80) { if (cp === 13) _jFlags |= 1; u[o++] = cp; }
    else if (cp < 0x800) { u[o++] = 0xC0 | (cp >> 6); u[o++] = 0x80 | (cp & 0x3F); }
    else if (cp < 0x10000) { u[o++] = 0xE0 | (cp >> 12); u[o++] = 0x80 | ((cp >> 6) & 0x3F); u[o++] = 0x80 | (cp & 0x3F); }
    else { u[o++] = 0xF0 | (cp >> 18); u[o++] = 0x80 | ((cp >> 12) & 0x3F); u[o++] = 0x80 | ((cp >> 6) & 0x3F); u[o++] = 0x80 | (cp & 0x3F); }
    _jOut = o; return next;
  }
  _jOut = o; return i + 2;
}

function tf_unescInPlace(u, start) {
  let q = u.indexOf(34, start), bs = u.indexOf(92, start);
  if (bs === -1 || bs > q) { _jOut = q; return q + 1; }
  let o = bs, i = bs;
  while (true) {
    const e = u[i + 1];
    if (e === 110) { u[o++] = 10; i += 2; while (u[i] === 92 && u[i + 1] === 110) { u[o++] = 10; i += 2; } }
    else if (e === 34) { u[o++] = 34; i += 2; }
    else { i = handleJsonEsc(u, i, o); o = _jOut; if ((_jFlags & 2) !== 0) return -i; }
    if (i === q) { _jOut = o; return q + 1; }
    if (i > q) q = u.indexOf(34, i);
    bs = u.indexOf(92, i);
    if (bs === -1 || bs > q) {
      const rem = q - i;
      if (rem > 0) { u.copyWithin(o, i, q); o += rem; }
      _jOut = o; return q + 1;
    }
    const run = bs - i;
    if (run > 0) {
      if (run <= 16) { while (i < bs) u[o++] = u[i++]; }
      else { u.copyWithin(o, i, bs); o += run; i = bs; }
    }
  }
}

function skipWs(u, p) { const n = u.length; while (p < n) { const c = u[p]; if (c === 32 || c === 10 || c === 13 || c === 9) p++; else break; } return p; }
function findJsonStrEnd(u, p) {
  while (true) {
    const q = u.indexOf(34, p);
    if (u[q - 1] !== 92) return q;
    let k = q - 2; while (u[k] === 92) k--;
    if (((q - 1 - k) & 1) === 0) return q;
    p = q + 1;
  }
}
function readJsonStr(u, buf, p) {
  const start = p + 1, q = u.indexOf(34, start), bs = u.indexOf(92, start);
  if (bs === -1 || bs > q) { _jp = q + 1; return buf.utf8Slice(start, q); }
  const endQ = findJsonStrEnd(u, bs + 2); _jp = endQ + 1;
  return JSON.parse(buf.utf8Slice(p, endQ + 1));
}
function readJsonVal(u, buf, p) {
  p = skipWs(u, p); const c = u[p];
  if (c === 34) return readJsonStr(u, buf, p);
  if (c === 123) {
    const obj = {}; p = skipWs(u, p + 1);
    if (u[p] === 125) { _jp = p + 1; return obj; }
    while (true) {
      p = skipWs(u, p); const key = readJsonStr(u, buf, p); p = skipWs(u, _jp); p++;
      const val = readJsonVal(u, buf, p);
      if (key === '__proto__') Object.defineProperty(obj, key, { value: val, enumerable: true, writable: true, configurable: true });
      else obj[key] = val;
      p = skipWs(u, _jp); if (u[p] === 44) { p++; continue; } _jp = p + 1; return obj;
    }
  }
  if (c === 91) {
    const arr = []; p = skipWs(u, p + 1);
    if (u[p] === 93) { _jp = p + 1; return arr; }
    while (true) { arr.push(readJsonVal(u, buf, p)); p = skipWs(u, _jp); if (u[p] === 44) { p++; continue; } _jp = p + 1; return arr; }
  }
  if (c === 116) { _jp = p + 4; return true; }
  if (c === 102) { _jp = p + 5; return false; }
  if (c === 110) { _jp = p + 4; return null; }
  let e = p, n = u.length;
  while (e < n) { const ch = u[e]; if ((ch >= 48 && ch <= 57) || ch === 45 || ch === 46 || ch === 101 || ch === 69 || ch === 43) e++; else break; }
  _jp = e; return Number(buf.latin1Slice(p, e));
}

function readFileObj(u, buf, p) {
  p++; if (u[p] <= 32) p = skipWs(u, p);
  let path = '', str = null, uOff = -1, uLen = 0, hasCR = false, rawQStart = -1, rawQEnd = -1, seenPath = false;
  if (u[p] === 125) { _jp = p + 1; return { path, content: '', uOff: -1, uLen: 0, hasCR: false, rawQStart: -1, rawQEnd: -1 }; }
  while (true) {
    if (u[p] <= 32) p = skipWs(u, p);
    let kind = 0;
    if (u[p] === 34) {
      if (u[p+1]===112 && u[p+2]===97 && u[p+3]===116 && u[p+4]===104 && u[p+5]===34) { kind = 1; p += 6; }
      else if (u[p+1]===99 && u[p+2]===111 && u[p+3]===110 && u[p+4]===116 && u[p+5]===101 && u[p+6]===110 && u[p+7]===116 && u[p+8]===34) { kind = 2; p += 9; }
      else { const key = readJsonStr(u, buf, p); p = _jp; if (key === 'path') kind = 1; else if (key === 'content') kind = 2; }
    }
    if (u[p] <= 32) p = skipWs(u, p);
    p++;
    if (u[p] <= 32) p = skipWs(u, p);
    if (kind === 1) { path = readJsonStr(u, buf, p); p = _jp; seenPath = true; }
    else if (kind === 2 && u[p] === 34) {
      if (seenPath && !isMdPath(path)) {
        const endQ = findJsonStrEnd(u, p + 1);
        rawQStart = p; rawQEnd = endQ + 1; str = null; uOff = -1; p = endQ + 1;
      } else {
        const start = p + 1; str = null; _jFlags = 0; _jNormCr = seenPath && isMdPath(path);
        const ret = tf_unescInPlace(u, start);
        if (ret >= 0) { uOff = start; uLen = _jOut - start; hasCR = (_jFlags & 1) !== 0; p = ret; }
        else {
          const next = -ret, prefix = buf.utf8Slice(start, _jOut) + String.fromCharCode(_jLoneCp), endQ = findJsonStrEnd(u, next);
          str = prefix + JSON.parse('"' + buf.utf8Slice(next, endQ + 1)); uOff = -1; p = endQ + 1;
        }
      }
    } else { readJsonVal(u, buf, p); p = _jp; }
    if (u[p] <= 32) p = skipWs(u, p);
    if (u[p] === 44) { p++; continue; }
    _jp = p + 1; break;
  }
  if (str === null && rawQStart === -1 && uOff !== -1 && !isMdPath(path)) { str = buf.utf8Slice(uOff, uOff + uLen); uOff = -1; }
  return { path, content: str, uOff, uLen, hasCR, rawQStart, rawQEnd };
}

function readInputObj(u, buf, p) {
  const obj = { site: null, templates: null, files: null };
  p = skipWs(u, p + 1);
  if (u[p] === 125) { _jp = p + 1; return obj; }
  while (true) {
    p = skipWs(u, p); const key = readJsonStr(u, buf, p); p = skipWs(u, _jp); p++; p = skipWs(u, p);
    if (key === 'files' && u[p] === 91) {
      const files = []; p = skipWs(u, p + 1);
      if (u[p] === 93) p++;
      else { while (true) { p = skipWs(u, p); files.push(readFileObj(u, buf, p)); p = skipWs(u, _jp); if (u[p] === 44) { p++; continue; } p++; break; } }
      obj.files = files; _jp = p;
    } else {
      const val = readJsonVal(u, buf, p);
      if (key === 'site') obj.site = val; else if (key === 'templates') obj.templates = val;
      else if (key !== '__proto__') obj[key] = val;
    }
    p = skipWs(u, _jp); if (u[p] === 44) { p++; continue; } _jp = p + 1; return obj;
  }
}

function readCaseObj(u, buf, p) {
  let inp = null; p = skipWs(u, p + 1);
  if (u[p] === 125) { _jp = p + 1; return inp; }
  while (true) {
    p = skipWs(u, p); const key = readJsonStr(u, buf, p); p = skipWs(u, _jp); p++; p = skipWs(u, p);
    if (key === 'input' && u[p] === 123) inp = readInputObj(u, buf, p);
    else readJsonVal(u, buf, p);
    p = skipWs(u, _jp); if (u[p] === 44) { p++; continue; } _jp = p + 1; return inp;
  }
}

function warmupCore6() {
  const du = new Uint8Array(64), ddst = new Uint8Array(128);
  const dLitS = new Uint8Array(8), dLitB = new Uint8Array(72);
  const dOps = new Int32Array([0, 0, 0, 0, 1, 0, 1, 0, 0, 5, 0, 12, 5, 64, 15, 7, 18, 0, 2, 0, 0]);
  const dLits = [dLitS, dLitB];
  const dOut = new Uint8Array(128);
  _outU8 = dOut; _outFlush = () => { _outOff = 0; };
  S_OFF[0] = 0; _vmBodyU8 = dLitS; _vmBodyLen = 0;
  const wU8 = new Uint8Array(Buffer.from('ab cd\u00a0ef \uff21 gh ij kl'));
  const uSrc = Buffer.from('abc\\n\\n\\"\\tdef"');
  const mU8 = new Uint8Array(Buffer.from('hi & < > *em* **st** \n\\'));
  _iSrc = mU8; _iDst = ddst;
  for (let k = 0; k < 20; k++) {
    _outCap = (k & 1) === 0 ? 4 : 128; _outOff = 0; S_LEN[0] = (k & 1) === 0 ? 4 : 0;
    tf_execTpl(dOps, dOps.length, dLits);
    tf_wcU8(wU8, wU8.length);
    du.set(uSrc, 0); _jFlags = 0; _jNormCr = true; tf_unescInPlace(du, 0);
    du[0] = 97; du[1] = 34; tf_unescInPlace(du, 0);
    tf_copyCodeU8(0, mU8.length, 0);
    tf_inlineU8(0, mU8.length, 0);
    tf_scanUrlU8(0, 7);
  }
}

function run(input) { return getFallback().run(input); }

function runCli() {
  warmupCore6();
  const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
  const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  const rawBuf = readFileSync(`${inputDir}/cases.json`);
  const rawU8 = new Uint8Array(rawBuf.buffer, rawBuf.byteOffset, rawBuf.byteLength);
  const fd = openSync(`${outputDir}/answers.json`, 'w');

  const CAP = 1048576;
  const buf = Buffer.allocUnsafe(CAP);
  const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  function flush() { if (_outOff > 0) { writeSync(fd, u8, 0, _outOff); _outOff = 0; } }
  const mainOut = { buf, u8, cap: CAP, fd, flush };
  _outU8 = u8; _outCap = CAP; _outOff = 0; _outFlush = flush;

  u8[_outOff++] = 91;
  let p = (rawU8.length >= 3 && rawU8[0] === 0xEF && rawU8[1] === 0xBB && rawU8[2] === 0xBF) ? 3 : 0;
  p = skipWs(rawU8, p);
  if (rawU8[p] === 91) {
    p = skipWs(rawU8, p + 1);
    let firstCase = true;
    while (p < rawU8.length && rawU8[p] !== 93) {
      const inp = readCaseObj(rawU8, rawBuf, p);
      p = skipWs(rawU8, _jp);
      if (!firstCase) { if (_outOff >= CAP) flush(); u8[_outOff++] = 44; }
      firstCase = false;
      runStreamCase(inp, mainOut, rawU8, rawBuf);
      if (rawU8[p] === 44) p = skipWs(rawU8, p + 1);
    }
  }
  if (_outOff + 2 > CAP) flush();
  u8[_outOff++] = 93; u8[_outOff++] = 10;
  flush();
  closeSync(fd);
}

module.exports = { run, runCli };
