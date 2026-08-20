/**
 * Obsidian / Linear-grade Markdown & YAML Frontmatter Parser
 * Pure ES Module with zero external dependencies.
 * Strictly adheres to No Emojis Policy: uses vector SVG icons and typographic badges.
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
      if (trimmed.startsWith('- on:') || trimmed.startsWith('- target:') || trimmed.startsWith('- condition:')) {
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
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const ROLE_THEMES = {
  orchestrator: { badgeClass: 'role-orchestrator', label: 'Orchestrator' },
  evaluator: { badgeClass: 'role-evaluator', label: 'Evaluator' },
  reviewer: { badgeClass: 'role-evaluator', label: 'Reviewer' },
  researcher: { badgeClass: 'role-researcher', label: 'Researcher' },
  coder: { badgeClass: 'role-coder', label: 'Coder' },
  router: { badgeClass: 'role-router', label: 'Router' },
  assistant: { badgeClass: 'role-assistant', label: 'Assistant' },
  tool: { badgeClass: 'role-tool', label: 'Tool' }
};

export function renderMarkdown(markdownText = '') {
  const { frontmatter, body } = parseFrontmatter(markdownText);
  let html = '';

  // Render frontmatter developer card if frontmatter fields exist
  const fmKeys = Object.keys(frontmatter);
  if (fmKeys.length > 0) {
    const roleKey = (frontmatter.role || '').toLowerCase();
    const roleInfo = ROLE_THEMES[roleKey] || { badgeClass: 'role-default', label: frontmatter.role || 'Agent' };

    html += `
      <div class="md-frontmatter-card">
        <div class="md-fm-header">
          <div class="md-fm-title-group">
            <span class="md-fm-name">${escapeHtml(frontmatter.name || 'Agent')}</span>
            <span class="md-fm-role-badge ${roleInfo.badgeClass}">${escapeHtml(roleInfo.label)}</span>
          </div>
          ${frontmatter.temperature !== undefined ? `
            <div class="md-fm-temp-tag">
              <span class="md-fm-temp-label">TEMP</span>
              <span class="md-fm-temp-val">${escapeHtml(String(frontmatter.temperature))}</span>
            </div>
          ` : ''}
        </div>

        ${frontmatter.description ? `
          <div class="md-fm-desc">
            ${inlineFormat(frontmatter.description)}
          </div>
        ` : ''}

        <div class="md-fm-tags-grid">
          ${frontmatter.tools && Array.isArray(frontmatter.tools) && frontmatter.tools.length > 0 ? `
            <div class="md-fm-row">
              <span class="md-fm-row-label">TOOLS</span>
              <div class="md-fm-chips">
                ${frontmatter.tools.map(t => `<span class="md-chip md-chip-tool"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>${escapeHtml(t)}</span>`).join('')}
              </div>
            </div>
          ` : ''}

          ${frontmatter.skills && Array.isArray(frontmatter.skills) && frontmatter.skills.length > 0 ? `
            <div class="md-fm-row">
              <span class="md-fm-row-label">SKILLS</span>
              <div class="md-fm-chips">
                ${frontmatter.skills.map(s => `<span class="md-chip md-chip-skill"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>${escapeHtml(s)}</span>`).join('')}
              </div>
            </div>
          ` : ''}

          ${frontmatter.globs && Array.isArray(frontmatter.globs) && frontmatter.globs.length > 0 ? `
            <div class="md-fm-row">
              <span class="md-fm-row-label">GLOBS</span>
              <div class="md-fm-chips">
                ${frontmatter.globs.map(g => `<span class="md-chip md-chip-glob">${escapeHtml(g)}</span>`).join('')}
              </div>
            </div>
          ` : ''}

          ${frontmatter.routes && Array.isArray(frontmatter.routes) && frontmatter.routes.length > 0 ? `
            <div class="md-fm-row">
              <span class="md-fm-row-label">ROUTES</span>
              <div class="md-fm-chips">
                ${frontmatter.routes.map(r => {
                  const normOn = (r.on || '').toLowerCase();
                  const isPass = normOn === 'pass' || normOn === 'approved' || normOn === 'start';
                  const isFail = normOn === 'fail' || normOn === 'reject' || normOn === 'rejected';
                  const badgeClass = isPass ? 'md-route-pass' : (isFail ? 'md-route-fail' : 'md-route-default');
                  const onText = (r.on ? r.on : 'NEXT').toUpperCase();
                  const maxText = r.max_retries ? ` (max ${r.max_retries})` : '';
                  return `<span class="md-chip ${badgeClass}"><span class="md-route-dot"></span><strong>${onText}:</strong> ${escapeHtml(r.target || '')}${maxText}</span>`;
                }).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  // Parse body blocks
  const lines = body.split('\n');
  let inCodeBlock = false;
  let codeLang = '';
  let codeBuffer = '';
  let inUlList = false;
  let inOlList = false;
  let inTable = false;
  let tableHeaderParsed = false;
  let tableRows = [];
  let inCallout = false;
  let calloutType = 'NOTE';
  let calloutBuffer = [];

  const closeOpenLists = () => {
    let res = '';
    if (inUlList) { res += '</ul>'; inUlList = false; }
    if (inOlList) { res += '</ol>'; inOlList = false; }
    return res;
  };

  const closeCallout = () => {
    let res = '';
    if (inCallout) {
      const typeLower = calloutType.toLowerCase();
      const content = calloutBuffer.map(c => `<p>${inlineFormat(c)}</p>`).join('');
      res += `
        <div class="md-callout md-callout-${typeLower}">
          <div class="md-callout-header">
            <span class="md-callout-badge">${escapeHtml(calloutType)}</span>
          </div>
          <div class="md-callout-body">${content}</div>
        </div>
      `;
      inCallout = false;
      calloutType = 'NOTE';
      calloutBuffer = [];
    }
    return res;
  };

  const closeTable = () => {
    let res = '';
    if (inTable) {
      if (tableRows.length > 0) {
        const headerRow = tableRows[0];
        const bodyRows = tableRows.slice(1);
        res += '<div class="md-table-wrapper"><table class="md-table"><thead><tr>';
        headerRow.forEach(h => {
          res += `<th>${inlineFormat(h)}</th>`;
        });
        res += '</tr></thead><tbody>';
        bodyRows.forEach(row => {
          res += '<tr>';
          row.forEach(cell => {
            res += `<td>${inlineFormat(cell)}</td>`;
          });
          res += '</tr>';
        });
        res += '</tbody></table></div>';
      }
      inTable = false;
      tableHeaderParsed = false;
      tableRows = [];
    }
    return res;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Code block ```lang
    if (trimmed.startsWith('```')) {
      html += closeOpenLists();
      html += closeCallout();
      html += closeTable();

      if (inCodeBlock) {
        html += `
          <div class="md-code-card">
            <div class="md-code-header">
              <span class="md-code-lang">${escapeHtml(codeLang || 'CODE')}</span>
            </div>
            <pre><code>${escapeHtml(codeBuffer.trimEnd())}</code></pre>
          </div>
        `;
        codeBuffer = '';
        codeLang = '';
        inCodeBlock = false;
      } else {
        codeLang = trimmed.slice(3).trim();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer += line + '\n';
      continue;
    }

    // Callouts & Blockquotes: > [!NOTE], > [!TIP], > [!WARNING], > [!IMPORTANT], > [!CAUTION]
    if (trimmed.startsWith('>')) {
      html += closeOpenLists();
      html += closeTable();

      const quoteContent = trimmed.replace(/^>\s?/, '');
      const calloutMatch = quoteContent.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);

      if (calloutMatch) {
        html += closeCallout();
        inCallout = true;
        calloutType = calloutMatch[1].toUpperCase();
        const restOfLine = quoteContent.replace(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i, '');
        if (restOfLine) calloutBuffer.push(restOfLine);
      } else if (inCallout) {
        calloutBuffer.push(quoteContent);
      } else {
        inCallout = true;
        calloutType = 'NOTE';
        calloutBuffer.push(quoteContent);
      }
      continue;
    } else if (inCallout) {
      html += closeCallout();
    }

    // Table rows: | cell | cell |
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      html += closeOpenLists();
      html += closeCallout();

      // Check if separator line (|---|---|)
      if (/^\|[\s\-:|]+\|$/.test(trimmed)) {
        tableHeaderParsed = true;
        continue;
      }

      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map(c => c.trim());

      inTable = true;
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      html += closeTable();
    }

    // Math block: $$ ... $$
    if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length > 2) {
      html += closeOpenLists();
      html += closeCallout();
      html += closeTable();
      const mathInner = trimmed.slice(2, -2).trim();
      html += `<div class="md-math-block"><code>${escapeHtml(mathInner)}</code></div>`;
      continue;
    }

    // Horizontal Rule: --- or ***
    if (/^(---|---|\*\*\*)$/.test(trimmed)) {
      html += closeOpenLists();
      html += closeCallout();
      html += closeTable();
      html += '<hr class="md-divider" />';
      continue;
    }

    // Headers (#, ##, ###, ####, #####)
    if (trimmed.startsWith('# ')) {
      html += closeOpenLists();
      html += closeCallout();
      html += closeTable();
      html += `<h1 class="md-h1"><span class="md-heading-marker">#</span>${inlineFormat(trimmed.slice(2))}</h1>`;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      html += closeOpenLists();
      html += closeCallout();
      html += closeTable();
      html += `<h2 class="md-h2"><span class="md-heading-marker">##</span>${inlineFormat(trimmed.slice(3))}</h2>`;
      continue;
    }
    if (trimmed.startsWith('### ')) {
      html += closeOpenLists();
      html += closeCallout();
      html += closeTable();
      html += `<h3 class="md-h3"><span class="md-heading-marker">###</span>${inlineFormat(trimmed.slice(4))}</h3>`;
      continue;
    }
    if (trimmed.startsWith('#### ')) {
      html += closeOpenLists();
      html += closeCallout();
      html += closeTable();
      html += `<h4 class="md-h4">${inlineFormat(trimmed.slice(5))}</h4>`;
      continue;
    }

    // Ordered Lists: 1. Item, 2. Item
    const olMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (olMatch) {
      if (inUlList) { html += '</ul>'; inUlList = false; }
      if (!inOlList) {
        html += '<ol class="md-ol">';
        inOlList = true;
      }
      html += `<li class="md-ol-item"><span class="md-ol-num">${olMatch[1]}</span><span class="md-ol-text">${inlineFormat(olMatch[2])}</span></li>`;
      continue;
    } else if (inOlList && !trimmed.startsWith('   ')) {
      html += '</ol>';
      inOlList = false;
    }

    // Unordered Lists: - Item or * Item
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (inOlList) { html += '</ol>'; inOlList = false; }
      if (!inUlList) {
        html += '<ul class="md-ul">';
        inUlList = true;
      }
      html += `<li class="md-ul-item"><span class="md-ul-bullet"></span><span class="md-ul-text">${inlineFormat(trimmed.slice(2))}</span></li>`;
      continue;
    } else if (inUlList && !trimmed.startsWith('  ')) {
      html += '</ul>';
      inUlList = false;
    }

    // Empty line
    if (!trimmed) {
      html += closeOpenLists();
      html += closeCallout();
      html += closeTable();
      continue;
    }

    // Regular paragraph
    html += closeOpenLists();
    html += closeCallout();
    html += closeTable();
    html += `<p class="md-p">${inlineFormat(trimmed)}</p>`;
  }

  html += closeOpenLists();
  html += closeCallout();
  html += closeTable();

  if (inCodeBlock) {
    html += `
      <div class="md-code-card">
        <div class="md-code-header"><span class="md-code-lang">${escapeHtml(codeLang || 'CODE')}</span></div>
        <pre><code>${escapeHtml(codeBuffer.trimEnd())}</code></pre>
      </div>
    `;
  }

  return html;
}

export function inlineFormat(text) {
  let out = escapeHtml(text);

  // LaTeX Math inline: $$...$$ or $...$
  out = out.replace(/\$\$([^$]+)\$\$/g, '<code class="md-math-inline">$1</code>');
  out = out.replace(/\$([^$]+)\$/g, '<code class="md-math-inline">$1</code>');

  // Math transition arrows: \longrightarrow or \rightarrow
  out = out.replace(/\\longrightarrow/g, ' &rarr; ');
  out = out.replace(/\\rightarrow/g, ' &rarr; ');
  out = out.replace(/\\mathbf\{([^}]+)\}/g, '<strong>$1</strong>');
  out = out.replace(/\\text\{([^}]+)\}/g, '<span>$1</span>');
  out = out.replace(/\\xrightarrow\{([^}]+)\}/g, ' &mdash; [$1] &rarr; ');

  // Bold **text**
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong class="md-strong">$1</strong>');

  // Italic *text*
  out = out.replace(/\*(.+?)\*/g, '<em class="md-em">$1</em>');

  // Inline code `code`
  out = out.replace(/`([^`]+)`/g, '<code class="md-code-inline">$1</code>');

  // Strikethrough ~~text~~
  out = out.replace(/~~(.+?)~~/g, '<del class="md-del">$1</del>');

  // Links [title](url)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="md-link" target="_blank" rel="noopener">$1</a>');

  return out;
}

export function estimateTokens(text = '') {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

