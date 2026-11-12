// Small, safe Markdown renderer for Planty chat answers.
// Escapes ALL HTML first, then adds a fixed set of tags; links only for http(s) URLs.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

function inline(text) {
  const codes = [];
  let s = escape(text).replace(/`([^`\n]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`); // protect code spans
  s = s
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`)
    .replace(/\*\*([^*\n]+)\*\*|__([^_\n]+)__/g, (_, a, b) => `<strong>${a ?? b}</strong>`)
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}

export function renderMarkdown(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [], list = null; // list = { tag, items }
  const flushPara = () => { if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; };
  const flushList = () => { if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; };
  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if ((m = line.match(/^\s{0,3}(#{1,3})\s+(.+)$/))) { flushPara(); flushList(); out.push(`<h${m[1].length + 2}>${inline(m[2])}</h${m[1].length + 2}>`); continue; }
    if ((m = line.match(/^\s{0,3}>\s?(.*)$/))) { flushPara(); flushList(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); continue; }
    if ((m = line.match(/^\s*[-*•]\s+(.+)$/)) || (m = line.match(/^\s*\d{1,2}[.)]\s+(.+)$/))) {
      const tag = /^\s*\d/.test(line) ? 'ol' : 'ul';
      flushPara();
      if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
      list.items.push(m[1]);
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushPara(); flushList();
  return out.join('');
}
