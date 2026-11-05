/**
 * Minimal gettext toolkit: .po/.pot parsing + serialising and a
 * binary .mo writer. No dependencies — the plugin's i18n pipeline has
 * to run on machines without gettext (`msgfmt`) or WP-CLI installed.
 *
 * Entry shape used across the scripts:
 *
 *   {
 *     msgctxt:      string | null,
 *     msgid:        string,
 *     msgidPlural:  string | null,
 *     msgstr:       string[],          // [0] for singular, [0..n] plural forms
 *     translator:   string[],          // `# ` comments
 *     extracted:    string[],          // `#. ` comments (translators: notes)
 *     references:   string[],          // `#: file:line`
 *     flags:        string[],          // `#, fuzzy, php-format`
 *     obsolete:     boolean,           // `#~` entries
 *   }
 */

/** Unique key of an entry: msgctxt + EOT + msgid (gettext convention). */
export function entryKey(entry) {
  return entry.msgctxt !== null && entry.msgctxt !== undefined
    ? `${entry.msgctxt}\u0004${entry.msgid}`
    : entry.msgid;
}

export function createEntry(fields = {}) {
  return {
    msgctxt: null,
    msgid: '',
    msgidPlural: null,
    msgstr: [''],
    translator: [],
    extracted: [],
    references: [],
    flags: [],
    obsolete: false,
    ...fields,
  };
}

/* ------------------------------------------------------------------ */
/* String escaping                                                     */
/* ------------------------------------------------------------------ */

function unescape(str) {
  return str.replace(/\\(.)/g, (_, ch) => {
    switch (ch) {
      case 'n':
        return '\n';
      case 't':
        return '\t';
      case 'r':
        return '\r';
      case '"':
        return '"';
      case '\\':
        return '\\';
      default:
        return ch;
    }
  });
}

function escape(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\t/g, '\\t')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

/**
 * Parses a .po / .pot document.
 *
 * @param {string} text
 * @returns {{ header: string, headerComments: string[], entries: object[] }}
 *   `header` is the msgstr of the `msgid ""` entry (raw, with `\n`s).
 */
