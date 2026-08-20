/**
 * Native Zero-Dependency Web Search & Page Fetch Engine
 * Provides DuckDuckGo search querying and clean HTML-to-Markdown page extraction.
 */

/**
 * Decode common HTML entities
 */
function decodeHtmlEntities(str = '') {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
}

/**
 * Clean and extract target URL from DuckDuckGo redirect link
 */
function cleanDuckDuckGoUrl(href = '') {
  if (!href) return '';
  try {
    if (href.startsWith('//')) href = 'https:' + href;
    const url = new URL(href, 'https://html.duckduckgo.com');
    const uddg = url.searchParams.get('uddg');
    if (uddg) {
      return decodeURIComponent(uddg);
    }
    if (href.startsWith('http://') || href.startsWith('https://')) {
      return href;
    }
  } catch (e) {
    if (href.startsWith('http://') || href.startsWith('https://')) {
      return href;
    }
  }
  return href;
}

/**
 * SSRF Safety Guard: Disallow loopback / private addresses
 */
function isPrivateHost(hostname) {
  if (!hostname) return true;
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') return true;
  if (host.startsWith('10.') || host.startsWith('192.168.')) return true;
  if (host.startsWith('172.')) {
    const parts = host.split('.');
    const second = parseInt(parts[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

/**
 * Perform web search using DuckDuckGo HTML endpoint without needing any API key
 */
export async function executeWebSearch(query, maxResults = 8) {
  if (!query || !query.trim()) {
    throw new Error('Search query cannot be empty.');
  }

  const limit = Math.min(Math.max(1, maxResults || 8), 20);
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query.trim())}`;

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9'
  };

  let html = '';
  try {
    const res = await fetch(searchUrl, { headers, signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      html = await res.text();
    }
  } catch (e) {}

  // Fallback: If html.duckduckgo.com is blocked or empty, try lite.duckduckgo.com
  if (!html || (!html.includes('result__title') && !html.includes('result__snippet') && !html.includes('result-link'))) {
    try {
      const liteUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query.trim())}`;
      const liteRes = await fetch(liteUrl, { headers, signal: AbortSignal.timeout(10000) });
      if (liteRes.ok) {
        html = await liteRes.text();
      }
    } catch (e) {}
  }

  const results = [];
  if (!html) {
    return { query, results, total: 0, notice: 'No response from search engine' };
  }

  // 1. Standard HTML DuckDuckGo result blocks
  // Regex to extract .result blocks: <div class="...result..."> ... </div>
  const resultBlockRegex = /<div[^>]*class="[^"]*(?:results_links|result\b|web-result)[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
  let match;

  while ((match = resultBlockRegex.exec(html)) !== null && results.length < limit) {
    const block = match[1];

    // Extract title & link: <a class="result__a" href="...">title</a> or <a class="result-link" href="...">
    const linkMatch = /<a[^>]*class="[^"]*(?:result__a|result-link)[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    // Extract snippet: <a class="result__snippet" ...>snippet</a> or <td class="result-snippet">
    const snippetMatch = /<[^>]*class="[^"]*(?:result__snippet|result-snippet)[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i.exec(block);

    if (linkMatch) {
      const rawHref = linkMatch[1];
      const rawTitle = linkMatch[2].replace(/<[^>]+>/g, '').trim();
      const rawSnippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '';

      const cleanUrl = cleanDuckDuckGoUrl(rawHref);
      const title = decodeHtmlEntities(rawTitle);
      const snippet = decodeHtmlEntities(rawSnippet);

      if (cleanUrl && title && !results.some(r => r.url === cleanUrl)) {
        results.push({ title, url: cleanUrl, snippet });
      }
    }
  }

  // 2. Fallback parser for Lite format (table-based results)
  if (results.length === 0) {
    const liteRowRegex = /<tr[^>]*>[\s\S]*?<a[^>]*class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/tr>[\s\S]*?<tr[^>]*>[\s\S]*?<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;
    while ((match = liteRowRegex.exec(html)) !== null && results.length < limit) {
      const cleanUrl = cleanDuckDuckGoUrl(match[1]);
      const title = decodeHtmlEntities(match[2].replace(/<[^>]+>/g, '').trim());
      const snippet = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, '').trim());

      if (cleanUrl && title && !results.some(r => r.url === cleanUrl)) {
        results.push({ title, url: cleanUrl, snippet });
      }
    }
  }

  // 3. Generic link extraction fallback
  if (results.length === 0) {
    const genericLinkRegex = /<a[^>]+href="(\/l\/\?[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((match = genericLinkRegex.exec(html)) !== null && results.length < limit) {
      const cleanUrl = cleanDuckDuckGoUrl(match[1]);
      const title = decodeHtmlEntities(match[2].replace(/<[^>]+>/g, '').trim());
      if (cleanUrl && title && cleanUrl.startsWith('http') && !results.some(r => r.url === cleanUrl)) {
        results.push({ title, url: cleanUrl, snippet: '' });
      }
    }
  }

  return {
    query,
    results,
    total: results.length
  };
}

