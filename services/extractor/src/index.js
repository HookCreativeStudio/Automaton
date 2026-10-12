import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { facilitator } from "@coinbase/x402";
import { HTTPFacilitatorClient } from "@x402/core/http";
import { extract } from "./extract.js";
import { requestLogger } from "./logger.js";

const app = express();
app.use(express.json());
app.use(requestLogger("extractor"));

const PORT = process.env.PORT || 3000;
const PAY_TO = process.env.PAY_TO || "0x7754DfCEBaA2E5c562aA42c67C5A6E7EDF5b5b81";
const PRICE = process.env.PRICE || "$0.007";

const facilitatorClient = new HTTPFacilitatorClient(facilitator);

const resourceServer = new x402ResourceServer(facilitatorClient)
  .register("eip155:8453",  new ExactEvmScheme())
  .register("eip155:137",   new ExactEvmScheme())
  .register("eip155:42161", new ExactEvmScheme())
  .registerExtension(bazaarResourceServerExtension);

app.use(
  paymentMiddleware(
    {
      "POST /extract": {
        accepts: [
          { scheme: "exact", price: PRICE, network: "eip155:8453",  payTo: PAY_TO },
          { scheme: "exact", price: PRICE, network: "eip155:137",   payTo: PAY_TO },
          { scheme: "exact", price: PRICE, network: "eip155:42161", payTo: PAY_TO },
        ],
        description:
          "Use this when you need clean structured content from any URL. " +
          "Accepts a URL and format preference (markdown, summary, json). " +
          "Returns structured content. No account required.",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string", description: "The URL to extract content from" },
            format: {
              type: "string",
              enum: ["markdown", "summary", "json"],
              description: "Output format",
            },
          },
          required: ["url"],
        },
        outputSchema: {
          type: "object",
          properties: {
            content: { description: "Extracted content in requested format" },
            title: { type: "string" },
            source_url: { type: "string" },
            word_count: { type: "number" },
          },
        },
        extensions: declareDiscoveryExtension({
          bodyType: "json",
          input: { url: "https://example.com/article", format: "markdown" },
          inputSchema: {
            properties: {
              url: { type: "string", description: "The URL to extract content from" },
              format: { type: "string", enum: ["markdown", "summary", "json"], description: "Output format" },
            },
            required: ["url"],
          },
          output: {
            example: {
              content: "# Article Title\n\nArticle body in markdown...",
              title: "Article Title",
              source_url: "https://example.com/article",
              word_count: 450,
            },
          },
        }),
      },
    },
    resourceServer
  )
);