export function parsePo(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const entries = [];
  let header = null;
  let headerComments = [];

  let current = createEntry();
  let field = null; // 'msgctxt' | 'msgid' | 'msgidPlural' | ['msgstr', index]
  let started = false; // a msgctxt / msgid line was seen for `current`

  const flush = () => {
    if (started) {
      if (current.msgid === '' && current.msgctxt === null && !current.obsolete) {
        header = current.msgstr[0] ?? '';
        headerComments = [...current.translator];
      } else {
        entries.push(current);
      }
      current = createEntry();
    }
    started = false;
    field = null;
  };

  const append = (value) => {
    if (field === null) return;
    if (Array.isArray(field)) {
      current.msgstr[field[1]] = (current.msgstr[field[1]] ?? '') + value;
    } else {
      current[field] = (current[field] ?? '') + value;
    }
  };

  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (line === '') {
      flush();
      continue;
    }

    let isObsolete = false;
    if (line.startsWith('#~')) {
      isObsolete = true;
      line = line.replace(/^#~\s?/, '').trim();
      if (line === '') continue;
    }

    if (!isObsolete && line.startsWith('#')) {
      if (started) flush();
      if (line.startsWith('#.')) current.extracted.push(line.slice(2).trim());
      else if (line.startsWith('#:')) {
        current.references.push(...line.slice(2).trim().split(/\s+/).filter(Boolean));
      } else if (line.startsWith('#,')) {
        current.flags.push(
          ...line
            .slice(2)
            .split(',')
            .map((f) => f.trim())
            .filter(Boolean),
        );
      } else if (!line.startsWith('#|')) {
        // `#|` previous-msgid comments are dropped.
        current.translator.push(line.replace(/^#\s?/, ''));
      }
      continue;
    }

    const kw = /^(msgctxt|msgid_plural|msgid|msgstr(?:\[(\d+)\])?)\s+"(.*)"$/.exec(line);
    if (kw) {
      const [, keyword, index, value] = kw;
      if (keyword === 'msgctxt' && started) flush();
      if (keyword === 'msgid' && started && field !== 'msgctxt') flush();
      if (keyword === 'msgctxt') {
        current.msgctxt = '';
        field = 'msgctxt';
      } else if (keyword === 'msgid') {
        current.msgid = '';
        field = 'msgid';
      } else if (keyword === 'msgid_plural') {
        current.msgidPlural = '';
        field = 'msgidPlural';
      } else {
        const i = index !== undefined ? Number(index) : 0;
        if (i === 0) current.msgstr = [];
        current.msgstr[i] = '';
        field = ['msgstr', i];
      }
      started = true;
      if (isObsolete) current.obsolete = true;
      append(unescape(value));
      continue;
    }

    const cont = /^"(.*)"$/.exec(line);
    if (cont && started) {
      append(unescape(cont[1]));
      continue;
    }

    throw new Error(`Unparseable .po line: ${rawLine}`);
  }
  flush();

  return { header: header ?? '', headerComments, entries };
}

/* ------------------------------------------------------------------ */
/* Serialising                                                         */
/* ------------------------------------------------------------------ */

const WRAP = 79;

/** Renders `keyword "value"`, wrapping long / multi-line values gettext-style. */
function renderField(keyword, value, prefix = '') {
  const escaped = escape(value);
  const single = `${keyword} "${escaped}"`;
  if (!value.includes('\n') && single.length + prefix.length <= WRAP) {
    return [`${prefix}${single}`];
  }

  // Split after each \n, then wrap each piece on spaces.
  const pieces = [];
  const parts = value.split(/(?<=\n)/);
  for (const part of parts) {
    let rest = escape(part);
    while (rest.length > WRAP - 2 - prefix.length) {
      let cut = rest.lastIndexOf(' ', WRAP - 3 - prefix.length);
      if (cut <= 0) cut = rest.indexOf(' ', WRAP - 3 - prefix.length);
      if (cut <= 0) break;
      // Never split inside an escape sequence.
      pieces.push(rest.slice(0, cut + 1));
      rest = rest.slice(cut + 1);
    }
    if (rest !== '') pieces.push(rest);
  }
  return [`${prefix}${keyword} ""`, ...pieces.map((p) => `${prefix}"${p}"`)];
}

function renderEntry(entry) {
  const out = [];
  for (const c of entry.translator) out.push(c === '' ? '#' : `# ${c}`);
  for (const c of entry.extracted) out.push(`#. ${c}`);
  if (!entry.obsolete) {
    // One reference per line keeps diffs readable.
    for (const ref of entry.references) out.push(`#: ${ref}`);
  }
  if (entry.flags.length > 0) out.push(`#, ${entry.flags.join(', ')}`);

  const prefix = entry.obsolete ? '#~ ' : '';
  if (entry.msgctxt !== null) out.push(...renderField('msgctxt', entry.msgctxt, prefix));
  out.push(...renderField('msgid', entry.msgid, prefix));
  if (entry.msgidPlural !== null) {
    out.push(...renderField('msgid_plural', entry.msgidPlural, prefix));
    const forms = entry.msgstr.length > 0 ? entry.msgstr : ['', ''];
    forms.forEach((form, i) => out.push(...renderField(`msgstr[${i}]`, form ?? '', prefix)));
  } else {
    out.push(...renderField('msgstr', entry.msgstr[0] ?? '', prefix));
  }
  return out.join('\n');
}

/**
 * Serialises a catalogue.
 *
 * @param {{ header: string, headerComments?: string[], entries: object[] }} catalogue
 * @returns {string}
 */
export function serializePo({ header, headerComments = [], entries }) {
  const blocks = [];
  const headerEntry = createEntry({ msgid: '', msgstr: [header], translator: headerComments });
  blocks.push(renderEntry(headerEntry));
  for (const entry of entries.filter((e) => !e.obsolete)) blocks.push(renderEntry(entry));
  for (const entry of entries.filter((e) => e.obsolete)) blocks.push(renderEntry(entry));
  return `${blocks.join('\n\n')}\n`;
}

/* ------------------------------------------------------------------ */
/* Header helpers                                                      */
/* ------------------------------------------------------------------ */

/** Parses `Key: value\n` header lines into an ordered map. */
export function parseHeader(header) {
  const map = new Map();
  for (const line of header.split('\n')) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    map.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
  }
  return map;
}

export function renderHeader(map) {
  return [...map.entries()].map(([k, v]) => `${k}: ${v}\n`).join('');
}

/* ------------------------------------------------------------------ */
/* .mo writer                                                          */
/* ------------------------------------------------------------------ */

/** True when an entry carries a usable translation. */
export function isTranslated(entry) {
  if (entry.obsolete || entry.flags.includes('fuzzy')) return false;
  if (entry.msgidPlural !== null) {
    return entry.msgstr.length > 0 && entry.msgstr.every((s) => typeof s === 'string' && s !== '');
  }
  return typeof entry.msgstr[0] === 'string' && entry.msgstr[0] !== '';
}

/**
 * Compiles translated entries into a little-endian GNU .mo buffer
 * (format revision 0, no hash table — WordPress's MO reader and
 * gettext both accept that).
 *
 * @param {string}   header  Raw header msgstr.
 * @param {object[]} entries Catalogue entries; untranslated / fuzzy /
 *                           obsolete ones are skipped.
 * @returns {Buffer}
 */
export function compileMo(header, entries) {
  const pairs = [{ key: Buffer.from('', 'utf8'), value: Buffer.from(header, 'utf8') }];
  for (const entry of entries) {
    if (!isTranslated(entry)) continue;
    let key = entry.msgid;
    if (entry.msgctxt !== null) key = `${entry.msgctxt}\u0004${key}`;
    if (entry.msgidPlural !== null) key = `${key}\u0000${entry.msgidPlural}`;
    const value = entry.msgidPlural !== null ? entry.msgstr.join('\u0000') : entry.msgstr[0];
    pairs.push({ key: Buffer.from(key, 'utf8'), value: Buffer.from(value, 'utf8') });
  }
  pairs.sort((a, b) => Buffer.compare(a.key, b.key));

  const count = pairs.length;
  const headerSize = 28;
  const origTableOffset = headerSize;
  const transTableOffset = origTableOffset + count * 8;
  let dataOffset = transTableOffset + count * 8;

  const origTable = Buffer.alloc(count * 8);
  const transTable = Buffer.alloc(count * 8);
  const chunks = [];

  pairs.forEach((pair, i) => {
    origTable.writeUInt32LE(pair.key.length, i * 8);
    origTable.writeUInt32LE(dataOffset, i * 8 + 4);
    chunks.push(pair.key, Buffer.from([0]));
    dataOffset += pair.key.length + 1;
  });
  pairs.forEach((pair, i) => {
    transTable.writeUInt32LE(pair.value.length, i * 8);
    transTable.writeUInt32LE(dataOffset, i * 8 + 4);
    chunks.push(pair.value, Buffer.from([0]));
    dataOffset += pair.value.length + 1;
  });

  const head = Buffer.alloc(headerSize);
  head.writeUInt32LE(0x950412de, 0); // magic
  head.writeUInt32LE(0, 4); // revision
  head.writeUInt32LE(count, 8);
  head.writeUInt32LE(origTableOffset, 12);
  head.writeUInt32LE(transTableOffset, 16);
  head.writeUInt32LE(0, 20); // hash table size
  head.writeUInt32LE(dataOffset, 24); // hash table offset (unused)

  return Buffer.concat([head, origTable, transTable, ...chunks]);
}

/**
 * Reads a .mo buffer back into `{ key: value }` (used by tests / check).
 *
 * @param {Buffer} buf
 * @returns {Map<string, string>}
 */
export function readMo(buf) {
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x950412de) throw new Error('Not a little-endian .mo file');
  const count = buf.readUInt32LE(8);
  const orig = buf.readUInt32LE(12);
  const trans = buf.readUInt32LE(16);
  const map = new Map();
  for (let i = 0; i < count; i++) {
    const kl = buf.readUInt32LE(orig + i * 8);
    const ko = buf.readUInt32LE(orig + i * 8 + 4);
    const vl = buf.readUInt32LE(trans + i * 8);
    const vo = buf.readUInt32LE(trans + i * 8 + 4);
    map.set(buf.toString('utf8', ko, ko + kl), buf.toString('utf8', vo, vo + vl));
  }
  return map;
}
