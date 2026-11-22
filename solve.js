// kestrel-sitegen-speed v7: zero-dependency, byte-for-byte compatible drop-in for makefun-site 1.0.0.

const REPORT_FILE = 'build-report.txt';
const RESERVED = ['posts', 'tags', 'page'];
const INCLUDE_DEPTH = 8;
const SLUG_MAX = 64;
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const H_OPEN = ['', '<h1 id="', '<h2 id="', '<h3 id="', '<h4 id="', '<h5 id="', '<h6 id="'];
const H_CLOSE = ['', '</h1>\n', '</h2>\n', '</h3>\n', '</h4>\n', '</h5>\n', '</h6>\n'];

const EMPTY_ARR = Object.freeze([]);
const EMPTY_OBJ = Object.freeze({});
const FM_ERR = Object.freeze({});

// Regexes compiled once at module load (V8 Irregexp native machine code)
const ESC_TEST = /[&<>"']/;
const R_AMP = /&/g, R_LT = /</g, R_GT = />/g, R_QUOT = /"/g, R_APOS = /'/g;
const U_AMP = /&amp;/g, U_LT = /&lt;/g, U_GT = /&gt;/g, U_QUOT = /&quot;/g, U_APOS = /&#39;/g;

const MD_RE = /[\\`*\[]/g;
const MD_TEST = /[\\`*\[]/;
const WS_RE = /\s/;
const COMBINING_RE = /\p{M}/gu;
const FENCE_CLOSE_RE = /\n```[ \t]*(?:\n|$)/g;
const PARA_STOP_RE = /\n(?=[ \t]*(?:\n|$)|```[A-Za-z0-9_+-]*[ \t]*(?:\n|$)|#{1,6}[ \t]+[^ \t\n]|(?:---|\*\*\*)[ \t]*(?:\n|$))/g;
const TRIM_LINE_RE = /(?:^|\n)[ \t]|[ \t](?:\n|$)/;

const PATH_RE = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const FOR_RE = /^for ([A-Za-z_][A-Za-z0-9_]*) in (\S+)$/;
const IF_RE = /^if (not )?(\S+)$/;
const INCLUDE_RE = /^include "([a-z0-9-]+)"$/;

// ASCII lookup tables
const ESCAPABLE_NO_GT = new Uint8Array(128);
for (const ch of '\\`*_[]()#+-.!') ESCAPABLE_NO_GT[ch.charCodeAt(0)] = 1;

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

const SLUG_BUF = Buffer.allocUnsafe(64);
const HEADING_IDS = new Set();

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

// ---------------------------------------------------------------- text helpers

function esc5(text) {
  return text.replace(R_AMP, '&amp;').replace(R_LT, '&lt;').replace(R_GT, '&gt;').replace(R_QUOT, '&quot;').replace(R_APOS, '&#39;');
}

function escapeHtml(text) {
  return ESC_TEST.test(text) ? esc5(text) : text;
}

function unescapeHtml(s) {
  if (s.indexOf('&') === -1) return s;
  return s.replace(U_APOS, "'").replace(U_QUOT, '"').replace(U_GT, '>').replace(U_LT, '<').replace(U_AMP, '&');
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

// Prefixed tf_ for selective V8 TurboFan optimization via --turbo-filter=tf_*
function tf_slugify(text) {
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

function finishWordSlow(text, i, len) {
  while (i < len) {
    const ch = text.charCodeAt(i);
    if (ch === 32 || ch === 10 || ch === 9 || ch === 13 || ch === 11 || ch === 12 || ch === 160) return i + 1;
    if (ch >= 0x1680 && (ch === 0x1680 || ch === 0xfeff || (ch >= 0x2000 && ch <= 0x200a) || ch === 0x2028 || ch === 0x2029 || ch === 0x202f || ch === 0x205f || ch === 0x3000)) return i + 1;
    i++;
  }
  return len;
}

function isWsSlow(ch) {
  return ch === 9 || ch === 13 || ch === 11 || ch === 12 || ch === 160 || (ch >= 0x1680 && (ch === 0x1680 || ch === 0xfeff || (ch >= 0x2000 && ch <= 0x200a) || ch === 0x2028 || ch === 0x2029 || ch === 0x202f || ch === 0x205f || ch === 0x3000));
}

// Prefixed tf_ for selective V8 TurboFan optimization via --turbo-filter=tf_*
function tf_countWords(text, start) {
  const len = text.length;
  let count = 0;
  let i = start;
  while (i < len) {
    const ch = text.charCodeAt(i);
    if (((ch - 33) >>> 0) < 127) {
      count++;
      i++;
      while (i < len && ((text.charCodeAt(i) - 33) >>> 0) < 127) i++;
      if (i < len) {
        const c2 = text.charCodeAt(i);
        if (c2 === 32 || c2 === 10) i++;
        else i = finishWordSlow(text, i, len);
      }
    } else if (ch === 32 || ch === 10 || isWsSlow(ch)) {
      i++;
    } else {
      count++;
      i = finishWordSlow(text, i + 1, len);
    }
  }
  return count;
}

// ---------------------------------------------------------------- front matter (zero wrapper allocations)

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

  const data = { title: '', date: undefined, tags: undefined, draft: undefined, layout: undefined, slug: undefined, summary: undefined };
  let seenMask = 0;
  let pos = 4;
  let lineNo = 2;

  while (pos < closePos) {
    const nl = text.indexOf('\n', pos);
    const lEnd = nl === -1 ? len : nl;
    const nextPos = nl === -1 ? len + 1 : nl + 1;

    if (pos < lEnd && text.charCodeAt(pos) === 35) {
      pos = nextPos; lineNo++; continue;
    }
    let p = pos;
    while (p < lEnd && (text.charCodeAt(p) === 32 || text.charCodeAt(p) === 9)) p++;
    if (p === lEnd) { pos = nextPos; lineNo++; continue; }

    let kEnd = pos;
    while (kEnd < lEnd) {
      const c = text.charCodeAt(kEnd);
      if ((c >= 97 && c <= 122) || c === 95) kEnd++;
      else break;
    }
    if (kEnd === pos || kEnd >= lEnd || text.charCodeAt(kEnd) !== 58) {
      _fmErr = `line ${lineNo} is not "key: value"`;
      return -1;
    }
    let vStart = kEnd + 1;
    if (vStart < lEnd) {
      if (text.charCodeAt(vStart) !== 32) {
        _fmErr = `line ${lineNo} is not "key: value"`;
        return -1;
      }
      vStart++;
    }

    let vEnd = lEnd;
    while (vEnd > vStart && (text.charCodeAt(vEnd - 1) === 32 || text.charCodeAt(vEnd - 1) === 9)) vEnd--;

    const kid = identifyFmKey(text, pos, kEnd - pos);
    if (kid === -1) { _fmErr = `unknown key "${text.slice(pos, kEnd)}"`; return -1; }

    const bit = 1 << kid;
    if ((seenMask & bit) !== 0) { _fmErr = `key "${FM_KEY_NAMES[kid]}" is given twice`; return -1; }
    if (vStart === vEnd) { _fmErr = `key "${FM_KEY_NAMES[kid]}" has no value`; return -1; }

    const val = parseFmValue(kid, text.slice(vStart, vEnd));
    if (val === FM_ERR) return -1;
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

  if ((seenMask & 1) === 0) { _fmErr = 'no title'; return -1; }
  _fmData = data;
  return bodyStart;
}

// ---------------------------------------------------------------- path & link resolution

function dirOf(path) {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
}

function resolvePath(dirParts, rel) {
  const parts = dirParts.length === 0 ? [] : dirParts.slice();
  let pos = 0;
  const len = rel.length;
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

function resolveLinkEscaped(rawTargetEsc, linkCtx) {
  if (rawTargetEsc.length > 0) {
    const c0 = rawTargetEsc.charCodeAt(0);
    if (c0 === 47 || c0 === 35) return rawTargetEsc;
  }
  const cache = linkCtx.dirCache;
  const cached = cache.get(rawTargetEsc);
  if (cached !== undefined) {
    if (typeof cached === 'string') return cached;
    linkCtx.broken.add('broken-link ' + linkCtx.sourcePath + ' -> ' + cached.t);
    return rawTargetEsc;
  }

  const target = rawTargetEsc.indexOf('&') === -1 ? rawTargetEsc : unescapeHtml(rawTargetEsc);
  if (target.length > 0) {
    const c0 = target.charCodeAt(0);
    if (c0 === 47 || c0 === 35 || hasScheme(target)) {
      cache.set(rawTargetEsc, rawTargetEsc);
      return rawTargetEsc;
    }
  }
  const hash = target.indexOf('#');
  const rel = hash === -1 ? target : target.slice(0, hash);
  const frag = hash === -1 ? '' : target.slice(hash);
  const path = rel === '' ? null : resolvePath(linkCtx.dirParts, rel);
  if (path !== null) {
    const dest = linkCtx.bySource.get(path);
    if (dest !== undefined) {
      const href = escapeHtml(dest.url + frag);
      cache.set(rawTargetEsc, href);
      return href;
    }
    if (linkCtx.staticPaths.has(path)) {
      const href = escapeHtml(linkCtx.base + '/' + path + frag);
      cache.set(rawTargetEsc, href);
      return href;
    }
  }
  linkCtx.broken.add('broken-link ' + linkCtx.sourcePath + ' -> ' + target);
  cache.set(rawTargetEsc, { t: target });
  return rawTargetEsc;
}

// ---------------------------------------------------------------- Zero-alloc RegExp.test inline parser

function isEscapedAt(s, pos, minPos) {
  let bs = 0;
  for (let p = pos - 1; p >= minPos && s.charCodeAt(p) === 92; p--) bs++;
  return (bs & 1) === 1;
}

function findUnescaped2Star(s, from) {
  let p = from;
  for (;;) {
    const j = s.indexOf('**', p);
    if (j === -1) return -1;
    if (j === from || s.charCodeAt(j - 1) !== 92 || !isEscapedAt(s, j, from)) return j;
    p = j + 1;
  }
}

function findUnescaped1Star(s, from) {
  let p = from;
  const len = s.length;
  while (p < len) {
    const j = s.indexOf('*', p);
    if (j === -1) return -1;
    if (j > from && s.charCodeAt(j - 1) === 92 && isEscapedAt(s, j, from)) {
      p = j + 1;
      continue;
    }
    if (j + 1 < len && s.charCodeAt(j + 1) === 42) {
      p = j + 2;
      continue;
    }
    return j;
  }
  return -1;
}

function findUnescapedBracket(s, from) {
  let p = from;
  for (;;) {
    const j = s.indexOf(']', p);
    if (j === -1) return -1;
    if (j === from || s.charCodeAt(j - 1) !== 92 || !isEscapedAt(s, j, from)) return j;
    p = j + 1;
  }
}

function inlineEscaped(s, linkCtx) {
  MD_RE.lastIndex = 0;
  if (!MD_RE.test(s)) return s;
  const len = s.length;
  let out = '';
  let last = 0;
  do {
    const i = MD_RE.lastIndex - 1;
    const c = s.charCodeAt(i);
    if (c === 92) {
      if (i + 1 < len) {
        const n = s.charCodeAt(i + 1);
        if (n < 128 && ESCAPABLE_NO_GT[n] === 1) {
          if (i > last) out += s.slice(last, i);
          last = i + 1;
          MD_RE.lastIndex = i + 2;
          continue;
        }
        if (n === 38 && i + 4 < len && s.charCodeAt(i + 2) === 103 && s.charCodeAt(i + 3) === 116 && s.charCodeAt(i + 4) === 59) {
          if (i > last) out += s.slice(last, i);
          last = i + 1;
          MD_RE.lastIndex = i + 5;
          continue;
        }
      }
      continue;
    }
    if (c === 96) {
      const j = s.indexOf('`', i + 1);
      if (j > i + 1) {
        if (i > last) out += s.slice(last, i);
        out += '<code>' + s.slice(i + 1, j) + '</code>';
        last = j + 1;
        MD_RE.lastIndex = last;
      }
      continue;
    }
    if (c === 42) {
      if (i + 1 < len && s.charCodeAt(i + 1) === 42) {
        const j = findUnescaped2Star(s, i + 2);
        if (j > i + 2) {
          if (i > last) out += s.slice(last, i);
          const inner = s.slice(i + 2, j);
          out += '<strong>' + (MD_TEST.test(inner) ? inlineEscaped(inner, linkCtx) : inner) + '</strong>';
          last = j + 2;
          MD_RE.lastIndex = last;
        } else {
          MD_RE.lastIndex = i + 2;
        }
        continue;
      }
      const j = findUnescaped1Star(s, i + 1);
      if (j > i + 1) {
        if (i > last) out += s.slice(last, i);
        const inner = s.slice(i + 1, j);
        out += '<em>' + (MD_TEST.test(inner) ? inlineEscaped(inner, linkCtx) : inner) + '</em>';
        last = j + 1;
        MD_RE.lastIndex = last;
      }
      continue;
    }
    const k = findUnescapedBracket(s, i + 1);
    if (k !== -1 && k + 1 < len && s.charCodeAt(k + 1) === 40) {
      const closeP = s.indexOf(')', k + 2);
      if (closeP > k + 2) {
        const rawTargetEsc = s.slice(k + 2, closeP);
        if (!WS_RE.test(rawTargetEsc)) {
          if (i > last) out += s.slice(last, i);
          const href = resolveLinkEscaped(rawTargetEsc, linkCtx);
          const inner = s.slice(i + 1, k);
          out += '<a href="' + href + '">' + (MD_TEST.test(inner) ? inlineEscaped(inner, linkCtx) : inner) + '</a>';
          last = closeP + 1;
          MD_RE.lastIndex = last;
        }
      }
    }
  } while (MD_RE.test(s));
  return last === 0 ? s : out + s.slice(last);
}

// ---------------------------------------------------------------- block markdown on pre-escaped body

function isBlankLine(src, start, end) {
  for (let i = start; i < end; i++) {
    const c = src.charCodeAt(i);
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}

function matchFenceOpen(src, start, end) {
  if (end - start < 3 || src.charCodeAt(start) !== 96 || src.charCodeAt(start + 1) !== 96 || src.charCodeAt(start + 2) !== 96) {
    return null;
  }
  let p = start + 3;
  while (p < end) {
    const c = src.charCodeAt(p);
    if (c < 128 && FENCE_LANG_LUT[c] === 1) p++;
    else break;
  }
  const langEnd = p;
  while (p < end) {
    const c = src.charCodeAt(p);
    if (c !== 32 && c !== 9) return null;
    p++;
  }
  return langEnd === start + 3 ? '' : src.slice(start + 3, langEnd);
}

function isFenceClose(src, start, end) {
  if (end - start < 3 || src.charCodeAt(start) !== 96 || src.charCodeAt(start + 1) !== 96 || src.charCodeAt(start + 2) !== 96) {
    return false;
  }
  for (let p = start + 3; p < end; p++) {
    const c = src.charCodeAt(p);
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}

let _hdDepth = 0, _hdStart = 0, _hdEnd = 0;
function matchHeading(src, start, end) {
  if (start >= end || src.charCodeAt(start) !== 35) return 0;
  let p = start;
  while (p < end && src.charCodeAt(p) === 35) p++;
  const depth = p - start;
  if (depth > 6 || p >= end) return 0;
  const c = src.charCodeAt(p);
  if (c !== 32 && c !== 9) return 0;
  while (p < end && (src.charCodeAt(p) === 32 || src.charCodeAt(p) === 9)) p++;
  let tEnd = end;
  while (tEnd > p && (src.charCodeAt(tEnd - 1) === 32 || src.charCodeAt(tEnd - 1) === 9)) tEnd--;
  if (p >= tEnd) return 0;
  _hdDepth = depth;
  _hdStart = p;
  _hdEnd = tEnd;
  return depth;
}

function isHr(src, start, end) {
  if (end - start < 3) return false;
  const c0 = src.charCodeAt(start);
  if (c0 !== 45 && c0 !== 42) return false;
  if (src.charCodeAt(start + 1) !== c0 || src.charCodeAt(start + 2) !== c0) return false;
  for (let p = start + 3; p < end; p++) {
    const c = src.charCodeAt(p);
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}

let _ordNum = 0;
function matchOrdered(src, start, end) {
  if (start >= end) return -1;
  let p = start;
  let num = 0;
  while (p < end) {
    const d = src.charCodeAt(p) - 48;
    if (d >= 0 && d <= 9) {
      num = num * 10 + d;
      p++;
      if (p - start > 9) return -1;
    } else break;
  }
  if (p === start || p + 1 >= end) return -1;
  if (src.charCodeAt(p) !== 46 || src.charCodeAt(p + 1) !== 32) return -1;
  _ordNum = num;
  return p + 2;
}

function isContinued(src, start, end) {
  if (end - start < 3 || src.charCodeAt(start) !== 32 || src.charCodeAt(start + 1) !== 32) return false;
  let p = start + 2;
  while (p < end && src.charCodeAt(p) === 32) p++;
  if (p >= end) return false;
  const c = src.charCodeAt(p);
  if (c > 32 && c < 128) return true;
  if (c === 9 || c === 10 || c === 13 || c === 11 || c === 12) return false;
  return !WS_RE.test(src[p]);
}

function trimSlice(src, start, end) {
  let a = start;
  let b = end;
  while (a < b && (src.charCodeAt(a) === 32 || src.charCodeAt(a) === 9)) a++;
  while (b > a && (src.charCodeAt(b - 1) === 32 || src.charCodeAt(b - 1) === 9)) b--;
  return src.slice(a, b);
}

function trimParaLines(paraStr) {
  let out = '';
  let q = 0;
  const plen = paraStr.length;
  for (;;) {
    const nl = paraStr.indexOf('\n', q);
    const end = nl === -1 ? plen : nl;
    const ts = trimSlice(paraStr, q, end);
    out = q === 0 ? ts : out + '\n' + ts;
    if (nl === -1) break;
    q = nl + 1;
  }
  return out;
}

let _mdPos = 0;
let _mdToc = EMPTY_ARR;
let _mdExcerpt = '';

function consumeFence(src, len, nextPos, lang) {
  if (nextPos > len) {
    _mdPos = nextPos;
    return lang === '' ? '<pre><code></code></pre>\n' : '<pre><code class="language-' + lang + '"></code></pre>\n';
  }
  const nl0 = src.indexOf('\n', nextPos);
  const end0 = nl0 === -1 ? len : nl0;
  if (isFenceClose(src, nextPos, end0)) {
    _mdPos = nl0 === -1 ? len + 1 : nl0 + 1;
    return lang === '' ? '<pre><code></code></pre>\n' : '<pre><code class="language-' + lang + '"></code></pre>\n';
  }
  FENCE_CLOSE_RE.lastIndex = end0;
  const m = FENCE_CLOSE_RE.exec(src);
  let codeEnd;
  if (m !== null) {
    codeEnd = m.index;
    const after = m.index + m[0].length;
    _mdPos = m[0].charCodeAt(m[0].length - 1) === 10 ? after : len + 1;
  } else {
    codeEnd = len;
    _mdPos = len + 1;
  }
  return lang === ''
    ? '<pre><code>' + src.slice(nextPos, codeEnd) + '\n</code></pre>\n'
    : '<pre><code class="language-' + lang + '">' + src.slice(nextPos, codeEnd) + '\n</code></pre>\n';
}

function isEscapedQuoteLine(src, p, end) {
  return end - p >= 4 && src.charCodeAt(p) === 38 && src.charCodeAt(p + 1) === 103 && src.charCodeAt(p + 2) === 116 && src.charCodeAt(p + 3) === 59;
}

function consumeBlockquote(src, len, pos, linkCtx) {
  let bqText = '';
  let p = pos;
  while (p <= len) {
    const qnl = src.indexOf('\n', p);
    const qlEnd = qnl === -1 ? len : qnl;
    if (!isEscapedQuoteLine(src, p, qlEnd)) break;
    let a = p + 4;
    let b = qlEnd;
    while (a < b && (src.charCodeAt(a) === 32 || src.charCodeAt(a) === 9)) a++;
    while (b > a && (src.charCodeAt(b - 1) === 32 || src.charCodeAt(b - 1) === 9)) b--;
    if (a < b) {
      const s = src.slice(a, b);
      bqText = bqText === '' ? s : bqText + '\n' + s;
    }
    p = qnl === -1 ? len + 1 : qnl + 1;
  }
  _mdPos = p;
  return bqText === ''
    ? '<blockquote>\n</blockquote>\n'
    : '<blockquote>\n<p>' + inlineEscaped(bqText, linkCtx) + '</p>\n</blockquote>\n';
}

function consumeBulletList(src, len, lEnd, pos, nextPos, linkCtx) {
  let o = '<ul>\n';
  let curItem = trimSlice(src, pos + 2, lEnd);
  let p = nextPos;
  while (p <= len) {
    const lnl = src.indexOf('\n', p);
    const llEnd = lnl === -1 ? len : lnl;
    const lNext = lnl === -1 ? len + 1 : lnl + 1;
    if (p + 1 < llEnd && (src.charCodeAt(p) === 45 || src.charCodeAt(p) === 42) && src.charCodeAt(p + 1) === 32) {
      o += '<li>' + inlineEscaped(curItem, linkCtx) + '</li>\n';
      curItem = trimSlice(src, p + 2, llEnd);
      p = lNext;
    } else if (isContinued(src, p, llEnd)) {
      curItem += '\n' + trimSlice(src, p, llEnd);
      p = lNext;
    } else {
      break;
    }
  }
  _mdPos = p;
  return o + '<li>' + inlineEscaped(curItem, linkCtx) + '</li>\n</ul>\n';
}

function consumeOrderedList(src, len, lEnd, ordContent, startNum, nextPos, linkCtx) {
  let o = startNum !== 1 ? '<ol start="' + startNum + '">\n' : '<ol>\n';
  let curItem = trimSlice(src, ordContent, lEnd);
  let p = nextPos;
  while (p <= len) {
    const lnl = src.indexOf('\n', p);
    const llEnd = lnl === -1 ? len : lnl;
    const lNext = lnl === -1 ? len + 1 : lnl + 1;
    const oc = matchOrdered(src, p, llEnd);
    if (oc !== -1) {
      o += '<li>' + inlineEscaped(curItem, linkCtx) + '</li>\n';
      curItem = trimSlice(src, oc, llEnd);
      p = lNext;
    } else if (isContinued(src, p, llEnd)) {
      curItem += '\n' + trimSlice(src, p, llEnd);
      p = lNext;
    } else {
      break;
    }
  }
  _mdPos = p;
  return o + '<li>' + inlineEscaped(curItem, linkCtx) + '</li>\n</ol>\n';
}

function renderMarkdown(rawBody, linkCtx) {
  const src = ESC_TEST.test(rawBody) ? esc5(rawBody) : rawBody;
  const len = src.length;
  HEADING_IDS.clear();
  const toc = [];
  let out = '';
  let excerpt = null;
  let pos = 0;

  while (pos <= len) {
    const nl = src.indexOf('\n', pos);
    const lEnd = nl === -1 ? len : nl;
    const nextPos = nl === -1 ? len + 1 : nl + 1;

    if (pos === lEnd) { pos = nextPos; continue; }
    const c0 = src.charCodeAt(pos);
    if ((c0 === 32 || c0 === 9) && isBlankLine(src, pos, lEnd)) {
      pos = nextPos;
      continue;
    }

    if (c0 === 96) {
      const lang = matchFenceOpen(src, pos, lEnd);
      if (lang !== null) {
        out += consumeFence(src, len, nextPos, lang);
        pos = _mdPos;
        continue;
      }
    }

    if (c0 === 35 && matchHeading(src, pos, lEnd) !== 0) {
      const depth = _hdDepth;
      const hEsc = src.slice(_hdStart, _hdEnd);
      const slugSrc = hEsc.indexOf('&') === -1 ? hEsc : unescapeHtml(hEsc);
      const id = uniqueSlug(tf_slugify(slugSrc), HEADING_IDS);
      const html = inlineEscaped(hEsc, linkCtx);
      out += H_OPEN[depth] + id + '">' + html + H_CLOSE[depth];
      if (depth === 2 || depth === 3) toc.push({ level: depth, id, html });
      pos = nextPos;
      continue;
    }

    if ((c0 === 45 || c0 === 42) && isHr(src, pos, lEnd)) {
      out += '<hr>\n';
      pos = nextPos;
      continue;
    }

    if (c0 === 38 && isEscapedQuoteLine(src, pos, lEnd)) {
      out += consumeBlockquote(src, len, pos, linkCtx);
      pos = _mdPos;
      continue;
    }

    if ((c0 === 45 || c0 === 42) && pos + 1 < lEnd && src.charCodeAt(pos + 1) === 32) {
      out += consumeBulletList(src, len, lEnd, pos, nextPos, linkCtx);
      pos = _mdPos;
      continue;
    }

    if (c0 >= 48 && c0 <= 57) {
      const ordContent = matchOrdered(src, pos, lEnd);
      if (ordContent !== -1) {
        out += consumeOrderedList(src, len, lEnd, ordContent, _ordNum, nextPos, linkCtx);
        pos = _mdPos;
        continue;
      }
    }

    const pos0 = pos;
    let lastEnd;
    if (lEnd === len) {
      lastEnd = len;
      pos = len + 1;
    } else {
      PARA_STOP_RE.lastIndex = lEnd;
      if (PARA_STOP_RE.test(src)) {
        lastEnd = PARA_STOP_RE.lastIndex - 1;
        pos = lastEnd + 1;
        if (pos < len && src.charCodeAt(pos) === 10) pos++;
      } else {
        lastEnd = len;
        pos = len + 1;
      }
    }
    let paraStr = src.slice(pos0, lastEnd);
    if (TRIM_LINE_RE.test(paraStr)) paraStr = trimParaLines(paraStr);
    const html = inlineEscaped(paraStr, linkCtx);
    if (excerpt === null) excerpt = html;
    out += '<p>' + html + '</p>\n';
  }

  _mdToc = toc;
  _mdExcerpt = excerpt === null ? '' : excerpt;
  return out;
}

// ---------------------------------------------------------------- template parser, lazy analyzer, specializer & JIT compiler

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

// Lazy per-site template analysis (only analyzes templates actually referenced by includes!)
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
const EMPTY_SET_RO = new Set();

function makeSchemas(baseSafe, pageUrlsSafe) {
  const postUrlTy = baseSafe ? 'safeStr' : 'str';
  const pageUrlTy = pageUrlsSafe ? 'safeStr' : 'str';
  return {
    cardTag: { name: 'str', slug: 'safeStr', url: postUrlTy },
    tocItem: { level: 'num', id: 'safeStr', html: 'str' },
    link: { title: 'str', url: postUrlTy, date: 'safeStr', date_long: 'safeStr' },
    card: {
      title: 'str', url: postUrlTy, date: 'safeStr', date_long: 'safeStr',
      summary: 'str', excerpt: 'str', reading_minutes: 'num', tags: 'arr:cardTag',
    },
    page: {
      title: 'str', url: pageUrlTy, date: 'safeStr', date_long: 'safeStr',
      summary: 'str', excerpt: 'str', reading_minutes: 'num', tags: 'arr:cardTag',
      slug: 'safeStr', content: 'str', toc: 'arr:tocItem',
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
    if (ty === 'str' || ty === 'safeStr' || ty === 'num' || ty === 'bool' || ty === 'undef') {
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

// Evaluate a completely site-invariant include (e.g. header, nav, footer, promo-*) ONCE per site!
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
  const lits = [];
  const statics = [];
  const stmts = [];
  const pendingParts = [];
  let pendingLit = '';
  let uid = 0;
  const budget = { n: 2000 };
  let titleEscCount = 0;

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
    flushLitToPart();
    if (pendingParts.length > 0) {
      stmts.push(`_o+=${pendingParts.join('+')};`);
      pendingParts.length = 0;
    }
  }

  function emitCond(info, isNot) {
    const e = info.expr;
    const ty = info.ty;
    if (ty === 'str' || ty === 'safeStr') return isNot ? `(${e}==='')` : `(${e}!=='')`;
    if (ty === 'num') return isNot ? `(${e}===0)` : `(${e}!==0)`;
    if (ty === 'bool') return isNot ? `(!${e})` : `(${e})`;
    if (ty.startsWith('arr:')) return isNot ? `(${e}.length===0)` : `(${e}.length>0)`;
    if (ty.startsWith('opt:')) {
      const inner = ty.slice(4);
      if (inner === 'link') return isNot ? `(${e}===null)` : `(${e}!==null)`;
      if (inner === 'str' || inner === 'safeStr') return isNot ? `(!${e})` : `(${e}&&${e}!=='')`;
    }
    if (ty === 'page' || ty === 'card' || ty === 'tag' || ty === 'pager' || ty === 'cardTag' || ty === 'tocItem' || ty === 'link' || ty === 'siteTag' || ty === 'loopObj') {
      return isNot ? 'false' : 'true';
    }
    return isNot ? `(!_tr(${e}))` : `_tr(${e})`;
  }

  function emitValPart(info, escaped) {
    const e = info.expr;
    const ty = info.ty;
    if (ty === 'safeStr') { pendingParts.push(e); return; }
    if (ty === 'str') {
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
    if (ty === 'opt:str') { pendingParts.push(escaped ? `(${e}!==undefined?_esc(${e}):'')` : `(${e}??'')`); return; }
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
          // Classify free variables under current frames:
          // - siteOnly: every free var is site/tags/recent and not shadowed by any frame -> layout-independent constant!
          // - singleDyn: all non-site-root free vars reduce to a single dyn-item variable (and no site/tags/recent used is shadowed)
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
              if (shadowed) {
                siteOnly = false;
                memoOk = false;
                break;
              }
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

          // Site-invariant include (e.g. header, nav, footer, site-only promo-*): evaluate ONCE per site!
          if (siteOnly) {
            pendingLit += evalSiteConstInclude(rctx, n.n);
            continue;
          }

          // Pure single-item memoized include (e.g. card across index & all tag pages!)
          if (memoOk && singleVar !== null) {
            flushParts();
            const entry = getOrBuildPureIncludeFn(rctx, n.n, singleVar, singleBind.ty);
            const sIdx = statics.length;
            statics.push(entry);
            stmts.push(`{const _e=_S[${sIdx}],_k=${singleBind.itemVar};let _c=_e.cache.get(_k);if(_c===undefined){_c=_e.fn(_k);if(_c.length>0)_c.indexOf('\\uFFFF');_e.cache.set(_k,_c);}_o+=_c;}`);
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
          stmts.push(`_o+=_rd(_S[${sIdx}],${scopeExpr},_T,${depth + 1});`);
        }
      }
    }
  }

  emit(nodes, initFrames, initDepth);
  flushParts();

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

export function run(input) {
  // 1. Parse templates in code-unit order
  const templates = new Map();
  const report = [];
  const rawTemplates = input.templates;
  const tplNames = Object.keys(rawTemplates).sort(byCodeUnits);
  for (let i = 0; i < tplNames.length; i++) {
    const name = tplNames[i];
    try {
      templates.set(name, parseTemplate(name, rawTemplates[name]));
    } catch (err) {
      if (!(err instanceof TemplateError)) throw err;
      report.push(err.message);
    }
  }

  let base = input.site.base_url;
  let bEnd = base.length;
  while (bEnd > 0 && base.charCodeAt(bEnd - 1) === 47) bEnd--;
  if (bEnd !== base.length) base = base.slice(0, bEnd);

  // 2. Sort files by path in code-unit order, split .md vs statics, parse front matter
  const files = input.files.slice().sort(cmpFilePath);
  const sources = [];
  const statics = [];
  const staticPaths = new Set();

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const path = f.path;
    if (path.endsWith('.md')) {
      const rawContent = f.content;
      const text = rawContent.indexOf('\r') === -1 ? rawContent : rawContent.replace(/\r\n?/g, '\n');
      const bodyStart = parseFrontMatter(text);
      if (bodyStart === -1) {
        report.push('refused ' + path + ': ' + _fmErr);
        continue;
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
        data,
        date: data.date,
        post,
        layout,
        slug: '',
        outDir: '',
        url: '',
        html: '',
        toc: EMPTY_ARR,
        excerpt: '',
        readingMinutes: 1,
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
  const baseSafe = !ESC_TEST.test(base);
  let pageUrlsSafe = baseSafe;

  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    const dir = s.post ? 'posts' : s.srcDir;
    if (pageUrlsSafe && !s.post && dir !== '' && ESC_TEST.test(dir)) pageUrlsSafe = false;
    let dirSet = taken.get(dir);
    if (dirSet === undefined) {
      dirSet = new Set();
      taken.set(dir, dirSet);
    }
    const rawSlug = s.data.slug !== undefined ? s.data.slug : tf_slugify(s.data.title);
    const slug = uniqueSlug(rawSlug, dirSet);
    s.slug = slug;
    s.outDir = dir === '' ? slug : dir + '/' + slug;
    s.url = base + '/' + s.outDir + '/';
    bySource.set(s.path, s);
  }

  // 4. Markdown + word count
  const broken = new Set();
  const dirInfoCache = new Map();
  dirInfoCache.set('', { parts: [], cache: new Map() });
  const rmMemo = new Map();
  const linkCtx = { sourcePath: '', dirParts: EMPTY_ARR, dirCache: null, bySource, staticPaths, base, broken };

  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    const dir = s.srcDir;
    let dInfo = dirInfoCache.get(dir);
    if (dInfo === undefined) {
      dInfo = { parts: dir.split('/'), cache: new Map() };
      dirInfoCache.set(dir, dInfo);
    }
    linkCtx.sourcePath = s.path;
    linkCtx.dirParts = dInfo.parts;
    linkCtx.dirCache = dInfo.cache;
    const rawBody = s.bodyStart === 0 ? s.text : s.text.slice(s.bodyStart);
    s.html = renderMarkdown(rawBody, linkCtx);
    s.toc = _mdToc;
    s.excerpt = _mdExcerpt;
    if (s.post || layoutNeedsReadingMinutes(s.layout, rawTemplates, templates, rmMemo)) {
      if (s.text.length - s.bodyStart > 399) {
        const words = tf_countWords(s.text, s.bodyStart);
        s.readingMinutes = words <= 200 ? 1 : Math.ceil(words / 200);
      }
    }
  }

  // 5. Collections
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

  // 6. Tags (zero per-post Set allocation)
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
      if (sl === undefined) { sl = tf_slugify(name); tagSlugCache.set(name, sl); }
      let dup = false;
      for (let q = 0; q < refs.length; q++) {
        if (refs[q].slug === sl) { dup = true; break; }
      }
      if (dup) continue;
      let tag = bySlug.get(sl);
      if (tag === undefined) {
        const url = base + '/tags/' + sl + '/';
        tag = { name, slug: sl, url, posts: [], cardTag: { name, slug: sl, url } };
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
      if (sl === undefined) { sl = tf_slugify(name); tagSlugCache.set(name, sl); }
      let dup = false;
      for (let q = 0; q < refs.length; q++) {
        if (refs[q].slug === sl) { dup = true; break; }
      }
      if (dup) continue;
      const tag = bySlug.get(sl);
      refs.push(tag !== undefined ? tag.cardTag : { name, slug: sl, url: '' });
    }
    s.tagRefs = refs;
  }

  const tags = Array.from(bySlug.values()).sort(cmpTag);

  // 7. Cards, links & layouts
  const dateLongCache = new Map();
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    const d = p.data.date;
    let dl = dateLongCache.get(d);
    if (dl === undefined) { dl = longDate(d); dateLongCache.set(d, dl); }
    p.card = {
      title: p.data.title,
      url: p.url,
      date: d,
      date_long: dl,
      summary: p.data.summary !== undefined ? p.data.summary : '',
      excerpt: p.excerpt,
      reading_minutes: p.readingMinutes,
      tags: p.tagRefs,
    };
    p.link = { title: p.data.title, url: p.url, date: d, date_long: dl };
  }

  const site = { title: input.site.title, base_url: base };
  const allTags = new Array(tags.length);
  for (let i = 0; i < tags.length; i++) {
    const t = tags[i];
    allTags[i] = { name: t.name, slug: t.slug, url: t.url, count: t.posts.length };
  }
  const recentCount = Math.min(input.site.recent, posts.length);
  const recent = new Array(recentCount);
  for (let i = 0; i < recentCount; i++) recent[i] = posts[i].card;

  const rctx = {
    templates,
    schemas: makeSchemas(baseSafe, pageUrlsSafe),
    siteRoot: { site, tags: allTags, recent },
    freeCache: new Map(),
    depthCache: new Map(),
    siteConstIncludeCache: new Map(),
    pureIncludeCache: new Map(),
    compiledLayouts: new Map(),
  };

  const output = {};

  const pageObj = {
    title: '', url: '', date: '', date_long: '', summary: '', excerpt: '',
    reading_minutes: 1, tags: EMPTY_ARR, slug: '', content: '', toc: EMPTY_ARR,
    newer: null, older: null, is_post: false,
  };

  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
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
    } else {
      const d = s.data.date;
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
    }
    const fn = getCompiledLayout(rctx, s.layout, 'P', PAGE_ROOT_TYPES, false);
    output[s.outDir + '/index.html'] = fn(pageObj);
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
      output[k === 1 ? 'index.html' : 'page/' + k + '/index.html'] = fn(pageCards, pager);
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
      output['tags/' + t.slug + '/index.html'] = fn(tagObj);
    }
  }

  if (templates.has('tags')) {
    const fn = getCompiledLayout(rctx, 'tags', 'A', EMPTY_OBJ, false);
    output['tags/index.html'] = fn();
  }

  for (let i = 0; i < statics.length; i++) {
    const f = statics[i];
    if (Object.hasOwn(output, f.path)) report.push('shadowed ' + f.path + ': a built page has its path');
    else output[f.path] = f.content;
  }

  // 8. Report
  for (const bLine of broken) report.push(bLine);
  report.sort(byCodeUnits);
  const pageCount = sources.length - posts.length;
  report.push('built ' + pageCount + ' pages, ' + posts.length + ' posts, ' + tags.length + ' tags and ' + statics.length + ' static files');
  output[REPORT_FILE] = report.join('\n') + '\n';

  return output;
}
