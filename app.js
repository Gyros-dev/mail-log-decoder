const input = document.getElementById('input');
const output = document.getElementById('output');

const sample = `"timestamp","source","message"
"2026-06-14T05:41:26.872Z","94.140.212.24","0 2026-06-14T08:41:26.872585+03:00 relay postfix 25010  D3F90824B3: info: header Subject: =?utf-8?Q?=D0=92=D0=B0=D1=88_=D0=B7=D0=B0=D0=BA=D0=B0?=? =?utf-8?Q?=D0=B7_=D1=81=D0=BE=D0=B7=D0=B4=D0=B0=D0=BD!?= from unknown[10.11.25.22]; from=<no-reply@kassir.ru> to=<ekdveri@gmail.com> proto=ESMTP helo=<[127.0.0.1]>"`;

function flash(btn, text) {
  if (!btn.dataset.label) btn.dataset.label = btn.textContent;
  btn.textContent = text;
  clearTimeout(btn._flashTimer);
  btn._flashTimer = setTimeout(() => btn.textContent = btn.dataset.label, 1600);
}

function bytesToString(bytes, charset) {
  const normalized = (charset || 'utf-8').toLowerCase().replace(/_/g, '-');
  const data = new Uint8Array(bytes);

  try {
    return new TextDecoder(normalized, { fatal: false }).decode(data);
  } catch (e) {
    try {
      return new TextDecoder('utf-8', { fatal: false }).decode(data);
    } catch (fallbackError) {
      return bytes.map(b => String.fromCharCode(b)).join('');
    }
  }
}

function decodeQToBytes(encoded) {
  const bytes = [];
  const clean = encoded.replace(/\r?\n[ \t]*/g, '');

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];

    if (ch === '_') {
      bytes.push(0x20);
      continue;
    }

    if (ch === '=' && /^[0-9A-Fa-f]{2}$/.test(clean.slice(i + 1, i + 3))) {
      bytes.push(parseInt(clean.slice(i + 1, i + 3), 16));
      i += 2;
      continue;
    }

    bytes.push(ch.charCodeAt(0));
  }

  return bytes;
}

function decodeBase64ToBytes(base64) {
  let clean = base64.replace(/\s/g, '');
  clean = clean.replace(/=+/g, '');
  while (clean.length % 4 !== 0) clean += '=';

  try {
    const binary = atob(clean);
    return Array.from(binary, ch => ch.charCodeAt(0));
  } catch (e) {
    return [];
  }
}

function normalizeBrokenMimeBoundaries(text) {
  return text.replace(/(\?=)\?[ \t\r\n]+(=\?[^?\s]+\?[bBqQ]\?)/g, '$1 $2');
}

function parseMimeWordAt(text, index) {
  const re = /=\?([^?\s]+)\?([bBqQ])\?([\s\S]*?)\?=/y;
  re.lastIndex = index;
  const match = re.exec(text);

  if (!match) return null;

  return {
    charset: match[1],
    encoding: match[2].toUpperCase(),
    encodedText: match[3],
    start: index,
    end: re.lastIndex
  };
}

function decodeMimeGroup(words) {
  let result = '';
  let i = 0;

  while (i < words.length) {
    const charset = words[i].charset;
    const encoding = words[i].encoding;
    const chunk = [words[i]];
    i++;

    while (
      i < words.length &&
      words[i].charset.toLowerCase() === charset.toLowerCase() &&
      words[i].encoding === encoding
    ) {
      chunk.push(words[i]);
      i++;
    }

    if (encoding === 'B') {
      const joinedBase64 = chunk.map(w => w.encodedText).join('');
      result += bytesToString(decodeBase64ToBytes(joinedBase64), charset);
    } else if (encoding === 'Q') {
      const joinedQ = chunk.map(w => w.encodedText).join('');
      result += bytesToString(decodeQToBytes(joinedQ), charset);
    } else {
      result += chunk.map(w => w.encodedText).join('');
    }
  }

  return result;
}

function decodeMimeWords(sourceText) {
  const text = normalizeBrokenMimeBoundaries(sourceText);
  let result = '';
  let i = 0;

  while (i < text.length) {
    const first = parseMimeWordAt(text, i);

    if (!first) {
      result += text[i];
      i++;
      continue;
    }

    const words = [first];
    let cursor = first.end;
    let lastWordEnd = first.end;

    while (true) {
      const whitespaceMatch = /^[ \t\r\n]+/.exec(text.slice(cursor));
      const whitespace = whitespaceMatch ? whitespaceMatch[0] : '';
      const nextStart = cursor + whitespace.length;
      const next = parseMimeWordAt(text, nextStart);

      if (!next) break;

      words.push(next);
      cursor = next.end;
      lastWordEnd = next.end;
    }

    result += decodeMimeGroup(words);
    i = lastWordEnd;
  }

  return result;
}

function decodeCsvEscapes(text) {
  return text
    .replace(/""/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t');
}

function decodeLogs() {
  const source = input.value;

  if (!source.trim()) {
    output.textContent = '';
    return;
  }

  output.textContent = decodeMimeWords(decodeCsvEscapes(source));
}

document.getElementById('decodeBtn').addEventListener('click', e => {
  decodeLogs();
  flash(e.currentTarget, 'Готово');
});

document.getElementById('copyBtn').addEventListener('click', async e => {
  const btn = e.currentTarget;
  const text = output.textContent || '';
  if (!text) { flash(btn, 'Нечего копировать'); return; }
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      if (!ok) throw new Error('copy failed');
    }
    flash(btn, 'Скопировано');
  } catch (err) {
    alert('Не удалось скопировать автоматически. Выделите текст результата и скопируйте вручную.');
  }
});

document.getElementById('clearBtn').addEventListener('click', e => {
  input.value = '';
  output.textContent = '';
  flash(e.currentTarget, 'Очищено');
});

document.getElementById('sampleBtn').addEventListener('click', () => {
  input.value = sample;
  decodeLogs();
});

input.addEventListener('input', decodeLogs);
