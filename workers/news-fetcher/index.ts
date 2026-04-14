/**
 * Cloudflare Worker — News Fetcher
 *
 * Runs on a cron schedule (see wrangler.toml) to fetch RSS feeds
 * from cybersecurity news sources and store the items in KV.
 *
 * The stored JSON is consumed by the Astro front-end at build time
 * or via a server-side route.
 */

export interface Env {
  NEWS_CACHE: KVNamespace;
}

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  summary?: string;
}

const RSS_FEEDS: Array<{ url: string; source: string }> = [
  { url: "https://feeds.feedburner.com/TheHackersNews", source: "The Hacker News" },
  { url: "https://www.bleepingcomputer.com/feed/", source: "BleepingComputer" },
  { url: "https://krebsonsecurity.com/feed/", source: "Krebs on Security" },
  { url: "https://www.darkreading.com/rss.xml", source: "Dark Reading" },
  { url: "https://threatpost.com/feed/", source: "Threatpost" },
];

const KV_KEY = "news:latest";
const MAX_ITEMS_PER_FEED = 10;

async function fetchFeed(
  feedUrl: string,
  source: string
): Promise<NewsItem[]> {
  try {
    const response = await fetch(feedUrl, {
      headers: { "User-Agent": "CyberInventors-NewsFetcher/1.0" },
      cf: { cacheTtl: 300 },
    });

    if (!response.ok) return [];

    const xml = await response.text();
    const items: NewsItem[] = [];

    // Lightweight XML parsing — no DOM available in Workers
    const itemBlocks = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];

    for (const block of itemBlocks.slice(0, MAX_ITEMS_PER_FEED)) {
      const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
        ?? block.match(/<title>(.*?)<\/title>/)?.[1]
        ?? "";

      const link = block.match(/<link>(.*?)<\/link>/)?.[1]
        ?? block.match(/<guid[^>]*>(https?:\/\/[^<]+)<\/guid>/)?.[1]
        ?? "";

      const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? "";

      const summary =
        block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1]
        ?? block.match(/<description>([\s\S]*?)<\/description>/)?.[1]
        ?? "";

      // Strip HTML tags from summary
      const cleanSummary = summary.replace(/<[^>]*>/g, "").trim().slice(0, 200);

      if (title && link) {
        items.push({ title: title.trim(), link: link.trim(), pubDate, source, summary: cleanSummary || undefined });
      }
    }

    return items;
  } catch {
    return [];
  }
}

export default {
  // Cron trigger — configure schedule in wrangler.toml
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    const results = await Promise.allSettled(
      RSS_FEEDS.map(({ url, source }) => fetchFeed(url, source))
    );

    const allItems: NewsItem[] = results
      .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
      .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
      .slice(0, 100);

    await env.NEWS_CACHE.put(KV_KEY, JSON.stringify(allItems), {
      // Expire after 2 hours — cron should refresh before then
      expirationTtl: 7200,
    });

    console.log(`News fetcher: stored ${allItems.length} items`);
  },

  // HTTP handler — optional, lets you trigger a manual refresh
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/news.json") {
      const cached = await env.NEWS_CACHE.get(KV_KEY);
      return new Response(cached ?? "[]", {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    if (url.pathname === "/refresh" && request.method === "POST") {
      // Simple secret check — set NEWS_REFRESH_SECRET in wrangler.toml secrets
      const authHeader = request.headers.get("Authorization") ?? "";
      const secret = (env as unknown as Record<string, string>)["NEWS_REFRESH_SECRET"];
      if (secret && authHeader !== `Bearer ${secret}`) {
        return new Response("Unauthorized", { status: 401 });
      }

      const results = await Promise.allSettled(
        RSS_FEEDS.map(({ url: feedUrl, source }) => fetchFeed(feedUrl, source))
      );
      const allItems: NewsItem[] = results
        .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
        .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
        .slice(0, 100);

      await env.NEWS_CACHE.put(KV_KEY, JSON.stringify(allItems), {
        expirationTtl: 7200,
      });

      return new Response(JSON.stringify({ ok: true, count: allItems.length }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
};
