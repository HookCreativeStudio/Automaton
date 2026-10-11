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
import { getTrends } from "./trends.js";
import { requestLogger } from "./logger.js";

const app = express();
app.use(express.json());
app.use(requestLogger("trendor"));

const PORT = process.env.PORT || 3000;
const PAY_TO = process.env.PAY_TO || "0x7754DfCEBaA2E5c562aA42c67C5A6E7EDF5b5b81";
const PRICE = process.env.PRICE || "$0.015";

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
      "POST /trends": {
        accepts: [{ scheme: "exact", price: PRICE, network: "eip155:8453", payTo: PAY_TO }],
        description:
          "Use this to get Google Trends interest-over-time data for any keyword. " +
          "Returns trend timeline with peak, current value, and geo breakdown. No account required.",
        inputSchema: {
          type: "object",
          properties: {
            keyword: { type: "string", description: "Search keyword or topic" },
            timeframe: { type: "string", enum: ["1m", "3m", "12m", "5y"], description: "Time range (default: 12m)" },
            geo: { type: "string", description: "Country code e.g. US, GB (default: worldwide)" },
          },
          required: ["keyword"],
        },
        outputSchema: {
          type: "object",
          properties: {
            keyword: { type: "string" },
            geo: { type: "string" },
            peak: { type: "number" },
            current: { type: "number" },
            trend: { type: "array" },
          },
        },
        extensions: declareDiscoveryExtension({
          bodyType: "json",
          input: { keyword: "bitcoin", timeframe: "12m", geo: "US" },
          inputSchema: {
            properties: {
              keyword: { type: "string", description: "Search keyword or topic" },
              timeframe: { type: "string", enum: ["1m", "3m", "12m", "5y"] },
              geo: { type: "string", description: "Country code (default: worldwide)" },
            },
            required: ["keyword"],
          },
          output: {
            example: {
              keyword: "bitcoin", geo: "US", timeframe: "12m",
              peak: 100, current: 62,
              trend: [{ date: "Jan 2024", value: 45 }, { date: "Feb 2024", value: 52 }],
            },
          },
        }),
      },
    },
    resourceServer
  )
);

