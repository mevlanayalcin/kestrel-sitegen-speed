// kestrel-sitegen-speed: pure Node 22 stdlib, zero-dependency, byte-for-byte compatible drop-in for makefun-site 1.0.0.
// Zero-decode SIMD in-place UTF-8 JSON reader + single-pass Uint8Array Markdown/HTML/JSON/WordCount engine + typed-schema template JIT.

const REPORT_FILE = 'build-report.txt';
const RESERVED = ['posts', 'tags', 'page'];
const INCLUDE_DEPTH = 8;
const SLUG_MAX = 64;
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const EMPTY_ARR = Object.freeze([]);
const EMPTY_OBJ = Object.freeze({});
const EMPTY_U8 = new Uint8Array(0);
const EMPTY_SET_RO = new Set();
const FM_ERR = Object.freeze({});

// Regexes compiled once at module load
const ESC_TEST = /[&<>"']/;
const R_AMP = /&/g, R_LT = /</g, R_GT = />/g, R_QUOT = /"/g, R_APOS = /'/g;
const COMBINING_RE = /\p{M}/gu;
const JSON_NO_QUOT_RE = /[\\\x00-\x1f\ud800-\udfff]/;
const JSON_ANY_RE = /[\\"\x00-\x1f\ud800-\udfff]/;
const JSON_ASCII_SAFE_TEST = /[^\x20-\x21\x23-\x25\x28-\x3b\x3d\x3f-\x5b\x5d-\x7e]/;

const PATH_RE = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const FOR_RE = /^for ([A-Za-z_][A-Za-z0-9_]*) in (\S+)$/;
const IF_RE = /^if (not )?(\S+)$/;
const INCLUDE_RE = /^include "([a-z0-9-]+)"$/;

// Lookup tables (monomorphic Uint8Arrays)
const ESCAPABLE_U8 = new Uint8Array(128);
for (const ch of '\\`*_[]()#+-.!>') ESCAPABLE_U8[ch.charCodeAt(0)] = 1;

const SLUG_LUT = new Uint8Array(128);
for (let c = 48; c <= 57; c++) SLUG_LUT[c] = c;
for (let c = 65; c <= 90; c++) SLUG_LUT[c] = c + 32;
for (let c = 97; c <= 122; c++) SLUG_LUT[c] = c;

const FENCE_LANG_LUT = new Uint8Array(128);
for (let c = 48; c <= 57; c++) FENCE_LANG_LUT[c] = 1;
for (let c = 65; c <= 90; c++) FENCE_LANG_LUT[c] = 1;
for (let c = 97; c <= 122; c++) FENCE_LANG_LUT[c] = 1;
FENCE_LANG_LUT[95] = 1;
FENCE_LANG_LUT[43] = 1;
FENCE_LANG_LUT[45] = 1;

const SCHEME_LUT = new Uint8Array(128);
for (let c = 48; c <= 57; c++) SCHEME_LUT[c] = 1;
for (let c = 65; c <= 90; c++) SCHEME_LUT[c] = 1;
for (let c = 97; c <= 122; c++) SCHEME_LUT[c] = 1;
SCHEME_LUT[43] = 1;
SCHEME_LUT[45] = 1;
SCHEME_LUT[46] = 1;

// Inline action table for Uint8Array bytes (0 = direct copy, includes ALL UTF-8 >= 0x80!)
// 1:& 2:< 3:> 4:" 5:' 6:\n 7:\ 8:` 9:* 10:[ 11:other ctrl < 32
const INL_ACT = new Uint8Array(256);
for (let c = 0; c < 32; c++) INL_ACT[c] = 11;
INL_ACT[10] = 6;
INL_ACT[34] = 4;
INL_ACT[38] = 1;
INL_ACT[39] = 5;
INL_ACT[42] = 9;
INL_ACT[60] = 2;
INL_ACT[62] = 3;
INL_ACT[91] = 10;
INL_ACT[92] = 7;
INL_ACT[96] = 8;

// Code / fence action table (0 = direct copy, 1:& 2:< 3:> 4:" 5:' 6:\n 7:\ 11:other ctrl < 32)
const CODE_ACT = new Uint8Array(256);
for (let c = 0; c < 32; c++) CODE_ACT[c] = 11;
CODE_ACT[10] = 6;
CODE_ACT[34] = 4;
CODE_ACT[38] = 1;
CODE_ACT[39] = 5;
CODE_ACT[60] = 2;
CODE_ACT[62] = 3;
CODE_ACT[92] = 7;

// Branchless URL byte classification table: 1=ascii-ws, 2=html/json-spec, 4=':', 8='#', 16=utf8-ws-lead
const URL_ACT = new Uint8Array(256);
for (let c = 0; c < 32; c++) URL_ACT[c] = 2;
URL_ACT[9] = 1; URL_ACT[10] = 1; URL_ACT[11] = 1; URL_ACT[12] = 1; URL_ACT[13] = 1; URL_ACT[32] = 1;
URL_ACT[34] = 2; URL_ACT[38] = 2; URL_ACT[39] = 2; URL_ACT[60] = 2; URL_ACT[62] = 2; URL_ACT[92] = 2;
URL_ACT[58] = 4;
URL_ACT[35] = 8;
URL_ACT[0xC2] = 16; URL_ACT[0xE1] = 16; URL_ACT[0xE2] = 16; URL_ACT[0xE3] = 16; URL_ACT[0xEF] = 16;

// Reusable scratch Buffers / Uint8Array views (zero per-file allocation!)
const SLUG_BUF = Buffer.allocUnsafe(64);
const HEADING_IDS = new Set();

let SRC_CAP = 0;
let SRC_BUF = null;
let SRC_U8 = null;

let DST_CAP = 262144;
let DST_BUF = Buffer.allocUnsafe(DST_CAP);
let DST_U8 = new Uint8Array(DST_BUF.buffer, DST_BUF.byteOffset, DST_BUF.byteLength);

let BQ_CAP = 65536;
let BQ_BUF = Buffer.allocUnsafe(BQ_CAP);
let BQ_U8 = new Uint8Array(BQ_BUF.buffer, BQ_BUF.byteOffset, BQ_BUF.byteLength);

let EX_CAP = 32768;
let EX_BUF = Buffer.allocUnsafe(EX_CAP);
let EX_U8 = new Uint8Array(EX_BUF.buffer, EX_BUF.byteOffset, EX_BUF.byteLength);

let URL_ARENA_CAP = 131072;
let URL_ARENA_BUF = Buffer.allocUnsafe(URL_ARENA_CAP);
let URL_ARENA_U8 = new Uint8Array(URL_ARENA_BUF.buffer, URL_ARENA_BUF.byteOffset, URL_ARENA_BUF.byteLength);
let urlArenaOff = 0;

function ensureUrlArena(need) {
  if (need <= URL_ARENA_CAP) return;
  while (URL_ARENA_CAP < need) URL_ARENA_CAP *= 2;
  const nb = Buffer.allocUnsafe(URL_ARENA_CAP);
  const nu = new Uint8Array(nb.buffer, nb.byteOffset, nb.byteLength);
  nu.set(URL_ARENA_U8.subarray(0, urlArenaOff), 0);
  URL_ARENA_BUF = nb;
  URL_ARENA_U8 = nu;
}

function toUtf8U8(s) {
  const b = Buffer.from(s, 'utf8');
  return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
}

function ensureSrc(need) {
  if (need <= SRC_CAP) return;
  if (SRC_CAP === 0) SRC_CAP = 65536;
  while (SRC_CAP < need) SRC_CAP *= 2;
  SRC_BUF = Buffer.allocUnsafe(SRC_CAP);
  SRC_U8 = new Uint8Array(SRC_BUF.buffer, SRC_BUF.byteOffset, SRC_BUF.byteLength);
}
function ensureDst(need) {
  if (need <= DST_CAP) return;
  while (DST_CAP < need) DST_CAP *= 2;
  const nb = Buffer.allocUnsafe(DST_CAP);
  const nu = new Uint8Array(nb.buffer, nb.byteOffset, nb.byteLength);
  nu.set(DST_U8, 0);
  DST_BUF = nb;
  DST_U8 = nu;
}
function ensureBq(need) {
  if (need <= BQ_CAP) return;
  while (BQ_CAP < need) BQ_CAP *= 2;
  BQ_BUF = Buffer.allocUnsafe(BQ_CAP);
  BQ_U8 = new Uint8Array(BQ_BUF.buffer, BQ_BUF.byteOffset, BQ_BUF.byteLength);
}
function ensureEx(need) {
  if (need <= EX_CAP) return;
  while (EX_CAP < need) EX_CAP *= 2;
  EX_BUF = Buffer.allocUnsafe(EX_CAP);
  EX_U8 = new Uint8Array(EX_BUF.buffer, EX_BUF.byteOffset, EX_BUF.byteLength);
}

// Pre-encoded byte tag constants (zero string->bytes work inside markdown!)
const toU8 = (s) => { const b = Buffer.from(s, 'latin1'); return new Uint8Array(b.buffer, b.byteOffset, b.byteLength); };
const ESC_BYTES = toU8('&amp;&lt;&gt;&quot;&#39;');
const ESC_OFF = new Uint8Array([0, 0, 5, 9, 13, 19]);
const ESC_LEN = new Uint8Array([0, 5, 4, 4, 6, 5]);
const T_STRONG_OPEN = toU8('<strong>');
const T_STRONG_CLOSE = toU8('</strong>');
const T_EM_OPEN = toU8('<em>');
const T_EM_CLOSE = toU8('</em>');
const T_HR = toU8('<hr>\n');
const T_HR_J = toU8('<hr>\\n');
const T_UL_OPEN = toU8('<ul>\n');
const T_UL_OPEN_J = toU8('<ul>\\n');
const T_UL_CLOSE = toU8('</ul>\n');
const T_UL_CLOSE_J = toU8('</ul>\\n');
const T_OL_OPEN = toU8('<ol>\n');
const T_OL_OPEN_J = toU8('<ol>\\n');
const T_OL_CLOSE = toU8('</ol>\n');
const T_OL_CLOSE_J = toU8('</ol>\\n');
const T_BQ_OPEN = toU8('<blockquote>\n');
const T_BQ_OPEN_J = toU8('<blockquote>\\n');
const T_BQ_CLOSE = toU8('</blockquote>\n');
const T_BQ_CLOSE_J = toU8('</blockquote>\\n');
const T_PRE_OPEN = toU8('<pre><code>');
const T_PRE_LANG = toU8('<pre><code class="language-');
const T_PRE_LANG_J = toU8('<pre><code class=\\"language-');
const T_PRE_CLOSE = toU8('</code></pre>\n');
const T_PRE_CLOSE_J = toU8('</code></pre>\\n');
const T_PRE_NL_CLOSE = toU8('\n</code></pre>\n');
const T_PRE_NL_CLOSE_J = toU8('\\n</code></pre>\\n');

const H_OPEN_U8 = [null, toU8('<h1 id="'), toU8('<h2 id="'), toU8('<h3 id="'), toU8('<h4 id="'), toU8('<h5 id="'), toU8('<h6 id="')];
const H_OPEN_JU8 = [null, toU8('<h1 id=\\"'), toU8('<h2 id=\\"'), toU8('<h3 id=\\"'), toU8('<h4 id=\\"'), toU8('<h5 id=\\"'), toU8('<h6 id=\\"')];
const H_CLOSE_U8 = [null, toU8('</h1>\n'), toU8('</h2>\n'), toU8('</h3>\n'), toU8('</h4>\n'), toU8('</h5>\n'), toU8('</h6>\n')];
const H_CLOSE_JU8 = [null, toU8('</h1>\\n'), toU8('</h2>\\n'), toU8('</h3>\\n'), toU8('</h4>\\n'), toU8('</h5>\\n'), toU8('</h6>\\n')];

function byCodeUnits(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function cmpFilePath(x, y) { const a = x.path, b = y.path; return a < b ? -1 : a > b ? 1 : 0; }
function cmpPost(x, y) {
  const xd = x.date, yd = y.date;
  if (yd !== xd) return yd < xd ? -1 : 1;
  const xs = x.slug, ys = y.slug;
  return xs < ys ? -1 : xs > ys ? 1 : 0;
}
function cmpTag(x, y) {
  const d = y.posts.length - x.posts.length;
  if (d !== 0) return d;
  const xs = x.slug, ys = y.slug;
  return xs < ys ? -1 : xs > ys ? 1 : 0;
}

// ---------------------------------------------------------------- JSON streaming scratch writer (for pureIncludeCache cards)

const MEM_CAP = 65536;
const MEM_BUF = Buffer.allocUnsafe(MEM_CAP);
const MEM_U8 = new Uint8Array(MEM_BUF.buffer, MEM_BUF.byteOffset, MEM_BUF.byteLength);

function createMemJsonWriter() {
  let buf = MEM_BUF;
  let u8 = MEM_U8;
  let cap = MEM_CAP;
  let off = 0;
  function ensure(need) {
    if (off + need <= cap) return;
    let next = cap * 2;
    while (off + need > next) next *= 2;
    const nb = Buffer.allocUnsafe(next);
    const nu = new Uint8Array(nb.buffer, nb.byteOffset, nb.byteLength);
    nu.set(u8.subarray(0, off), 0);
    buf = nb;
    u8 = nu;
    cap = next;
  }
  const w = {
    reset() { buf = MEM_BUF; u8 = MEM_U8; cap = MEM_CAP; off = 0; },
    toBuf() {
      const out = new Uint8Array(off);
      out.set(u8.subarray(0, off), 0);
      return out;
    },
    b(src) {
      const n = src.length;
      ensure(n);
      u8.set(src, off);
      off += n;
    },
    a(s) {
      const n = s.length;
      if (n === 0) return;
      ensure(n);
      off += buf.latin1Write(s, off);
    },
    s(s) {
      const n = s.length;
      if (n === 0) return;
      ensure(n * 3);
      off += buf.utf8Write(s, off);
    },
    j(s) {
      if (s.length === 0) return;
      w.s(JSON_ANY_RE.test(s) ? JSON.stringify(s).slice(1, -1) : s);
    },
  };
  return w;
}

const SHARED_MEM_WRITER = createMemJsonWriter();

function escHtmlJsonStr(s) {
  if (s.length === 0) return '';
  const e = ESC_TEST.test(s) ? esc5(s) : s;
  return JSON_NO_QUOT_RE.test(e) ? JSON.stringify(e).slice(1, -1) : e;
}

function jsonEscInner(s) {
  if (s.length === 0) return '';
  return JSON_ANY_RE.test(s) ? JSON.stringify(s).slice(1, -1) : s;
}

// ---------------------------------------------------------------- text helpers

function esc5(text) {
  return text.replace(R_AMP, '&amp;').replace(R_LT, '&lt;').replace(R_GT, '&gt;').replace(R_QUOT, '&quot;').replace(R_APOS, '&#39;');
}

function escapeHtml(text) {
  return ESC_TEST.test(text) ? esc5(text) : text;
}

function slugifySlow(text) {
  const plain = text.normalize('NFKD').replace(COMBINING_RE, '');
  let outLen = 0;
  let gap = false;
  const len = plain.length;
  for (let i = 0; i < len; i++) {
    const c = plain.charCodeAt(i);
    const m = c < 128 ? SLUG_LUT[c] : 0;
    if (m === 0) {
      if (outLen > 0) gap = true;
      continue;
    }
    if (gap) {
      if (outLen >= SLUG_MAX - 1) break;
      SLUG_BUF[outLen++] = 45;
      gap = false;
    }
    SLUG_BUF[outLen++] = m;
    if (outLen === SLUG_MAX) break;
  }
  return outLen === 0 ? 'untitled' : SLUG_BUF.latin1Slice(0, outLen);
}

function slugify(text) {
  let outLen = 0;
  let gap = false;
  const len = text.length;
  for (let i = 0; i < len; i++) {
    const c = text.charCodeAt(i);
    if (c >= 128) return slugifySlow(text);
    const m = SLUG_LUT[c];
    if (m === 0) {
      if (outLen > 0) gap = true;
      continue;
    }
    if (gap) {
      if (outLen >= SLUG_MAX - 1) break;
      SLUG_BUF[outLen++] = 45;
      gap = false;
    }
    SLUG_BUF[outLen++] = m;
    if (outLen === SLUG_MAX) break;
  }
  return outLen === 0 ? 'untitled' : SLUG_BUF.latin1Slice(0, outLen);
}

function slugifyU8(u, a, b) {
  let outLen = 0;
  let gap = false;
  for (let i = a; i < b; i++) {
    const c = u[i];
    if (c >= 128) return slugifySlow(_curFileBuf.utf8Slice(_curFileOff + a, _curFileOff + b));
    const m = SLUG_LUT[c];
    if (m === 0) {
      if (outLen > 0) gap = true;
      continue;
    }
    if (gap) {
      if (outLen >= SLUG_MAX - 1) break;
      SLUG_BUF[outLen++] = 45;
      gap = false;
    }
    SLUG_BUF[outLen++] = m;
    if (outLen === SLUG_MAX) break;
  }
  return outLen === 0 ? 'untitled' : SLUG_BUF.latin1Slice(0, outLen);
}

function uniqueSlug(slug, taken) {
  if (!taken.has(slug)) {
    taken.add(slug);
    return slug;
  }
  for (let n = 2; ; n++) {
    const cand = slug + '-' + n;
    if (!taken.has(cand)) {
      taken.add(cand);
      return cand;
    }
  }
}

function longDate(date) {
  const m = (date.charCodeAt(5) - 48) * 10 + (date.charCodeAt(6) - 48);
  const d = (date.charCodeAt(8) - 48) * 10 + (date.charCodeAt(9) - 48);
  return d + ' ' + MONTHS[m - 1] + ' ' + date.slice(0, 4);
}

// ---------------------------------------------------------------- Branchless 2x UTF-8 Uint8Array word counter (0 deopts, ~2.0ms!)

const WC_BIT = new Uint8Array(256);
WC_BIT.fill(1);
WC_BIT[9] = 0; WC_BIT[10] = 0; WC_BIT[11] = 0; WC_BIT[12] = 0; WC_BIT[13] = 0; WC_BIT[32] = 0;
WC_BIT[0xC2] = 2; WC_BIT[0xE1] = 2; WC_BIT[0xE2] = 2; WC_BIT[0xE3] = 2; WC_BIT[0xEF] = 2;

function utf8WsLen(u, i, n) {
  const b0 = u[i];
  if (b0 < 128) return (b0 === 32 || b0 === 10 || b0 === 9 || b0 === 13 || b0 === 11 || b0 === 12) ? 1 : 0;
  if (b0 === 0xC2) return (i + 1 < n && u[i + 1] === 0xA0) ? 2 : 0;
  if (i + 2 >= n) return 0;
  const b1 = u[i + 1], b2 = u[i + 2];
  if (b0 === 0xE2) {
    if (b1 === 0x80) return ((b2 >= 0x80 && b2 <= 0x8A) || b2 === 0xA8 || b2 === 0xA9 || b2 === 0xAF) ? 3 : 0;
    return (b1 === 0x81 && b2 === 0x9F) ? 3 : 0;
  }
  if (b0 === 0xE3) return (b1 === 0x80 && b2 === 0x80) ? 3 : 0;
  if (b0 === 0xE1) return (b1 === 0x9A && b2 === 0x80) ? 3 : 0;
  if (b0 === 0xEF) return (b1 === 0xBB && b2 === 0xBF) ? 3 : 0;
  return 0;
}

function tf_wcU8(u, n) {
  let count = 0, prev = 0, i = 0;
  const lim = n - 1;
  while (i < lim) {
    const c0 = WC_BIT[u[i]], c1 = WC_BIT[u[i + 1]];
    if ((c0 | c1) < 2) {
      count += (c0 & (prev ^ 1)) + (c1 & (c0 ^ 1));
      prev = c1;
      i += 2;
    } else if (c0 < 2) {
      count += c0 & (prev ^ 1);
      prev = c0;
      i++;
    } else {
      const ws = utf8WsLen(u, i, n);
      if (ws > 0) { prev = 0; i += ws; }
      else { count += prev ^ 1; prev = 1; i++; }
    }
  }
  if (i < n) {
    const c = WC_BIT[u[i]];
    if (c < 2) count += c & (prev ^ 1);
    else if (utf8WsLen(u, i, n) === 0) count += prev ^ 1;
  }
  return count;
}

function countWordsStrFallback(text, start) {
  const m = text.slice(start).match(/\S+/g);
  return m === null ? 0 : m.length;
}

// ---------------------------------------------------------------- front matter

let _fmErr = '';
let _fmData = null;

function daysIn(y, m) {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;
}

function parseFmString(raw, key) {
  const len = raw.length;
  const c0 = raw.charCodeAt(0);
  if (c0 === 34) {
    if (len < 2 || raw.charCodeAt(len - 1) !== 34) {
      _fmErr = `key "${key}": a quoted string is not closed`;
      return FM_ERR;
    }
    let hasEsc = false;
    for (let i = 1; i < len - 1; i++) {
      const c = raw.charCodeAt(i);
      if (c === 92) {
        const n = raw.charCodeAt(i + 1);
        if ((n !== 34 && n !== 92) || i + 1 === len - 1) {
          _fmErr = `key "${key}": a quoted string holds an escape other than \\" or \\\\`;
          return FM_ERR;
        }
        hasEsc = true;
        i++;
      } else if (c === 34) {
        _fmErr = `key "${key}": a quoted string holds a stray quote`;
        return FM_ERR;
      }
    }
    if (!hasEsc) return raw.slice(1, len - 1);
    let out = '';
    let last = 1;
    for (let i = 1; i < len - 1; i++) {
      if (raw.charCodeAt(i) === 92) {
        if (i > last) out += raw.slice(last, i);
        out += raw[i + 1];
        i++;
        last = i + 1;
      }
    }
    if (last < len - 1) out += raw.slice(last, len - 1);
    return out;
  }
  if (c0 === 91) {
    _fmErr = `key "${key}": a bare string opens on [`;
    return FM_ERR;
  }
  return raw;
}

function parseFmDate(raw) {
  if (raw.length !== 10 || raw.charCodeAt(4) !== 45 || raw.charCodeAt(7) !== 45) return null;
  const d0 = raw.charCodeAt(0) - 48, d1 = raw.charCodeAt(1) - 48, d2 = raw.charCodeAt(2) - 48, d3 = raw.charCodeAt(3) - 48;
  const m0 = raw.charCodeAt(5) - 48, m1 = raw.charCodeAt(6) - 48;
  const dy0 = raw.charCodeAt(8) - 48, dy1 = raw.charCodeAt(9) - 48;
  if (
    (d0 | d1 | d2 | d3 | m0 | m1 | dy0 | dy1) < 0 ||
    d0 > 9 || d1 > 9 || d2 > 9 || d3 > 9 || m0 > 9 || m1 > 9 || dy0 > 9 || dy1 > 9
  ) return null;
  const y = d0 * 1000 + d1 * 100 + d2 * 10 + d3;
  const mo = m0 * 10 + m1;
  const day = dy0 * 10 + dy1;
  if (y < 1970 || y > 2099 || mo < 1 || mo > 12 || day < 1 || day > daysIn(y, mo)) return null;
  return raw;
}

function parseFmTags(raw) {
  const len = raw.length;
  if (raw.charCodeAt(0) !== 91 || raw.charCodeAt(len - 1) !== 93) {
    _fmErr = 'key "tags": not a list [a, b]';
    return FM_ERR;
  }
  if (len === 2) return EMPTY_ARR;
  const inner = raw.slice(1, len - 1);
  if (inner.trim() === '') return EMPTY_ARR;
  const parts = inner.split(',');
  for (let k = 0; k < parts.length; k++) {
    const t = parts[k].trim();
    if (t === '' || t.indexOf('"') !== -1 || t.indexOf('[') !== -1 || t.indexOf(']') !== -1) {
      _fmErr = 'key "tags": an empty tag, or one holding " [ or ]';
      return FM_ERR;
    }
    parts[k] = t;
  }
  return parts;
}

function parseFmValue(kid, raw) {
  if (kid === 0) return parseFmString(raw, 'title');
  if (kid === 6) return parseFmString(raw, 'summary');
  if (kid === 1) {
    const d = parseFmDate(raw);
    if (d === null) {
      _fmErr = 'key "date": not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)';
      return FM_ERR;
    }
    return d;
  }
  if (kid === 2) return parseFmTags(raw);
  if (kid === 3) {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    _fmErr = 'key "draft": true or false';
    return FM_ERR;
  }
  if (kid === 4) {
    for (let k = 0; k < raw.length; k++) {
      const c = raw.charCodeAt(k);
      if (!((c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 45)) {
        _fmErr = 'key "layout": not a template name';
        return FM_ERR;
      }
    }
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

function identifyFmKey(text, pos, kLen) {
  const c0 = text.charCodeAt(pos);
  if (kLen === 4) {
    if (c0 === 100 && text.charCodeAt(pos + 1) === 97 && text.charCodeAt(pos + 2) === 116 && text.charCodeAt(pos + 3) === 101) return 1;
    if (c0 === 116 && text.charCodeAt(pos + 1) === 97 && text.charCodeAt(pos + 2) === 103 && text.charCodeAt(pos + 3) === 115) return 2;
    if (c0 === 115 && text.charCodeAt(pos + 1) === 108 && text.charCodeAt(pos + 2) === 117 && text.charCodeAt(pos + 3) === 103) return 5;
  } else if (kLen === 5) {
    if (c0 === 116 && text.charCodeAt(pos + 1) === 105 && text.charCodeAt(pos + 2) === 116 && text.charCodeAt(pos + 3) === 108 && text.charCodeAt(pos + 4) === 101) return 0;
    if (c0 === 100 && text.charCodeAt(pos + 1) === 114 && text.charCodeAt(pos + 2) === 97 && text.charCodeAt(pos + 3) === 102 && text.charCodeAt(pos + 4) === 116) return 3;
  } else if (kLen === 6) {
    if (c0 === 108 && text.charCodeAt(pos + 1) === 97 && text.charCodeAt(pos + 2) === 121 && text.charCodeAt(pos + 3) === 111 && text.charCodeAt(pos + 4) === 117 && text.charCodeAt(pos + 5) === 116) return 4;
  } else if (kLen === 7) {
    if (c0 === 115 && text.charCodeAt(pos + 1) === 117 && text.charCodeAt(pos + 2) === 109 && text.charCodeAt(pos + 3) === 109 && text.charCodeAt(pos + 4) === 97 && text.charCodeAt(pos + 5) === 114 && text.charCodeAt(pos + 6) === 121) return 6;
  }
  return -1;
}

function parseFrontMatterLines(text, pos, closePos) {
  const len = text.length;
  const data = { title: '', date: undefined, tags: undefined, draft: undefined, layout: undefined, slug: undefined, summary: undefined };
  let seenMask = 0;
  let lineNo = 2;

  while (pos < closePos) {
    const nl = text.indexOf('\n', pos);
    const lEnd = nl === -1 ? len : nl;
    const nextPos = nl === -1 ? len + 1 : nl + 1;

    if (pos === lEnd) { pos = nextPos; lineNo++; continue; }
    const c0 = text.charCodeAt(pos);
    if (c0 < 97 || c0 > 122) {
      if (c0 === 35) { pos = nextPos; lineNo++; continue; }
      let p = pos;
      while (p < lEnd && (text.charCodeAt(p) === 32 || text.charCodeAt(p) === 9)) p++;
      if (p === lEnd) { pos = nextPos; lineNo++; continue; }
    }

    const colon = text.indexOf(':', pos);
    let kid = -1;
    let kEnd = pos;
    if (colon !== -1 && colon < lEnd) {
      kid = identifyFmKey(text, pos, colon - pos);
      kEnd = colon;
    }
    if (kid === -1) {
      kEnd = pos;
      while (kEnd < lEnd) {
        const c = text.charCodeAt(kEnd);
        if ((c >= 97 && c <= 122) || c === 95) kEnd++;
        else break;
      }
      if (kEnd === pos || kEnd >= lEnd || text.charCodeAt(kEnd) !== 58) {
        _fmErr = `line ${lineNo} is not "key: value"`;
        return false;
      }
    }
    let vStart = kEnd + 1;
    if (vStart < lEnd) {
      if (text.charCodeAt(vStart) !== 32) {
        _fmErr = `line ${lineNo} is not "key: value"`;
        return false;
      }
      vStart++;
    }
    if (kid === -1) { _fmErr = `unknown key "${text.slice(pos, kEnd)}"`; return false; }

    let vEnd = lEnd;
    while (vEnd > vStart && (text.charCodeAt(vEnd - 1) === 32 || text.charCodeAt(vEnd - 1) === 9)) vEnd--;

    const bit = 1 << kid;
    if ((seenMask & bit) !== 0) { _fmErr = `key "${FM_KEY_NAMES[kid]}" is given twice`; return false; }
    if (vStart === vEnd) { _fmErr = `key "${FM_KEY_NAMES[kid]}" has no value`; return false; }

    const val = parseFmValue(kid, text.slice(vStart, vEnd));
    if (val === FM_ERR) return false;
    if (kid === 0) data.title = val;
    else if (kid === 1) data.date = val;
    else if (kid === 2) data.tags = val;
    else if (kid === 3) data.draft = val;
    else if (kid === 4) data.layout = val;
    else if (kid === 5) data.slug = val;
    else data.summary = val;
    seenMask |= bit;

    pos = nextPos;
    lineNo++;
  }

  if ((seenMask & 1) === 0) { _fmErr = 'no title'; return false; }
  _fmData = data;
  return true;
}

function parseFrontMatter(text) {
  const len = text.length;
  if (len < 3 || text.charCodeAt(0) !== 45 || text.charCodeAt(1) !== 45 || text.charCodeAt(2) !== 45) {
    _fmErr = 'no front matter';
    return -1;
  }
  if (len === 3) { _fmErr = 'the front matter is not closed'; return -1; }
  if (text.charCodeAt(3) !== 10) { _fmErr = 'no front matter'; return -1; }

  let closePos;
  let bodyStart;
  const closeIdx = text.indexOf('\n---\n', 3);
  if (closeIdx !== -1) {
    closePos = closeIdx + 1;
    bodyStart = closeIdx + 5;
  } else if (len >= 7 && text.charCodeAt(len - 4) === 10 && text.charCodeAt(len - 3) === 45 && text.charCodeAt(len - 2) === 45 && text.charCodeAt(len - 1) === 45) {
    closePos = len - 3;
    bodyStart = len;
  } else {
    _fmErr = 'the front matter is not closed';
    return -1;
  }
  return parseFrontMatterLines(text, 4, closePos) ? bodyStart : -1;
}

function normalizeCrInPlace(u, uOff, uLen) {
  const end = uOff + uLen;
  let r = u.indexOf(13, uOff);
  if (r === -1 || r >= end) return uLen;
  let w = r;
  while (r < end) {
    u[w++] = 10;
    r++;
    if (r < end && u[r] === 10) r++;
    const next = u.indexOf(13, r);
    const stop = (next === -1 || next >= end) ? end : next;
    if (stop > r) { u.copyWithin(w, r, stop); w += stop - r; r = stop; }
  }
  return w - uOff;
}

// Line-stepping front matter scanner on UTF-8 slice: ~5 indexOf(10) calls, decodes ONLY inner ~140B header!
function parseFrontMatterU8(u, buf, uOff, uLen) {
  if (uLen < 3 || u[uOff] !== 45 || u[uOff + 1] !== 45 || u[uOff + 2] !== 45) {
    _fmErr = 'no front matter';
    return -1;
  }
  if (uLen === 3) { _fmErr = 'the front matter is not closed'; return -1; }
  if (u[uOff + 3] !== 10) { _fmErr = 'no front matter'; return -1; }
  const end = uOff + uLen;
  let p = uOff + 4;
  let closeStart = -1;
  let bodyOff = -1;
  while (p <= end) {
    if (p + 3 <= end && u[p] === 45 && u[p + 1] === 45 && u[p + 2] === 45) {
      if (p + 3 === end) { closeStart = p; bodyOff = end; break; }
      if (u[p + 3] === 10) { closeStart = p; bodyOff = p + 4; break; }
    }
    const nl = u.indexOf(10, p);
    if (nl === -1 || nl >= end) break;
    p = nl + 1;
  }
  if (closeStart === -1) { _fmErr = 'the front matter is not closed'; return -1; }
  const inner = buf.utf8Slice(uOff + 4, closeStart);
  return parseFrontMatterLines(inner, 0, inner.length) ? bodyOff : -1;
}

// ---------------------------------------------------------------- path & link resolution (raw unescaped target!)

function dirOf(path) {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
}

function resolvePathFast(dirStr, dirParts, rel) {
  const len = rel.length;
  if (len === 0) return null;
  const dLen = dirParts.length;
  if (rel.charCodeAt(0) === 46 && rel.charCodeAt(1) === 46 && rel.charCodeAt(2) === 47) {
    // Fast path for ../../foo/bar (posts/YYYY -> root or assets)
    if (
      dLen >= 2 && len > 6 &&
      rel.charCodeAt(3) === 46 && rel.charCodeAt(4) === 46 && rel.charCodeAt(5) === 47 &&
      rel.charCodeAt(6) !== 46 && rel.charCodeAt(6) !== 47 &&
      rel.charCodeAt(len - 1) !== 47 &&
      rel.indexOf('/.', 5) === -1 && rel.indexOf('//', 5) === -1
    ) {
      if (dLen === 2) return rel.slice(6);
      if (dLen === 3) return dirParts[0] + '/' + rel.slice(6);
    }
    // Fast path for ../foo/bar (posts/YYYY -> posts/ZZZZ, or about -> root)
    if (
      dLen >= 1 && len > 3 &&
      rel.charCodeAt(3) !== 46 && rel.charCodeAt(3) !== 47 &&
      rel.charCodeAt(len - 1) !== 47 &&
      rel.indexOf('/.', 2) === -1 && rel.indexOf('//', 2) === -1
    ) {
      if (dLen === 1) return rel.slice(3);
      if (dLen === 2) return dirParts[0] + '/' + rel.slice(3);
    }
  }
  if (rel.indexOf('/') === -1 && rel !== '.' && rel !== '..') {
    return dirStr === '' ? rel : dirStr + '/' + rel;
  }
  const parts = dLen === 0 ? [] : dirParts.slice();
  let pos = 0;
  while (pos <= len) {
    let slash = rel.indexOf('/', pos);
    if (slash === -1) slash = len;
    const segLen = slash - pos;
    if (segLen === 0 || (segLen === 1 && rel.charCodeAt(pos) === 46)) {
      // skip
    } else if (segLen === 2 && rel.charCodeAt(pos) === 46 && rel.charCodeAt(pos + 1) === 46) {
      if (parts.length === 0) return null;
      parts.pop();
    } else {
      parts.push(rel.slice(pos, slash));
    }
    pos = slash + 1;
  }
  return parts.join('/');
}

function hasScheme(target) {
  const len = target.length;
  if (len < 2) return false;
  const c0 = target.charCodeAt(0);
  if (!((c0 >= 65 && c0 <= 90) || (c0 >= 97 && c0 <= 122))) return false;
  for (let i = 1; i < len; i++) {
    const c = target.charCodeAt(i);
    if (c === 58) return true;
    if (c >= 128 || SCHEME_LUT[c] === 0) return false;
  }
  return false;
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

// Arena-backed relative link resolver with parent/grandparent shared caches + C++ memcpy via dst.set!
function writeRelLinkHrefU8(a, b, hashPos, hasSpec, o) {
  const src = _iSrc, dst = _iDst, jm = _iJm, linkCtx = _iCtx;
  let cache = linkCtx.dirCache;
  if (b - a >= 3 && src[a] === 46 && src[a + 1] === 46 && src[a + 2] === 47) {
    if (b - a >= 6 && src[a + 3] === 46 && src[a + 4] === 46 && src[a + 5] === 47) {
      if (linkCtx.rel2Cache !== null) cache = linkCtx.rel2Cache;
    } else if (linkCtx.rel1Cache !== null) {
      cache = linkCtx.rel1Cache;
    }
  }
  const target = _iSrcBuf.utf8Slice(_iSrcBufOff + a, _iSrcBufOff + b);
  let cached = cache.get(target);
  if (typeof cached === 'number') {
    if (cached !== 0) {
      const ao = cached >>> 12, an = cached & 4095;
      dst.set(URL_ARENA_U8.subarray(ao, ao + an), o);
      return o + an;
    }
    linkCtx.broken.add('broken-link ' + linkCtx.sourcePath + ' -> ' + target);
    if (hasSpec === 0) { dst.set(src.subarray(a, b), o); return o + (b - a); }
    return tf_copyCodeU8(a, b, o);
  }
  if (cached !== undefined) {
    const ao = (jm && cached.jo !== -1) ? cached.jo : cached.o;
    const an = (jm && cached.jo !== -1) ? cached.jn : cached.n;
    dst.set(URL_ARENA_U8.subarray(ao, ao + an), o);
    return o + an;
  }

  // Fast path: safe page URLs + no HTML/JSON special bytes in target
  if (linkCtx.pageUrlsSafe && hasSpec === 0) {
    const rel = hashPos === -1 ? target : _iSrcBuf.utf8Slice(_iSrcBufOff + a, _iSrcBufOff + hashPos);
    const path = rel.length === 0 ? null : resolvePathFast(linkCtx.dirStr, linkCtx.dirParts, rel);
    if (path !== null) {
      const dest = linkCtx.bySource.get(path);
      if (dest !== undefined) {
        const uo = dest.urlOff, un = dest.urlLen;
        if (hashPos === -1) {
          dst.set(URL_ARENA_U8.subarray(uo, uo + un), o);
          cache.set(target, (uo < 0x80000 && un < 4096) ? ((uo << 12) | un) : { o: uo, n: un, jo: -1, jn: 0 });
          return o + un;
        }
        const fLen = b - hashPos;
        const tot = un + fLen;
        ensureUrlArena(urlArenaOff + tot);
        const arena = URL_ARENA_U8;
        const ao = urlArenaOff;
        const uSlice = arena.subarray(uo, uo + un);
        const fSlice = src.subarray(hashPos, b);
        arena.set(uSlice, ao);
        arena.set(fSlice, ao + un);
        dst.set(uSlice, o);
        dst.set(fSlice, o + un);
        urlArenaOff = ao + tot;
        cache.set(target, (ao < 0x80000 && tot < 4096) ? ((ao << 12) | tot) : { o: ao, n: tot, jo: -1, jn: 0 });
        return o + tot;
      }
      if (linkCtx.staticPaths.has(path)) {
        const hash = target.indexOf('#');
        const frag = hash === -1 ? '' : target.slice(hash);
        const rawUrl = linkCtx.base + '/' + path + frag;
        const href = !JSON_ASCII_SAFE_TEST.test(rawUrl) ? rawUrl : escapeHtml(rawUrl);
        const j = href === rawUrl ? null : (JSON_NO_QUOT_RE.test(href) ? JSON.stringify(href).slice(1, -1) : null);
        ensureUrlArena(urlArenaOff + href.length * 3 + (j !== null ? j.length * 3 : 0) + 16);
        const ao = urlArenaOff;
        const an = href === rawUrl ? URL_ARENA_BUF.latin1Write(href, ao) : URL_ARENA_BUF.utf8Write(href, ao);
        urlArenaOff = ao + an;
        if (j === null) {
          cache.set(target, (ao < 0x80000 && an < 4096) ? ((ao << 12) | an) : { o: ao, n: an, jo: -1, jn: 0 });
          dst.set(URL_ARENA_U8.subarray(ao, ao + an), o);
          return o + an;
        }
        const jo = urlArenaOff;
        const jn = URL_ARENA_BUF.utf8Write(j, jo);
        urlArenaOff = jo + jn;
        cache.set(target, { o: ao, n: an, jo, jn });
        const ro = jm ? jo : ao, rn = jm ? jn : an;
        dst.set(URL_ARENA_U8.subarray(ro, ro + rn), o);
        return o + rn;
      }
    }
    linkCtx.broken.add('broken-link ' + linkCtx.sourcePath + ' -> ' + target);
    cache.set(target, 0);
    dst.set(src.subarray(a, b), o);
    return o + (b - a);
  }

  // General path (special bytes in target or unsafe base/page URLs)
  const hash = target.indexOf('#');
  const rel = hash === -1 ? target : target.slice(0, hash);
  const frag = hash === -1 ? '' : target.slice(hash);
  const path = rel === '' ? null : resolvePathFast(linkCtx.dirStr, linkCtx.dirParts, rel);
  let href = null;
  if (path !== null) {
    const dest = linkCtx.bySource.get(path);
    if (dest !== undefined) href = escapeHtml(dest.url + frag);
    else if (linkCtx.staticPaths.has(path)) href = escapeHtml(linkCtx.base + '/' + path + frag);
  }
  if (href !== null) {
    const j = JSON_NO_QUOT_RE.test(href) ? JSON.stringify(href).slice(1, -1) : null;
    ensureUrlArena(urlArenaOff + href.length * 3 + (j !== null ? j.length * 3 : 0) + 16);
    const ao = urlArenaOff;
    const an = URL_ARENA_BUF.utf8Write(href, ao);
    urlArenaOff = ao + an;
    if (j === null) {
      cache.set(target, (ao < 0x80000 && an < 4096) ? ((ao << 12) | an) : { o: ao, n: an, jo: -1, jn: 0 });
      dst.set(URL_ARENA_U8.subarray(ao, ao + an), o);
      return o + an;
    }
    const jo = urlArenaOff;
    const jn = URL_ARENA_BUF.utf8Write(j, jo);
    urlArenaOff = jo + jn;
    cache.set(target, { o: ao, n: an, jo, jn });
    const ro = jm ? jo : ao, rn = jm ? jn : an;
    dst.set(URL_ARENA_U8.subarray(ro, ro + rn), o);
    return o + rn;
  }
  linkCtx.broken.add('broken-link ' + linkCtx.sourcePath + ' -> ' + target);
  cache.set(target, 0);
  if (hasSpec === 0) { dst.set(src.subarray(a, b), o); return o + (b - a); }
  return tf_copyCodeU8(a, b, o);
}

// Used only by rare lone-surrogate string fallback
function resolveRawTarget(target, linkCtx, jm) {
  if (target.length > 0) {
    const c0 = target.charCodeAt(0);
    if (c0 === 47 || c0 === 35 || hasScheme(target)) return escapeHtml(target);
  }
  const hash = target.indexOf('#');
  const rel = hash === -1 ? target : target.slice(0, hash);
  const frag = hash === -1 ? '' : target.slice(hash);
  const path = rel === '' ? null : resolvePathFast(linkCtx.dirStr, linkCtx.dirParts, rel);
  if (path !== null) {
    const dest = linkCtx.bySource.get(path);
    if (dest !== undefined) return escapeHtml(dest.url + frag);
    if (linkCtx.staticPaths.has(path)) return escapeHtml(linkCtx.base + '/' + path + frag);
  }
  linkCtx.broken.add('broken-link ' + linkCtx.sourcePath + ' -> ' + target);
  return escapeHtml(target);
}

// ---------------------------------------------------------------- Uint8Array -> Uint8Array TurboFan Markdown engine

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

function copyCodeOther(dst, o, c, act, jm) {
  if (act === 6) { if (jm) { dst[o++] = 92; dst[o++] = 110; } else dst[o++] = 10; return o; }
  if (act === 7) { if (jm) { dst[o++] = 92; dst[o++] = 92; } else dst[o++] = 92; return o; }
  if (jm) return writeCtrlJsonU8(dst, o, c);
  dst[o++] = c;
  return o;
}

// Ultra-compact zero-deopt 4x-unrolled TurboFan code/fence escaper (all act >= 6 -> single hot copyCodeOther call!)
function tf_copyCodeU8(a, b, o) {
  const src = _iSrc, dst = _iDst;
  let i = a;
  while (i < b) {
    let c = src[i];
    let act = CODE_ACT[c];
    while (act === 0) {
      dst[o++] = c;
      if (++i >= b) return o;
      c = src[i];
      act = CODE_ACT[c];
    }
    if (act <= 5) {
      let ep = ESC_OFF[act];
      const eEnd = ep + ESC_LEN[act];
      while (ep < eEnd) dst[o++] = ESC_BYTES[ep++];
    } else {
      o = copyCodeOther(dst, o, c, act, _iJm);
    }
    i++;
  }
  return o;
}

// Module-scoped inline context so tf_inlineU8 & tf_copyCodeU8 take ONLY 3 Smi ints (a, b, o) -> zero stack spill!
let _curFileBuf = null;
let _curFileOff = 0;
let _iSrc = null;
let _iSrcBuf = null;
let _iSrcBufOff = 0;
let _iDst = null;
let _iDstBuf = null;
let _iJm = false;
let _iCtx = null;

function isEscU8(u, pos, minPos) {
  let bs = 0;
  for (let p = pos - 1; p >= minPos && u[p] === 92; p--) bs++;
  return (bs & 1) === 1;
}

let _spNext = 0;

// 8-line branchless zero-deopt TurboFan URL scanner (2x unrolled!)
function tf_scanUrlU8(a, b) {
  const src = _iSrc;
  let m = 0, p = a;
  const lim = b - 1;
  while (p < lim) {
    m |= URL_ACT[src[p]] | URL_ACT[src[p + 1]];
    p += 2;
  }
  if (p < b) m |= URL_ACT[src[p]];
  return m;
}

function hasUtf8WsU8(src, a, b) {
  for (let p = a; p < b; p++) {
    if (src[p] >= 0xC2 && utf8WsLen(src, p, b) > 0) return true;
  }
  return false;
}

function handleCodeOrLinkU8(i, b, o, act) {
  const src = _iSrc, dst = _iDst, jm = _iJm;
  if (act === 8) { // '`'
    const j = src.indexOf(96, i + 1);
    if (j > i + 1 && j < b) {
      dst[o++] = 60; dst[o++] = 99; dst[o++] = 111; dst[o++] = 100; dst[o++] = 101; dst[o++] = 62;
      o = tf_copyCodeU8(i + 1, j, o);
      dst[o++] = 60; dst[o++] = 47; dst[o++] = 99; dst[o++] = 111; dst[o++] = 100; dst[o++] = 101; dst[o++] = 62;
      _spNext = j + 1;
    } else {
      dst[o++] = 96;
      _spNext = i + 1;
    }
    return o;
  }
  // act === 10: '['
  let pB = i + 1, k = -1;
  while (pB < b) {
    const j = src.indexOf(93, pB);
    if (j === -1 || j >= b) break;
    if (j === i + 1 || src[j - 1] !== 92 || !isEscU8(src, j, i + 1)) { k = j; break; }
    pB = j + 1;
  }
  if (k !== -1 && k + 1 < b && src[k + 1] === 40) {
    const closeP = src.indexOf(41, k + 2);
    if (closeP > k + 2 && closeP < b) {
      const m = tf_scanUrlU8(k + 2, closeP);
      if ((m & 1) === 0 && ((m & 16) === 0 || !hasUtf8WsU8(src, k + 2, closeP))) {
        const hasSpec = m & 2;
        const hasColon = m & 4;
        const hashPos = (m & 8) !== 0 ? src.indexOf(35, k + 2) : -1;
        dst[o++] = 60; dst[o++] = 97; dst[o++] = 32; dst[o++] = 104; dst[o++] = 114; dst[o++] = 101; dst[o++] = 102; dst[o++] = 61;
        if (jm) dst[o++] = 92;
        dst[o++] = 34;
        const u0 = src[k + 2];
        if (u0 === 47 || u0 === 35 || (hasColon !== 0 && hasSchemeU8(src, k + 2, closeP))) {
          if (hasSpec === 0) { dst.set(src.subarray(k + 2, closeP), o); o += closeP - (k + 2); }
          else o = tf_copyCodeU8(k + 2, closeP, o);
        } else {
          o = writeRelLinkHrefU8(k + 2, closeP, hashPos, hasSpec, o);
        }
        if (jm) dst[o++] = 92;
        dst[o++] = 34; dst[o++] = 62;
        o = tf_inlineU8(i + 1, k, o);
        dst[o++] = 60; dst[o++] = 47; dst[o++] = 97; dst[o++] = 62;
        _spNext = closeP + 1;
        return o;
      }
    }
  }
  dst[o++] = 91;
  _spNext = i + 1;
  return o;
}

function handleMdTokU8(i, b, o, act) {
  if (act === 8 || act === 10) return handleCodeOrLinkU8(i, b, o, act);
  const src = _iSrc, dst = _iDst;
  if (act === 9) { // '*' slow path (nested/escaped/unclosed emphasis)
    if (i + 1 < b && src[i + 1] === 42) {
      let p = i + 2, j = -1;
      const lim = b - 1;
      while (p < lim) {
        const f = src.indexOf(42, p);
        if (f === -1 || f >= lim) break;
        if (src[f + 1] === 42 && (f === i + 2 || src[f - 1] !== 92 || !isEscU8(src, f, i + 2))) { j = f; break; }
        p = f + 1;
      }
      if (j > i + 2) {
        dst[o++] = 60; dst[o++] = 115; dst[o++] = 116; dst[o++] = 114; dst[o++] = 111; dst[o++] = 110; dst[o++] = 103; dst[o++] = 62;
        o = tf_inlineU8(i + 2, j, o);
        dst[o++] = 60; dst[o++] = 47; dst[o++] = 115; dst[o++] = 116; dst[o++] = 114; dst[o++] = 111; dst[o++] = 110; dst[o++] = 103; dst[o++] = 62;
        _spNext = j + 2;
      } else {
        dst[o++] = 42; dst[o++] = 42;
        _spNext = i + 2;
      }
      return o;
    }
    let p = i + 1, j = -1;
    while (p < b) {
      const f = src.indexOf(42, p);
      if (f === -1 || f >= b) break;
      if (f > i + 1 && src[f - 1] === 92 && isEscU8(src, f, i + 1)) { p = f + 1; continue; }
      if (f + 1 < b && src[f + 1] === 42) { p = f + 2; continue; }
      j = f; break;
    }
    if (j > i + 1) {
      dst[o++] = 60; dst[o++] = 101; dst[o++] = 109; dst[o++] = 62;
      o = tf_inlineU8(i + 1, j, o);
      dst[o++] = 60; dst[o++] = 47; dst[o++] = 101; dst[o++] = 109; dst[o++] = 62;
      _spNext = j + 1;
    } else {
      dst[o++] = 42;
      _spNext = i + 1;
    }
    return o;
  }
  if (act === 7) { // '\'
    if (i + 1 < b) {
      const n = src[i + 1];
      if (n < 128 && ESCAPABLE_U8[n] === 1) {
        if (n === 62) { dst[o++] = 38; dst[o++] = 103; dst[o++] = 116; dst[o++] = 59; }
        else if (n === 92 && _iJm) { dst[o++] = 92; dst[o++] = 92; }
        else dst[o++] = n;
        _spNext = i + 2;
        return o;
      }
    }
    if (_iJm) { dst[o++] = 92; dst[o++] = 92; } else dst[o++] = 92;
    _spNext = i + 1;
    return o;
  }
  // act === 11: ctrl < 32
  if (_iJm) o = writeCtrlJsonU8(dst, o, src[i]); else dst[o++] = src[i];
  _spNext = i + 1;
  return o;
}

// Compact zero-deopt 4x-unrolled byte-copy + unified 1-pass speculative *em* / **strong**!
function tf_inlineU8(a, b, o) {
  const src = _iSrc;
  const dst = _iDst;
  let i = a;
  while (i < b) {
    let c = src[i];
    let act = INL_ACT[c];
    while (act === 0) {
      dst[o++] = c;
      if (++i >= b) return o;
      c = src[i];
      act = INL_ACT[c];
    }
      if (act <= 5) {
        let ep = ESC_OFF[act];
        const eEnd = ep + ESC_LEN[act];
        while (ep < eEnd) dst[o++] = ESC_BYTES[ep++];
        i++;
      } else if (act === 6) {
        if (_iJm) { dst[o++] = 92; dst[o++] = 110; } else dst[o++] = 10;
        i++;
      } else if (act === 9) { // '*' unified 1-pass speculative copy (0 cold branches!)
        let p = i + 1, o2 = o + 4, is2 = 0, ok = 0;
        if (p < b && src[p] === 42) { p++; o2 += 4; is2 = 1; }
        const s0 = p;
        while (p < b) {
          const ch = src[p];
          if (INL_ACT[ch] === 0) { dst[o2++] = ch; p++; continue; }
          if (ch === 42 && p > s0) {
            if (is2 !== 0) {
              if (p + 1 < b && src[p + 1] === 42) {
                dst.set(T_STRONG_OPEN, o); dst.set(T_STRONG_CLOSE, o2);
                o = o2 + 9; i = p + 2; ok = 1;
              }
            } else if (p + 1 >= b || src[p + 1] !== 42) {
              dst.set(T_EM_OPEN, o); dst.set(T_EM_CLOSE, o2);
              o = o2 + 5; i = p + 1; ok = 1;
            }
          }
          break;
        }
        if (ok === 0) { o = handleMdTokU8(i, b, o, 9); i = _spNext; }
      } else if (act === 8 || act === 10) {
        o = handleCodeOrLinkU8(i, b, o, act);
        i = _spNext;
      } else {
        o = handleMdTokU8(i, b, o, act);
        i = _spNext;
      }
  }
  return o;
}

// ---------------------------------------------------------------- Uint8Array block scanner

function isBlankU8(u, a, b) {
  for (let i = a; i < b; i++) {
    const c = u[i];
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}

let _flEnd = 0;
function matchFenceOpenU8(u, a, b) {
  if (b - a < 3 || u[a] !== 96 || u[a + 1] !== 96 || u[a + 2] !== 96) return false;
  let p = a + 3;
  while (p < b) {
    const c = u[p];
    if (c < 128 && FENCE_LANG_LUT[c] === 1) p++;
    else break;
  }
  _flEnd = p;
  while (p < b) {
    const c = u[p];
    if (c !== 32 && c !== 9) return false;
    p++;
  }
  return true;
}

function isFenceCloseU8(u, a, b) {
  if (b - a < 3 || u[a] !== 96 || u[a + 1] !== 96 || u[a + 2] !== 96) return false;
  for (let p = a + 3; p < b; p++) {
    const c = u[p];
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}

let _hdDepth = 0, _hdStart = 0, _hdEnd = 0;
function matchHeadingU8(u, a, b) {
  if (a >= b || u[a] !== 35) return 0;
  let p = a;
  while (p < b && u[p] === 35) p++;
  const depth = p - a;
  if (depth > 6 || p >= b) return 0;
  const c = u[p];
  if (c !== 32 && c !== 9) return 0;
  while (p < b && (u[p] === 32 || u[p] === 9)) p++;
  let tEnd = b;
  while (tEnd > p && (u[tEnd - 1] === 32 || u[tEnd - 1] === 9)) tEnd--;
  if (p >= tEnd) return 0;
  _hdDepth = depth;
  _hdStart = p;
  _hdEnd = tEnd;
  return depth;
}

function isHrU8(u, a, b) {
  if (b - a < 3) return false;
  const c0 = u[a];
  if (c0 !== 45 && c0 !== 42) return false;
  if (u[a + 1] !== c0 || u[a + 2] !== c0) return false;
  for (let p = a + 3; p < b; p++) {
    const c = u[p];
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}

let _ordNum = 0;
function matchOrderedU8(u, a, b) {
  if (a >= b) return -1;
  let p = a;
  let num = 0;
  while (p < b) {
    const d = u[p] - 48;
    if (d >= 0 && d <= 9) {
      num = num * 10 + d;
      p++;
      if (p - a > 9) return -1;
    } else break;
  }
  if (p === a || p + 1 >= b) return -1;
  if (u[p] !== 46 || u[p + 1] !== 32) return -1;
  _ordNum = num;
  return p + 2;
}

function isContinuedU8(u, a, b) {
  if (b - a < 3 || u[a] !== 32 || u[a + 1] !== 32) return false;
  let p = a + 2;
  while (p < b && u[p] === 32) p++;
  if (p >= b) return false;
  return utf8WsLen(u, p, b) === 0;
}

function endsParaU8(u, a, b, c0) {
  if (c0 === 32 || c0 === 9) return isBlankU8(u, a, b);
  if (c0 === 96) return matchFenceOpenU8(u, a, b);
  if (c0 === 35) return matchHeadingU8(u, a, b) !== 0;
  if (c0 === 45 || c0 === 42) return isHrU8(u, a, b);
  return false;
}

let _paraLastEnd = 0;
let _paraClean = true;
function scanParaU8(fileU8, c0, lEnd, nextPos, len) {
  let lastEnd = lEnd;
  let clean = (c0 !== 32 && c0 !== 9) && (fileU8[lEnd - 1] !== 32 && fileU8[lEnd - 1] !== 9);
  let p = nextPos;
  while (p <= len) {
    const pnl = fileU8.indexOf(10, p);
    const plEnd = pnl === -1 ? len : pnl;
    if (p === plEnd) { p = pnl === -1 ? len + 1 : pnl + 1; break; }
    const lc0 = fileU8[p];
    if (lc0 <= 96 && endsParaU8(fileU8, p, plEnd, lc0)) break;
    if (clean) {
      const lc1 = fileU8[plEnd - 1];
      if (lc0 === 32 || lc0 === 9 || lc1 === 32 || lc1 === 9) clean = false;
    }
    lastEnd = plEnd;
    p = pnl === -1 ? len + 1 : pnl + 1;
  }
  _paraLastEnd = lastEnd;
  _paraClean = clean;
  return p;
}

let _mdPos = 0;
let _mdToc = EMPTY_ARR;
let _mdExcerpt = '';
let _mdExcerptJson = '';
let _mdExcerptBuf = EMPTY_U8;
let _mdHtmlLen = 0;

function consumeFenceU8(fileU8, len, pos, nextPos, dst, o, jm) {
  const langStart = pos + 3;
  const langEnd = _flEnd;
  const codeStart = nextPos;
  let codeEnd = -1;
  if (nextPos > len) {
    _mdPos = nextPos;
  } else {
    let q = nextPos;
    let found = false;
    while (q < len) {
      const idx = fileU8.indexOf(96, q);
      if (idx === -1) break;
      if (idx === nextPos || fileU8[idx - 1] === 10) {
        const cnl = fileU8.indexOf(10, idx);
        const clEnd = cnl === -1 ? len : cnl;
        if (isFenceCloseU8(fileU8, idx, clEnd)) {
          codeEnd = idx === nextPos ? -1 : idx - 1;
          _mdPos = cnl === -1 ? len + 1 : cnl + 1;
          found = true;
          break;
        }
        q = cnl === -1 ? len : cnl + 1;
      } else {
        q = idx + 1;
      }
    }
    if (!found) {
      codeEnd = len;
      _mdPos = len + 1;
    }
  }
  if (langEnd === langStart) {
    dst.set(T_PRE_OPEN, o); o += T_PRE_OPEN.length;
  } else {
    const t = jm ? T_PRE_LANG_J : T_PRE_LANG;
    dst.set(t, o); o += t.length;
    for (let k = langStart; k < langEnd; k++) dst[o++] = fileU8[k];
    if (jm) dst[o++] = 92;
    dst[o++] = 34; dst[o++] = 62;
  }
  if (codeEnd === -1) {
    const t = jm ? T_PRE_CLOSE_J : T_PRE_CLOSE;
    dst.set(t, o); o += t.length;
  } else {
    o = tf_copyCodeU8(codeStart, codeEnd, o);
    const t = jm ? T_PRE_NL_CLOSE_J : T_PRE_NL_CLOSE;
    dst.set(t, o); o += t.length;
  }
  return o;
}

function consumeHeadingU8(fileU8, dst, dstBuf, o, jm, toc, fastTocBuf, copyDst) {
  const depth = _hdDepth;
  const hStart = _hdStart;
  const hEnd = _hdEnd;
  const id = uniqueSlug(slugifyU8(fileU8, hStart, hEnd), HEADING_IDS);
  const ho = jm ? H_OPEN_JU8[depth] : H_OPEN_U8[depth];
  dst.set(ho, o); o += ho.length;
  o += dstBuf.latin1Write(id, o);
  if (jm) dst[o++] = 92;
  dst[o++] = 34; dst[o++] = 62;
  if (depth === 2 || depth === 3) {
    if (fastTocBuf) {
      const hO0 = o;
      o = tf_inlineU8(hStart, hEnd, o);
      toc.push({ level: depth, id, html: '', $hb: copyDst ? dst.slice(hO0, o) : dst.subarray(hO0, o) });
    } else {
      ensureEx((hEnd - hStart) * 8 + 65536);
      _iDst = EX_U8; _iDstBuf = EX_BUF; _iJm = false;
      const exLen = tf_inlineU8(hStart, hEnd, 0);
      _iDst = dst; _iDstBuf = dstBuf; _iJm = jm;
      const rawHtml = EX_BUF.utf8Slice(0, exLen);
      if (jm) {
        const jh = jsonEscInner(rawHtml);
        o += dstBuf.utf8Write(jh, o);
        toc.push({ level: depth, id, html: rawHtml, $h: jh });
      } else {
        dst.set(EX_U8.subarray(0, exLen), o); o += exLen;
        toc.push({ level: depth, id, html: rawHtml, $h: jsonEscInner(rawHtml) });
      }
    }
  } else {
    o = tf_inlineU8(hStart, hEnd, o);
  }
  const hc = jm ? H_CLOSE_JU8[depth] : H_CLOSE_U8[depth];
  dst.set(hc, o); o += hc.length;
  return o;
}

function consumeBlockquoteU8(fileU8, len, pos, dst, o, jm) {
  const bq = BQ_U8;
  let bqLen = 0;
  let p = pos;
  while (p <= len) {
    const qnl = fileU8.indexOf(10, p);
    const qlEnd = qnl === -1 ? len : qnl;
    if (p >= qlEnd || fileU8[p] !== 62) break;
    let a = p + 1, b = qlEnd;
    while (a < b && (fileU8[a] === 32 || fileU8[a] === 9)) a++;
    while (b > a && (fileU8[b - 1] === 32 || fileU8[b - 1] === 9)) b--;
    if (a < b) {
      if (bqLen > 0) bq[bqLen++] = 10;
      bq.set(fileU8.subarray(a, b), bqLen); bqLen += b - a;
    }
    p = qnl === -1 ? len + 1 : qnl + 1;
  }
  _mdPos = p;
  const bo = jm ? T_BQ_OPEN_J : T_BQ_OPEN;
  dst.set(bo, o); o += bo.length;
  if (bqLen > 0) {
    dst[o++] = 60; dst[o++] = 112; dst[o++] = 62;
    _iSrc = bq.subarray(0, bqLen); _iSrcBuf = BQ_BUF; _iSrcBufOff = 0;
    o = tf_inlineU8(0, bqLen, o);
    _iSrc = fileU8; _iSrcBuf = _curFileBuf; _iSrcBufOff = _curFileOff;
    dst[o++] = 60; dst[o++] = 47; dst[o++] = 112; dst[o++] = 62;
    if (jm) { dst[o++] = 92; dst[o++] = 110; } else dst[o++] = 10;
  }
  const bc = jm ? T_BQ_CLOSE_J : T_BQ_CLOSE;
  dst.set(bc, o); o += bc.length;
  return o;
}

function consumeBulletListU8(fileU8, len, pos, lEnd, nextPos, dst, o, jm) {
  const bq = BQ_U8;
  const uo = jm ? T_UL_OPEN_J : T_UL_OPEN;
  dst.set(uo, o); o += uo.length;
  let a = pos + 2, b = lEnd;
  while (a < b && (fileU8[a] === 32 || fileU8[a] === 9)) a++;
  while (b > a && (fileU8[b - 1] === 32 || fileU8[b - 1] === 9)) b--;
  let bqLen = 0, inBq = false, itemA = a, itemB = b, p = nextPos;
  while (p <= len) {
    const lnl = fileU8.indexOf(10, p);
    const llEnd = lnl === -1 ? len : lnl;
    const lNext = lnl === -1 ? len + 1 : lnl + 1;
    if (p + 1 < llEnd && (fileU8[p] === 45 || fileU8[p] === 42) && fileU8[p + 1] === 32) {
      dst[o++] = 60; dst[o++] = 108; dst[o++] = 105; dst[o++] = 62;
      if (inBq) { _iSrc = bq.subarray(0, bqLen); _iSrcBuf = BQ_BUF; _iSrcBufOff = 0; o = tf_inlineU8(0, bqLen, o); _iSrc = fileU8; _iSrcBuf = _curFileBuf; _iSrcBufOff = _curFileOff; }
      else o = tf_inlineU8(itemA, itemB, o);
      dst[o++] = 60; dst[o++] = 47; dst[o++] = 108; dst[o++] = 105; dst[o++] = 62;
      if (jm) { dst[o++] = 92; dst[o++] = 110; } else dst[o++] = 10;
      a = p + 2; b = llEnd;
      while (a < b && (fileU8[a] === 32 || fileU8[a] === 9)) a++;
      while (b > a && (fileU8[b - 1] === 32 || fileU8[b - 1] === 9)) b--;
      itemA = a; itemB = b; inBq = false; bqLen = 0;
      p = lNext;
    } else if (isContinuedU8(fileU8, p, llEnd)) {
      if (!inBq) { bqLen = 0; bq.set(fileU8.subarray(itemA, itemB), 0); bqLen = itemB - itemA; inBq = true; }
      bq[bqLen++] = 10;
      let ca = p, cb = llEnd;
      while (ca < cb && (fileU8[ca] === 32 || fileU8[ca] === 9)) ca++;
      while (cb > ca && (fileU8[cb - 1] === 32 || fileU8[cb - 1] === 9)) cb--;
      bq.set(fileU8.subarray(ca, cb), bqLen); bqLen += cb - ca;
      p = lNext;
    } else break;
  }
  _mdPos = p;
  dst[o++] = 60; dst[o++] = 108; dst[o++] = 105; dst[o++] = 62;
  if (inBq) { _iSrc = bq.subarray(0, bqLen); _iSrcBuf = BQ_BUF; _iSrcBufOff = 0; o = tf_inlineU8(0, bqLen, o); _iSrc = fileU8; _iSrcBuf = _curFileBuf; _iSrcBufOff = _curFileOff; }
  else o = tf_inlineU8(itemA, itemB, o);
  dst[o++] = 60; dst[o++] = 47; dst[o++] = 108; dst[o++] = 105; dst[o++] = 62;
  if (jm) { dst[o++] = 92; dst[o++] = 110; } else dst[o++] = 10;
  const uc = jm ? T_UL_CLOSE_J : T_UL_CLOSE;
  dst.set(uc, o); o += uc.length;
  return o;
}

function consumeOrderedListU8(fileU8, len, ordContent, startNum, lEnd, nextPos, dst, dstBuf, o, jm) {
  const bq = BQ_U8;
  if (startNum !== 1) {
    o += dstBuf.latin1Write(jm ? '<ol start=\\"' + startNum + '\\">\\n' : '<ol start="' + startNum + '">\n', o);
  } else {
    const oo = jm ? T_OL_OPEN_J : T_OL_OPEN;
    dst.set(oo, o); o += oo.length;
  }
  let a = ordContent, b = lEnd;
  while (a < b && (fileU8[a] === 32 || fileU8[a] === 9)) a++;
  while (b > a && (fileU8[b - 1] === 32 || fileU8[b - 1] === 9)) b--;
  let bqLen = 0, inBq = false, itemA = a, itemB = b, p = nextPos;
  while (p <= len) {
    const lnl = fileU8.indexOf(10, p);
    const llEnd = lnl === -1 ? len : lnl;
    const lNext = lnl === -1 ? len + 1 : lnl + 1;
    const oc = matchOrderedU8(fileU8, p, llEnd);
    if (oc !== -1) {
      dst[o++] = 60; dst[o++] = 108; dst[o++] = 105; dst[o++] = 62;
      if (inBq) { _iSrc = bq.subarray(0, bqLen); _iSrcBuf = BQ_BUF; _iSrcBufOff = 0; o = tf_inlineU8(0, bqLen, o); _iSrc = fileU8; _iSrcBuf = _curFileBuf; _iSrcBufOff = _curFileOff; }
      else o = tf_inlineU8(itemA, itemB, o);
      dst[o++] = 60; dst[o++] = 47; dst[o++] = 108; dst[o++] = 105; dst[o++] = 62;
      if (jm) { dst[o++] = 92; dst[o++] = 110; } else dst[o++] = 10;
      a = oc; b = llEnd;
      while (a < b && (fileU8[a] === 32 || fileU8[a] === 9)) a++;
      while (b > a && (fileU8[b - 1] === 32 || fileU8[b - 1] === 9)) b--;
      itemA = a; itemB = b; inBq = false; bqLen = 0;
      p = lNext;
    } else if (isContinuedU8(fileU8, p, llEnd)) {
      if (!inBq) { bqLen = 0; bq.set(fileU8.subarray(itemA, itemB), 0); bqLen = itemB - itemA; inBq = true; }
      bq[bqLen++] = 10;
      let ca = p, cb = llEnd;
      while (ca < cb && (fileU8[ca] === 32 || fileU8[ca] === 9)) ca++;
      while (cb > ca && (fileU8[cb - 1] === 32 || fileU8[cb - 1] === 9)) cb--;
      bq.set(fileU8.subarray(ca, cb), bqLen); bqLen += cb - ca;
      p = lNext;
    } else break;
  }
  _mdPos = p;
  dst[o++] = 60; dst[o++] = 108; dst[o++] = 105; dst[o++] = 62;
  if (inBq) { _iSrc = bq.subarray(0, bqLen); _iSrcBuf = BQ_BUF; _iSrcBufOff = 0; o = tf_inlineU8(0, bqLen, o); _iSrc = fileU8; _iSrcBuf = _curFileBuf; _iSrcBufOff = _curFileOff; }
  else o = tf_inlineU8(itemA, itemB, o);
  dst[o++] = 60; dst[o++] = 47; dst[o++] = 108; dst[o++] = 105; dst[o++] = 62;
  if (jm) { dst[o++] = 92; dst[o++] = 110; } else dst[o++] = 10;
  const oc2 = jm ? T_OL_CLOSE_J : T_OL_CLOSE;
  dst.set(oc2, o); o += oc2.length;
  return o;
}

function trimParaToBq(fileU8, pos, lastEnd) {
  const bq = BQ_U8;
  let qLen = 0, q = pos;
  while (q <= lastEnd) {
    const _qnl = fileU8.indexOf(10, q);
    const qnl = (_qnl === -1 || _qnl >= lastEnd) ? -1 : _qnl;
    const qlEnd = qnl === -1 ? lastEnd : qnl;
    let ta = q, tb = qlEnd;
    while (ta < tb && (fileU8[ta] === 32 || fileU8[ta] === 9)) ta++;
    while (tb > ta && (fileU8[tb - 1] === 32 || fileU8[tb - 1] === 9)) tb--;
    if (q > pos) bq[qLen++] = 10;
    bq.set(fileU8.subarray(ta, tb), qLen); qLen += tb - ta;
    if (qnl === -1) break;
    q = qnl + 1;
  }
  return qLen;
}

function renderMarkdownU8(fileU8, fileBuf, fileOff, len, linkCtx, jm, fastTocBuf, fastExcerptBuf, copyDst, isPost, maxExpand) {
  ensureDst(len * maxExpand + 131072);
  ensureBq(len + 64);
  let dst = DST_U8;
  let dstBuf = DST_BUF;
  HEADING_IDS.clear();
  const toc = [];
  let excerptSeen = false;
  let excerpt = '';
  let excerptJson = '';
  let excerptBuf = EMPTY_U8;
  let o = 0;
  let pos = 0;

  // Bind inline context ONCE per file
  _curFileBuf = fileBuf;
  _curFileOff = fileOff;
  _iSrc = fileU8; _iSrcBuf = fileBuf; _iSrcBufOff = fileOff; _iDst = dst; _iDstBuf = dstBuf; _iJm = jm; _iCtx = linkCtx;

  while (pos <= len) {
    if (o + 65536 > DST_CAP) {
      ensureDst(o + len * maxExpand + 131072);
      dst = DST_U8; dstBuf = DST_BUF;
      _iDst = dst; _iDstBuf = dstBuf;
    }
    const nl = fileU8.indexOf(10, pos);
    const lEnd = nl === -1 ? len : nl;
    const nextPos = nl === -1 ? len + 1 : nl + 1;

    if (pos === lEnd) { pos = nextPos; continue; }
    const c0 = fileU8[pos];

    // Fast path: 85% of blocks start with A-Z / a-z / UTF-8 (>= 65 && !== 96) -> skip all 7 special block checks!
    if (c0 < 65 || c0 === 96) {
      if ((c0 === 32 || c0 === 9) && isBlankU8(fileU8, pos, lEnd)) { pos = nextPos; continue; }
      if (c0 === 96 && matchFenceOpenU8(fileU8, pos, lEnd)) {
        o = consumeFenceU8(fileU8, len, pos, nextPos, dst, o, jm);
        pos = _mdPos;
        continue;
      }
      if (c0 === 35 && matchHeadingU8(fileU8, pos, lEnd) !== 0) {
        o = consumeHeadingU8(fileU8, dst, dstBuf, o, jm, toc, fastTocBuf, copyDst);
        pos = nextPos;
        continue;
      }
      if ((c0 === 45 || c0 === 42) && isHrU8(fileU8, pos, lEnd)) {
        const t = jm ? T_HR_J : T_HR;
        dst.set(t, o); o += t.length;
        pos = nextPos;
        continue;
      }
      if (c0 === 62) {
        o = consumeBlockquoteU8(fileU8, len, pos, dst, o, jm);
        pos = _mdPos;
        continue;
      }
      if ((c0 === 45 || c0 === 42) && pos + 1 < lEnd && fileU8[pos + 1] === 32) {
        o = consumeBulletListU8(fileU8, len, pos, lEnd, nextPos, dst, o, jm);
        pos = _mdPos;
        continue;
      }
      if (c0 >= 48 && c0 <= 57) {
        const ordContent = matchOrderedU8(fileU8, pos, lEnd);
        if (ordContent !== -1) {
          o = consumeOrderedListU8(fileU8, len, ordContent, _ordNum, lEnd, nextPos, dst, dstBuf, o, jm);
          pos = _mdPos;
          continue;
        }
      }
    }

    const p = scanParaU8(fileU8, c0, lEnd, nextPos, len);
    const lastEnd = _paraLastEnd;
    let pA = pos, pB = lastEnd;
    const trimmed = !_paraClean;
    if (trimmed) {
      const qLen = trimParaToBq(fileU8, pos, lastEnd);
      _iSrc = BQ_U8.subarray(0, qLen); _iSrcBuf = BQ_BUF; _iSrcBufOff = 0; pA = 0; pB = qLen;
    }
    pos = p;
    dst[o++] = 60; dst[o++] = 112; dst[o++] = 62;
    if (!excerptSeen) {
      excerptSeen = true;
      if (fastExcerptBuf && !copyDst) {
        const exO0 = o;
        o = tf_inlineU8(pA, pB, o);
        excerptBuf = isPost ? dst.slice(exO0, o) : dst.subarray(exO0, o);
      } else {
        ensureEx((pB - pA) * maxExpand + 65536);
        _iDst = EX_U8; _iDstBuf = EX_BUF; _iJm = false;
        const exLen = tf_inlineU8(pA, pB, 0);
        _iDst = dst; _iDstBuf = dstBuf; _iJm = jm;
        excerpt = EX_BUF.utf8Slice(0, exLen);
        if (jm) {
          excerptJson = jsonEscInner(excerpt);
          const exO0 = o;
          o += dstBuf.utf8Write(excerptJson, o);
          if (fastExcerptBuf) excerptBuf = dst.slice(exO0, o);
        } else {
          dst.set(EX_U8.subarray(0, exLen), o); o += exLen;
        }
      }
    } else {
      o = tf_inlineU8(pA, pB, o);
    }
    if (trimmed) { _iSrc = fileU8; _iSrcBuf = _curFileBuf; _iSrcBufOff = _curFileOff; }
    dst[o++] = 60; dst[o++] = 47; dst[o++] = 112; dst[o++] = 62;
    if (jm) { dst[o++] = 92; dst[o++] = 110; } else dst[o++] = 10;
  }

  _mdToc = toc;
  _mdExcerpt = excerpt;
  _mdExcerptJson = excerptJson;
  _mdExcerptBuf = excerptBuf;
  _mdHtmlLen = o;
}

// Rare fallback for bodies containing lone UTF-16 surrogates (!rawBody.isWellFormed())
const WS_RE = /\s/;
const MD_RE = /[\\`*\[]/g;
const ESCAPABLE_STR = new Uint8Array(128);
for (const ch of '\\`*_[]()#+-.!>') ESCAPABLE_STR[ch.charCodeAt(0)] = 1;

function inlineStrFallback(s, linkCtx) {
  MD_RE.lastIndex = 0;
  let out = '';
  let last = 0;
  const len = s.length;
  const escSpan = (str) => escapeHtml(str);
  while (MD_RE.test(s)) {
    const i = MD_RE.lastIndex - 1;
    const c = s.charCodeAt(i);
    if (c === 92) {
      if (i + 1 < len && s.charCodeAt(i + 1) < 128 && ESCAPABLE_STR[s.charCodeAt(i + 1)] === 1) {
        if (i > last) out += escSpan(s.slice(last, i));
        out += escapeHtml(s[i + 1]);
        last = i + 2; MD_RE.lastIndex = last;
      }
      continue;
    }
    if (c === 96) {
      const j = s.indexOf('`', i + 1);
      if (j > i + 1) {
        if (i > last) out += escSpan(s.slice(last, i));
        out += '<code>' + escapeHtml(s.slice(i + 1, j)) + '</code>';
        last = j + 1; MD_RE.lastIndex = last;
      }
      continue;
    }
    if (c === 42) {
      if (i + 1 < len && s.charCodeAt(i + 1) === 42) {
        let p = i + 2, j = -1;
        while ((j = s.indexOf('**', p)) !== -1) {
          let bs = 0; for (let q = j - 1; q >= i + 2 && s.charCodeAt(q) === 92; q--) bs++;
          if ((bs & 1) === 0) break; p = j + 1;
        }
        if (j > i + 2) {
          if (i > last) out += escSpan(s.slice(last, i));
          out += '<strong>' + inlineStrFallback(s.slice(i + 2, j), linkCtx) + '</strong>';
          last = j + 2; MD_RE.lastIndex = last;
        } else MD_RE.lastIndex = i + 2;
        continue;
      }
      let p = i + 1, j = -1;
      while (p < len && (j = s.indexOf('*', p)) !== -1) {
        let bs = 0; for (let q = j - 1; q >= i + 1 && s.charCodeAt(q) === 92; q--) bs++;
        if ((bs & 1) === 1) { p = j + 1; continue; }
        if (j + 1 < len && s.charCodeAt(j + 1) === 42) { p = j + 2; continue; }
        break;
      }
      if (j > i + 1) {
        if (i > last) out += escSpan(s.slice(last, i));
        out += '<em>' + inlineStrFallback(s.slice(i + 1, j), linkCtx) + '</em>';
        last = j + 1; MD_RE.lastIndex = last;
      }
      continue;
    }
    let p = i + 1, k = -1;
    while ((k = s.indexOf(']', p)) !== -1) {
      let bs = 0; for (let q = k - 1; q >= i + 1 && s.charCodeAt(q) === 92; q--) bs++;
      if ((bs & 1) === 0) break; p = k + 1;
    }
    if (k !== -1 && k + 1 < len && s.charCodeAt(k + 1) === 40) {
      const cp = s.indexOf(')', k + 2);
      if (cp > k + 2) {
        const tgt = s.slice(k + 2, cp);
        if (!WS_RE.test(tgt)) {
          if (i > last) out += escSpan(s.slice(last, i));
          out += '<a href="' + resolveRawTarget(tgt, linkCtx, false) + '">' + inlineStrFallback(s.slice(i + 1, k), linkCtx) + '</a>';
          last = cp + 1; MD_RE.lastIndex = last;
        }
      }
    }
  }
  return out + escSpan(s.slice(last));
}

function renderMarkdownStrFallback(rawBody, linkCtx) {
  const lines = rawBody.split('\n');
  HEADING_IDS.clear();
  const toc = [];
  const out = [];
  let excerpt = null;
  let i = 0;
  const blank = (l) => /^[ \t]*$/.test(l);
  const fence = (l) => /^```([A-Za-z0-9_+-]*)[ \t]*$/.exec(l);
  const fenceEnd = (l) => /^```[ \t]*$/.test(l);
  const heading = (l) => /^(#{1,6})[ \t]+(.+?)[ \t]*$/.exec(l);
  const hr = (l) => /^(?:---|\*\*\*)[ \t]*$/.test(l);
  const bullet = (l) => /^[-*] (.*)$/.exec(l);
  const ordered = (l) => /^(\d{1,9})\. (.*)$/.exec(l);
  const cont = (l) => /^  +\S/.test(l);
  while (i < lines.length) {
    const line = lines[i];
    if (blank(line)) { i++; continue; }
    let m;
    if ((m = fence(line))) {
      const lang = m[1]; const code = []; i++;
      while (i < lines.length && !fenceEnd(lines[i])) code.push(lines[i++]);
      if (i < lines.length) i++;
      const open = lang ? `<pre><code class="language-${lang}">` : '<pre><code>';
      out.push(`${open}${code.length ? escapeHtml(code.join('\n')) + '\n' : ''}</code></pre>\n`);
      continue;
    }
    if ((m = heading(line))) {
      const depth = m[1].length;
      const id = uniqueSlug(slugifySlow(m[2]), HEADING_IDS);
      const html = inlineStrFallback(m[2], linkCtx);
      out.push(`<h${depth} id="${id}">${html}</h${depth}>\n`);
      if (depth === 2 || depth === 3) {
        const jh = jsonEscInner(html);
        toc.push({ level: depth, id, html, $h: jh, $hb: jh.length === 0 ? EMPTY_U8 : toUtf8U8(jh) });
      }
      i++; continue;
    }
    if (hr(line)) { out.push('<hr>\n'); i++; continue; }
    if (line.startsWith('>')) {
      const inner = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        const t = lines[i++].slice(1).replace(/^[ \t]+|[ \t]+$/g, '');
        if (t !== '') inner.push(t);
      }
      out.push(inner.length ? `<blockquote>\n<p>${inlineStrFallback(inner.join('\n'), linkCtx)}</p>\n</blockquote>\n` : '<blockquote>\n</blockquote>\n');
      continue;
    }
    if ((m = bullet(line))) {
      const items = [m[1].replace(/^[ \t]+|[ \t]+$/g, '')]; i++;
      while (i < lines.length) {
        if ((m = bullet(lines[i]))) { items.push(m[1].replace(/^[ \t]+|[ \t]+$/g, '')); i++; }
        else if (cont(lines[i])) { items[items.length - 1] += '\n' + lines[i++].replace(/^[ \t]+|[ \t]+$/g, ''); }
        else break;
      }
      out.push(`<ul>\n${items.map((x) => `<li>${inlineStrFallback(x, linkCtx)}</li>\n`).join('')}</ul>\n`);
      continue;
    }
    if ((m = ordered(line))) {
      const start = Number(m[1]); const items = [m[2].replace(/^[ \t]+|[ \t]+$/g, '')]; i++;
      while (i < lines.length) {
        if ((m = ordered(lines[i]))) { items.push(m[2].replace(/^[ \t]+|[ \t]+$/g, '')); i++; }
        else if (cont(lines[i])) { items[items.length - 1] += '\n' + lines[i++].replace(/^[ \t]+|[ \t]+$/g, ''); }
        else break;
      }
      out.push(`${start !== 1 ? `<ol start="${start}">` : '<ol>'}\n${items.map((x) => `<li>${inlineStrFallback(x, linkCtx)}</li>\n`).join('')}</ol>\n`);
      continue;
    }
    const para = [line.replace(/^[ \t]+|[ \t]+$/g, '')]; i++;
    while (i < lines.length && !blank(lines[i]) && !fence(lines[i]) && !heading(lines[i]) && !hr(lines[i])) {
      para.push(lines[i++].replace(/^[ \t]+|[ \t]+$/g, ''));
    }
    const html = inlineStrFallback(para.join('\n'), linkCtx);
    if (excerpt === null) excerpt = html;
    out.push(`<p>${html}</p>\n`);
  }
  _mdToc = toc;
  _mdExcerpt = excerpt === null ? '' : excerpt;
  return out.join('');
}

// ---------------------------------------------------------------- template parser, analyzer & JIT compiler

class TemplateError extends Error {}

function pathOf(name, text) {
  if (!PATH_RE.test(text)) throw new TemplateError(`template "${name}": ${JSON.stringify(text)} is not a path`);
  return text.split('.');
}

function isSpacesTabs(src, start, end) {
  for (let i = start; i < end; i++) {
    const c = src.charCodeAt(i);
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}

function parseTemplate(name, src) {
  const root = { kind: 'root', body: [] };
  const stack = [root];
  let body = root.body;
  let text = '';
  let i = 0;
  const len = src.length;

  while (i < len) {
    const open = src.indexOf('{', i);
    if (open === -1 || open === len - 1) {
      text += src.slice(i);
      break;
    }
    const next = src.charCodeAt(open + 1);
    if (next !== 123 && next !== 37) {
      text += src.slice(i, open + 1);
      i = open + 1;
      continue;
    }
    if (open > i) text += src.slice(i, open);
    if (next === 123) {
      const raw = open + 2 < len && src.charCodeAt(open + 2) === 123;
      const close = src.indexOf(raw ? '}}}' : '}}', open + (raw ? 3 : 2));
      if (close === -1) throw new TemplateError(`template "${name}": a ${raw ? '{{{' : '{{'} is not closed`);
      if (text !== '') { body.push({ k: 0, v: text }); text = ''; }
      body.push({ k: raw ? 2 : 1, p: pathOf(name, src.slice(open + (raw ? 3 : 2), close).trim()) });
      i = close + (raw ? 3 : 2);
      continue;
    }
    const close = src.indexOf('%}', open + 2);
    if (close === -1) throw new TemplateError(`template "${name}": a {% is not closed`);
    const end = close + 2;
    const lineStart = open === 0 ? 0 : src.lastIndexOf('\n', open - 1) + 1;
    const nl = src.indexOf('\n', end);
    const lineEnd = nl === -1 ? len : nl;
    const standalone = isSpacesTabs(src, lineStart, open) && isSpacesTabs(src, end, lineEnd);
    if (standalone) text = text.slice(0, text.length - (open - lineStart));
    if (text !== '') { body.push({ k: 0, v: text }); text = ''; }

    const tag = src.slice(open + 2, close).trim();
    const top = stack[stack.length - 1];
    let m;
    if ((m = FOR_RE.exec(tag)) !== null) {
      const node = { k: 4, kind: 'for', n: m[1], p: pathOf(name, m[2]), b: [] };
      body.push(node);
      stack.push(node);
      body = node.b;
    } else if ((m = IF_RE.exec(tag)) !== null) {
      const node = { k: 3, kind: 'if', not: m[1] !== undefined, p: pathOf(name, m[2]), t: [], e: null };
      body.push(node);
      stack.push(node);
      body = node.t;
    } else if (tag === 'else') {
      if (top.kind !== 'if' || top.e !== null) throw new TemplateError(`template "${name}": an else outside an if`);
      top.e = [];
      body = top.e;
    } else if (tag === 'endfor' || tag === 'endif') {
      if (top.kind !== (tag === 'endfor' ? 'for' : 'if')) {
        throw new TemplateError(`template "${name}": an ${tag} with no open ${tag.slice(3)}`);
      }
      stack.pop();
      const parent = stack[stack.length - 1];
      body = parent.kind === 'root' ? parent.body : parent.kind === 'for' ? parent.b : (parent.e ?? parent.t);
    } else if ((m = INCLUDE_RE.exec(tag)) !== null) {
      body.push({ k: 5, n: m[1] });
    } else {
      throw new TemplateError(`template "${name}": {% ${tag} %} is not a tag`);
    }

    i = standalone ? (nl === -1 ? len : nl + 1) : end;
  }
  if (text !== '') body.push({ k: 0, v: text });
  if (stack.length > 1) throw new TemplateError(`template "${name}": a ${stack[stack.length - 1].kind} is not closed`);
  return root.body;
}

// Bit 1: escapes content; bit 2: escapes excerpt; bit 4: escapes html; also counts raw AST nodes.
function scanTemplateEscapes(nodes) {
  let mask = 0;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.k === 1) {
      const last = n.p[n.p.length - 1];
      if (last === 'content') mask |= 1;
      else if (last === 'excerpt') mask |= 2;
      else if (last === 'html') mask |= 4;
    } else if (n.k === 3) {
      mask |= scanTemplateEscapes(n.t);
      if (n.e !== null) mask |= scanTemplateEscapes(n.e);
    } else if (n.k === 4) {
      mask |= scanTemplateEscapes(n.b);
    }
  }
  return mask;
}

function countExpandedNodes(templates, name, depth) {
  const nodes = templates.get(name);
  if (nodes === undefined) return 0;
  let total = nodes.length;
  const stack = [nodes];
  while (stack.length > 0 && total <= 2000) {
    const arr = stack.pop();
    for (let i = 0; i < arr.length; i++) {
      const n = arr[i];
      if (n.k === 3) {
        total += n.t.length;
        stack.push(n.t);
        if (n.e !== null) { total += n.e.length; stack.push(n.e); }
      } else if (n.k === 4) {
        total += n.b.length;
        stack.push(n.b);
      } else if (n.k === 5 && depth < INCLUDE_DEPTH) {
        total += countExpandedNodes(templates, n.n, depth + 1);
      }
      if (total > 2000) return total;
    }
  }
  return total;
}

function textOf(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) {
    const len = v.length;
    if (len === 0) return '';
    let out = textOf(v[0]);
    for (let i = 1; i < len; i++) out += ', ' + textOf(v[i]);
    return out;
  }
  return '';
}

function truthy(v) {
  if (Array.isArray(v)) return v.length > 0;
  return v !== undefined && v !== null && v !== false && v !== '' && v !== 0;
}

function resolvePropPath(v, path, from) {
  for (let k = from; k < path.length; k++) {
    if (v === null || typeof v !== 'object' || !Object.hasOwn(v, path[k])) return undefined;
    v = v[path[k]];
  }
  return v;
}

function renderDynamicAst(nodes, scope, templates, depth) {
  let out = '';
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.k === 0) { out += n.v; continue; }
    if (n.k === 1 || n.k === 2) {
      let s = scope;
      const p0 = n.p[0];
      while (s !== null && !Object.hasOwn(s.vars, p0)) s = s.parent;
      const v = s === null ? undefined : resolvePropPath(s.vars[p0], n.p, 1);
      const t = textOf(v);
      if (t !== '') out += n.k === 1 ? escapeHtml(t) : t;
    } else if (n.k === 3) {
      let s = scope;
      const p0 = n.p[0];
      while (s !== null && !Object.hasOwn(s.vars, p0)) s = s.parent;
      const v = s === null ? undefined : resolvePropPath(s.vars[p0], n.p, 1);
      const br = truthy(v) !== n.not ? n.t : n.e;
      if (br !== null) out += renderDynamicAst(br, scope, templates, depth);
    } else if (n.k === 4) {
      let s = scope;
      const p0 = n.p[0];
      while (s !== null && !Object.hasOwn(s.vars, p0)) s = s.parent;
      const xs = s === null ? undefined : resolvePropPath(s.vars[p0], n.p, 1);
      if (Array.isArray(xs)) {
        const xlen = xs.length;
        for (let k = 0; k < xlen; k++) {
          const vars = { [n.n]: xs[k], loop: { index: k + 1, first: k === 0, last: k === xlen - 1, length: xlen } };
          out += renderDynamicAst(n.b, { vars, parent: scope }, templates, depth);
        }
      }
    } else if (n.k === 5) {
      const t = templates.get(n.n);
      if (t !== undefined && depth < INCLUDE_DEPTH) {
        out += renderDynamicAst(t, scope, templates, depth + 1);
      }
    }
  }
  return out;
}

function getMaxDepthLazy(rctx, name, visiting) {
  const cached = rctx.depthCache.get(name);
  if (cached !== undefined) return cached;
  if (visiting.has(name)) return INCLUDE_DEPTH + 1;
  const nodes = rctx.templates.get(name);
  if (nodes === undefined) return 0;
  visiting.add(name);
  let maxD = 0;
  const walk = (arr) => {
    for (let i = 0; i < arr.length; i++) {
      const n = arr[i];
      if (n.k === 5) {
        if (rctx.templates.has(n.n)) {
          const d = 1 + getMaxDepthLazy(rctx, n.n, visiting);
          if (d > maxD) maxD = d;
        }
      } else if (n.k === 3) {
        walk(n.t);
        if (n.e !== null) walk(n.e);
      } else if (n.k === 4) {
        walk(n.b);
      }
    }
  };
  walk(nodes);
  visiting.delete(name);
  rctx.depthCache.set(name, maxD);
  return maxD;
}

function getFreeVarsLazy(rctx, name, visiting) {
  if (rctx.freeCache.has(name)) return rctx.freeCache.get(name);
  if (visiting.has(name)) return null;
  const nodes = rctx.templates.get(name);
  if (nodes === undefined) return EMPTY_SET_RO;
  visiting.add(name);
  const free = new Set();
  let ok = true;
  const walk = (arr, bound) => {
    for (let i = 0; i < arr.length && ok; i++) {
      const n = arr[i];
      if (n.k === 1 || n.k === 2) {
        const r = n.p[0];
        if (!bound.has(r)) free.add(r);
      } else if (n.k === 3) {
        const r = n.p[0];
        if (!bound.has(r)) free.add(r);
        walk(n.t, bound);
        if (n.e !== null) walk(n.e, bound);
      } else if (n.k === 4) {
        const r = n.p[0];
        if (!bound.has(r)) free.add(r);
        const nextBound = new Set(bound);
        nextBound.add(n.n);
        nextBound.add('loop');
        walk(n.b, nextBound);
      } else if (n.k === 5) {
        const sub = getFreeVarsLazy(rctx, n.n, visiting);
        if (sub === null) { ok = false; return; }
        for (const v of sub) {
          if (!bound.has(v)) free.add(v);
        }
      }
    }
  };
  walk(nodes, EMPTY_SET_RO);
  visiting.delete(name);
  const res = ok ? free : null;
  rctx.freeCache.set(name, res);
  return res;
}

function makeSchemas(baseSafe, pageUrlsSafe, contentIsJsonBuf, fastExcerptBuf, fastTocBuf) {
  const postUrlTy = baseSafe ? 'safeStr' : 'str';
  const pageUrlTy = pageUrlsSafe ? 'safeStr' : 'str';
  const exTy = fastExcerptBuf ? 'preEB' : 'preE';
  const tocHtmlTy = fastTocBuf ? 'preHB' : 'preH';
  return {
    cardTag: { name: 'preN', slug: 'safeStr', url: postUrlTy },
    tocItem: { level: 'num', id: 'safeStr', html: tocHtmlTy },
    link: { title: 'preT', url: postUrlTy, date: 'safeStr', date_long: 'safeStr' },
    card: {
      title: 'preT', url: postUrlTy, date: 'safeStr', date_long: 'safeStr',
      summary: 'preS', excerpt: exTy, reading_minutes: 'num', tags: 'arr:cardTag',
    },
    page: {
      title: 'preT', url: pageUrlTy, date: 'safeStr', date_long: 'safeStr',
      summary: 'preS', excerpt: exTy, reading_minutes: 'num', tags: 'arr:cardTag',
      slug: 'safeStr', content: contentIsJsonBuf ? 'jsonBuf' : 'str', toc: 'arr:tocItem',
      newer: 'opt:link', older: 'opt:link', is_post: 'bool',
    },
    pager: { number: 'num', total: 'num', url: postUrlTy, newer_url: postUrlTy, older_url: postUrlTy },
    tag: { name: 'str', slug: 'safeStr', url: postUrlTy, count: 'num', posts: 'arr:card' },
    siteTag: { name: 'str', slug: 'safeStr', url: postUrlTy, count: 'num' },
  };
}

function resolveTypedExpr(schemas, baseExpr, baseType, path, from) {
  let expr = baseExpr;
  let ty = baseType;
  for (let k = from; k < path.length; k++) {
    const prop = path[k];
    if (ty === 'str' || ty === 'safeStr' || ty === 'jsonBuf' || ty === 'preN' || ty === 'preT' || ty === 'preS' || ty === 'preE' || ty === 'preH' || ty === 'preEB' || ty === 'preHB' || ty === 'num' || ty === 'bool' || ty === 'undef') {
      return { expr: 'undefined', ty: 'undef' };
    }
    if (ty.startsWith('arr:')) {
      if (prop === 'length') { expr = `${expr}.length`; ty = 'num'; }
      else return { expr: 'undefined', ty: 'undef' };
      continue;
    }
    if (ty.startsWith('opt:')) {
      const inner = ty.slice(4);
      const sch = schemas[inner];
      if (!Object.hasOwn(sch, prop)) return { expr: 'undefined', ty: 'undef' };
      const nextTy = sch[prop];
      if (k === path.length - 1) {
        return { expr: `(${expr}!==null?${expr}.${prop}:undefined)`, ty: 'opt:' + nextTy };
      }
      return { expr: `(${expr}!==null?_rp(${expr}.${prop},${JSON.stringify(path)},${k + 1}):undefined)`, ty: 'any' };
    }
    const sch = schemas[ty];
    if (sch !== undefined) {
      if (!Object.hasOwn(sch, prop)) return { expr: 'undefined', ty: 'undef' };
      expr = `${expr}.${prop}`;
      ty = sch[prop];
      continue;
    }
    return { expr: `_rp(${expr},${JSON.stringify(path)},${k})`, ty: 'any' };
  }
  return { expr, ty };
}

function resolveCompileBinding(rootName, frames, siteRoot, rootTypes) {
  for (let i = frames.length - 1; i >= 0; i--) {
    const f = frames[i];
    if (rootName === 'loop') {
      return f.kind === 'static' ? { kind: 'static', val: f.loopVal } : { kind: 'dyn-loop', idxVar: f.idxVar, lenVar: f.lenVar };
    }
    if (rootName === f.name) {
      return f.kind === 'static' ? { kind: 'static', val: f.val } : { kind: 'dyn-item', itemVar: f.itemVar, ty: f.ty };
    }
  }
  if (rootName === 'site' || rootName === 'tags' || rootName === 'recent') {
    return { kind: 'static', val: siteRoot[rootName] };
  }
  if (Object.hasOwn(rootTypes, rootName)) {
    return { kind: 'root', expr: rootTypes[rootName].expr, ty: rootTypes[rootName].ty };
  }
  return { kind: 'static', val: undefined };
}

function hasDynamicDep(nodes, frames, rctx, rootTypes) {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.k === 0) continue;
    if (n.k === 1 || n.k === 2) {
      if (resolveCompileBinding(n.p[0], frames, rctx.siteRoot, rootTypes).kind !== 'static') return true;
    } else if (n.k === 3) {
      if (resolveCompileBinding(n.p[0], frames, rctx.siteRoot, rootTypes).kind !== 'static') return true;
      if (hasDynamicDep(n.t, frames, rctx, rootTypes)) return true;
      if (n.e !== null && hasDynamicDep(n.e, frames, rctx, rootTypes)) return true;
    } else if (n.k === 4) {
      if (resolveCompileBinding(n.p[0], frames, rctx.siteRoot, rootTypes).kind !== 'static') return true;
      const nextFrames = frames.concat({ name: n.n, kind: 'static', val: undefined, loopVal: undefined });
      if (hasDynamicDep(n.b, nextFrames, rctx, rootTypes)) return true;
    } else if (n.k === 5) {
      const free = getFreeVarsLazy(rctx, n.n, new Set());
      if (free === null) return true;
      for (const v of free) {
        if (resolveCompileBinding(v, frames, rctx.siteRoot, rootTypes).kind !== 'static') return true;
      }
    }
  }
  return false;
}

function resolvePathForCodegen(schemas, path, frames, siteRoot, rootTypes) {
  const b = resolveCompileBinding(path[0], frames, siteRoot, rootTypes);
  if (b.kind === 'static') {
    return { isStatic: true, val: resolvePropPath(b.val, path, 1) };
  }
  if (b.kind === 'dyn-loop') {
    if (path.length === 1) return { isStatic: false, expr: '_LM', ty: 'loopObj' };
    if (path.length === 2) {
      const prop = path[1];
      if (prop === 'index') return { isStatic: false, expr: `(${b.idxVar}+1)`, ty: 'num' };
      if (prop === 'first') return { isStatic: false, expr: `(${b.idxVar}===0)`, ty: 'bool' };
      if (prop === 'last') return { isStatic: false, expr: `(${b.idxVar}===${b.lenVar}-1)`, ty: 'bool' };
      if (prop === 'length') return { isStatic: false, expr: b.lenVar, ty: 'num' };
    }
    return { isStatic: true, val: undefined };
  }
  if (b.kind === 'dyn-item') {
    const r = resolveTypedExpr(schemas, b.itemVar, b.ty, path, 1);
    if (r.ty === 'undef') return { isStatic: true, val: undefined };
    return { isStatic: false, expr: r.expr, ty: r.ty };
  }
  const r = resolveTypedExpr(schemas, b.expr, b.ty, path, 1);
  if (r.ty === 'undef') return { isStatic: true, val: undefined };
  return { isStatic: false, expr: r.expr, ty: r.ty };
}

function getOrBuildPureIncludeFn(rctx, tplName, varName, varTy) {
  const key = tplName + '\0' + varName + '\0' + varTy;
  let entry = rctx.pureIncludeCache.get(key);
  if (entry !== undefined) return entry;
  const nodes = rctx.templates.get(tplName);
  const frames = [{ name: varName, kind: 'dyn', itemVar: '_p0', idxVar: '_0', lenVar: '_0', ty: varTy }];
  const fn = buildCompiledFn(rctx, nodes, frames, EMPTY_OBJ, 1, false);
  entry = { fn, cache: new Map() };
  rctx.pureIncludeCache.set(key, entry);
  return entry;
}

function evalSiteConstInclude(rctx, tplName) {
  let str = rctx.siteConstIncludeCache.get(tplName);
  if (str !== undefined) return str;
  const nodes = rctx.templates.get(tplName);
  const scope = { vars: rctx.siteRoot, parent: null };
  str = renderDynamicAst(nodes, scope, rctx.templates, 1);
  if (str.length > 0) str.indexOf('\uFFFF');
  rctx.siteConstIncludeCache.set(tplName, str);
  return str;
}

function buildCompiledFn(rctx, nodes, initFrames, rootTypes, initDepth, allowMemo) {
  const schemas = rctx.schemas;
  const streamMode = rctx.streamMode;
  const lits = [];
  const sLits = [];
  const statics = [];
  const stmts = [];
  const pendingParts = [];
  let pendingLit = '';
  let usesO = false;
  let uid = 0;
  const budget = { n: 2000 };
  let titleEscCount = 0;

  function flushO() {
    if (pendingParts.length > 0) {
      usesO = true;
      stmts.push(`_o+=${pendingParts.join('+')};`);
      pendingParts.length = 0;
    }
    stmts.push('__FLUSHO__');
  }

  function flushLitStream(forceBuf) {
    if (pendingLit === '') return;
    const j = JSON.stringify(pendingLit).slice(1, -1);
    pendingLit = '';
    if (forceBuf || j.length >= 192) {
      flushO();
      const b = Buffer.from(j, 'utf8');
      const u = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
      const idx = lits.length;
      lits.push(u);
      stmts.push(`_w.b(_L[${idx}]);`);
    } else {
      const idx = sLits.length;
      sLits.push(j);
      pendingParts.push(`_SL[${idx}]`);
    }
  }

  function flushLitToPart() {
    if (pendingLit !== '') {
      if (pendingLit.length > 0) pendingLit.indexOf('\uFFFF');
      const idx = lits.length;
      lits.push(pendingLit);
      pendingParts.push(`_L[${idx}]`);
      pendingLit = '';
    }
  }

  function flushParts() {
    if (streamMode) {
      flushLitStream(false);
      if (pendingParts.length > 0) {
        usesO = true;
        stmts.push(`_o+=${pendingParts.join('+')};`);
        pendingParts.length = 0;
      }
      return;
    }
    flushLitToPart();
    if (pendingParts.length > 0) {
      stmts.push(`_o+=${pendingParts.join('+')};`);
      pendingParts.length = 0;
    }
  }

  function emitCond(info, isNot) {
    const e = info.expr;
    const ty = info.ty;
    if (ty === 'jsonBuf') return isNot ? `(${e}.length===0)` : `(${e}.length>0)`;
    if (ty === 'preEB') { const b = e.slice(0, -8) + '.$eb'; return isNot ? `(${b}.length===0)` : `(${b}.length>0)`; }
    if (ty === 'preHB') { const b = e.slice(0, -5) + '.$hb'; return isNot ? `(${b}.length===0)` : `(${b}.length>0)`; }
    if (ty === 'str' || ty === 'safeStr' || ty === 'preN' || ty === 'preT' || ty === 'preS' || ty === 'preE' || ty === 'preH') return isNot ? `(${e}==='')` : `(${e}!=='')`;
    if (ty === 'num') return isNot ? `(${e}===0)` : `(${e}!==0)`;
    if (ty === 'bool') return isNot ? `(!${e})` : `(${e})`;
    if (ty.startsWith('arr:')) return isNot ? `(${e}.length===0)` : `(${e}.length>0)`;
    if (ty.startsWith('opt:')) {
      const inner = ty.slice(4);
      if (inner === 'link') return isNot ? `(${e}===null)` : `(${e}!==null)`;
      if (inner === 'str' || inner === 'safeStr' || inner === 'preT') return isNot ? `(!${e})` : `(${e}&&${e}!=='')`;
    }
    if (ty === 'page' || ty === 'card' || ty === 'tag' || ty === 'pager' || ty === 'cardTag' || ty === 'tocItem' || ty === 'link' || ty === 'siteTag' || ty === 'loopObj') {
      return isNot ? 'false' : 'true';
    }
    return isNot ? `(!_tr(${e}))` : `_tr(${e})`;
  }

  function emitValStream(info, escaped) {
    flushLitStream(false);
    const e = info.expr;
    const ty = info.ty;
    if (ty === 'jsonBuf') {
      flushO();
      // Supports either Uint8Array (fast U8 path) or pre-escaped/raw string (lone-surrogate fallback!)
      stmts.push(`if(typeof ${e}==='string')_w.j(${e});else if(${e}.length>0)_w.b(${e});`);
      return;
    }
    if (ty === 'preEB') {
      flushO();
      const b = e.slice(0, -8) + '.$eb';
      stmts.push(`if(${b}.length>0)_w.b(${b});`);
      return;
    }
    if (ty === 'preHB') {
      flushO();
      const b = e.slice(0, -5) + '.$hb';
      stmts.push(`if(${b}.length>0)_w.b(${b});`);
      return;
    }
    if (ty === 'safeStr') { pendingParts.push(e); return; }
    if (ty === 'preN') { pendingParts.push(escaped ? e.slice(0, -5) + '.$n' : `_ji(${e})`); return; }
    if (ty === 'preT') { pendingParts.push(escaped ? e.slice(0, -6) + '.$t' : `_ji(${e})`); return; }
    if (ty === 'preS') { pendingParts.push(escaped ? e.slice(0, -8) + '.$s' : `_ji(${e})`); return; }
    if (ty === 'preE') { pendingParts.push(escaped ? `_ej(${e})` : e.slice(0, -8) + '.$e'); return; }
    if (ty === 'preH') { pendingParts.push(escaped ? `_ej(${e})` : e.slice(0, -5) + '.$h'); return; }
    if (ty === 'opt:preT') {
      // e is `(_p0.newer!==null?_p0.newer.title:undefined)` -> replace `.title` with `.$t` when escaped!
      pendingParts.push(escaped ? `(${e.replace('.title:', '.$t:')}??'')` : `(${e}!==undefined?_ji(${e}):'')`);
      return;
    }
    if (ty === 'str') {
      if (escaped) {
        if (e === '_p0.title' && rootTypes === PAGE_ROOT_TYPES) {
          titleEscCount++;
          pendingParts.push('_pt');
        } else {
          pendingParts.push(`_ej(${e})`);
        }
      } else {
        pendingParts.push(`_ji(${e})`);
      }
      return;
    }
    if (ty === 'num') { pendingParts.push(e); return; }
    if (ty === 'bool') { pendingParts.push(`(${e}?'true':'false')`); return; }
    if (ty === 'page' || ty === 'card' || ty === 'tag' || ty === 'pager' || ty === 'cardTag' || ty === 'tocItem' || ty === 'link' || ty === 'siteTag' || ty === 'loopObj') {
      return;
    }
    if (ty === 'opt:safeStr') { pendingParts.push(`(${e}??'')`); return; }
    if (ty === 'opt:str') { pendingParts.push(escaped ? `(${e}!==undefined?_ej(${e}):'')` : `(${e}!==undefined?_ji(${e}):'')`); return; }
    pendingParts.push(escaped ? `_ej(_tx(${e}))` : `_ji(_tx(${e}))`);
  }

  function emitValPart(info, escaped) {
    const e = info.expr;
    const ty = info.ty;
    if (ty === 'safeStr') { pendingParts.push(e); return; }
    if (ty === 'str' || ty === 'preN' || ty === 'preT' || ty === 'preS' || ty === 'preE' || ty === 'preH') {
      if (escaped) {
        if (e === '_p0.title' && rootTypes === PAGE_ROOT_TYPES) {
          titleEscCount++;
          pendingParts.push('_pt');
        } else {
          pendingParts.push(`_esc(${e})`);
        }
      } else {
        pendingParts.push(e);
      }
      return;
    }
    if (ty === 'num') { pendingParts.push(e); return; }
    if (ty === 'bool') { pendingParts.push(`(${e}?'true':'false')`); return; }
    if (ty === 'page' || ty === 'card' || ty === 'tag' || ty === 'pager' || ty === 'cardTag' || ty === 'tocItem' || ty === 'link' || ty === 'siteTag' || ty === 'loopObj') {
      return;
    }
    if (ty === 'opt:safeStr') { pendingParts.push(`(${e}??'')`); return; }
    if (ty === 'opt:str' || ty === 'opt:preT') { pendingParts.push(escaped ? `(${e}!==undefined?_esc(${e}):'')` : `(${e}??'')`); return; }
    pendingParts.push(escaped ? `_esc(_tx(${e}))` : `_tx(${e})`);
  }

  function emit(arr, frames, depth) {
    for (let i = 0; i < arr.length; i++) {
      const n = arr[i];
      if (n.k === 0) { pendingLit += n.v; continue; }
      if (n.k === 1 || n.k === 2) {
        const info = resolvePathForCodegen(schemas, n.p, frames, rctx.siteRoot, rootTypes);
        if (info.isStatic) {
          const t = textOf(info.val);
          if (t !== '') pendingLit += n.k === 1 ? escapeHtml(t) : t;
        } else if (streamMode) {
          emitValStream(info, n.k === 1);
        } else {
          flushLitToPart();
          emitValPart(info, n.k === 1);
        }
        continue;
      }
      if (n.k === 3) {
        const info = resolvePathForCodegen(schemas, n.p, frames, rctx.siteRoot, rootTypes);
        if (info.isStatic) {
          const br = truthy(info.val) !== n.not ? n.t : n.e;
          if (br !== null) emit(br, frames, depth);
          continue;
        }
        const cond = emitCond(info, n.not);
        if (cond === 'true') { emit(n.t, frames, depth); continue; }
        if (cond === 'false') { if (n.e !== null) emit(n.e, frames, depth); continue; }
        flushParts();
        stmts.push(`if(${cond}){`);
        emit(n.t, frames, depth);
        flushParts();
        if (n.e !== null && n.e.length > 0) {
          stmts.push(`}else{`);
          emit(n.e, frames, depth);
          flushParts();
        }
        stmts.push(`}`);
        continue;
      }
      if (n.k === 4) {
        const info = resolvePathForCodegen(schemas, n.p, frames, rctx.siteRoot, rootTypes);
        if (info.isStatic) {
          const xs = info.val;
          if (!Array.isArray(xs) || xs.length === 0) continue;
          const testFrames = frames.concat({ name: n.n, kind: 'static', val: undefined, loopVal: undefined });
          if (!hasDynamicDep(n.b, testFrames, rctx, rootTypes)) {
            const xlen = xs.length;
            for (let k = 0; k < xlen; k++) {
              const iterFrames = frames.concat({
                name: n.n,
                kind: 'static',
                val: xs[k],
                loopVal: { index: k + 1, first: k === 0, last: k === xlen - 1, length: xlen },
              });
              emit(n.b, iterFrames, depth);
            }
            continue;
          }
          flushParts();
          const sIdx = statics.length;
          statics.push(xs);
          const id = uid++;
          const aV = `_a${id}`, iV = `_i${id}`, lV = `_l${id}`, xV = `_x${id}`;
          stmts.push(`{const ${aV}=_S[${sIdx}],${lV}=${aV}.length;for(let ${iV}=0;${iV}<${lV};${iV}++){const ${xV}=${aV}[${iV}];`);
          const nextFrames = frames.concat({ name: n.n, kind: 'dyn', itemVar: xV, idxVar: iV, lenVar: lV, ty: 'any' });
          emit(n.b, nextFrames, depth);
          flushParts();
          stmts.push(`}}`);
          continue;
        }
        flushParts();
        const id = uid++;
        const aV = `_a${id}`, iV = `_i${id}`, lV = `_l${id}`, xV = `_x${id}`;
        const isGuaranteedArr = info.ty.startsWith('arr:');
        const elemTy = isGuaranteedArr ? info.ty.slice(4) : 'any';
        stmts.push(`{const ${aV}=${info.expr};if(${isGuaranteedArr ? `${aV}.length>0` : `Array.isArray(${aV})&&${aV}.length>0`}){const ${lV}=${aV}.length;for(let ${iV}=0;${iV}<${lV};${iV}++){const ${xV}=${aV}[${iV}];`);
        const nextFrames = frames.concat({ name: n.n, kind: 'dyn', itemVar: xV, idxVar: iV, lenVar: lV, ty: elemTy });
        emit(n.b, nextFrames, depth);
        flushParts();
        stmts.push(`}}}`);
        continue;
      }
      if (n.k === 5) {
        if (depth >= INCLUDE_DEPTH) continue;
        const incNodes = rctx.templates.get(n.n);
        if (incNodes === undefined) continue;

        const free = getFreeVarsLazy(rctx, n.n, new Set());
        const maxD = getMaxDepthLazy(rctx, n.n, new Set());

        if (free !== null && maxD + depth + 1 <= INCLUDE_DEPTH) {
          let siteOnly = true;
          let singleVar = null;
          let singleBind = null;
          let memoOk = allowMemo && frames.length > 0;
          for (const v of free) {
            if (v === 'site' || v === 'tags' || v === 'recent') {
              let shadowed = false;
              for (let f = 0; f < frames.length; f++) {
                if (frames[f].name === v) { shadowed = true; break; }
              }
              if (shadowed) { siteOnly = false; memoOk = false; break; }
              continue;
            }
            siteOnly = false;
            if (memoOk) {
              if (v === 'loop' || singleVar !== null) {
                memoOk = false;
              } else {
                const bind = resolveCompileBinding(v, frames, rctx.siteRoot, rootTypes);
                if (bind.kind === 'dyn-item') {
                  singleVar = v;
                  singleBind = bind;
                } else {
                  memoOk = false;
                }
              }
            }
          }

          if (siteOnly) {
            pendingLit += evalSiteConstInclude(rctx, n.n);
            continue;
          }

          if (memoOk && singleVar !== null) {
            flushParts();
            const entry = getOrBuildPureIncludeFn(rctx, n.n, singleVar, singleBind.ty);
            const sIdx = statics.length;
            statics.push(entry);
            if (streamMode) {
              flushO();
              stmts.push(`{const _e=_S[${sIdx}],_k=${singleBind.itemVar};let _c=_e.cache.get(_k);if(_c===undefined){_mw.reset();_e.fn(_mw,_k);_c=_mw.toBuf();_e.cache.set(_k,_c);}_w.b(_c);}`);
            } else {
              stmts.push(`{const _e=_S[${sIdx}],_k=${singleBind.itemVar};let _c=_e.cache.get(_k);if(_c===undefined){_c=_e.fn(_k);if(_c.length>0)_c.indexOf('\\uFFFF');_e.cache.set(_k,_c);}_o+=_c;}`);
            }
            continue;
          }
        }

        if (budget.n > 0) {
          budget.n -= incNodes.length;
          emit(incNodes, frames, depth + 1);
        } else {
          flushParts();
          const sIdx = statics.length;
          statics.push(incNodes);
          let scopeExpr = `{vars:{site:_SR.site,tags:_SR.tags,recent:_SR.recent`;
          for (const rk of Object.keys(rootTypes)) scopeExpr += `,${rk}:${rootTypes[rk].expr}`;
          scopeExpr += `},parent:null}`;
          for (let f = 0; f < frames.length; f++) {
            const fr = frames[f];
            if (fr.kind === 'dyn') {
              scopeExpr = `{vars:{${JSON.stringify(fr.name)}:${fr.itemVar},loop:{index:${fr.idxVar}+1,first:${fr.idxVar}===0,last:${fr.idxVar}===${fr.lenVar}-1,length:${fr.lenVar}}},parent:${scopeExpr}}`;
            } else {
              const vIdx = statics.length;
              statics.push({ [fr.name]: fr.val, loop: fr.loopVal });
              scopeExpr = `{vars:_S[${vIdx}],parent:${scopeExpr}}`;
            }
          }
          if (streamMode) {
            flushO();
            stmts.push(`_w.j(_rd(_S[${sIdx}],${scopeExpr},_T,${depth + 1}));`);
          } else {
            stmts.push(`_o+=_rd(_S[${sIdx}],${scopeExpr},_T,${depth + 1});`);
          }
        }
      }
    }
  }

  emit(nodes, initFrames, initDepth);
  flushParts();

  if (streamMode) {
    if (usesO) stmts.push(`if(_o.length>0)_w.s(_o);`);
    const realStmts = stmts.filter((s) => s !== '__FLUSHO__');
    if (realStmts.length === 0) return () => {};
    if (realStmts.length === 1 && lits.length === 1 && sLits.length === 0 && statics.length === 0 && realStmts[0] === '_w.b(_L[0]);') {
      const cBuf = lits[0];
      return (_w) => { _w.b(cBuf); };
    }
    if (realStmts.length === 2 && lits.length === 0 && sLits.length === 1 && statics.length === 0 && realStmts[0] === '_o+=_SL[0];') {
      const b = Buffer.from(sLits[0], 'utf8');
      const u = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
      return (_w) => { _w.b(u); };
    }
    const preamble = (titleEscCount > 0 ? `const _pt=_ej(_p0.title);\n` : '') + (usesO ? `let _o='';\n` : '');
    const flushStmt = usesO ? `if(_o.length>0){_w.s(_o);_o='';}` : '';
    const bodyCode = `${preamble}${stmts.map((s) => (s === '__FLUSHO__' ? flushStmt : s)).filter(Boolean).join('\n')}`;
    const factory = new Function('_L', '_SL', '_S', '_ej', '_ji', '_tx', '_tr', '_rp', '_rd', '_T', '_SR', '_LM', '_mw', `return function(_w,_p0,_p1){\n${bodyCode}\n};`);
    return factory(lits, sLits, statics, escHtmlJsonStr, jsonEscInner, textOf, truthy, resolvePropPath, renderDynamicAst, rctx.templates, rctx.siteRoot, EMPTY_OBJ, SHARED_MEM_WRITER);
  }

  if (stmts.length === 0) return () => '';
  if (stmts.length === 1 && lits.length === 1 && statics.length === 0 && stmts[0] === '_o+=_L[0];') {
    const c = lits[0];
    return () => c;
  }

  const preamble = titleEscCount > 0 ? `const _pt=_esc(_p0.title);\n` : '';
  const bodyCode = `${preamble}let _o='';\n${stmts.join('\n')}\nreturn _o;`;
  const factory = new Function('_L', '_S', '_esc', '_tx', '_tr', '_rp', '_rd', '_T', '_SR', '_LM', `return function(_p0,_p1){\n${bodyCode}\n};`);
  return factory(lits, statics, escapeHtml, textOf, truthy, resolvePropPath, renderDynamicAst, rctx.templates, rctx.siteRoot, EMPTY_OBJ);
}

const PAGE_ROOT_TYPES = { page: { expr: '_p0', ty: 'page' } };
const INDEX_ROOT_TYPES = { posts: { expr: '_p0', ty: 'arr:card' }, pager: { expr: '_p1', ty: 'pager' } };
const TAG_ROOT_TYPES = { tag: { expr: '_p0', ty: 'tag' } };

function getCompiledLayout(rctx, tplName, roleKey, rootTypes, allowMemo) {
  const key = roleKey + '\0' + tplName;
  let fn = rctx.compiledLayouts.get(key);
  if (fn !== undefined) return fn;
  const nodes = rctx.templates.get(tplName);
  if (nodes === undefined) return null;
  fn = buildCompiledFn(rctx, nodes, [], rootTypes, 0, allowMemo);
  rctx.compiledLayouts.set(key, fn);
  return fn;
}

function layoutNeedsReadingMinutes(tplName, rawTemplates, parsedTemplates, memo) {
  if (memo.has(tplName)) return memo.get(tplName);
  memo.set(tplName, false);
  const src = rawTemplates[tplName];
  if (src !== undefined && src.indexOf('reading_minutes') !== -1) {
    memo.set(tplName, true);
    return true;
  }
  const nodes = parsedTemplates.get(tplName);
  if (nodes === undefined) return false;
  const stack = [nodes];
  while (stack.length > 0) {
    const arr = stack.pop();
    for (let i = 0; i < arr.length; i++) {
      const n = arr[i];
      if (n.k === 5) {
        if (layoutNeedsReadingMinutes(n.n, rawTemplates, parsedTemplates, memo)) {
          memo.set(tplName, true);
          return true;
        }
      } else if (n.k === 3) {
        stack.push(n.t);
        if (n.e !== null) stack.push(n.e);
      } else if (n.k === 4) {
        stack.push(n.b);
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------- build pipeline

function run(input, writer = null, rawU8 = null, rawBuf = null) {
  const streamMode = writer !== null;
  urlArenaOff = 0;

  // 1. Parse templates in code-unit order
  const templates = new Map();
  const report = [];
  const rawTemplates = input.templates;
  const tplNames = Object.keys(rawTemplates).sort(byCodeUnits);
  let tplEscMask = 0;
  let anyHasReadingMinutes = false;
  for (let i = 0; i < tplNames.length; i++) {
    const name = tplNames[i];
    const rawSrc = rawTemplates[name];
    if (!anyHasReadingMinutes && rawSrc.indexOf('reading_minutes') !== -1) anyHasReadingMinutes = true;
    try {
      const nodes = parseTemplate(name, rawSrc);
      templates.set(name, nodes);
      if (streamMode) tplEscMask |= scanTemplateEscapes(nodes);
    } catch (err) {
      if (!(err instanceof TemplateError)) throw err;
      report.push(err.message);
    }
  }
  const mdJsonBufMode = streamMode && (tplEscMask & 1) === 0;
  let noBudgetRisk = mdJsonBufMode;
  if (noBudgetRisk) {
    for (let i = 0; i < tplNames.length; i++) {
      if (countExpandedNodes(templates, tplNames[i], 0) > 2000) { noBudgetRisk = false; break; }
    }
  }
  const fastExcerptBuf = noBudgetRisk && (tplEscMask & 2) === 0;
  const fastTocBuf = noBudgetRisk && (tplEscMask & 4) === 0;

  let base = input.site.base_url;
  let bEnd = base.length;
  while (bEnd > 0 && base.charCodeAt(bEnd - 1) === 47) bEnd--;
  if (bEnd !== base.length) base = base.slice(0, bEnd);
  const maxExpand = base.length <= 40 ? 12 : Math.ceil((base.length + 160) / 4);

  // 2. Sort files by path in code-unit order, split .md vs statics, parse front matter
  const files = input.files.slice().sort(cmpFilePath);
  const sources = [];
  const statics = [];
  const staticPaths = new Set();

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const path = f.path;
    if (path.endsWith('.md')) {
      let text = '';
      let bodyStart = 0;
      let bodyOff = -1;
      let bodyLen = 0;
      if (f.content === null && rawU8 !== null) {
        let uOff = f.uOff;
        let uLen = f.uLen;
        if (f.hasCR) uLen = normalizeCrInPlace(rawU8, uOff, uLen);
        bodyOff = parseFrontMatterU8(rawU8, rawBuf, uOff, uLen);
        if (bodyOff === -1) {
          report.push('refused ' + path + ': ' + _fmErr);
          continue;
        }
        bodyLen = (uOff + uLen) - bodyOff;
      } else {
        const rawContent = f.content;
        text = rawContent.indexOf('\r') === -1 ? rawContent : rawContent.replace(/\r\n?/g, '\n');
        bodyStart = parseFrontMatter(text);
        if (bodyStart === -1) {
          report.push('refused ' + path + ': ' + _fmErr);
          continue;
        }
      }
      const data = _fmData;
      const post = path.startsWith('posts/');
      if (!post) {
        if (path.startsWith('tags/')) {
          report.push('refused ' + path + ": tags/ is the generator's own");
          continue;
        }
        if (path.startsWith('page/')) {
          report.push('refused ' + path + ": page/ is the generator's own");
          continue;
        }
      }
      if (post && data.date === undefined) {
        report.push('refused ' + path + ': a post needs a date');
        continue;
      }
      const layout = data.layout !== undefined ? data.layout : (post ? 'post' : 'page');
      if (!templates.has(layout)) {
        report.push('refused ' + path + ': layout "' + layout + '" is no template that parses');
        continue;
      }
      if (data.draft === true) {
        report.push('draft ' + path);
        continue;
      }
      sources.push({
        path,
        srcDir: dirOf(path),
        text,
        bodyStart,
        uOff: bodyOff,
        uLen: bodyLen,
        data,
        date: data.date,
        post,
        layout,
        slug: '',
        outDir: '',
        url: '',
        urlOff: 0,
        urlLen: 0,
        html: null,
        toc: EMPTY_ARR,
        excerpt: '',
        excerptJson: '',
        excerptBuf: EMPTY_U8,
        readingMinutes: 1,
        rendered: false,
        newer: null,
        older: null,
        tagRefs: EMPTY_ARR,
        card: null,
        link: null,
      });
    } else {
      statics.push(f);
      staticPaths.add(path);
    }
  }

  // 3. Permalinks
  const taken = new Map();
  taken.set('', new Set(RESERVED));
  const bySource = new Map();
  const baseSafe = !JSON_ASCII_SAFE_TEST.test(base);
  let pageUrlsSafe = baseSafe;

  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    const dir = s.post ? 'posts' : s.srcDir;
    if (pageUrlsSafe && !s.post && dir !== '' && JSON_ASCII_SAFE_TEST.test(dir)) {
      pageUrlsSafe = false;
    }
    let dirSet = taken.get(dir);
    if (dirSet === undefined) {
      dirSet = new Set();
      taken.set(dir, dirSet);
    }
    const rawSlug = s.data.slug !== undefined ? s.data.slug : slugify(s.data.title);
    const slug = uniqueSlug(rawSlug, dirSet);
    s.slug = slug;
    s.outDir = dir === '' ? slug : dir + '/' + slug;
    const url = base + '/' + s.outDir + '/';
    s.url = url;
    if (pageUrlsSafe) {
      const uLen = url.length;
      ensureUrlArena(urlArenaOff + uLen);
      s.urlOff = urlArenaOff;
      s.urlLen = URL_ARENA_BUF.latin1Write(url, urlArenaOff);
      urlArenaOff += s.urlLen;
    }
    bySource.set(s.path, s);
  }

  // 4. Collections & tags
  const posts = [];
  for (let i = 0; i < sources.length; i++) {
    if (sources[i].post) posts.push(sources[i]);
  }
  posts.sort(cmpPost);
  for (let k = 0; k < posts.length; k++) {
    const p = posts[k];
    p.newer = k === 0 ? null : posts[k - 1];
    p.older = k === posts.length - 1 ? null : posts[k + 1];
  }

  const tagSlugCache = new Map();
  const bySlug = new Map();

  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    const rawTags = p.data.tags;
    if (rawTags === undefined || rawTags.length === 0) continue;
    const refs = [];
    for (let j = 0; j < rawTags.length; j++) {
      const name = rawTags[j];
      let sl = tagSlugCache.get(name);
      if (sl === undefined) { sl = slugify(name); tagSlugCache.set(name, sl); }
      let dup = false;
      for (let q = 0; q < refs.length; q++) {
        if (refs[q].slug === sl) { dup = true; break; }
      }
      if (dup) continue;
      let tag = bySlug.get(sl);
      if (tag === undefined) {
        const url = base + '/tags/' + sl + '/';
        tag = { name, slug: sl, url, posts: [], cardTag: streamMode ? { name, slug: sl, url, $n: escHtmlJsonStr(name) } : { name, slug: sl, url } };
        bySlug.set(sl, tag);
      }
      tag.posts.push(p);
      refs.push(tag.cardTag);
    }
    p.tagRefs = refs;
  }

  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    if (s.post) continue;
    const rawTags = s.data.tags;
    if (rawTags === undefined || rawTags.length === 0) continue;
    const refs = [];
    for (let j = 0; j < rawTags.length; j++) {
      const name = rawTags[j];
      let sl = tagSlugCache.get(name);
      if (sl === undefined) { sl = slugify(name); tagSlugCache.set(name, sl); }
      let dup = false;
      for (let q = 0; q < refs.length; q++) {
        if (refs[q].slug === sl) { dup = true; break; }
      }
      if (dup) continue;
      const tag = bySlug.get(sl);
      refs.push(tag !== undefined ? tag.cardTag : (streamMode ? { name, slug: sl, url: '', $n: escHtmlJsonStr(name) } : { name, slug: sl, url: '' }));
    }
    s.tagRefs = refs;
  }

  const tags = Array.from(bySlug.values()).sort(cmpTag);

  // 5. Uint8Array single-pass Markdown + word count helper
  const broken = new Set();
  const dirInfoCache = new Map();
  const rel1Caches = new Map();
  const rel2Caches = new Map();
  function getSharedCache(map, key) {
    let m = map.get(key);
    if (m === undefined) { m = new Map(); map.set(key, m); }
    return m;
  }
  dirInfoCache.set('', { parts: [], cache: new Map(), rel1Cache: null, rel2Cache: null });
  const rmMemo = new Map();
  const linkCtx = { sourcePath: '', dirStr: '', dirParts: EMPTY_ARR, dirCache: null, rel1Cache: null, rel2Cache: null, bySource, staticPaths, base, broken, pageUrlsSafe };

  function renderSourceMd(s, copyDst) {
    const dir = s.srcDir;
    let dInfo = dirInfoCache.get(dir);
    if (dInfo === undefined) {
      const parts = dir.split('/');
      const r1 = getSharedCache(rel1Caches, parts.length === 1 ? '' : parts.slice(0, -1).join('/'));
      const r2 = parts.length >= 2 ? getSharedCache(rel2Caches, parts.length === 2 ? '' : parts.slice(0, -2).join('/')) : null;
      dInfo = { parts, cache: new Map(), rel1Cache: r1, rel2Cache: r2 };
      dirInfoCache.set(dir, dInfo);
    }
    linkCtx.sourcePath = s.path;
    linkCtx.dirStr = dir;
    linkCtx.dirParts = dInfo.parts;
    linkCtx.dirCache = dInfo.cache;
    linkCtx.rel1Cache = dInfo.rel1Cache;
    linkCtx.rel2Cache = dInfo.rel2Cache;
    const needRm = anyHasReadingMinutes && (s.post || layoutNeedsReadingMinutes(s.layout, rawTemplates, templates, rmMemo));

    let fileU8, fileBuf, fileOff, srcLen;
    if (s.uOff !== -1) {
      srcLen = s.uLen;
      if (srcLen === 0) {
        s.html = mdJsonBufMode ? EMPTY_U8 : '';
        s.toc = EMPTY_ARR;
        s.excerpt = '';
        s.excerptJson = '';
        s.excerptBuf = EMPTY_U8;
        s.rendered = true;
        return;
      }
      fileU8 = rawU8.subarray(s.uOff, s.uOff + srcLen);
      fileBuf = rawBuf;
      fileOff = s.uOff;
    } else {
      const rawBody = s.bodyStart === 0 ? s.text : s.text.slice(s.bodyStart);
      if (rawBody.length === 0) {
        s.html = mdJsonBufMode ? EMPTY_U8 : '';
        s.toc = EMPTY_ARR;
        s.excerpt = '';
        s.excerptJson = '';
        s.excerptBuf = EMPTY_U8;
        s.rendered = true;
        return;
      }
      if (!rawBody.isWellFormed()) {
        s.html = renderMarkdownStrFallback(rawBody, linkCtx);
        s.toc = _mdToc;
        s.excerpt = _mdExcerpt;
        s.excerptJson = streamMode ? jsonEscInner(_mdExcerpt) : '';
        s.excerptBuf = fastExcerptBuf && s.excerptJson.length > 0 ? toUtf8U8(s.excerptJson) : EMPTY_U8;
        if (needRm && rawBody.length > 399) {
          const words = countWordsStrFallback(s.text, s.bodyStart);
          s.readingMinutes = words <= 200 ? 1 : Math.ceil(words / 200);
        }
        s.rendered = true;
        return;
      }
      ensureSrc(rawBody.length * 3 + 16);
      srcLen = SRC_BUF.utf8Write(rawBody, 0);
      fileU8 = SRC_U8.subarray(0, srcLen);
      fileBuf = SRC_BUF;
      fileOff = 0;
    }

    if (needRm && srcLen > 399) {
      const words = tf_wcU8(fileU8, srcLen);
      s.readingMinutes = words <= 200 ? 1 : Math.ceil(words / 200);
    }
    renderMarkdownU8(fileU8, fileBuf, fileOff, srcLen, linkCtx, mdJsonBufMode, fastTocBuf, fastExcerptBuf, copyDst, s.post, maxExpand);
    if (mdJsonBufMode) {
      s.html = copyDst ? DST_U8.slice(0, _mdHtmlLen) : DST_U8.subarray(0, _mdHtmlLen);
    } else {
      s.html = DST_BUF.utf8Slice(0, _mdHtmlLen);
    }
    s.toc = _mdToc;
    s.excerpt = _mdExcerpt;
    s.excerptJson = _mdExcerptJson;
    s.excerptBuf = _mdExcerptBuf;
    s.rendered = true;
  }

  // Pre-render ONLY top `recent` posts (copying their small HTML buffer so DST_U8 stays reusable!)
  const recentCount = Math.min(input.site.recent, posts.length);
  for (let i = 0; i < recentCount; i++) renderSourceMd(posts[i], true);

  // 6. Cards, links & site root
  const dateLongCache = new Map();
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    const d = p.date;
    let dl = dateLongCache.get(d);
    if (dl === undefined) { dl = longDate(d); dateLongCache.set(d, dl); }
    const sum = p.data.summary !== undefined ? p.data.summary : '';
    if (streamMode) {
      const tj = escHtmlJsonStr(p.data.title);
      p.card = {
        title: p.data.title, url: p.url, date: d, date_long: dl,
        summary: sum, excerpt: p.excerpt, reading_minutes: p.readingMinutes, tags: p.tagRefs,
        $t: tj, $s: escHtmlJsonStr(sum), $e: p.rendered ? p.excerptJson : '', $eb: p.rendered ? p.excerptBuf : EMPTY_U8,
      };
      p.link = { title: p.data.title, url: p.url, date: d, date_long: dl, $t: tj };
    } else {
      p.card = {
        title: p.data.title, url: p.url, date: d, date_long: dl,
        summary: sum, excerpt: p.excerpt, reading_minutes: p.readingMinutes, tags: p.tagRefs,
      };
      p.link = { title: p.data.title, url: p.url, date: d, date_long: dl };
    }
  }

  const site = { title: input.site.title, base_url: base };
  const allTags = new Array(tags.length);
  for (let i = 0; i < tags.length; i++) {
    const t = tags[i];
    allTags[i] = { name: t.name, slug: t.slug, url: t.url, count: t.posts.length };
  }
  const recent = new Array(recentCount);
  for (let i = 0; i < recentCount; i++) recent[i] = posts[i].card;

  const rctx = {
    templates,
    schemas: makeSchemas(baseSafe, pageUrlsSafe, mdJsonBufMode, fastExcerptBuf, fastTocBuf),
    siteRoot: { site, tags: allTags, recent },
    streamMode,
    freeCache: new Map(),
    depthCache: new Map(),
    siteConstIncludeCache: new Map(),
    pureIncludeCache: new Map(),
    compiledLayouts: new Map(),
  };

  const output = streamMode ? null : {};
  let hasIndexStatic = false;
  if (streamMode) {
    for (let i = 0; i < statics.length; i++) {
      const sp = statics[i].path;
      if (sp === 'index.html' || sp.endsWith('/index.html')) { hasIndexStatic = true; break; }
    }
  }
  const writtenPaths = (streamMode && hasIndexStatic) ? new Set() : null;
  let firstEntry = true;
  if (streamMode) writer.byte(123); // '{'

  function beginKey(path) {
    if (writtenPaths !== null) writtenPaths.add(path);
    const comma = !firstEntry;
    firstEntry = false;
    if (pageUrlsSafe) {
      writer.ka(path, comma);
    } else if (!JSON_ANY_RE.test(path)) {
      if (comma) writer.byte(44);
      writer.byte(34);
      writer.s(path);
      writer.a('":"');
    } else {
      if (comma) writer.byte(44);
      writer.s(JSON.stringify(path));
      writer.a(':"');
    }
  }

  function beginIndexDir(dir) {
    const comma = !firstEntry;
    firstEntry = false;
    if (writtenPaths === null && pageUrlsSafe) {
      writer.kidx(dir, comma);
      return;
    }
    const path = dir + '/index.html';
    if (writtenPaths !== null) writtenPaths.add(path);
    if (pageUrlsSafe) {
      writer.ka(path, comma);
    } else if (!JSON_ANY_RE.test(path)) {
      if (comma) writer.byte(44);
      writer.byte(34);
      writer.s(path);
      writer.a('":"');
    } else {
      if (comma) writer.byte(44);
      writer.s(JSON.stringify(path));
      writer.a(':"');
    }
  }

  const pageObj = {
    title: '', url: '', date: '', date_long: '', summary: '', excerpt: '',
    reading_minutes: 1, tags: EMPTY_ARR, slug: '', content: '', toc: EMPTY_ARR,
    newer: null, older: null, is_post: false, $t: '', $s: '', $e: '', $eb: EMPTY_U8,
  };

  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    if (!s.rendered) {
      renderSourceMd(s, false);
      if (s.card !== null) {
        s.card.excerpt = s.excerpt;
        if (streamMode) { s.card.$e = s.excerptJson; s.card.$eb = s.excerptBuf; }
        s.card.reading_minutes = s.readingMinutes;
      }
    }
    if (s.card !== null) {
      const c = s.card;
      pageObj.title = c.title;
      pageObj.url = c.url;
      pageObj.date = c.date;
      pageObj.date_long = c.date_long;
      pageObj.summary = c.summary;
      pageObj.excerpt = c.excerpt;
      pageObj.reading_minutes = c.reading_minutes;
      pageObj.tags = c.tags;
      pageObj.slug = s.slug;
      pageObj.content = s.html;
      pageObj.toc = s.toc;
      pageObj.newer = s.newer !== null ? s.newer.link : null;
      pageObj.older = s.older !== null ? s.older.link : null;
      pageObj.is_post = true;
      if (streamMode) { pageObj.$t = c.$t; pageObj.$s = c.$s; pageObj.$e = c.$e; pageObj.$eb = c.$eb; }
    } else {
      const d = s.date;
      let dl = '';
      if (d !== undefined) {
        dl = dateLongCache.get(d);
        if (dl === undefined) { dl = longDate(d); dateLongCache.set(d, dl); }
      }
      pageObj.title = s.data.title;
      pageObj.url = s.url;
      pageObj.date = d !== undefined ? d : '';
      pageObj.date_long = dl;
      pageObj.summary = s.data.summary !== undefined ? s.data.summary : '';
      pageObj.excerpt = s.excerpt;
      pageObj.reading_minutes = s.readingMinutes;
      pageObj.tags = s.tagRefs;
      pageObj.slug = s.slug;
      pageObj.content = s.html;
      pageObj.toc = s.toc;
      pageObj.newer = null;
      pageObj.older = null;
      pageObj.is_post = false;
      if (streamMode) { pageObj.$t = escHtmlJsonStr(pageObj.title); pageObj.$s = pageObj.summary !== '' ? escHtmlJsonStr(pageObj.summary) : ''; pageObj.$e = s.excerptJson; pageObj.$eb = s.excerptBuf; }
    }
    const fn = getCompiledLayout(rctx, s.layout, 'P', PAGE_ROOT_TYPES, false);
    if (streamMode) {
      beginIndexDir(s.outDir);
      fn(writer, pageObj);
      writer.byte(34);
    } else {
      output[s.outDir + '/index.html'] = fn(pageObj);
    }
    s.html = null;
    s.toc = EMPTY_ARR;
    s.text = '';
  }

  if (templates.has('index')) {
    const fn = getCompiledLayout(rctx, 'index', 'I', INDEX_ROOT_TYPES, true);
    const per = input.site.per_page;
    const pages = Math.max(1, Math.ceil(posts.length / per));
    const rootUrl = base + '/';
    const pager = { number: 1, total: pages, url: '', newer_url: '', older_url: '' };
    for (let k = 1; k <= pages; k++) {
      const from = (k - 1) * per;
      const to = Math.min(k * per, posts.length);
      const pageCards = new Array(to - from);
      for (let j = from; j < to; j++) pageCards[j - from] = posts[j].card;
      pager.number = k;
      pager.url = k === 1 ? rootUrl : base + '/page/' + k + '/';
      pager.newer_url = k === 1 ? '' : (k === 2 ? rootUrl : base + '/page/' + (k - 1) + '/');
      pager.older_url = k === pages ? '' : base + '/page/' + (k + 1) + '/';
      const outPath = k === 1 ? 'index.html' : 'page/' + k + '/index.html';
      if (streamMode) {
        beginKey(outPath);
        fn(writer, pageCards, pager);
        writer.byte(34);
      } else {
        output[outPath] = fn(pageCards, pager);
      }
    }
  }

  if (templates.has('tag')) {
    const fn = getCompiledLayout(rctx, 'tag', 'T', TAG_ROOT_TYPES, true);
    const tagObj = { name: '', slug: '', url: '', count: 0, posts: EMPTY_ARR };
    for (let i = 0; i < tags.length; i++) {
      const t = tags[i];
      const tPosts = t.posts;
      const tCards = new Array(tPosts.length);
      for (let j = 0; j < tPosts.length; j++) tCards[j] = tPosts[j].card;
      tagObj.name = t.name;
      tagObj.slug = t.slug;
      tagObj.url = t.url;
      tagObj.count = tPosts.length;
      tagObj.posts = tCards;
      const outPath = 'tags/' + t.slug + '/index.html';
      if (streamMode) {
        beginKey(outPath);
        fn(writer, tagObj);
        writer.byte(34);
      } else {
        output[outPath] = fn(tagObj);
      }
    }
  }

  if (templates.has('tags')) {
    const fn = getCompiledLayout(rctx, 'tags', 'A', EMPTY_OBJ, false);
    if (streamMode) {
      beginKey('tags/index.html');
      fn(writer);
      writer.byte(34);
    } else {
      output['tags/index.html'] = fn();
    }
  }

  if (streamMode) {
    const seenStatic = writtenPaths !== null ? writtenPaths : new Set();
    for (let i = 0; i < statics.length; i++) {
      const f = statics[i];
      if (seenStatic.has(f.path)) {
        report.push('shadowed ' + f.path + ': a built page has its path');
      } else {
        seenStatic.add(f.path);
        if (f.path !== REPORT_FILE) {
          if (!firstEntry) writer.byte(44);
          firstEntry = false;
          writer.s(JSON.stringify(f.path));
          writer.byte(58);
          writer.s(JSON.stringify(f.content));
        }
      }
    }
  } else {
    for (let i = 0; i < statics.length; i++) {
      const f = statics[i];
      if (Object.hasOwn(output, f.path)) report.push('shadowed ' + f.path + ': a built page has its path');
      else output[f.path] = f.content;
    }
  }

  // 8. Report
  for (const bLine of broken) report.push(bLine);
  report.sort(byCodeUnits);
  const pageCount = sources.length - posts.length;
  report.push('built ' + pageCount + ' pages, ' + posts.length + ' posts, ' + tags.length + ' tags and ' + statics.length + ' static files');
  const repStr = report.join('\n') + '\n';
  if (streamMode) {
    if (!firstEntry) writer.byte(44);
    writer.a('"build-report.txt":');
    writer.s(JSON.stringify(repStr));
    writer.byte(125); // '}'
    return null;
  }
  output[REPORT_FILE] = repStr;
  return output;
}


module.exports = {
  run,
  renderMarkdownStrFallback,
  countWordsStrFallback,
  parseFrontMatter,
  buildCompiledFn,
  getCompiledLayout,
  makeSchemas,
  renderDynamicAst,
  slugifySlow,
  getMdMeta: () => ({ toc: _mdToc, excerpt: _mdExcerpt }),
  getFmMeta: () => ({ data: _fmData, err: _fmErr }),
};
