const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

function normalizeMarkdownTransport(text='') {
  let raw = String(text ?? '')
    .replace(/\\([*_`~])/g, '$1')
    .replace(/\r\n?/g, '\n');
  raw = raw.replace(/\*{5,}/g, m => m.length % 2 ? '***' : '**');
  raw = raw.replace(/(^|\s)\*{2,4}(?=\s|$)/g, '$1');
  return raw;
}

export function renderMarkdownSafe(text='') {
  let x = escapeHtml(normalizeMarkdownTransport(text));
  const blocks = [];
  x = x.replace(/```(?:[a-z0-9_-]+)?\n?([\s\S]*?)```/gi, (_, code) => {
    const i = blocks.push(`<pre><code>${code.trim()}</code></pre>`) - 1;
    return `@@SLC_CODE_${i}@@`;
  });
  x = x
    .replace(/^###\s+(.+)$/gm, '<h4>$1</h4>')
    .replace(/^##\s+(.+)$/gm, '<h3>$1</h3>')
    .replace(/^#\s+(.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  const lines = x.split('\n');
  const out = [];
  let list = '';
  const closeList = () => { if (list) { out.push(`</${list}>`); list = ''; } };
  for (const line of lines) {
    const ul = line.match(/^\s*[-•]\s+(.+)/);
    const ol = line.match(/^\s*\d+[.)]\s+(.+)/);
    const quote = line.match(/^&gt;\s*(.+)/);
    if (ul) {
      if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
      out.push(`<li>${ul[1]}</li>`);
      continue;
    }
    if (ol) {
      if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; }
      out.push(`<li>${ol[1]}</li>`);
      continue;
    }
    closeList();
    if (quote) out.push(`<blockquote>${quote[1]}</blockquote>`);
    else if (line.trim()) out.push(`<p>${line}</p>`);
    else out.push('<br>');
  }
  closeList();
  return out.join('').replace(/@@SLC_CODE_(\d+)@@/g, (_, i) => blocks[Number(i)] || '');
}

export { normalizeMarkdownTransport };