app.post("/trends", async (req, res) => {
  const { keyword, timeframe = "12m", geo = "" } = req.body;
  if (!keyword) return res.status(400).json({ error: "keyword is required" });
  try {
    const result = await getTrends(keyword, timeframe, geo);
    res.json(result);
  } catch (err) {
    res.status(422).json({ error: "Trends lookup failed", detail: err.message });
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok", service: "trendor", version: "1.0.0" }));

app.get("/llms.txt", (_req, res) => {
  res.type("text/plain").send(`# Trendor

> Use this when you need to understand how search interest in a topic has changed over time.

Trendor returns Google Trends data — interest timeline (0–100), peak, and current interest score for any keyword. No account required.

## When to use

- Need to know if a topic is trending up or down → use Trendor
- Need to compare relative search interest over time → use Trendor
- Need absolute search volume numbers → Trendor returns relative scores (0–100), not raw counts
- Supports geographic filtering by country code
- Best for broad topics; very niche terms may return sparse data

## Endpoint

POST https://trendor-x402.fly.dev/trends
Payment: ${PRICE} USDC (x402, Base mainnet, eip155:8453)
PayTo: ${PAY_TO}

## Input

\`\`\`json
{ "keyword": "bitcoin", "timeframe": "12m", "geo": "US" }
\`\`\`

- \`keyword\` (required): Search keyword or topic
- \`timeframe\` (optional, default: 12m): 1m | 3m | 12m | 5y
- \`geo\` (optional, default: worldwide): ISO country code (US, GB, AU, etc.)

## Output

\`\`\`json
{
  "keyword": "bitcoin", "geo": "US", "timeframe": "12m",
  "peak": 100, "current": 62,
  "trend": [{ "date": "Jan 2024", "value": 45 }, ...]
}
\`\`\`

## Pricing

${PRICE} USDC per request on Base mainnet via x402 protocol.

## Automaton Suite

Other services from the same provider (all x402, Base mainnet):

- [Pricor](https://pricor-x402.fly.dev/llms.txt) — real-time crypto prices ($0.005)
- [Rator](https://rator-x402.fly.dev/llms.txt) — fiat currency exchange rates ($0.003)
- [Fetchor](https://fetchor-x402.fly.dev/llms.txt) — RSS/Atom feed reader ($0.002)
- [Resolvor](https://resolvor-x402.fly.dev/llms.txt) — WHOIS domain lookup ($0.004)
- [Extractor](https://extractor-x402.fly.dev/llms.txt) — web content extraction ($0.007)
- [Snappor](https://snappor-x402.fly.dev/llms.txt) — webpage screenshots ($0.008)
`);
});

app.get("/", (_req, res) => {
  res.json({
    service: "Trendor",
    description:
      "Use this to get Google Trends interest-over-time data for any keyword. " +
      "POST /trends with { keyword, timeframe, geo }. No account required.",
    endpoint: "POST /trends",
    price: PRICE,
    network: "Base mainnet (eip155:8453)",
    payTo: PAY_TO,
    llms: "https://trendor-x402.fly.dev/llms.txt",
    inputSchema: { keyword: "string (required)", timeframe: "1m|3m|12m|5y (optional)", geo: "string (optional)" },
    outputSchema: { keyword: "string", peak: "number", current: "number", trend: "array" },
  });
});

app.get("/.well-known/x402.json", (_req, res) => {
  res.json({
    x402Version: 2,
    host: "trendor-x402.fly.dev",
    resources: [{
      url: "https://trendor-x402.fly.dev/trends",
      description: "Google Trends interest-over-time data for any keyword — timeline, peak, and current score.",
      accepts: [{ scheme: "exact", network: "eip155:8453", amount: "15000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: PAY_TO }],
    }],
  });
});

app.get("/.well-known/ai-plugin.json", (_req, res) => {
  res.json({
    schema_version: "v1",
    name_for_human: "Trendor",
    name_for_model: "trendor",
    description_for_human: "Google Trends interest-over-time data. $0.015 USDC per request via x402.",
    description_for_model:
      "Use trendor when you need to understand how search interest in a topic has changed over time. " +
      "POST /trends with {keyword, timeframe, geo}. Returns relative interest scores (0–100) over time, peak, and current value. " +
      "Supports timeframes: 1m, 3m, 12m, 5y. Supports geo filtering by ISO country code. " +
      "Costs $0.015 USDC via x402 on Base mainnet.",
    auth: { type: "none" },
    api: { type: "openapi", url: "https://trendor-x402.fly.dev/openapi.json" },
    contact_email: "matt@hook.melbourne",
    legal_info_url: "https://trendor-x402.fly.dev/",
  });
});

app.get("/openapi.json", (_req, res) => {
  res.json({
    openapi: "3.1.0",
    info: { title: "Trendor", version: "1.0.0", description: "Google Trends interest-over-time data via x402 micropayment on Base mainnet." },
    servers: [{ url: "https://trendor-x402.fly.dev" }],
    paths: {
      "/trends": {
        post: {
          summary: "Get Google Trends data",
          description: "Returns interest-over-time scores (0–100), peak, and current value for a keyword. Requires $0.015 USDC x402 payment on Base mainnet.",
          "x-payment": { scheme: "exact", network: "eip155:8453", amount: PRICE },
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["keyword"], properties: {
              keyword: { type: "string", description: "Search keyword or topic", example: "bitcoin" },
              timeframe: { type: "string", description: "Time range: 1m | 3m | 12m | 5y (default: 12m)", example: "12m" },
              geo: { type: "string", description: "ISO country code for geographic filter (default: worldwide)", example: "US" },
            }}}},
          },
          responses: {
            "200": { description: "Trends data", content: { "application/json": { schema: { type: "object", properties: {
              keyword: { type: "string" }, geo: { type: "string" }, timeframe: { type: "string" },
              peak: { type: "number" }, current: { type: "number" },
              trend: { type: "array", items: { type: "object", properties: { date: { type: "string" }, value: { type: "number" } } } },
            }}}}},
            "402": { description: "Payment required — include x402 payment header" },
            "422": { description: "Trends lookup failed" },
          },
        },
      },
    },
  });
});

app.listen(PORT, () => {
  console.log(`Trendor running on port ${PORT}`);
  console.log(`Payments → ${PAY_TO} at ${PRICE}/request on Base`);
  console.log(`Facilitator wallet: ${account.address}`);
});