app.post("/extract", async (req, res) => {
  const { url, format = "markdown" } = req.body;
  if (!url) return res.status(400).json({ error: "url is required" });
  if (!["markdown", "summary", "json"].includes(format)) {
    return res.status(400).json({ error: "format must be markdown, summary, or json" });
  }
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }
  try {
    const result = await extract(url, format);
    res.json(result);
  } catch (err) {
    if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND" || err.response?.status >= 400) {
      res.status(422).json({ error: "Could not fetch URL", detail: err.message });
    } else {
      res.status(500).json({ error: "Extraction failed", detail: err.message });
    }
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok", service: "extractor", version: "1.0.0" }));

app.get("/llms.txt", (_req, res) => {
  res.type("text/plain").send(`# Extractor

> Use this when you need clean readable text from any public URL.

Extractor fetches any public URL and returns its content as clean markdown, a 2-3 sentence summary, or structured JSON — stripping ads, navigation, and boilerplate. No account required.

## When to use

- Need the readable text of an article or page → use Extractor
- Need a quick summary of a page → use Extractor with format=summary
- Need structured metadata (title, author, topics, sentiment) → use Extractor with format=json
- Need a visual screenshot of the page → use Snappor instead
- markdown format is fast (no AI); summary and json formats use Claude Haiku

## Endpoint

POST https://extractor-x402.fly.dev/extract
Payment: ${PRICE} USDC (x402, Base mainnet, eip155:8453)
PayTo: ${PAY_TO}

## Input

\`\`\`json
{ "url": "https://example.com/article", "format": "markdown" }
\`\`\`

- \`url\` (required): Any publicly accessible URL
- \`format\` (optional, default: markdown): \`markdown\` | \`summary\` | \`json\`

## Output

\`\`\`json
{
  "content": "# Article Title\\n\\nClean article body...",
  "title": "Article Title",
  "source_url": "https://example.com/article",
  "word_count": 450
}
\`\`\`

- **markdown**: Full article as clean Markdown (fast, no AI)
- **summary**: 2-3 sentence summary (Claude Haiku)
- **json**: Structured data — title, author, date, topics, key_points, sentiment (Claude Haiku)

## Pricing

${PRICE} USDC per request on Base mainnet via x402 protocol.

## Automaton Suite

Other services from the same provider (all x402, Base mainnet):

- [Pricor](https://pricor-x402.fly.dev/llms.txt) — real-time crypto prices ($0.005)
- [Rator](https://rator-x402.fly.dev/llms.txt) — fiat currency exchange rates ($0.003)
- [Fetchor](https://fetchor-x402.fly.dev/llms.txt) — RSS/Atom feed reader ($0.002)
- [Resolvor](https://resolvor-x402.fly.dev/llms.txt) — WHOIS domain lookup ($0.004)
- [Trendor](https://trendor-x402.fly.dev/llms.txt) — Google Trends data ($0.015)
- [Snappor](https://snappor-x402.fly.dev/llms.txt) — webpage screenshots ($0.008)
`);
});

app.get("/", (_req, res) => {
  res.json({
    service: "Extractor",
    description:
      "Use this when you need clean structured content from any URL. " +
      "POST /extract with { url, format } — format is markdown, summary, or json. " +
      "Costs " + PRICE + " USDC per request via x402.",
    endpoint: "POST /extract",
    price: PRICE,
    network: "Base mainnet (eip155:8453)",
    payTo: PAY_TO,
    llms: "https://extractor-x402.fly.dev/llms.txt",
    inputSchema: { url: "string (required)", format: "markdown | summary | json (default: markdown)" },
    outputSchema: { content: "string | object", title: "string", source_url: "string", word_count: "number" },
  });
});

app.get("/.well-known/x402.json", (_req, res) => {
  res.json({
    x402Version: 2,
    resources: [{
      url: "https://extractor-x402.fly.dev/extract",
      description: "Fetch any public URL and return clean markdown, a 2-3 sentence summary, or structured JSON. Strips ads and boilerplate.",
      accepts: [
      { scheme: "exact", network: "eip155:8453",  amount: "7000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",  payTo: PAY_TO, maxTimeoutSeconds: 300 },
      { scheme: "exact", network: "eip155:137",   amount: "7000", asset: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",   payTo: PAY_TO, maxTimeoutSeconds: 300 },
      { scheme: "exact", network: "eip155:42161", amount: "7000", asset: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", payTo: PAY_TO, maxTimeoutSeconds: 300 },
    ],
      outputSchema: { type: "object", properties: { content: {}, title: { type: "string" }, source_url: { type: "string" }, word_count: { type: "number" } } },
      tags: ["web", "content", "extraction", "markdown", "scraping"],
    }],
  });
});

app.get("/.well-known/ai-plugin.json", (_req, res) => {
  res.json({
    schema_version: "v1",
    name_for_human: "Extractor",
    name_for_model: "extractor",
    description_for_human: "Clean web content extraction. $0.007 USDC per request via x402.",
    description_for_model:
      "Use extractor when you need clean readable text from any public URL. " +
      "POST /extract with {url, format}. format options: markdown (fast, no AI), summary (2-3 sentences), json (structured metadata). " +
      "Costs $0.007 USDC via x402 on Base mainnet. Does not work on login-gated pages.",
    auth: { type: "none" },
    api: { type: "openapi", url: "https://extractor-x402.fly.dev/openapi.json" },
    contact_email: "matt@hook.melbourne",
    legal_info_url: "https://extractor-x402.fly.dev/",
  });
});

app.get("/openapi.json", (_req, res) => {
  res.json({
    openapi: "3.1.0",
    info: { title: "Extractor", version: "1.0.0", description: "Web content extraction via x402 micropayment on Base mainnet." },
    servers: [{ url: "https://extractor-x402.fly.dev" }],
    paths: {
      "/extract": {
        post: {
          summary: "Extract content from URL",
          description: "Returns clean markdown, summary, or structured JSON from any public URL. Requires $0.007 USDC x402 payment on Base mainnet.",
          "x-payment": { scheme: "exact", network: "eip155:8453", amount: PRICE },
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["url"], properties: {
              url: { type: "string", description: "Public URL to extract", example: "https://example.com/article" },
              format: { type: "string", enum: ["markdown", "summary", "json"], description: "Output format (default: markdown)", example: "markdown" },
            }}}},
          },
          responses: {
            "200": { description: "Extracted content", content: { "application/json": { schema: { type: "object", properties: {
              content: { description: "Extracted content — string for markdown/summary, object for json" },
              title: { type: "string" }, source_url: { type: "string" }, word_count: { type: "number" },
            }}}}},
            "402": { description: "Payment required — include x402 payment header" },
            "422": { description: "URL unreachable or content extraction failed" },
          },
        },
      },
    },
  });
});

app.listen(PORT, () => {
  console.log(`Extractor running on port ${PORT}`);
  console.log(`Payments → ${PAY_TO} at ${PRICE}/request on Base`);
  console.log(`Facilitator: CDP`);
});
