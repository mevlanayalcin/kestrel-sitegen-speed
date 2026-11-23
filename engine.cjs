'use strict';
const { closeSync, fstatSync, openSync, readSync, writeSync } = require('node:fs');
let _fb = null;
function getFallback() {
if (_fb === null) _fb = require('./fallback.cjs');
return _fb;
}
const RESERVED = ['index.html', 'posts', 'tags', 'page', 'build-report.txt'];
const REPORT_FILE = 'build-report.txt';
const INCLUDE_DEPTH = 16;
const EMPTY_ARR = Object.freeze([]);
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
const SLUG_LIG = [[102,102],[102,105],[102,108],[102,102,105],[102,102,108],[115,116],[115,116]];
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
const ESC_BYTES = new Uint8Array([
38,97,109,112,59, 38,108,116,59, 38,103,116,59, 38,113,117,111,116,59, 38,35,51,57,59,
]);
const ESC_OFF = new Uint8Array([0, 0, 5, 9, 13, 19]);
const ESC_LEN = new Uint8Array([0, 5, 4, 4, 6, 5]);
let MEGA_BUF = null, MEGA_U8 = null;
let megaCap = 0, megaTop = 0, _rawEnd = 0;
let CONST_BASE = 0, SLUG_TMP_OFF = 0;
let K_TRUE = 0, K_DIGITS = 0, K_LIDX_SCR = 0, K_LLEN_SCR = 0;
let K_PRE_OPEN = 0, K_PRE_LANG = 0, K_PRE_CLOSE = 0, K_PRE_NL_CLOSE = 0;
let K_HR = 0, K_BQ_OPEN = 0, K_BQ_CLOSE = 0, K_UL_OPEN = 0, K_UL_CLOSE = 0, K_OL_OPEN = 0, K_OL_CLOSE = 0;
let K_EM_OPEN = 0, K_EM_CLOSE = 0, K_STRONG_OPEN = 0, K_STRONG_CLOSE = 0;
let K_CODE_OPEN = 0, K_CODE_CLOSE = 0, K_A_OPEN = 0, K_LI_CLOSE = 0, K_P_CLOSE = 0, K_IDX_SUF = 0;
const H_OPEN_OFF = new Int32Array(7), H_CLOSE_OFF = new Int32Array(7);
let OUT_BASE = 0, OUT_END = 0;
const OUT_CAP = 524288;
let STR_BASE_INIT = 0, strArenaOff = 0, strEnd = 0;
let EX_BASE_INIT = 0, exArenaOff = 0, exEnd = 0;
let CARD_BASE_INIT = 0, cardArenaOff = 0, cardEnd = 0;
let SAVED_BASE_INIT = 0, savedArenaOff = 0, savedEnd = 0;
let BQ_BASE = 0, bqCap = 65536;
let DST_BASE = 0, dstCap = 393216;
let _megaFdOut = -1;
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
let SRC_I32 = new Int32Array(1024 * 24);
function ensureSrcI32(n) { if (n * 24 <= SRC_I32.length) return; let nc = SRC_I32.length; while (nc < n * 24) nc <<= 1; const nb = new Int32Array(nc); nb.set(SRC_I32); SRC_I32 = nb; }
const HEADING_IDS = new Set();
const VISITING_SET = new Set();
function initMega(fSize) {
_rawEnd = fSize;
const rawCap = Math.max(256, (fSize + 71) & ~7);
const strCap = 393216, exCap = 196608, cardCap = 327680, savedCap = 131072;
bqCap = 65536; dstCap = 393216;
const total = rawCap + 512 + OUT_CAP + strCap + exCap + cardCap + savedCap + bqCap + dstCap;
MEGA_BUF = Buffer.allocUnsafe(total);
MEGA_U8 = new Uint8Array(MEGA_BUF.buffer, MEGA_BUF.byteOffset, MEGA_BUF.byteLength);
megaCap = total; megaTop = total;
CONST_BASE = rawCap;
let cp = CONST_BASE;
const putK = (s) => { const o = cp; cp += MEGA_BUF.latin1Write(s, cp); return o; };
K_TRUE = putK('truefalse0123456789');
K_DIGITS = K_TRUE + 9;
K_LIDX_SCR = CONST_BASE + 24;
K_LLEN_SCR = CONST_BASE + 36;
SLUG_TMP_OFF = CONST_BASE + 48;
cp = CONST_BASE + 112;
K_PRE_OPEN = putK('<pre><code>');
K_PRE_LANG = putK('<pre><code class=\\"language-');
K_PRE_CLOSE = putK('</code></pre>\\n');
K_PRE_NL_CLOSE = putK('\\n</code></pre>\\n');
K_HR = putK('<hr>\\n');
K_BQ_OPEN = putK('<blockquote>\\n');
K_BQ_CLOSE = putK('</blockquote>\\n');
K_UL_OPEN = putK('<ul>\\n');
K_UL_CLOSE = putK('</ul>\\n');
K_OL_OPEN = putK('<ol>\\n');
K_OL_CLOSE = putK('</ol>\\n');
K_EM_OPEN = putK('<em>');
K_EM_CLOSE = putK('</em>');
K_STRONG_OPEN = putK('<strong>');
K_STRONG_CLOSE = putK('</strong>');
K_CODE_OPEN = putK('<code>');
K_CODE_CLOSE = putK('</code>');
K_A_OPEN = putK('<a href=\\"');
K_LI_CLOSE = putK('</li>\\n');
K_P_CLOSE = putK('</p>\\n');
K_IDX_SUF = putK('/index.html":"');
for (let d = 1; d <= 6; d++) {
H_OPEN_OFF[d] = putK('<h' + d + ' id=\\"');
H_CLOSE_OFF[d] = putK('</h' + d + '>\\n');
}
OUT_BASE = CONST_BASE + 512; OUT_END = OUT_BASE + OUT_CAP;
STR_BASE_INIT = OUT_END; strArenaOff = STR_BASE_INIT; strEnd = STR_BASE_INIT + strCap;
EX_BASE_INIT = strEnd; exArenaOff = EX_BASE_INIT; exEnd = EX_BASE_INIT + exCap;
CARD_BASE_INIT = exEnd; cardArenaOff = CARD_BASE_INIT; cardEnd = CARD_BASE_INIT + cardCap;
SAVED_BASE_INIT = cardEnd; savedArenaOff = SAVED_BASE_INIT; savedEnd = SAVED_BASE_INIT + savedCap;
BQ_BASE = savedEnd;
DST_BASE = BQ_BASE + bqCap;
}
function allocMegaRegion(size) {
const aligned = (size + 63) & ~7;
if (megaTop + aligned > megaCap) {
let nc = megaCap;
while (nc < megaTop + aligned) nc = Math.max(nc * 2, megaTop + aligned);
const nb = Buffer.allocUnsafe(nc);
const nu = new Uint8Array(nb.buffer, nb.byteOffset, nb.byteLength);
nu.set(MEGA_U8);
MEGA_BUF = nb; MEGA_U8 = nu; megaCap = nc;
}
const base = megaTop;
megaTop += aligned;
return base;
}
function growStr(needBytes) {
const cap = Math.max(393216, needBytes * 2);
strArenaOff = allocMegaRegion(cap);
strEnd = strArenaOff + cap;
}
function ensureStr(needBytes) { if (strArenaOff + needBytes > strEnd) growStr(needBytes); }
function ensureEx(needBytes) {
if (exArenaOff + needBytes <= exEnd) return;
const cap = Math.max(196608, needBytes * 2);
exArenaOff = allocMegaRegion(cap); exEnd = exArenaOff + cap;
}
function ensureCard(needBytes) {
if (cardArenaOff + needBytes <= cardEnd) return;
const cap = Math.max(327680, needBytes * 2);
cardArenaOff = allocMegaRegion(cap); cardEnd = cardArenaOff + cap;
}
function ensureSaved(needBytes) {
if (savedArenaOff + needBytes <= savedEnd) return;
const cap = Math.max(131072, needBytes * 2);
savedArenaOff = allocMegaRegion(cap); savedEnd = savedArenaOff + cap;
}
function ensureDst(needBytes) {
if (needBytes <= dstCap) return;
let nc = dstCap; while (nc < needBytes) nc <<= 1;
DST_BASE = allocMegaRegion(nc + 64); dstCap = nc;
}
function ensureBq(needBytes) {
if (needBytes <= bqCap) return;
let nc = bqCap; while (nc < needBytes) nc <<= 1;
BQ_BASE = allocMegaRegion(nc + 64); bqCap = nc;
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
function slugify(text) {
const len = text.length, lut = SLUG_L1, out = MEGA_U8, base = SLUG_TMP_OFF;
let o = 0, dash = 0;
for (let i = 0; i < len; i++) {
const c = text.charCodeAt(i);
let b;
if (c < 256) b = lut[c];
else if (c >= 0xFB00 && c <= 0xFB06) {
const lig = SLUG_LIG[c - 0xFB00];
if (dash !== 0 && o > 0) { out[base + o++] = 45; if (o === 64) break; }
dash = 0;
for (let k = 0; k < lig.length; k++) { out[base + o++] = lig[k]; if (o === 64) break; }
if (o === 64) break;
continue;
} else b = slugNonL1(c);
if (b === 255) return slugifySlow(text);
if (b !== 0) {
if (dash !== 0 && o > 0) { out[base + o++] = 45; if (o === 64) break; }
dash = 0; out[base + o++] = b; if (o === 64) break;
} else if (o > 0) dash = 1;
}
while (o > 0 && out[base + o - 1] === 45) o--;
return o === 0 ? 'untitled' : MEGA_BUF.latin1Slice(base, base + o);
}
let _slugBufLen = 0;
function slugifyU8(a, b) {
const u = MEGA_U8, lut = SLUG_L1, base = SLUG_TMP_OFF, lim = base + 64;
let out = base, dash = 0, i = a;
while (i < b) {
const c = u[i++];
let v;
if (c < 128) v = lut[c];
else if (c >= 0xC2 && c <= 0xDF && i < b) {
const cp = ((c & 0x1F) << 6) | (u[i++] & 0x3F);
v = cp < 256 ? lut[cp] : slugNonL1(cp);
if (v === 255) { _slugBufLen = 0; return slugifySlow(MEGA_BUF.utf8Slice(a, b)); }
} else if (c >= 0xE0 && c <= 0xEF && i + 1 < b) {
const cp = ((c & 0x0F) << 12) | ((u[i] & 0x3F) << 6) | (u[i + 1] & 0x3F); i += 2;
if (cp >= 0xFB00 && cp <= 0xFB06) {
const lig = SLUG_LIG[cp - 0xFB00];
if (dash !== 0 && out > base) { u[out++] = 45; if (out === lim) break; }
dash = 0;
for (let k = 0; k < lig.length; k++) { u[out++] = lig[k]; if (out === lim) break; }
if (out === lim) break;
continue;
}
v = slugNonL1(cp);
if (v === 255) { _slugBufLen = 0; return slugifySlow(MEGA_BUF.utf8Slice(a, b)); }
} else { _slugBufLen = 0; return slugifySlow(MEGA_BUF.utf8Slice(a, b)); }
if (v !== 0) {
if (dash !== 0 && out > base) { u[out++] = 45; if (out === lim) break; }
dash = 0; u[out++] = v; if (out === lim) break;
} else if (out > base) dash = 1;
}
while (out > base && u[out - 1] === 45) out--;
const len = out - base;
_slugBufLen = len;
return len === 0 ? 'untitled' : MEGA_BUF.latin1Slice(base, out);
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
function utf8WsLen(u, i, end) {
const b0 = u[i];
if (b0 === 0xC2 && i + 1 < end && u[i + 1] === 0xA0) return 2;
if (b0 === 0xE1 && i + 2 < end && u[i + 1] === 0x9A && u[i + 2] === 0x80) return 3;
if (b0 === 0xE2 && i + 2 < end) {
const b1 = u[i + 1], b2 = u[i + 2];
if (b1 === 0x80 && ((b2 >= 0x80 && b2 <= 0x8A) || b2 === 0xA8 || b2 === 0xA9 || b2 === 0xAF)) return 3;
if (b1 === 0x81 && b2 === 0x9F) return 3;
}
if (b0 === 0xE3 && i + 2 < end && u[i + 1] === 0x80 && u[i + 2] === 0x80) return 3;
if (b0 === 0xEF && i + 2 < end && u[i + 1] === 0xBB && u[i + 2] === 0xBF) return 3;
return 0;
}
function tf_wcU8(u, start, end) {
const wc = WC_BIT;
let count = 0, prev = 0, i = start;
const lim4 = end - 3;
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
const ws = utf8WsLen(u, i, end);
if (ws > 0) { prev = 0; i += ws; } else { count += prev ^ 1; prev = 1; i++; }
}
}
while (i < end) {
const c = wc[u[i]];
if (c < 2) { count += c & (prev ^ 1); prev = c; i++; }
else { const ws = utf8WsLen(u, i, end); if (ws > 0) { prev = 0; i += ws; } else { count += prev ^ 1; prev = 1; i++; } }
}
return count;
}
let _fmErr = '';
let _fmTA = -1, _fmTB = 0, _fmTStr = null;
let _fmSA = -1, _fmSB = 0, _fmSStr = null;
let _fmDateInt = 0, _fmDateOff = 0;
let _fmTagA = -1, _fmTagB = 0, _fmTags = null;
let _fmDraft = false, _fmLayout = null, _fmSlug = null;
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
function validateFmTagsU8(u, buf, vStart, vEnd, rawTagsCache) {
const vLen = vEnd - vStart;
if (u[vStart] !== 91 || u[vEnd - 1] !== 93) { _fmErr = 'key "tags": not a list [a, b]'; return -1; }
if (vLen === 2) { _fmTagA = -1; _fmTags = null; return 0; }
let a = vStart + 1, b = vEnd - 1;
while (a < b && (u[a] === 32 || u[a] === 9)) a++;
while (b > a && (u[b - 1] === 32 || u[b - 1] === 9)) b--;
if (a === b) { _fmTagA = -1; _fmTags = null; return 0; }
let p = a;
while (p <= b) {
let comma = u.indexOf(44, p);
if (comma === -1 || comma > b) comma = b;
let ta = p, tb = comma;
while (ta < tb && (u[ta] === 32 || u[ta] === 9)) ta++;
while (tb > ta && (u[tb - 1] === 32 || u[tb - 1] === 9)) tb--;
if (ta === tb) { _fmErr = 'key "tags": an empty tag, or one holding " [ or ]'; return -1; }
for (let k = ta; k < tb; k++) {
const c = u[k];
if (c === 34 || c === 91 || c === 93) { _fmErr = 'key "tags": an empty tag, or one holding " [ or ]'; return -1; }
if (c >= 128 || c < 32) {
const raw = buf.utf8Slice(vStart, vEnd);
let res = rawTagsCache.get(raw);
if (res === undefined) { res = parseFmTags(raw); if (res === FM_ERR) return -1; rawTagsCache.set(raw, res); }
_fmTagA = -1; _fmTags = res.length > 0 ? res : null;
return 0;
}
}
if (comma === b) break;
p = comma + 1;
}
_fmTagA = a; _fmTagB = b; _fmTags = null;
return 0;
}
function parseFrontMatterU8(u, buf, uOff, uLen, rawTagsCache) {
if (uLen < 3 || u[uOff] !== 45 || u[uOff + 1] !== 45 || u[uOff + 2] !== 45) { _fmErr = 'no front matter'; return -1; }
if (uLen === 3) { _fmErr = 'the front matter is not closed'; return -1; }
if (u[uOff + 3] !== 10) { _fmErr = 'no front matter'; return -1; }
const end = uOff + uLen;
_fmTA = -1; _fmTB = 0; _fmTStr = null;
_fmSA = -1; _fmSB = 0; _fmSStr = null;
_fmDateInt = 0; _fmDateOff = 0;
_fmTagA = -1; _fmTagB = 0; _fmTags = null;
_fmDraft = false; _fmLayout = null; _fmSlug = null;
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
else if (vc0 === 34 && vLen >= 2 && u[vEnd - 1] === 34) {
let cleanQ = true;
for (let k = vStart + 1; k < vEnd - 1; k++) { const ch = u[k]; if (ch === 92 || ch === 34) { cleanQ = false; break; } }
if (cleanQ) { _fmTA = vStart + 1; _fmTB = vEnd - 1; }
else { const v = parseFmString(buf.utf8Slice(vStart, vEnd), 'title'); if (v === FM_ERR) return -1; _fmTStr = v; }
} else { const v = parseFmString(buf.utf8Slice(vStart, vEnd), 'title'); if (v === FM_ERR) return -1; _fmTStr = v; }
} else if (kid === 1) {
if (vLen !== 10 || u[vStart + 4] !== 45 || u[vStart + 7] !== 45) { _fmErr = 'key "date": not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)'; return -1; }
const d0 = vc0 - 48, d1 = u[vStart + 1] - 48, d2 = u[vStart + 2] - 48, d3 = u[vStart + 3] - 48;
const m0 = u[vStart + 5] - 48, m1 = u[vStart + 6] - 48, dy0 = u[vStart + 8] - 48, dy1 = u[vStart + 9] - 48;
if ((d0 | d1 | d2 | d3 | m0 | m1 | dy0 | dy1) < 0 || d0 > 9 || d1 > 9 || d2 > 9 || d3 > 9 || m0 > 9 || m1 > 9 || dy0 > 9 || dy1 > 9) { _fmErr = 'key "date": not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)'; return -1; }
const y = d0 * 1000 + d1 * 100 + d2 * 10 + d3, mo = m0 * 10 + m1, day = dy0 * 10 + dy1;
if (y < 1970 || y > 2099 || mo < 1 || mo > 12 || day < 1 || day > daysIn(y, mo)) { _fmErr = 'key "date": not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)'; return -1; }
_fmDateInt = y * 10000 + mo * 100 + day; _fmDateOff = vStart;
} else if (kid === 2) {
if (validateFmTagsU8(u, buf, vStart, vEnd, rawTagsCache) === -1) return -1;
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
else if (vc0 === 34 && vLen >= 2 && u[vEnd - 1] === 34) {
let cleanQ = true;
for (let k = vStart + 1; k < vEnd - 1; k++) { const ch = u[k]; if (ch === 92 || ch === 34) { cleanQ = false; break; } }
if (cleanQ) { if (vLen > 2) { _fmSA = vStart + 1; _fmSB = vEnd - 1; } else _fmSStr = ''; }
else { const v = parseFmString(buf.utf8Slice(vStart, vEnd), 'summary'); if (v === FM_ERR) return -1; _fmSStr = v; }
} else { const v = parseFmString(buf.utf8Slice(vStart, vEnd), 'summary'); if (v === FM_ERR) return -1; _fmSStr = v; }
}
seenMask |= bit; p = nextPos; lineNo++;
}
_fmErr = 'the front matter is not closed';
return -1;
}
let _dPrev = '', _dSlash = 0;
function dirOf(path) {
const idx = path.lastIndexOf('/');
if (idx === -1) return '';
if (idx === _dSlash && path.startsWith(_dPrev)) return _dPrev;
_dSlash = idx; _dPrev = path.slice(0, idx); return _dPrev;
}
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
let _iCtx = null;
function writeRelLinkHrefU8(a, b, hashPos, hasSpec, isNonAscii, o) {
let u = MEGA_U8;
const linkCtx = _iCtx;
let cache = linkCtx.dirCache;
if (b - a >= 3 && u[a] === 46 && u[a + 1] === 46 && u[a + 2] === 47) {
if (b - a >= 6 && u[a + 3] === 46 && u[a + 4] === 46 && u[a + 5] === 47) {
if (linkCtx.rel2Cache !== null) cache = linkCtx.rel2Cache;
} else if (linkCtx.rel1Cache !== null) cache = linkCtx.rel1Cache;
}
const target = isNonAscii === 0 ? MEGA_BUF.latin1Slice(a, b) : MEGA_BUF.utf8Slice(a, b);
let cached = cache.get(target);
if (cached !== undefined) {
if (typeof cached === 'number') {
if (cached !== 0) {
const ao = cached >>> 8, an = cached & 255;
u.copyWithin(o, ao, ao + an);
return o + an;
}
linkCtx.broken.add('broken-link ' + linkCtx.sourcePath + ' -> ' + target);
if (hasSpec === 0) { u.copyWithin(o, a, b); return o + (b - a); }
return tf_copyCodeU8(a, b, o);
}
u.copyWithin(o, cached.o, cached.o + cached.n);
return o + cached.n;
}
const rel = hashPos === -1 ? target : (isNonAscii === 0 ? MEGA_BUF.latin1Slice(a, hashPos) : MEGA_BUF.utf8Slice(a, hashPos));
const path = rel.length === 0 ? null : resolvePathFast(linkCtx.dirStr, linkCtx.dirParts, rel);
if (path !== null) {
const dest = linkCtx.bySource.get(path);
if (dest !== undefined) {
if (hasSpec === 0) {
const uo = SRC_I32[dest.si + 9], un = SRC_I32[dest.si + 10];
if (hashPos === -1) {
u.copyWithin(o, uo, uo + un);
cache.set(target, (uo < 0x800000 && un < 256) ? ((uo << 8) | un) : { o: uo, n: un });
return o + un;
}
const fLen = b - hashPos, tot = un + fLen;
ensureStr(tot); u = MEGA_U8;
const ao = strArenaOff;
u.copyWithin(ao, uo, uo + un); u.copyWithin(ao + un, hashPos, b);
u.copyWithin(o, ao, ao + tot);
strArenaOff = ao + tot;
cache.set(target, (ao < 0x800000 && tot < 256) ? ((ao << 8) | tot) : { o: ao, n: tot });
return o + tot;
}
const frag = hashPos === -1 ? '' : target.slice(hashPos - a);
const jh = escHtmlJsonStr(MEGA_BUF.latin1Slice(SRC_I32[dest.si + 9], SRC_I32[dest.si + 9] + SRC_I32[dest.si + 10]) + frag);
ensureStr(jh.length * 3 + 8); u = MEGA_U8;
const ao = strArenaOff, an = MEGA_BUF.utf8Write(jh, ao);
strArenaOff = ao + an;
cache.set(target, (ao < 0x800000 && an < 256) ? ((ao << 8) | an) : { o: ao, n: an });
u.copyWithin(o, ao, ao + an);
return o + an;
}
if (linkCtx.staticPaths.has(path)) {
const frag = hashPos === -1 ? '' : target.slice(hashPos - a);
const rawUrl = linkCtx.base + '/' + path + frag;
const jh = !JSON_ASCII_SAFE_TEST.test(rawUrl) ? rawUrl : escHtmlJsonStr(rawUrl);
ensureStr(jh.length * 3 + 8); u = MEGA_U8;
const ao = strArenaOff, an = jh === rawUrl ? MEGA_BUF.latin1Write(jh, ao) : MEGA_BUF.utf8Write(jh, ao);
strArenaOff = ao + an;
cache.set(target, (ao < 0x800000 && an < 256) ? ((ao << 8) | an) : { o: ao, n: an });
u.copyWithin(o, ao, ao + an);
return o + an;
}
}
linkCtx.broken.add('broken-link ' + linkCtx.sourcePath + ' -> ' + target);
cache.set(target, 0);
if (hasSpec === 0) { u.copyWithin(o, a, b); return o + (b - a); }
return tf_copyCodeU8(a, b, o);
}
function writeCtrlJsonU8(u, o, b) {
u[o++] = 92;
if (b === 9) { u[o++] = 116; return o; }
if (b === 13) { u[o++] = 114; return o; }
if (b === 8) { u[o++] = 98; return o; }
if (b === 12) { u[o++] = 102; return o; }
u[o++] = 117; u[o++] = 48; u[o++] = 48;
u[o++] = b < 16 ? 48 : 49;
const lo = b & 15;
u[o++] = lo < 10 ? 48 + lo : 87 + lo;
return o;
}
function copyCodeOther(u, o, c, act) {
if (act === 6) { u[o++] = 92; u[o++] = 110; return o; }
if (act === 7) { u[o++] = 92; u[o++] = 92; return o; }
return writeCtrlJsonU8(u, o, c);
}
function tf_copyCodeU8(a, b, o) {
if (a >= b) return o;
const u = MEGA_U8, tbl = CODE_ACT, sv = u[b];
u[b] = 0;
let i = a;
while (true) {
let c = u[i], act = tbl[c];
while (act === 0) { u[o++] = c; c = u[++i]; act = tbl[c]; }
if (i >= b) { u[b] = sv; return o; }
if (act <= 5) { let ep = ESC_OFF[act], ee = ep + ESC_LEN[act]; while (ep < ee) u[o++] = ESC_BYTES[ep++]; }
else o = copyCodeOther(u, o, c, act);
i++;
}
}
function tf_scanUrlU8(a, b) {
const u = MEGA_U8, tbl = URL_ACT;
let m = 0, p = a;
const lim = b - 1;
while (p < lim) { m |= tbl[u[p]] | tbl[u[p + 1]]; p += 2; }
if (p < b) m |= tbl[u[p]];
return m;
}
function isEscU8(u, pos, minPos) { let bs = 0; for (let p = pos - 1; p >= minPos && u[p] === 92; p--) bs++; return (bs & 1) === 1; }
function hasUtf8WsU8(u, a, b) { for (let p = a; p < b; p++) if (u[p] >= 0xC2 && utf8WsLen(u, p, b) > 0) return true; return false; }
let _spNext = 0;
function handleCodeOrLinkU8(i, b, o, act) {
let u = MEGA_U8;
if (act === 8) {
const sv = u[b]; u[b] = 96;
const j = u.indexOf(96, i + 1);
u[b] = sv;
if (j > i + 1 && j < b) {
u.copyWithin(o, K_CODE_OPEN, K_CODE_OPEN + 6); o += 6;
o = tf_copyCodeU8(i + 1, j, o);
u.copyWithin(o, K_CODE_CLOSE, K_CODE_CLOSE + 7); o += 7;
_spNext = j + 1; return o;
}
u[o++] = 96; _spNext = i + 1; return o;
}
let pB = i + 1, k = -1;
const sv93 = u[b]; u[b] = 93;
while (pB < b) {
const j = u.indexOf(93, pB); if (j >= b) break;
if (j === i + 1 || u[j - 1] !== 92 || !isEscU8(u, j, i + 1)) { k = j; break; }
pB = j + 1;
}
u[b] = sv93;
if (k !== -1 && k + 1 < b && u[k + 1] === 40) {
const sv41 = u[b]; u[b] = 41;
const closeP = u.indexOf(41, k + 2);
u[b] = sv41;
if (closeP > k + 2 && closeP < b) {
const m = tf_scanUrlU8(k + 2, closeP);
if ((m & 1) === 0 && ((m & 16) === 0 || !hasUtf8WsU8(u, k + 2, closeP))) {
const hasSpec = m & 2;
u.copyWithin(o, K_A_OPEN, K_A_OPEN + 10); o += 10;
const u0 = u[k + 2];
if (u0 === 47 || u0 === 35 || ((m & 4) !== 0 && hasSchemeU8(u, k + 2, closeP))) {
if (hasSpec === 0) { u.copyWithin(o, k + 2, closeP); o += closeP - (k + 2); }
else o = tf_copyCodeU8(k + 2, closeP, o);
} else {
let hashPos = -1;
if ((m & 8) !== 0) { const sv35 = u[closeP]; u[closeP] = 35; const hp = u.indexOf(35, k + 2); u[closeP] = sv35; if (hp < closeP) hashPos = hp; }
o = writeRelLinkHrefU8(k + 2, closeP, hashPos, hasSpec, m & 16, o);
u = MEGA_U8;
}
u[o++] = 92; u[o++] = 34; u[o++] = 62;
o = tf_inlineU8(i + 1, k, o);
u = MEGA_U8;
u[o++] = 60; u[o++] = 47; u[o++] = 97; u[o++] = 62;
_spNext = closeP + 1; return o;
}
}
}
u[o++] = 91; _spNext = i + 1; return o;
}
function handleMdTokU8(i, b, o, act) {
if (act === 8 || act === 10) return handleCodeOrLinkU8(i, b, o, act);
let u = MEGA_U8;
if (act === 9) {
if (i + 1 < b && u[i + 1] === 42) {
let p = i + 2, j = -1; const lim = b - 1;
const sv = u[b]; u[b] = 42;
while (p < lim) {
const f = u.indexOf(42, p); if (f >= lim) break;
if (u[f + 1] === 42 && (f === i + 2 || u[f - 1] !== 92 || !isEscU8(u, f, i + 2))) { j = f; break; }
p = f + 1;
}
u[b] = sv;
if (j > i + 2) {
u.copyWithin(o, K_STRONG_OPEN, K_STRONG_OPEN + 8); o += 8;
o = tf_inlineU8(i + 2, j, o);
u = MEGA_U8;
u.copyWithin(o, K_STRONG_CLOSE, K_STRONG_CLOSE + 9); o += 9;
_spNext = j + 2;
} else { u[o++] = 42; u[o++] = 42; _spNext = i + 2; }
return o;
}
let p = i + 1, j = -1;
const sv = u[b]; u[b] = 42;
while (p < b) {
const f = u.indexOf(42, p); if (f >= b) break;
if (f > i + 1 && u[f - 1] === 92 && isEscU8(u, f, i + 1)) { p = f + 1; continue; }
if (f + 1 < b && u[f + 1] === 42) { p = f + 2; continue; }
j = f; break;
}
u[b] = sv;
if (j > i + 1) {
u.copyWithin(o, K_EM_OPEN, K_EM_OPEN + 4); o += 4;
o = tf_inlineU8(i + 1, j, o);
u = MEGA_U8;
u.copyWithin(o, K_EM_CLOSE, K_EM_CLOSE + 5); o += 5;
_spNext = j + 1;
} else { u[o++] = 42; _spNext = i + 1; }
return o;
}
if (act === 7) {
if (i + 1 < b) {
const n = u[i + 1];
if (n < 128 && ESCAPABLE_U8[n] === 1) {
if (n === 62) { u[o++] = 38; u[o++] = 103; u[o++] = 116; u[o++] = 59; }
else if (n === 92) { u[o++] = 92; u[o++] = 92; }
else u[o++] = n;
_spNext = i + 2; return o;
}
}
u[o++] = 92; u[o++] = 92; _spNext = i + 1; return o;
}
o = writeCtrlJsonU8(u, o, u[i]);
_spNext = i + 1; return o;
}
function tf_inlineU8(a, b, o) {
if (a >= b) return o;
let u = MEGA_U8;
const tbl = INL_ACT, sv = u[b];
u[b] = 0;
let i = a;
while (true) {
let c = u[i], act = tbl[c];
while (act === 0) { u[o++] = c; c = u[++i]; act = tbl[c]; if (act !== 0) break; u[o++] = c; c = u[++i]; act = tbl[c]; }
if (i >= b) { u[b] = sv; return o; }
if (act === 6) { u[o++] = 92; u[o++] = 110; i++; continue; }
if (act <= 5) { let ep = ESC_OFF[act], ee = ep + ESC_LEN[act]; while (ep < ee) u[o++] = ESC_BYTES[ep++]; i++; continue; }
if (act === 9) {
let p = i + 1, o2 = o + 4, is2 = 0, ok = 0;
if (p < b && u[p] === 42) { p++; o2 += 4; is2 = 1; }
const s0 = p;
while (true) {
const ch = u[p];
if (tbl[ch] === 0) { u[o2++] = ch; p++; continue; }
if (ch === 42 && p > s0) {
if (is2 !== 0) {
if (p + 1 < b && u[p + 1] === 42) {
u.copyWithin(o, K_STRONG_OPEN, K_STRONG_OPEN + 8);
u.copyWithin(o2, K_STRONG_CLOSE, K_STRONG_CLOSE + 9);
o = o2 + 9; i = p + 2; ok = 1;
}
} else if (p + 1 >= b || u[p + 1] !== 42) {
u.copyWithin(o, K_EM_OPEN, K_EM_OPEN + 4);
u.copyWithin(o2, K_EM_CLOSE, K_EM_CLOSE + 5);
o = o2 + 5; i = p + 1; ok = 1;
}
}
break;
}
if (ok !== 0) continue;
}
u[b] = sv; o = handleMdTokU8(i, b, o, act); u = MEGA_U8; u[b] = 0; i = _spNext;
}
}
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
function trimParaToBq(u, pos, lastEnd) {
let bqPos = BQ_BASE, q = pos;
while (q <= lastEnd) {
const _qnl = u.indexOf(10, q), qnl = _qnl >= lastEnd ? -1 : _qnl, qlEnd = qnl === -1 ? lastEnd : qnl;
let ta = q, tb = qlEnd;
while (ta < tb && (u[ta] === 32 || u[ta] === 9)) ta++;
while (tb > ta && (u[tb - 1] === 32 || u[tb - 1] === 9)) tb--;
if (q > pos) u[bqPos++] = 10;
const n = tb - ta;
if (n > 0) { u.copyWithin(bqPos, ta, tb); bqPos += n; }
if (qnl === -1) break; q = qnl + 1;
}
return bqPos;
}
let _mdPos = 0, _mdExStart = -1, _mdExEnd = -1;
function consumeFenceU8(u, end, pos, nextPos, o) {
const langStart = pos + 3, langEnd = _flEnd, codeStart = nextPos;
let codeEnd = -1;
if (nextPos > end) _mdPos = nextPos;
else {
let q = nextPos, found = false;
u[end] = 96;
while (q < end) {
const idx = u.indexOf(96, q); if (idx >= end) break;
if (idx === nextPos || u[idx - 1] === 10) {
u[end] = 10;
const cnl = u.indexOf(10, idx), clEnd = cnl >= end ? end : cnl;
if (isFenceCloseU8(u, idx, clEnd)) {
codeEnd = idx === nextPos ? -1 : idx - 1; _mdPos = cnl >= end ? end : cnl + 1; found = true; break;
}
u[end] = 96;
q = cnl >= end ? end : cnl + 1;
} else q = idx + 1;
}
u[end] = 10;
if (!found) { codeEnd = end; _mdPos = end; }
}
if (langEnd === langStart) { u.copyWithin(o, K_PRE_OPEN, K_PRE_OPEN + 11); o += 11; }
else {
u.copyWithin(o, K_PRE_LANG, K_PRE_LANG + 28); o += 28;
const ll = langEnd - langStart;
u.copyWithin(o, langStart, langEnd); o += ll;
u[o++] = 92; u[o++] = 34; u[o++] = 62;
}
if (codeEnd === -1) { u.copyWithin(o, K_PRE_CLOSE, K_PRE_CLOSE + 15); o += 15; }
else { o = tf_copyCodeU8(codeStart, codeEnd, o); u.copyWithin(o, K_PRE_NL_CLOSE, K_PRE_NL_CLOSE + 17); o += 17; }
return o;
}
function consumeHeadingU8(o) {
const depth = _hdDepth, hStart = _hdStart, hEnd = _hdEnd;
const rawId = slugifyU8(hStart, hEnd);
let u = MEGA_U8, idLen;
const ho = H_OPEN_OFF[depth];
u.copyWithin(o, ho, ho + 9); o += 9;
const idStart = o;
if (!HEADING_IDS.has(rawId)) {
HEADING_IDS.add(rawId);
if (_slugBufLen > 0) { idLen = _slugBufLen; u.copyWithin(o, SLUG_TMP_OFF, SLUG_TMP_OFF + idLen); }
else idLen = MEGA_BUF.latin1Write(rawId, o);
} else {
const id = uniqueSlug(rawId, HEADING_IDS);
idLen = MEGA_BUF.latin1Write(id, o);
}
o += idLen;
u[o++] = 92; u[o++] = 34; u[o++] = 62;
const hO0 = o;
o = tf_inlineU8(hStart, hEnd, o);
u = MEGA_U8;
if (depth === 2 || depth === 3) {
ensureTocCap(tocCount + 1);
ensureStr(idLen); u = MEGA_U8;
const idOff = strArenaOff;
u.copyWithin(idOff, idStart, idStart + idLen);
strArenaOff = idOff + idLen;
TOC_LVL[tocCount] = depth;
TOC_ID_OFF[tocCount] = idOff;
TOC_ID_LEN[tocCount] = idLen;
TOC_HTML_OFF[tocCount] = hO0 - DST_BASE;
TOC_HTML_LEN[tocCount] = o - hO0;
tocCount++;
}
const hc = H_CLOSE_OFF[depth];
u.copyWithin(o, hc, hc + 7); o += 7;
return o;
}
function consumeBlockquoteU8(u, end, pos, lEnd, nextPos, o) {
let a0 = pos + 1, b0 = lEnd;
while (a0 < b0 && (u[a0] === 32 || u[a0] === 9)) a0++;
while (b0 > a0 && (u[b0 - 1] === 32 || u[b0 - 1] === 9)) b0--;
if (nextPos >= end || u[nextPos] !== 62) {
_mdPos = nextPos;
u.copyWithin(o, K_BQ_OPEN, K_BQ_OPEN + 14); o += 14;
if (a0 < b0) {
u[o++] = 60; u[o++] = 112; u[o++] = 62;
o = tf_inlineU8(a0, b0, o); u = MEGA_U8;
u.copyWithin(o, K_P_CLOSE, K_P_CLOSE + 6); o += 6;
}
u.copyWithin(o, K_BQ_CLOSE, K_BQ_CLOSE + 15); o += 15;
return o;
}
let bqPos = BQ_BASE, p = nextPos;
if (a0 < b0) { u.copyWithin(bqPos, a0, b0); bqPos += b0 - a0; }
while (p < end && u[p] === 62) {
const qnl = u.indexOf(10, p), qlEnd = qnl >= end ? end : qnl;
let a = p + 1, b = qlEnd;
while (a < b && (u[a] === 32 || u[a] === 9)) a++;
while (b > a && (u[b - 1] === 32 || u[b - 1] === 9)) b--;
if (a < b) { if (bqPos > BQ_BASE) u[bqPos++] = 10; u.copyWithin(bqPos, a, b); bqPos += b - a; }
p = qnl >= end ? end : qnl + 1;
}
_mdPos = p;
u.copyWithin(o, K_BQ_OPEN, K_BQ_OPEN + 14); o += 14;
if (bqPos > BQ_BASE) {
u[o++] = 60; u[o++] = 112; u[o++] = 62;
o = tf_inlineU8(BQ_BASE, bqPos, o); u = MEGA_U8;
u.copyWithin(o, K_P_CLOSE, K_P_CLOSE + 6); o += 6;
}
u.copyWithin(o, K_BQ_CLOSE, K_BQ_CLOSE + 15); o += 15;
return o;
}
function consumeListU8(u, end, isOrd, firstA, startNum, lEnd, nextPos, o) {
if (!isOrd) { u.copyWithin(o, K_UL_OPEN, K_UL_OPEN + 6); o += 6; }
else if (startNum === 1) { u.copyWithin(o, K_OL_OPEN, K_OL_OPEN + 6); o += 6; }
else { o += MEGA_BUF.latin1Write('<ol start=\\"' + startNum + '\\">\\n', o); }
let a = firstA, b = lEnd;
while (a < b && (u[a] === 32 || u[a] === 9)) a++;
while (b > a && (u[b - 1] === 32 || u[b - 1] === 9)) b--;
let bqPos = BQ_BASE, inBq = false, itemA = a, itemB = b, p = nextPos;
while (p < end) {
const c = u[p];
if (c !== 32 && (isOrd ? (c < 48 || c > 57) : (c !== 45 && c !== 42))) break;
const lnl = u.indexOf(10, p), llEnd = lnl >= end ? end : lnl, lNext = lnl >= end ? end : lnl + 1;
const nextItemA = isOrd
? (p < llEnd && c >= 48 && c <= 57 ? matchOrderedU8(u, p, llEnd) : -1)
: (p + 1 < llEnd && (c === 45 || c === 42) && u[p + 1] === 32 ? p + 2 : -1);
if (nextItemA !== -1) {
u[o++] = 60; u[o++] = 108; u[o++] = 105; u[o++] = 62;
if (inBq) o = tf_inlineU8(BQ_BASE, bqPos, o);
else o = tf_inlineU8(itemA, itemB, o);
u = MEGA_U8;
u.copyWithin(o, K_LI_CLOSE, K_LI_CLOSE + 7); o += 7;
a = nextItemA; b = llEnd;
while (a < b && (u[a] === 32 || u[a] === 9)) a++;
while (b > a && (u[b - 1] === 32 || u[b - 1] === 9)) b--;
itemA = a; itemB = b; inBq = false; bqPos = BQ_BASE; p = lNext;
} else if (isContinuedU8(u, p, llEnd)) {
if (!inBq) { u.copyWithin(BQ_BASE, itemA, itemB); bqPos = BQ_BASE + (itemB - itemA); inBq = true; }
u[bqPos++] = 10;
let ca = p, cb = llEnd;
while (ca < cb && (u[ca] === 32 || u[ca] === 9)) ca++;
while (cb > ca && (u[cb - 1] === 32 || u[cb - 1] === 9)) cb--;
if (cb > ca) { u.copyWithin(bqPos, ca, cb); bqPos += cb - ca; }
p = lNext;
} else break;
}
_mdPos = p;
u[o++] = 60; u[o++] = 108; u[o++] = 105; u[o++] = 62;
if (inBq) o = tf_inlineU8(BQ_BASE, bqPos, o);
else o = tf_inlineU8(itemA, itemB, o);
u = MEGA_U8;
u.copyWithin(o, K_LI_CLOSE, K_LI_CLOSE + 7); o += 7;
const cl = isOrd ? K_OL_CLOSE : K_UL_CLOSE;
u.copyWithin(o, cl, cl + 7); o += 7;
return o;
}
function renderMarkdownFast(start, end) {
let u = MEGA_U8;
const blk = BLK_C0, pec = PARA_END_C0;
let pos = start, o = DST_BASE, exSeen = false;
_mdExStart = -1; _mdExEnd = -1;
tocCount = 0;
while (pos < end) {
const c0 = u[pos];
if (c0 === 10) { pos++; continue; }
const nl = u.indexOf(10, pos), lEnd = nl >= end ? end : nl, nextPos = nl >= end ? end : nl + 1;
const bk = blk[c0];
if (bk !== 0) {
if (bk === 3) { if (matchHeadingU8(u, pos, lEnd) !== 0) { o = consumeHeadingU8(o); u = MEGA_U8; pos = nextPos; continue; } }
else if (bk === 4) {
if (isHrU8(u, pos, lEnd)) { u.copyWithin(o, K_HR, K_HR + 6); o += 6; pos = nextPos; continue; }
if (pos + 1 < lEnd && u[pos + 1] === 32) { o = consumeListU8(u, end, false, pos + 2, 0, lEnd, nextPos, o); u = MEGA_U8; pos = _mdPos; continue; }
} else if (bk === 5) { o = consumeBlockquoteU8(u, end, pos, lEnd, nextPos, o); u = MEGA_U8; pos = _mdPos; continue; }
else if (bk === 6) { const oc = matchOrderedU8(u, pos, lEnd); if (oc !== -1) { o = consumeListU8(u, end, true, oc, _ordNum, lEnd, nextPos, o); u = MEGA_U8; pos = _mdPos; continue; } }
else if (bk === 2) { if (matchFenceOpenU8(u, pos, lEnd)) { o = consumeFenceU8(u, end, pos, nl >= end ? end + 1 : nextPos, o); u = MEGA_U8; pos = _mdPos; continue; } }
else if (isBlankU8(u, pos, lEnd)) { pos = nextPos; continue; }
}
let p, pA, pB;
if (nextPos >= end || u[nextPos] === 10) {
p = nextPos >= end ? end : nextPos + 1;
pA = pos; pB = lEnd;
if (c0 === 32 || c0 === 9) while (pA < pB && (u[pA] === 32 || u[pA] === 9)) pA++;
if (pB > pA && (u[pB - 1] === 32 || u[pB - 1] === 9)) while (pB > pA && (u[pB - 1] === 32 || u[pB - 1] === 9)) pB--;
} else {
let lastEnd = lEnd;
let clean = (c0 !== 32 && c0 !== 9 && u[lEnd - 1] !== 32 && u[lEnd - 1] !== 9) ? 1 : 0;
p = nextPos;
while (p < end) {
const lc0 = u[p];
if (lc0 === 10) { p++; break; }
const pnl = u.indexOf(10, p), plEnd = pnl >= end ? end : pnl;
if (pec[lc0] !== 0 && endsParaU8(u, p, plEnd, lc0)) break;
if (clean !== 0) { const lc1 = u[plEnd - 1]; if (lc0 === 32 || lc0 === 9 || lc1 === 32 || lc1 === 9) clean = 0; }
lastEnd = plEnd; p = pnl >= end ? end : pnl + 1;
}
if (clean !== 0) { pA = pos; pB = lastEnd; }
else { pA = BQ_BASE; pB = trimParaToBq(u, pos, lastEnd); }
}
pos = p;
u[o++] = 60; u[o++] = 112; u[o++] = 62;
if (!exSeen) { exSeen = true; _mdExStart = o; o = tf_inlineU8(pA, pB, o); _mdExEnd = o; }
else o = tf_inlineU8(pA, pB, o);
u = MEGA_U8;
u.copyWithin(o, K_P_CLOSE, K_P_CLOSE + 6); o += 6;
}
return o - DST_BASE;
}
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
function countExpandedNodes(templates, name, depth, memo) {
if (depth > INCLUDE_DEPTH) return 0;
const k = depth === 0 ? name : name + '#' + depth;
const c = memo.get(k); if (c !== undefined) return c;
const nodes = templates.get(name); if (nodes === undefined) return 0;
let total = 0;
function walk(arr) {
for (let i = 0; i < arr.length; i++) {
const n = arr[i]; total++; if (total > 2000) return;
if (n.k === 3) { walk(n.t); if (n.e !== null) walk(n.e); }
else if (n.k === 4) walk(n.b);
else if (n.k === 5 && depth < INCLUDE_DEPTH) total += countExpandedNodes(templates, n.n, depth + 1, memo);
}
}
walk(nodes); memo.set(k, total); return total;
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
const ops = [];
let pendingLit = '', cardTplName = null, activeLoop = 0, loopVar = '', supported = true;
let loopFlags = 0;
function flushLit() {
if (pendingLit === '') return;
const j = JSON_ANY_RE.test(pendingLit) ? JSON.stringify(pendingLit).slice(1, -1) : pendingLit;
pendingLit = '';
const need = j.length * 3 + 8;
ensureStr(need);
const lo = strArenaOff, ln = MEGA_BUF.utf8Write(j, lo);
strArenaOff = lo + ln;
ops.push(0, lo, ln);
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
rctx.tagSnips.push(subOps);
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
return { ops: new Int32Array(ops), cardTplName };
}
let _outOff = 0, _outEnd = 0, _outMode = 0, _curChunkStart = 0;
let _vmBodyOff = 0, _vmBodyLen = 0, _vmExOff = 0, _vmExLen = 0;
let _vmTocBase = 0, _vmTocCount = 0, _vmTagIds = EMPTY_ARR, _vmTagCount = 0;
let _vmCardOffs = null, _vmCardLens = null, _vmCardList = null, _vmCardCount = 0;
let _vmTagSnips = null;
let _vmIp = 0, _vmLi = 0, _vmLCount = 0;
function flushMainOut() {
if (_outOff > OUT_BASE) { writeSync(_megaFdOut, MEGA_U8, OUT_BASE, _outOff - OUT_BASE); _outOff = OUT_BASE; }
}
function vmGrowChunk(needExtra) {
const curLen = _outOff - _curChunkStart;
const newCap = Math.max(curLen * 2 + needExtra + 65536, 131072);
const newStart = allocMegaRegion(newCap);
if (curLen > 0) MEGA_U8.copyWithin(newStart, _curChunkStart, _curChunkStart + curLen);
_curChunkStart = newStart;
_outOff = newStart + curLen;
_outEnd = newStart + newCap;
if (_outMode === 1) cardEnd = _outEnd;
else if (_outMode === 2) strEnd = _outEnd;
}
function vmFlushWrite(a, n) {
if (_outMode === 0) {
flushMainOut();
if (_outOff + n <= OUT_END) { MEGA_U8.copyWithin(_outOff, a, a + n); _outOff += n; return _outOff; }
let pos = a, rem = n;
while (rem > 0) {
const space = OUT_END - _outOff;
if (space === 0) { flushMainOut(); continue; }
const take = rem < space ? rem : space;
MEGA_U8.copyWithin(_outOff, pos, pos + take);
_outOff += take; pos += take; rem -= take;
}
return _outOff;
}
if (_outMode === 3) { _outOff = _curChunkStart; return _outOff; } // warmup dummy
vmGrowChunk(n);
MEGA_U8.copyWithin(_outOff, a, a + n);
_outOff += n;
return _outOff;
}
function setLoopIntSlot(slotId, num) {
if (num < 10) { S_OFF[slotId] = K_DIGITS + num; S_LEN[slotId] = 1; return; }
const p = slotId === SL_L_IDX ? K_LIDX_SCR : K_LLEN_SCR;
if (num < 100) { MEGA_U8[p] = 48 + ((num / 10) | 0); MEGA_U8[p + 1] = 48 + (num % 10); S_OFF[slotId] = p; S_LEN[slotId] = 2; return; }
const st = String(num), n = st.length;
for (let k = 0; k < n; k++) MEGA_U8[p + k] = st.charCodeAt(k);
S_OFF[slotId] = p; S_LEN[slotId] = n;
}
function loadTagSlots(tid) {
S_OFF[SL_L_A] = TAG_NOFF[tid]; S_LEN[SL_L_A] = TAG_NLEN[tid];
S_OFF[SL_L_B] = TAG_SOFF[tid]; S_LEN[SL_L_B] = TAG_SLEN[tid];
S_OFF[SL_L_URL] = TAG_UOFF[tid]; S_LEN[SL_L_URL] = TAG_ULEN[tid];
}
function loadTocSlots(li) {
S_OFF[SL_L_A] = TOC_ID_OFF[li]; S_LEN[SL_L_A] = TOC_ID_LEN[li];
S_OFF[SL_L_B] = K_DIGITS + TOC_LVL[li]; S_LEN[SL_L_B] = 1;
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
const n = _vmBodyLen; if (n === 0) return o;
if (o + n > _outEnd) return vmFlushWrite(_vmBodyOff, n);
MEGA_U8.copyWithin(o, _vmBodyOff, _vmBodyOff + n); return o + n;
}
if (op === 3) {
const n = _vmExLen; if (n === 0) return o;
if (o + n > _outEnd) return vmFlushWrite(_vmExOff, n);
MEGA_U8.copyWithin(o, _vmExOff, _vmExOff + n); return o + n;
}
if (op === 4) {
const n = TOC_HTML_LEN[_vmLi]; if (n === 0) return o;
const a = _vmTocBase + TOC_HTML_OFF[_vmLi];
if (o + n > _outEnd) return vmFlushWrite(a, n);
MEGA_U8.copyWithin(o, a, a + n); return o + n;
}
if (op === 13) {
const tc = _vmTagCount; if (tc === 0) return o;
const tids = _vmTagIds, sn = _vmTagSnips[arg], offs = sn.offs, lens = sn.lens;
for (let k = 0; k < tc; k++) {
const tid = tids[k], to = offs[tid], tl = lens[tid];
if (tl === 0) continue;
if (o + tl > _outEnd) { _outOff = o; o = vmFlushWrite(to, tl); }
else { MEGA_U8.copyWithin(o, to, to + tl); o += tl; }
}
return o;
}
const cc = _vmCardCount, cl = _vmCardList, co = _vmCardOffs, cn = _vmCardLens;
for (let k = 0; k < cc; k++) {
const pid = cl[k], cOff = co[pid], cLen = cn[pid];
if (o + cLen > _outEnd) { _outOff = o; o = vmFlushWrite(cOff, cLen); }
else { MEGA_U8.copyWithin(o, cOff, cOff + cLen); o += cLen; }
}
return o;
}
function tf_execTpl(ops, opLen) {
let o = _outOff, u = MEGA_U8, end = _outEnd;
const sOff = S_OFF, sLen = S_LEN;
let ip = 0;
while (ip < opLen) {
const op = ops[ip];
if (op === 0) {
const a = ops[ip + 1], n = ops[ip + 2]; ip += 3;
if (o + n > end) { _outOff = o; o = vmFlushWrite(a, n); u = MEGA_U8; end = _outEnd; }
else { u.copyWithin(o, a, a + n); o += n; }
} else if (op === 1) {
const idx = ops[ip + 1]; ip += 3;
const n = sLen[idx];
if (n === 0) continue;
const a = sOff[idx];
if (o + n > end) { _outOff = o; o = vmFlushWrite(a, n); u = MEGA_U8; end = _outEnd; }
else { u.copyWithin(o, a, a + n); o += n; }
} else if (op === 5) {
const a = ops[ip + 1];
ip = ((sLen[a & 63] === 0) !== ((a & 64) !== 0)) ? ops[ip + 2] : ip + 3;
} else if (op === 7) {
ip = ops[ip + 1];
} else {
o = vmExtOp(op, ops[ip + 1], ops[ip + 2], ip, o);
ip = _vmIp; u = MEGA_U8; end = _outEnd;
}
}
_outOff = o;
}
function writeSlotStr(slotId, str) {
if (str.length === 0) { S_LEN[slotId] = 0; return; }
ensureStr(str.length * 3 + 16);
const o = strArenaOff, n = MEGA_BUF.utf8Write(str, o);
strArenaOff = o + n; S_OFF[slotId] = o; S_LEN[slotId] = n;
}
function writeSlotAscii(slotId, str) {
const n = str.length;
if (n === 0) { S_LEN[slotId] = 0; return; }
ensureStr(n + 16);
const o = strArenaOff; MEGA_BUF.latin1Write(str, o);
strArenaOff = o + n; S_OFF[slotId] = o; S_LEN[slotId] = n;
}
function writeSlotNum(slotId, num) {
if (num >= 0 && num < 10) { S_OFF[slotId] = K_DIGITS + num; S_LEN[slotId] = 1; return; }
writeSlotAscii(slotId, String(num));
}
function allocTagEntry(name, slug, url) {
const escName = escHtmlJsonStr(name);
const id = tagArenaCount++;
ensureTagCap(tagArenaCount);
ensureStr(escName.length * 3 + slug.length + url.length + 16);
const no = strArenaOff, nl = MEGA_BUF.utf8Write(escName, no);
const so = no + nl, sl = MEGA_BUF.latin1Write(slug, so);
const uo = so + sl, ul = url.length > 0 ? MEGA_BUF.latin1Write(url, uo) : 0;
strArenaOff = uo + ul;
TAG_NOFF[id] = no; TAG_NLEN[id] = nl;
TAG_SOFF[id] = so; TAG_SLEN[id] = sl;
TAG_UOFF[id] = uo; TAG_ULEN[id] = ul;
return { id, escName };
}
function invokeFallback(input) {
const rawFiles = input.files;
for (let j = 0; j < rawFiles.length; j++) {
const sf = rawFiles[j];
if (sf.rawQStart !== -1 && sf.content === null) sf.content = JSON.parse(MEGA_BUF.utf8Slice(sf.rawQStart, sf.rawQEnd));
}
const writer = {
byte(b) { if (_outOff >= OUT_END) flushMainOut(); MEGA_U8[_outOff++] = b; },
a(s) { const n = s.length; if (_outOff + n > OUT_END) flushMainOut(); _outOff += MEGA_BUF.latin1Write(s, _outOff); },
ka(s, comma) {
const n = s.length; if (_outOff + n + 5 > OUT_END) flushMainOut();
if (comma) MEGA_U8[_outOff++] = 44;
MEGA_U8[_outOff++] = 34; _outOff += MEGA_BUF.latin1Write(s, _outOff); MEGA_U8[_outOff++] = 34; MEGA_U8[_outOff++] = 58; MEGA_U8[_outOff++] = 34;
},
kidx(dir, comma) {
const n = dir.length; if (_outOff + n + 16 > OUT_END) flushMainOut();
if (comma) MEGA_U8[_outOff++] = 44;
MEGA_U8[_outOff++] = 34; _outOff += MEGA_BUF.latin1Write(dir, _outOff); MEGA_U8.copyWithin(_outOff, K_IDX_SUF, K_IDX_SUF + 14); _outOff += 14;
},
s(str) {
const n = str.length; if (n === 0) return;
const need = n * 3;
if (_outOff + need > OUT_END) { flushMainOut(); if (need > OUT_CAP) { writeSync(_megaFdOut, str); return; } }
_outOff += MEGA_BUF.utf8Write(str, _outOff);
},
j(str) {
const js = JSON_ANY_RE.test(str) ? JSON.stringify(str).slice(1, -1) : str;
const n = js.length; if (n === 0) return;
const need = n * 3;
if (_outOff + need > OUT_END) { flushMainOut(); if (need > OUT_CAP) { writeSync(_megaFdOut, js); return; } }
_outOff += MEGA_BUF.utf8Write(js, _outOff);
},
b(src) {
const n = src.length; if (n === 0) return;
if (_outOff + n > OUT_END) { flushMainOut(); if (n > OUT_CAP) { writeSync(_megaFdOut, src); return; } }
MEGA_U8.set(src, _outOff); _outOff += n;
},
};
return getFallback().run(input, writer, MEGA_U8, MEGA_BUF);
}
const TH_SIZE = 256, TH_MASK = 255;
const TH_GEN = new Int32Array(TH_SIZE);
const TH_OFF = new Int32Array(TH_SIZE);
const TH_LEN = new Int32Array(TH_SIZE);
const TH_TID = new Int32Array(TH_SIZE);
let _thGen = 0;
function runStreamCase(input) {
const rawFiles = input.files;
for (let i = 0; i < rawFiles.length; i++) {
const f = rawFiles[i];
if (f.isMd && f.uOff === -1) return invokeFallback(input);
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
if (fastOk) { const cntMemo = new Map(); for (let i = 0; i < tplNames.length; i++) if (countExpandedNodes(templates, tplNames[i], 0, cntMemo) > 2000) { fastOk = false; break; } }
let base = input.site.base_url, bEnd = base.length;
while (bEnd > 0 && base.charCodeAt(bEnd - 1) === 47) bEnd--;
if (bEnd !== base.length) base = base.slice(0, bEnd);
if (!fastOk || JSON_ASCII_SAFE_TEST.test(base)) return invokeFallback(input);
const maxExpand = base.length <= 40 ? 12 : Math.ceil((base.length + 160) / 4);
const baseSkip = base.length + 1;
rawFiles.sort(cmpFilePath);
const sources = [], statics = [], staticPaths = new Set();
const rawTagsCache = new Map();
for (let i = 0; i < rawFiles.length; i++) {
const f = rawFiles[i], path = f.path;
if (f.isMd) {
let uOff = f.uOff, uLen = f.uLen;
if (f.hasCR) uLen = normalizeCrInPlace(MEGA_U8, uOff, uLen);
const bodyOff = parseFrontMatterU8(MEGA_U8, MEGA_BUF, uOff, uLen, rawTagsCache);
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
const si = sources.length * 24; ensureSrcI32(sources.length + 1);
const a32 = SRC_I32;
a32[si] = bodyOff; a32[si+1] = bodyLen; a32[si+2] = _fmTA; a32[si+3] = _fmTB;
a32[si+4] = _fmSA; a32[si+5] = _fmSB; a32[si+6] = _fmTagA; a32[si+7] = _fmTagB;
a32[si+8] = _fmDateOff; a32[si+11] = -1; a32[si+12] = 0; a32[si+13] = 0; a32[si+14] = 0; a32[si+15] = 1;
a32[si+16] = 0; a32[si+17] = 0; a32[si+18] = 0; a32[si+19] = 0;
sources.push({
si, path, srcDir: dirOf(path), tStr: _fmTStr, sStr: _fmSStr, rawTags: _fmTags, fmSlug: _fmSlug,
dateInt: _fmDateInt, post, layout, vm: null, slug: '', postIdx: -1, savedToc: null, rendered: false,
newer: null, older: null, tagIds: EMPTY_ARR,
});
} else { statics.push(f); staticPaths.add(path); }
}
strArenaOff = STR_BASE_INIT; strEnd = STR_BASE_INIT + 393216;
exArenaOff = EX_BASE_INIT; exEnd = EX_BASE_INIT + 196608;
cardArenaOff = CARD_BASE_INIT; cardEnd = CARD_BASE_INIT + 327680;
savedArenaOff = SAVED_BASE_INIT; savedEnd = SAVED_BASE_INIT + 131072;
tagArenaCount = 0;
const taken = new Map(); taken.set('', new Set(RESERVED));
const bySource = new Map();
const postsPreStr = base + '/posts/';
ensureStr(base.length + postsPreStr.length + 16);
const baseOff = strArenaOff, baseLen = MEGA_BUF.latin1Write(base, baseOff); strArenaOff += baseLen;
const postsPreOff = strArenaOff, postsPreLen = MEGA_BUF.latin1Write(postsPreStr, postsPreOff); strArenaOff += postsPreLen;
const postsDirSet = new Set(); taken.set('posts', postsDirSet);
for (let i = 0; i < sources.length; i++) {
const s = sources[i];
let dirSet;
if (s.post) dirSet = postsDirSet;
else {
const dir = s.srcDir;
if (dir !== '' && JSON_ASCII_SAFE_TEST.test(dir)) return invokeFallback(input);
dirSet = taken.get(dir);
if (dirSet === undefined) { dirSet = new Set(); taken.set(dir, dirSet); }
}
const si = s.si, a32 = SRC_I32, tA = a32[si + 2];
const rawSlug = s.fmSlug !== null ? s.fmSlug : (tA !== -1 ? slugifyU8(tA, a32[si + 3]) : slugify(s.tStr));
const slug = uniqueSlug(rawSlug, dirSet);
s.slug = slug;
const slLen = slug.length;
if (s.post) {
const uLen = postsPreLen + slLen + 1;
ensureStr(uLen);
const uo = strArenaOff;
MEGA_U8.copyWithin(uo, postsPreOff, postsPreOff + postsPreLen);
const slOff = uo + postsPreLen;
MEGA_BUF.latin1Write(slug, slOff);
MEGA_U8[slOff + slLen] = 47;
a32[si + 9] = uo; a32[si + 10] = uLen;
strArenaOff = uo + uLen;
} else {
const dir = s.srcDir;
const uLen = baseLen + 1 + (dir.length > 0 ? dir.length + 1 : 0) + slLen + 1;
ensureStr(uLen);
let cur = strArenaOff;
const uo = cur;
MEGA_U8.copyWithin(cur, baseOff, baseOff + baseLen); cur += baseLen;
MEGA_U8[cur++] = 47;
if (dir.length > 0) { cur += MEGA_BUF.latin1Write(dir, cur); MEGA_U8[cur++] = 47; }
cur += MEGA_BUF.latin1Write(slug, cur);
MEGA_U8[cur++] = 47;
a32[si + 9] = uo; a32[si + 10] = cur - uo;
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
const tagSlugCache = new Map(), bySlug = new Map(), tagCardById = [], tagById = [];
_thGen++;
const gen = _thGen;
let thUsed = 0;
function resolvePostTagBytes(ta, tb) {
const u = MEGA_U8, len = tb - ta;
let h = 2166136261;
for (let k = ta; k < tb; k++) h = Math.imul(h ^ u[k], 16777619);
let idx = h & TH_MASK;
while (TH_GEN[idx] === gen) {
if (TH_LEN[idx] === len) {
const ko = TH_OFF[idx];
let eq = true;
for (let k = 0; k < len; k++) if (u[ko + k] !== u[ta + k]) { eq = false; break; }
if (eq) return TH_TID[idx];
}
idx = (idx + 1) & TH_MASK;
}
const name = MEGA_BUF.latin1Slice(ta, tb);
let sl = tagSlugCache.get(name); if (sl === undefined) { sl = slugify(name); tagSlugCache.set(name, sl); }
let tag = bySlug.get(sl);
if (tag === undefined) {
const url = base + '/tags/' + sl + '/';
const te = allocTagEntry(name, sl, url);
tag = { name, slug: sl, url, id: te.id, $n: te.escName, posts: [] };
tagCardById[te.id] = { name, slug: sl, url };
tagById[te.id] = tag;
bySlug.set(sl, tag);
}
if (thUsed < 192) {
TH_GEN[idx] = gen; TH_OFF[idx] = ta; TH_LEN[idx] = len; TH_TID[idx] = tag.id; thUsed++;
}
return tag.id;
}
for (let i = 0; i < posts.length; i++) {
const p = posts[i];
const psi = p.si, pTagA = SRC_I32[psi + 6];
if (pTagA !== -1) {
const u = MEGA_U8, b = SRC_I32[psi + 7];
const tids = [];
let pos = pTagA;
while (pos <= b) {
let comma = u.indexOf(44, pos);
if (comma === -1 || comma > b) comma = b;
let ta = pos, tb = comma;
while (ta < tb && (u[ta] === 32 || u[ta] === 9)) ta++;
while (tb > ta && (u[tb - 1] === 32 || u[tb - 1] === 9)) tb--;
const tid = resolvePostTagBytes(ta, tb);
let dup = false; for (let q = 0; q < tids.length; q++) if (tids[q] === tid) { dup = true; break; }
if (!dup) { tagById[tid].posts.push(p); tids.push(tid); }
if (comma === b) break;
pos = comma + 1;
}
p.tagIds = tids;
} else if (p.rawTags !== null) {
const rawTags = p.rawTags, tids = [];
for (let j = 0; j < rawTags.length; j++) {
const name = rawTags[j];
let sl = tagSlugCache.get(name); if (sl === undefined) { sl = slugify(name); tagSlugCache.set(name, sl); }
let tag = bySlug.get(sl);
if (tag === undefined) {
const url = base + '/tags/' + sl + '/';
const te = allocTagEntry(name, sl, url);
tag = { name, slug: sl, url, id: te.id, $n: te.escName, posts: [] };
tagCardById[te.id] = { name, slug: sl, url };
tagById[te.id] = tag;
bySlug.set(sl, tag);
}
const tid = tag.id;
let dup = false; for (let q = 0; q < tids.length; q++) if (tids[q] === tid) { dup = true; break; }
if (!dup) { tag.posts.push(p); tids.push(tid); }
}
p.tagIds = tids;
}
}
const orphanTagCache = new Map();
for (let i = 0; i < sources.length; i++) {
const s = sources[i]; if (s.post) continue;
const sTagA = SRC_I32[s.si + 6];
if (sTagA === -1 && s.rawTags === null) continue;
let rawTags = s.rawTags;
if (rawTags === null) {
rawTags = [];
const u = MEGA_U8, b = SRC_I32[s.si + 7];
let pos = sTagA;
while (pos <= b) {
let comma = u.indexOf(44, pos);
if (comma === -1 || comma > b) comma = b;
let ta = pos, tb = comma;
while (ta < tb && (u[ta] === 32 || u[ta] === 9)) ta++;
while (tb > ta && (u[tb - 1] === 32 || u[tb - 1] === 9)) tb--;
rawTags.push(MEGA_BUF.latin1Slice(ta, tb));
if (comma === b) break;
pos = comma + 1;
}
}
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
const si = s.si, a32 = SRC_I32, srcLen = a32[si + 1];
if (srcLen === 0) {
_vmBodyOff = DST_BASE; _vmBodyLen = 0; tocCount = 0; a32[si + 13] = 0; a32[si + 14] = 0;
if (saveCopy) { a32[si + 11] = DST_BASE; a32[si + 12] = 0; s.savedToc = null; }
s.rendered = true; return;
}
const srcStart = a32[si], srcEnd = srcStart + srcLen;
if (anyHasReadingMinutes && srcLen > 399 && (s.post || layoutNeedsReadingMinutes(s.layout, rawTemplates, templates, rmMemo))) {
const words = tf_wcU8(MEGA_U8, srcStart, srcEnd);
a32[si + 15] = words <= 200 ? 1 : Math.ceil(words / 200);
}
ensureDst(srcLen * maxExpand + 131072);
ensureBq(srcLen + 64);
if (HEADING_IDS.size > 0) HEADING_IDS.clear();
_iCtx = linkCtx;
const svEnd = MEGA_U8[srcEnd];
MEGA_U8[srcEnd] = 10;
const htmlLen = renderMarkdownFast(srcStart, srcEnd);
MEGA_U8[srcEnd] = svEnd;
if (_mdExStart !== -1 && _mdExEnd > _mdExStart) {
const exLen = _mdExEnd - _mdExStart;
if (s.post) {
ensureEx(exLen);
const eo = exArenaOff;
MEGA_U8.copyWithin(eo, _mdExStart, _mdExEnd);
exArenaOff = eo + exLen;
a32[si + 13] = eo; a32[si + 14] = exLen;
} else { a32[si + 13] = _mdExStart; a32[si + 14] = exLen; }
} else { a32[si + 13] = 0; a32[si + 14] = 0; }
if (saveCopy) {
ensureSaved(htmlLen);
const so = savedArenaOff;
if (htmlLen > 0) MEGA_U8.copyWithin(so, DST_BASE, DST_BASE + htmlLen);
savedArenaOff = so + htmlLen;
a32[si + 11] = so; a32[si + 12] = htmlLen;
if (tocCount > 0) {
s.savedToc = { n: tocCount, lvl: TOC_LVL.slice(0, tocCount), idOff: TOC_ID_OFF.slice(0, tocCount), idLen: TOC_ID_LEN.slice(0, tocCount), hOff: TOC_HTML_OFF.slice(0, tocCount), hLen: TOC_HTML_LEN.slice(0, tocCount) };
}
} else { _vmBodyOff = DST_BASE; _vmBodyLen = htmlLen; }
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
ensureStr(48);
const dOff = strArenaOff;
MEGA_U8.copyWithin(dOff, dSrcOff, dSrcOff + 10);
const dlOff = dOff + 10, dlLen = MEGA_BUF.latin1Write(dl, dlOff);
strArenaOff = dlOff + dlLen;
da = { dl, dOff, dLen: 10, dlOff, dlLen };
dateArenaCache.set(di, da);
return da;
}
for (let i = 0; i < posts.length; i++) {
const p = posts[i], pi = p.si, a32 = SRC_I32;
const da = getDateArena(p.dateInt, a32[pi + 8]);
a32[pi + 20] = da.dOff; a32[pi + 21] = da.dLen; a32[pi + 22] = da.dlOff; a32[pi + 23] = da.dlLen;
const tA = a32[pi + 2];
if (tA !== -1) {
const tB = a32[pi + 3];
ensureStr((tB - tA) * 6 + 16);
a32[pi + 16] = strArenaOff;
const oEnd = tf_copyCodeU8(tA, tB, strArenaOff);
a32[pi + 17] = oEnd - strArenaOff; strArenaOff = oEnd;
} else {
const tEsc = escHtmlJsonStr(p.tStr);
ensureStr(tEsc.length * 3 + 16);
a32[pi + 16] = strArenaOff; const tl = MEGA_BUF.utf8Write(tEsc, strArenaOff); a32[pi + 17] = tl; strArenaOff += tl;
}
const sA = a32[pi + 4];
if (sA !== -1) {
const sB = a32[pi + 5];
ensureStr((sB - sA) * 6 + 16);
a32[pi + 18] = strArenaOff;
const oEnd = tf_copyCodeU8(sA, sB, strArenaOff);
a32[pi + 19] = oEnd - strArenaOff; strArenaOff = oEnd;
} else if (p.sStr !== null && p.sStr !== '') {
const sEsc = escHtmlJsonStr(p.sStr);
ensureStr(sEsc.length * 3 + 16);
a32[pi + 18] = strArenaOff; const sl = MEGA_BUF.utf8Write(sEsc, strArenaOff); a32[pi + 19] = sl; strArenaOff += sl;
}
}
const site = { title: input.site.title, base_url: base };
const allTags = new Array(tags.length);
for (let i = 0; i < tags.length; i++) { const t = tags[i]; allTags[i] = { name: t.name, slug: t.slug, url: t.url, count: t.posts.length }; }
const recent = new Array(recentCount);
for (let i = 0; i < recentCount; i++) {
const p = posts[i], pi = p.si, a32 = SRC_I32;
const exLen = a32[pi + 14], exOff = a32[pi + 13];
const exStr = exLen > 0 ? JSON.parse('"' + MEGA_BUF.utf8Slice(exOff, exOff + exLen) + '"') : '';
const pTags = new Array(p.tagIds.length);
for (let j = 0; j < p.tagIds.length; j++) pTags[j] = tagCardById[p.tagIds[j]];
const tA = a32[pi + 2], sA = a32[pi + 4];
const titleStr = tA !== -1 ? MEGA_BUF.utf8Slice(tA, a32[pi + 3]) : p.tStr;
const sumStr = sA !== -1 ? MEGA_BUF.utf8Slice(sA, a32[pi + 5]) : (p.sStr !== null ? p.sStr : '');
recent[i] = {
title: titleStr,
url: MEGA_BUF.latin1Slice(a32[pi + 9], a32[pi + 9] + a32[pi + 10]),
date: MEGA_BUF.latin1Slice(a32[pi + 20], a32[pi + 20] + a32[pi + 21]),
date_long: MEGA_BUF.latin1Slice(a32[pi + 22], a32[pi + 22] + a32[pi + 23]),
summary: sumStr, excerpt: exStr, reading_minutes: a32[pi + 15], tags: pTags,
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
if (!allVmOk) return invokeFallback(input);
const builtSnips = new Array(rctx.tagSnips.length);
if (rctx.tagSnips.length > 0 && tagArenaCount > 0) {
const savedMainOff = _outOff;
_outMode = 2;
for (let si = 0; si < rctx.tagSnips.length; si++) {
const snOps = rctx.tagSnips[si];
const offs = new Int32Array(tagArenaCount), lens = new Int32Array(tagArenaCount);
for (let tid = 0; tid < tagArenaCount; tid++) {
loadTagSlots(tid);
ensureStr(1024);
_curChunkStart = strArenaOff; _outOff = strArenaOff; _outEnd = strEnd;
tf_execTpl(snOps, snOps.length);
offs[tid] = _curChunkStart; lens[tid] = _outOff - _curChunkStart; strArenaOff = _outOff;
}
builtSnips[si] = { offs, lens };
}
_outMode = 0; _outOff = savedMainOff; _outEnd = OUT_END;
}
_vmTagSnips = builtSnips;
const needCards = cardVm !== null && posts.length > 0;
const cardOffs = needCards ? new Int32Array(posts.length) : null;
const cardLens = needCards ? new Int32Array(posts.length) : null;
let hasIndexStatic = false;
for (let i = 0; i < statics.length; i++) { const sp = statics[i].path; if (sp === 'index.html' || sp.endsWith('/index.html')) { hasIndexStatic = true; break; } }
const writtenPaths = hasIndexStatic ? new Set() : null;
let firstEntry = true;
_outMode = 0; _outEnd = OUT_END;
if (_outOff >= OUT_END) flushMainOut();
MEGA_U8[_outOff++] = 123;
function beginKey(path) {
if (writtenPaths !== null) writtenPaths.add(path);
const n = path.length; if (_outOff + n + 5 > OUT_END) flushMainOut();
if (!firstEntry) MEGA_U8[_outOff++] = 44; else firstEntry = false;
MEGA_U8[_outOff++] = 34; _outOff += MEGA_BUF.latin1Write(path, _outOff);
MEGA_U8[_outOff++] = 34; MEGA_U8[_outOff++] = 58; MEGA_U8[_outOff++] = 34;
}
for (let i = 0; i < sources.length; i++) {
const s = sources[i], si = s.si, a32 = SRC_I32;
if (!s.rendered) {
renderSourceMd(s, false);
_vmTocBase = DST_BASE; _vmTocCount = tocCount;
} else {
_vmBodyOff = a32[si + 11]; _vmBodyLen = a32[si + 12];
if (s.savedToc !== null) {
const st = s.savedToc; ensureTocCap(st.n);
TOC_LVL.set(st.lvl); TOC_ID_OFF.set(st.idOff); TOC_ID_LEN.set(st.idLen); TOC_HTML_OFF.set(st.hOff); TOC_HTML_LEN.set(st.hLen);
_vmTocBase = a32[si + 11]; _vmTocCount = st.n;
} else _vmTocCount = 0;
}
const urlOff = a32[si + 9], urlLen = a32[si + 10], slLen = s.slug.length;
const slOff = urlOff + urlLen - 1 - slLen;
if (s.post) {
S_OFF[SL_TITLE] = a32[si + 16]; S_LEN[SL_TITLE] = a32[si + 17];
S_OFF[SL_URL] = urlOff; S_LEN[SL_URL] = urlLen;
S_OFF[SL_DATE] = a32[si + 20]; S_LEN[SL_DATE] = a32[si + 21];
S_OFF[SL_DATE_LONG] = a32[si + 22]; S_LEN[SL_DATE_LONG] = a32[si + 23];
S_OFF[SL_SUMMARY] = a32[si + 18]; S_LEN[SL_SUMMARY] = a32[si + 19];
writeSlotNum(SL_RM, a32[si + 15]);
S_OFF[SL_SLUG] = slOff; S_LEN[SL_SLUG] = slLen;
const nw = s.newer;
if (nw !== null) { const ni = nw.si; S_OFF[SL_NEWER_URL] = a32[ni + 9]; S_LEN[SL_NEWER_URL] = a32[ni + 10]; S_OFF[SL_NEWER_TITLE] = a32[ni + 16]; S_LEN[SL_NEWER_TITLE] = a32[ni + 17]; }
else { S_LEN[SL_NEWER_URL] = 0; S_LEN[SL_NEWER_TITLE] = 0; }
const ol = s.older;
if (ol !== null) { const oi = ol.si; S_OFF[SL_OLDER_URL] = a32[oi + 9]; S_LEN[SL_OLDER_URL] = a32[oi + 10]; S_OFF[SL_OLDER_TITLE] = a32[oi + 16]; S_LEN[SL_OLDER_TITLE] = a32[oi + 17]; }
else { S_LEN[SL_OLDER_URL] = 0; S_LEN[SL_OLDER_TITLE] = 0; }
S_OFF[SL_IS_POST] = K_TRUE; S_LEN[SL_IS_POST] = 4;
} else {
const tA = a32[si + 2];
if (tA !== -1) {
const tB = a32[si + 3];
ensureStr((tB - tA) * 6 + 16);
const o0 = strArenaOff, o1 = tf_copyCodeU8(tA, tB, o0);
S_OFF[SL_TITLE] = o0; S_LEN[SL_TITLE] = o1 - o0; strArenaOff = o1;
} else writeSlotStr(SL_TITLE, escHtmlJsonStr(s.tStr));
S_OFF[SL_URL] = urlOff; S_LEN[SL_URL] = urlLen;
if (s.dateInt !== 0) {
const da = getDateArena(s.dateInt, a32[si + 8]);
S_OFF[SL_DATE] = da.dOff; S_LEN[SL_DATE] = da.dLen;
S_OFF[SL_DATE_LONG] = da.dlOff; S_LEN[SL_DATE_LONG] = da.dlLen;
} else { S_LEN[SL_DATE] = 0; S_LEN[SL_DATE_LONG] = 0; }
const sA = a32[si + 4];
if (sA !== -1) {
const sB = a32[si + 5];
ensureStr((sB - sA) * 6 + 16);
const o0 = strArenaOff, o1 = tf_copyCodeU8(sA, sB, o0);
S_OFF[SL_SUMMARY] = o0; S_LEN[SL_SUMMARY] = o1 - o0; strArenaOff = o1;
} else if (s.sStr !== null && s.sStr !== '') writeSlotStr(SL_SUMMARY, escHtmlJsonStr(s.sStr)); else S_LEN[SL_SUMMARY] = 0;
writeSlotNum(SL_RM, a32[si + 15]);
S_OFF[SL_SLUG] = slOff; S_LEN[SL_SLUG] = slLen;
S_LEN[SL_NEWER_URL] = 0; S_LEN[SL_NEWER_TITLE] = 0;
S_LEN[SL_OLDER_URL] = 0; S_LEN[SL_OLDER_TITLE] = 0;
S_OFF[SL_IS_POST] = K_TRUE; S_LEN[SL_IS_POST] = 0;
}
_vmTagIds = s.tagIds; _vmTagCount = s.tagIds.length;
S_LEN[SL_HAS_TAGS] = _vmTagCount;
S_LEN[SL_HAS_TOC] = _vmTocCount;
const exOff = a32[si + 13], exLen = a32[si + 14];
if (s.post) { _vmExOff = exOff; _vmExLen = exLen; }
else if (exLen > 0) { ensureEx(exLen); MEGA_U8.copyWithin(exArenaOff, exOff, exOff + exLen); _vmExOff = exArenaOff; _vmExLen = exLen; exArenaOff += exLen; }
else { _vmExOff = 0; _vmExLen = 0; }
const dLen = urlLen - baseSkip - 1;
if (writtenPaths !== null) writtenPaths.add(MEGA_BUF.latin1Slice(urlOff + baseSkip, urlOff + urlLen - 1) + '/index.html');
if (_outOff + dLen + 16 > OUT_END) flushMainOut();
if (!firstEntry) MEGA_U8[_outOff++] = 44; else firstEntry = false;
MEGA_U8[_outOff++] = 34;
MEGA_U8.copyWithin(_outOff, urlOff + baseSkip, urlOff + urlLen - 1);
_outOff += dLen;
MEGA_U8.copyWithin(_outOff, K_IDX_SUF, K_IDX_SUF + 14);
_outOff += 14;
const vm = s.vm;
tf_execTpl(vm.ops, vm.ops.length);
if (_outOff >= OUT_END) flushMainOut();
MEGA_U8[_outOff++] = 34;
if (needCards && s.post) {
const savedMainOff = _outOff;
ensureCard(4096 + exLen);
_outMode = 1; _curChunkStart = cardArenaOff; _outOff = cardArenaOff; _outEnd = cardEnd;
tf_execTpl(cardVm.ops, cardVm.ops.length);
cardOffs[s.postIdx] = _curChunkStart; cardLens[s.postIdx] = _outOff - _curChunkStart; cardArenaOff = _outOff;
_outMode = 0; _outOff = savedMainOff; _outEnd = OUT_END;
}
s.savedToc = null;
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
tf_execTpl(idxVm.ops, idxVm.ops.length);
if (_outOff >= OUT_END) flushMainOut(); MEGA_U8[_outOff++] = 34;
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
tf_execTpl(tagVm.ops, tagVm.ops.length);
if (_outOff >= OUT_END) flushMainOut(); MEGA_U8[_outOff++] = 34;
}
}
if (tagsVm !== null) {
beginKey('tags/index.html');
tf_execTpl(tagsVm.ops, tagsVm.ops.length);
if (_outOff >= OUT_END) flushMainOut(); MEGA_U8[_outOff++] = 34;
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
if (_outOff + kNeed > OUT_END) flushMainOut();
if (!firstEntry) MEGA_U8[_outOff++] = 44; else firstEntry = false;
_outOff += MEGA_BUF.utf8Write(keyJson, _outOff);
MEGA_U8[_outOff++] = 58;
if (f.rawQStart !== -1 && f.content === null) {
const sLen = f.rawQEnd - f.rawQStart;
if (_outOff + sLen > OUT_END) {
flushMainOut();
if (sLen > OUT_CAP) { writeSync(_megaFdOut, MEGA_U8, f.rawQStart, sLen); continue; }
}
MEGA_U8.copyWithin(_outOff, f.rawQStart, f.rawQEnd); _outOff += sLen;
} else {
const valJson = JSON.stringify(f.content);
const vNeed = valJson.length * 3;
if (_outOff + vNeed > OUT_END) { flushMainOut(); if (vNeed > OUT_CAP) { writeSync(_megaFdOut, valJson); continue; } }
_outOff += MEGA_BUF.utf8Write(valJson, _outOff);
}
}
}
}
for (const bLine of broken) report.push(bLine);
report.sort(byCodeUnits);
report.push('built ' + (sources.length - posts.length) + ' pages, ' + posts.length + ' posts, ' + tags.length + ' tags and ' + statics.length + ' static files');
const repJson = JSON.stringify(report.join('\n') + '\n');
const rNeed = repJson.length * 3 + 24;
if (_outOff + rNeed > OUT_END) flushMainOut();
if (!firstEntry) MEGA_U8[_outOff++] = 44;
_outOff += MEGA_BUF.latin1Write('"build-report.txt":', _outOff);
if (repJson.length * 3 > OUT_END - _outOff) { flushMainOut(); writeSync(_megaFdOut, repJson); }
else _outOff += MEGA_BUF.utf8Write(repJson, _outOff);
if (_outOff >= OUT_END) flushMainOut();
MEGA_U8[_outOff++] = 125;
}
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
if (run > 0) { u.copyWithin(o, i, bs); o += run; i = bs; }
}
}
function skipWs(u, p) { const n = _rawEnd; while (p < n) { const c = u[p]; if (c === 32 || c === 10 || c === 13 || c === 9) p++; else break; } return p; }
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
let e = p, n = _rawEnd;
while (e < n) { const ch = u[e]; if ((ch >= 48 && ch <= 57) || ch === 45 || ch === 46 || ch === 101 || ch === 69 || ch === 43) e++; else break; }
_jp = e; return Number(buf.latin1Slice(p, e));
}
function readFileObj(u, buf, p) {
p++; if (u[p] <= 32) p = skipWs(u, p);
let path = '', str = null, uOff = -1, uLen = 0, hasCR = false, rawQStart = -1, rawQEnd = -1, seenPath = false, isMd = false;
if (u[p] === 125) { _jp = p + 1; return { path, content: '', uOff: -1, uLen: 0, hasCR: false, rawQStart: -1, rawQEnd: -1, isMd: false }; }
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
if (kind === 1) { path = readJsonStr(u, buf, p); p = _jp; seenPath = true; isMd = isMdPath(path); }
else if (kind === 2 && u[p] === 34) {
if (seenPath && !isMd) {
const endQ = findJsonStrEnd(u, p + 1);
rawQStart = p; rawQEnd = endQ + 1; str = null; uOff = -1; p = endQ + 1;
} else {
const start = p + 1; str = null; _jFlags = 0; _jNormCr = seenPath && isMd;
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
if (str === null && rawQStart === -1 && uOff !== -1 && !isMd) { str = buf.utf8Slice(uOff, uOff + uLen); uOff = -1; }
return { path, content: str, uOff, uLen, hasCR, rawQStart, rawQEnd, isMd };
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
const u = MEGA_U8, b = MEGA_BUF;
const sBase = BQ_BASE, dBase = DST_BASE;
const wLen = b.utf8Write('ab cd\u00a0ef \uff21 gh ij kl', sBase);
const mOff = sBase + 64, mLen = b.utf8Write('hi & < > *em* **st** \n\\', mOff);
const uOff = sBase + 128, uStr = 'abc\\n\\n\\"\\tdef"';
const dOps = new Int32Array([0, K_PRE_OPEN, 8, 0, K_PRE_LANG, 24, 1, 0, 0, 5, 0, 12, 5, 64, 15, 7, 18, 0, 2, 0, 0]);
S_OFF[0] = K_TRUE; _vmBodyOff = K_PRE_OPEN; _vmBodyLen = 0;
_outMode = 3; _curChunkStart = dBase;
for (let k = 0; k < 20; k++) {
_outOff = dBase; _outEnd = dBase + ((k & 1) === 0 ? 4 : 128);
S_LEN[0] = (k & 1) === 0 ? 4 : 0;
tf_execTpl(dOps, dOps.length);
tf_wcU8(u, sBase, sBase + wLen);
b.latin1Write(uStr, uOff); _jFlags = 0; _jNormCr = true; tf_unescInPlace(u, uOff);
u[uOff] = 97; u[uOff + 1] = 34; tf_unescInPlace(u, uOff);
tf_copyCodeU8(mOff, mOff + mLen, dBase);
tf_inlineU8(mOff, mOff + mLen, dBase);
tf_scanUrlU8(mOff, mOff + 7);
}
_outMode = 0;
}
function run(input) { return getFallback().run(input); }
function runCli() {
const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const fdIn = openSync(`${inputDir}/cases.json`, 'r');
const fSize = fstatSync(fdIn).size;
initMega(fSize);
warmupCore6();
let rOff = 0;
while (rOff < fSize) {
const got = readSync(fdIn, MEGA_BUF, rOff, fSize - rOff, rOff);
if (got <= 0) break;
rOff += got;
}
closeSync(fdIn);
_megaFdOut = openSync(`${outputDir}/answers.json`, 'w');
_outMode = 0; _outOff = OUT_BASE; _outEnd = OUT_END;
MEGA_U8[_outOff++] = 91;
let p = (fSize >= 3 && MEGA_U8[0] === 0xEF && MEGA_U8[1] === 0xBB && MEGA_U8[2] === 0xBF) ? 3 : 0;
p = skipWs(MEGA_U8, p);
if (p < fSize && MEGA_U8[p] === 91) {
p = skipWs(MEGA_U8, p + 1);
let firstCase = true;
while (p < fSize && MEGA_U8[p] !== 93) {
const inp = readCaseObj(MEGA_U8, MEGA_BUF, p);
p = skipWs(MEGA_U8, _jp);
if (!firstCase) { if (_outOff >= OUT_END) flushMainOut(); MEGA_U8[_outOff++] = 44; }
firstCase = false;
runStreamCase(inp);
if (p < fSize && MEGA_U8[p] === 44) p = skipWs(MEGA_U8, p + 1);
}
}
if (_outOff + 2 > OUT_END) flushMainOut();
MEGA_U8[_outOff++] = 93; MEGA_U8[_outOff++] = 10;
flushMainOut();
closeSync(_megaFdOut);
}
module.exports = { run, runCli };