/**
 * Converts raw HTML into clean, token-efficient Markdown
 */
function htmlToMarkdown(html = '') {
  let md = html;

  // 1. Remove non-content tags & their inner content
  md = md.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  md = md.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  md = md.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '');
  md = md.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '');
  md = md.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  md = md.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '');
  md = md.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '');
  md = md.replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '');
  md = md.replace(/<!--[\s\S]*?-->/g, '');

  // 2. Convert Headings
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n\n# $1\n\n');
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n\n## $1\n\n');
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n\n### $1\n\n');
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n\n#### $1\n\n');

  // 3. Convert Code Blocks & Inline Code
  md = md.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (m, code) => {
    return `\n\`\`\`\n${decodeHtmlEntities(code.replace(/<[^>]+>/g, '').trim())}\n\`\`\`\n`;
  });
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, ' `$1` ');

  // 4. Convert Links: <a href="url">text</a> -> [text](url)
  md = md.replace(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (m, href, text) => {
    const cleanText = text.replace(/<[^>]+>/g, '').trim();
    if (!cleanText || href.startsWith('#') || href.startsWith('javascript:')) return cleanText;
    return `[${cleanText}](${href})`;
  });

  // 5. Convert Strong & Emphasis
  md = md.replace(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, '**$1**');
  md = md.replace(/<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, '*$1*');

  // 6. Convert Lists
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');
  md = md.replace(/<\/?(?:ul|ol)[^>]*>/gi, '\n');

  // 7. Convert Paragraphs, Blockquotes & Line Breaks
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, '\n> $1\n');
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n\n$1\n\n');
  md = md.replace(/<br\s*\/?>/gi, '\n');
  md = md.replace(/<hr\s*\/?>/gi, '\n---\n');

  // 8. Strip remaining HTML tags
  md = md.replace(/<[^>]+>/g, '');

  // 9. Decode entities & clean up multiple whitespace/blank lines
  md = decodeHtmlEntities(md);
  md = md.replace(/[ \t]+/g, ' ');
  md = md.replace(/\n\s*\n\s*\n+/g, '\n\n');

  return md.trim();
}

/**
 * Fetches content from a web URL, strips boilerplate, and converts to clean Markdown
 */
export async function executeFetchPage(url, maxLength = 8000, rawHtml = false) {
  if (!url || !url.trim()) {
    throw new Error('URL cannot be empty.');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (e) {
    throw new Error(`Invalid URL format: ${url}`);
  }

  if (isPrivateHost(parsedUrl.hostname)) {
    throw new Error(`Access to private / loopback IP address (${parsedUrl.hostname}) is blocked for safety.`);
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7'
  };

  const res = await fetch(url, {
    headers,
    redirect: 'follow',
    signal: AbortSignal.timeout(12000)
  });

  if (!res.ok) {
    throw new Error(`HTTP Error ${res.status} (${res.statusText}) when fetching ${url}`);
  }

  const rawBody = await res.text();
  const contentType = res.headers.get('content-type') || '';
  const isHtml = contentType.includes('html') || contentType.includes('xml') || rawBody.trim().startsWith('<');

  // Extract title
  let title = 'Web Content';
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(rawBody) || /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(rawBody);
  if (titleMatch) {
    title = decodeHtmlEntities(titleMatch[1].replace(/<[^>]+>/g, '').trim());
  }

  let content = '';
  if (rawHtml || !isHtml) {
    content = rawBody;
  } else {
    // Convert HTML to Markdown
    content = htmlToMarkdown(rawBody);
  }

  const maxChars = Math.max(500, Math.min(maxLength || 8000, 30000));
  const truncated = content.length > maxChars;
  if (truncated) {
    content = content.slice(0, maxChars) + '\n\n*[Content truncated...]*';
  }

  return {
    url: res.url || url,
    title,
    status: res.status,
    content,
    truncated
  };
}
