import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { facilitator } from "@coinbase/x402";
import { HTTPFacilitatorClient } from "@x402/core/http";
import { parseFeed } from "./feed.js";
import { requestLogger } from "./logger.js";

const app = express();
app.use(express.json());
app.use(requestLogger("fetchor"));

const PORT = process.env.PORT || 3000;
const PAY_TO = process.env.PAY_TO || "0x7754DfCEBaA2E5c562aA42c67C5A6E7EDF5b5b81";
const PRICE = process.env.PRICE || "$0.002";

const facilitatorClient = new HTTPFacilitatorClient(facilitator);

const resourceServer = new x402ResourceServer(facilitatorClient)
  .register("eip155:8453",  new ExactEvmScheme())
  .register("eip155:137",   new ExactEvmScheme())
  .register("eip155:42161", new ExactEvmScheme())
  .registerExtension(bazaarResourceServerExtension);

app.use(
  paymentMiddleware(
    {
      "POST /feed": {
        accepts: [
          { scheme: "exact", price: PRICE, network: "eip155:8453",  payTo: PAY_TO },
          { scheme: "exact", price: PRICE, network: "eip155:137",   payTo: PAY_TO },
          { scheme: "exact", price: PRICE, network: "eip155:42161", payTo: PAY_TO },
        ],
        description:
          "Use this to read any RSS or Atom feed and get structured article data. " +
          "Returns feed title, description, and recent items with titles, links, dates, and summaries. No account required.",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string", description: "URL of the RSS or Atom feed" },
            limit: { type: "number", description: "Max items to return (default: 10, max: 50)" },
          },
          required: ["url"],
        },
        outputSchema: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            link: { type: "string" },
            item_count: { type: "number" },
            items: { type: "array" },
          },
        },
        extensions: declareDiscoveryExtension({
          bodyType: "json",
          input: { url: "https://feeds.bbci.co.uk/news/rss.xml", limit: 5 },
          inputSchema: {
            properties: {
              url: { type: "string", description: "URL of the RSS or Atom feed" },
              limit: { type: "number", description: "Max items to return (default: 10, max: 50)" },
            },
            required: ["url"],
          },
          output: {
            example: {
              title: "BBC News",
              description: "BBC News - Home",
              link: "https://www.bbc.co.uk/news",
              item_count: 5,
              items: [{ title: "Article headline", link: "https://bbc.co.uk/...", published: "Mon, 01 Jan 2025", summary: "Short summary..." }],
            },
          },
        }),
      },
    },
    resourceServer
  )
);

