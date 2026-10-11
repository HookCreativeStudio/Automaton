import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactEvmScheme as ExactEvmFacilitatorScheme } from "@x402/evm/exact/facilitator";
import { toFacilitatorEvmSigner } from "@x402/evm";
import { x402Facilitator } from "@x402/core/facilitator";
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { parseFeed } from "./feed.js";
import { requestLogger } from "./logger.js";

const app = express();
app.use(express.json());
app.use(requestLogger("fetchor"));

const PORT = process.env.PORT || 3000;
const PAY_TO = process.env.PAY_TO || "0x7754DfCEBaA2E5c562aA42c67C5A6E7EDF5b5b81";
const PRICE = process.env.PRICE || "$0.002";

const account = privateKeyToAccount(process.env.FACILITATOR_PRIVATE_KEY);
const walletClient = createWalletClient({
  account,
  chain: base,
  transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org"),
}).extend(publicActions);
Object.assign(walletClient, { address: account.address });

const signer = toFacilitatorEvmSigner(walletClient);
const localFacilitator = new x402Facilitator().register(
  "eip155:8453",
  new ExactEvmFacilitatorScheme(signer)
);

const resourceServer = new x402ResourceServer(localFacilitator)
  .register("eip155:8453", new ExactEvmScheme())
  .registerExtension(bazaarResourceServerExtension);

app.use(
  paymentMiddleware(
    {
      "POST /feed": {
        accepts: [{ scheme: "exact", price: PRICE, network: "eip155:8453", payTo: PAY_TO }],
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

> Use this to read any RSS or Atom feed and get structured article data.

Fetchor parses any public RSS or Atom feed and returns structured data — feed title, description, and items with titles, links, dates, and summaries. Costs ${PRICE} USDC per request via x402 on Base mainnet. No account required.

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

app.listen(PORT, () => {
  console.log(`Fetchor running on port ${PORT}`);
  console.log(`Payments → ${PAY_TO} at ${PRICE}/request on Base`);
  console.log(`Facilitator wallet: ${account.address}`);
});
