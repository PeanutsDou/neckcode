const TIMEOUT = 10000;

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return [];
    const data = (await res.json()) as Record<string, unknown>;

    const results: SearchResult[] = [];
    const heading = data.Heading as string;
    const abstract = data.Abstract as string;
    const abstractUrl = data.AbstractURL as string;

    if (heading && abstract) {
      results.push({ title: heading, url: abstractUrl || '', snippet: abstract });
    }

    const related = data.RelatedTopics as Array<Record<string, unknown>>;
    if (Array.isArray(related)) {
      for (const item of related) {
        if (results.length >= 10) break;
        const t = item.Text as string;
        const u = item.FirstURL as string;
        if (t && u) {
          const parts = t.split(' - ');
          results.push({ title: parts[0] || t, url: u, snippet: parts.slice(1).join(' - ') || t });
        }
      }
    }

    return results.slice(0, 10);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function webSearch(query: string): Promise<string> {
  if (!query || !query.trim()) {
    return 'ERROR: query is required.';
  }

  const results = await searchDuckDuckGo(query.trim());

  if (results.length === 0) {
    return `No results found for "${query}".`;
  }

  return results
    .map((r, i) => `${i + 1}. **${r.title}**\n   URL: ${r.url}\n   ${r.snippet}`)
    .join('\n\n');
}
