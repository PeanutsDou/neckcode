const cache = new Map<string, { text: string; ts: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const TIMEOUT = 15000;
const MAX_BODY = 1_000_000;

const BLOCKED_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
const BLOCKED_PREFIXES = ['10.', '172.16.', '172.17.', '172.18.', '172.19.', '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.', '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.', '192.168.'];

function isBlocked(url: URL): boolean {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return true;
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.includes(host)) return true;
  return BLOCKED_PREFIXES.some(p => host.startsWith(p));
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 200000);
}

export async function webFetch(urlStr: string): Promise<string> {
  const cached = cache.get(urlStr);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.text;
  }

  const url = new URL(urlStr);
  if (isBlocked(url)) {
    return `ERROR: Access to "${urlStr}" is blocked (internal/private network).`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const res = await fetch(urlStr, {
      signal: controller.signal,
      headers: { 'User-Agent': 'NeckCode/0.1' },
      redirect: 'follow',
    });

    if (!res.ok) {
      return `ERROR: HTTP ${res.status} ${res.statusText}`;
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return `ERROR: Unsupported content type: ${contentType}. Only text/html and text/plain are supported.`;
    }

    const raw = await res.text();
    const text = contentType.includes('text/html') ? stripHtml(raw) : raw;
    const truncated = text.length > MAX_BODY ? text.slice(0, MAX_BODY) + `\n...[truncated ${text.length - MAX_BODY} chars]` : text;

    cache.set(urlStr, { text: truncated, ts: Date.now() });
    return truncated;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('abort')) return 'ERROR: Request timed out (15s).';
    return `ERROR: ${msg}`;
  } finally {
    clearTimeout(timer);
  }
}
