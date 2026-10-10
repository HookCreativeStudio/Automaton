import Parser from "rss-parser";

const parser = new Parser({ timeout: 10000 });

export async function parseFeed(url, limit = 10) {
  const feed = await parser.parseURL(url);
  const items = (feed.items || []).slice(0, Math.min(limit, 50)).map(item => ({
    title: item.title,
    link: item.link,
    published: item.pubDate || item.isoDate,
    summary: item.contentSnippet || item.summary || "",
  }));
  return {
    title: feed.title,
    description: feed.description,
    link: feed.link,
    item_count: items.length,
    items,
  };
}