app.post("/feed", async (req, res) => {
  const { url, limit = 10 } = req.body;
  if (!url) return res.status(400).json({ error: "url is required" });
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }
  try {
    const result = await parseFeed(url, limit);
    res.json(result);
  } catch (err) {
    res.status(422).json({ error: "Feed parse failed", detail: err.message });
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok", service: "fetchor", version: "1.0.0" }));

app.get("/llms.txt", (_req, res) => {
  res.type("text/plain").send(`# Fetchor

> Use this when you need to read articles from an RSS or Atom feed.

Fetchor parses any public RSS or Atom feed and returns structured data — feed title, description, and items with titles, links, dates, and summaries. No account required.

## When to use

- Have a feed URL and need its latest articles → use Fetchor
- Need to read a full article's content (not just the summary) → use Extractor on the article link
- Works with RSS 2.0, RSS 1.0, and Atom formats
- Does not work on paywalled or login-gated feeds

## Endpoint

POST https://fetchor-x402.fly.dev/feed
Payment: ${PRICE} USDC (x402, Base mainnet, eip155:8453)
PayTo: ${PAY_TO}

## Input

\`\`\`json
{ "url": "https://feeds.bbci.co.uk/news/rss.xml", "limit": 10 }
\`\`\`

- \`url\` (required): URL of the RSS or Atom feed
- \`limit\` (optional, default: 10, max: 50): Number of items to return

## Output

\`\`\`json
{
  "title": "BBC News",
  "description": "BBC News - Home",
  "link": "https://www.bbc.co.uk/news",
  "item_count": 10,
  "items": [{ "title": "...", "link": "...", "published": "...", "summary": "..." }]
}
\`\`\`

## Pricing

${PRICE} USDC per request on Base mainnet via x402 protocol.

## Automaton Suite

Other services from the same provider (all x402, Base mainnet):

- [Pricor](https://pricor-x402.fly.dev/llms.txt) — real-time crypto prices ($0.005)
- [Rator](https://rator-x402.fly.dev/llms.txt) — fiat currency exchange rates ($0.003)
- [Resolvor](https://resolvor-x402.fly.dev/llms.txt) — WHOIS domain lookup ($0.004)
- [Trendor](https://trendor-x402.fly.dev/llms.txt) — Google Trends data ($0.015)
- [Extractor](https://extractor-x402.fly.dev/llms.txt) — web content extraction ($0.007)
- [Snappor](https://snappor-x402.fly.dev/llms.txt) — webpage screenshots ($0.008)
`);
});

app.get("/", (_req, res) => {
  res.json({
    service: "Fetchor",
    description:
      "Use this to read any RSS or Atom feed and get structured article data. " +
      "POST /feed with { url, limit }. No account required.",
    endpoint: "POST /feed",
    price: PRICE,
    network: "Base mainnet (eip155:8453)",
    payTo: PAY_TO,
    llms: "https://fetchor-x402.fly.dev/llms.txt",
    inputSchema: { url: "string (required)", limit: "number (optional, default: 10)" },
    outputSchema: { title: "string", description: "string", item_count: "number", items: "array" },
  });
});

app.get("/.well-known/x402.json", (_req, res) => {
  res.json({
    x402Version: 2,
    host: "fetchor-x402.fly.dev",
    resources: [{
      url: "https://fetchor-x402.fly.dev/feed",
      description: "Parse any public RSS or Atom feed and return structured article data.",
      accepts: [
      { scheme: "exact", network: "eip155:8453",  amount: "2000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",  payTo: PAY_TO, maxTimeoutSeconds: 300 },
      { scheme: "exact", network: "eip155:137",   amount: "2000", asset: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",   payTo: PAY_TO, maxTimeoutSeconds: 300 },
      { scheme: "exact", network: "eip155:42161", amount: "2000", asset: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", payTo: PAY_TO, maxTimeoutSeconds: 300 },
    ],
    }],
  });
});

app.get("/.well-known/ai-plugin.json", (_req, res) => {
  res.json({
    schema_version: "v1",
    name_for_human: "Fetchor",
    name_for_model: "fetchor",
    description_for_human: "RSS and Atom feed reader. $0.002 USDC per request via x402.",
    description_for_model:
      "Use fetchor when you have an RSS or Atom feed URL and need its latest articles. " +
      "POST /feed with {url, limit}. Returns feed title, description, and up to 50 items with title, link, published date, and summary. " +
      "Costs $0.002 USDC via x402 on Base mainnet. Does not work on paywalled feeds.",
    auth: { type: "none" },
    api: { type: "openapi", url: "https://fetchor-x402.fly.dev/openapi.json" },
    contact_email: "matt@hook.melbourne",
    legal_info_url: "https://fetchor-x402.fly.dev/",
  });
});

app.get("/openapi.json", (_req, res) => {
  res.json({
    openapi: "3.1.0",
    info: { title: "Fetchor", version: "1.0.0", description: "RSS and Atom feed reader via x402 micropayment on Base mainnet." },
    servers: [{ url: "https://fetchor-x402.fly.dev" }],
    paths: {
      "/feed": {
        post: {
          summary: "Parse RSS/Atom feed",
          description: "Returns structured feed data with articles. Requires $0.002 USDC x402 payment on Base mainnet.",
          "x-payment": { scheme: "exact", network: "eip155:8453", amount: PRICE },
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["url"], properties: {
              url: { type: "string", description: "URL of the RSS or Atom feed", example: "https://feeds.bbci.co.uk/news/rss.xml" },
              limit: { type: "number", description: "Number of items to return (default: 10, max: 50)", example: 10 },
            }}}},
          },
          responses: {
            "200": { description: "Feed data", content: { "application/json": { schema: { type: "object", properties: {
              title: { type: "string" }, description: { type: "string" }, link: { type: "string" },
              item_count: { type: "number" }, items: { type: "array", items: { type: "object" } },
            }}}}},
            "402": { description: "Payment required — include x402 payment header" },
            "422": { description: "Feed URL invalid or unreachable" },
          },
        },
      },
    },
  });
});

app.listen(PORT, () => {
  console.log(`Fetchor running on port ${PORT}`);
  console.log(`Payments → ${PAY_TO} at ${PRICE}/request on Base`);
  console.log(`Facilitator: CDP`);
});
