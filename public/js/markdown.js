/**
 * Lightweight Markdown & YAML Frontmatter Parser
 */

export function parseFrontmatter(markdownText = '') {
  const match = markdownText.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: markdownText };
  }

  const rawYml = match[1];
  const body = match[2];
  const frontmatter = {};
  const routes = [];
  let inRoutes = false;
  let currentRoute = null;

  rawYml.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    if (trimmed.startsWith('routes:')) {
      inRoutes = true;
      return;
    }

    if (inRoutes) {
      if (trimmed.startsWith('- on:') || trimmed.startsWith('- target:')) {
        if (currentRoute) routes.push(currentRoute);
        currentRoute = {};
      }
      if (line.startsWith('  ') && currentRoute) {
        const colonIdx = trimmed.replace(/^-\s*/, '').indexOf(':');
        if (colonIdx > 0) {
          const k = trimmed.replace(/^-\s*/, '').slice(0, colonIdx).trim();
          const v = trimmed.replace(/^-\s*/, '').slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '');
          currentRoute[k] = v;
        }
        return;
      }
      if (!line.startsWith('  ')) {
        inRoutes = false;
        if (currentRoute) { routes.push(currentRoute); currentRoute = null; }
      }
    }

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx > 0 && !inRoutes) {
      const key = trimmed.slice(0, colonIdx).trim();
      let val = trimmed.slice(colonIdx + 1).trim();
      if (val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
      } else {
        val = val.replace(/^['"]|['"]$/g, '');
      }
      frontmatter[key] = val;
    }
  });

  if (currentRoute) routes.push(currentRoute);
  if (routes.length > 0) frontmatter.routes = routes;

  return { frontmatter, body };
}

export function escapeHtml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderMarkdown(markdownText = '') {
  const { frontmatter, body } = parseFrontmatter(markdownText);
  let html = '';

  // Render frontmatter pill summary if available
  const fmKeys = Object.keys(frontmatter);
  if (fmKeys.length > 0) {
    html += '<div class="frontmatter-summary">';
    for (const key of fmKeys) {
      if (key === 'routes') {
        const routeList = frontmatter.routes || [];
        for (const r of routeList) {
          const badgeClass = r.on === 'pass' ? 'fm-route-pass' : (r.on === 'fail' ? 'fm-route-fail' : 'fm-route-default');
          const onText = r.on ? r.on.toUpperCase() : 'NEXT';
          const maxText = r.max_retries ? ` (max ${r.max_retries})` : '';
          html += `<span class="fm-pill ${badgeClass}"><strong>${onText}:</strong> -> ${escapeHtml(r.target || '')}${maxText}</span>`;
        }
      } else {
        const val = Array.isArray(frontmatter[key]) ? frontmatter[key].join(', ') : frontmatter[key];
        html += `<span class="fm-pill"><strong>${escapeHtml(key)}:</strong> ${escapeHtml(String(val))}</span>`;
      }
    }
    html += '</div>';
  }

  // Parse body lines
  const lines = body.split('\n');
  let inCodeBlock = false;
  let codeBuffer = '';
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block ```
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        html += `<pre><code>${escapeHtml(codeBuffer.trimEnd())}</code></pre>`;
        codeBuffer = '';
        inCodeBlock = false;
      } else {
        if (inList) {
          html += '</ul>';
          inList = false;
        }
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer += line + '\n';
      continue;
    }

    const trimmed = line.trim();

    // Headers
    if (trimmed.startsWith('# ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h1>${inlineFormat(trimmed.slice(2))}</h1>`;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h2>${inlineFormat(trimmed.slice(3))}</h2>`;
      continue;
    }
    if (trimmed.startsWith('### ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h3>${inlineFormat(trimmed.slice(4))}</h3>`;
      continue;
    }

    // Unordered List
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList) {
        html += '<ul>';
        inList = true;
      }
      html += `<li>${inlineFormat(trimmed.slice(2))}</li>`;
      continue;
    } else if (inList) {
      html += '</ul>';
      inList = false;
    }

    // Empty line
    if (!trimmed) {
      continue;
    }

    // Regular paragraph
    html += `<p>${inlineFormat(trimmed)}</p>`;
  }

  if (inCodeBlock) {
    html += `<pre><code>${escapeHtml(codeBuffer.trimEnd())}</code></pre>`;
  }
  if (inList) {
    html += '</ul>';
  }

  return html;
}

function inlineFormat(text) {
  let out = escapeHtml(text);
  
  // Bold **text**
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  
  // Italic *text*
  out = out.replace(/\*(.+?)\*/g, '<em>$1</em>');
  
  // Inline code `code`
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Links [title](url)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  return out;
}

export function estimateTokens(text = '') {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
