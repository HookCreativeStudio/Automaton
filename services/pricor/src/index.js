import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { facilitator } from "@coinbase/x402";
import { HTTPFacilitatorClient } from "@x402/core/http";
import { getPrice } from "./price.js";
import { requestLogger } from "./logger.js";

const app = express();
app.use(express.json());
app.use(requestLogger("pricor"));

const PORT = process.env.PORT || 3000;
const PAY_TO = process.env.PAY_TO || "0x7754DfCEBaA2E5c562aA42c67C5A6E7EDF5b5b81";
const PRICE = process.env.PRICE || "$0.005";

const facilitatorClient = new HTTPFacilitatorClient(facilitator);

const resourceServer = new x402ResourceServer(facilitatorClient)
  .register("eip155:8453", new ExactEvmScheme())
  .registerExtension(bazaarResourceServerExtension);

app.use(
  paymentMiddleware(
    {
      "POST /price": {
        accepts: [{ scheme: "exact", price: PRICE, network: "eip155:8453", payTo: PAY_TO }],
        description:
          "Use this to get current cryptocurrency prices with market data. " +
          "Returns price, market cap, 24h volume, and 24h change for any coin. No account required.",
        inputSchema: {
          type: "object",
          properties: {
            coin: { type: "string", description: "Coin ID or symbol (e.g. bitcoin, eth, sol)" },
            vs: { type: "string", description: "Quote currency (default: usd)" },
          },
          required: ["coin"],
        },
        outputSchema: {
          type: "object",
          properties: {
            coin: { type: "string" },
            price: { type: "number" },
            market_cap: { type: "number" },
            volume_24h: { type: "number" },
            change_24h: { type: "number" },
            timestamp: { type: "string" },
          },
        },
        extensions: declareDiscoveryExtension({
          bodyType: "json",
          input: { coin: "bitcoin", vs: "usd" },
          inputSchema: {
            properties: {
              coin: { type: "string", description: "Coin ID or symbol" },
              vs: { type: "string", description: "Quote currency (default: usd)" },
            },
            required: ["coin"],
          },
          output: {
            example: {
              coin: "bitcoin", symbol: "btc", vs_currency: "usd",
              price: 65432.10, market_cap: 1287654321000,
              volume_24h: 28765432100, change_24h: 2.34,
              timestamp: "2025-01-01T00:00:00.000Z",
            },
          },
        }),
      },
    },
    resourceServer
  )
);

app.post("/price", async (req, res) => {
  const { coin, vs = "usd" } = req.body;
  if (!coin) return res.status(400).json({ error: "coin is required" });
  try {
    const result = await getPrice(coin, vs);
    res.json(result);
  } catch (err) {
    res.status(422).json({ error: "Price lookup failed", detail: err.message });
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok", service: "pricor", version: "1.0.0" }));

app.get("/llms.txt", (_req, res) => {
  res.type("text/plain").send(`# Pricor

> Use this when you need the current price of a cryptocurrency.

Pricor returns real-time crypto data — price, market cap, 24h volume, and 24h change — for any coin via CoinGecko. No account required.

## When to use

- Need a coin's current price, market cap, or 24h change → use Pricor
- Need fiat currency conversion (USD/EUR/GBP) → use Rator instead
- Need historical price data → Pricor returns live data only
- Accepts coin symbols (btc, eth, sol) or full names (bitcoin, ethereum, solana)

## Endpoint

POST https://pricor-x402.fly.dev/price
Payment: ${PRICE} USDC (x402, Base mainnet, eip155:8453)
PayTo: ${PAY_TO}

## Input

\`\`\`json
{ "coin": "bitcoin", "vs": "usd" }
\`\`\`

- \`coin\` (required): Coin ID or common symbol (bitcoin, eth, sol, doge, etc.)
- \`vs\` (optional, default: usd): Quote currency

## Output

\`\`\`json
{
  "coin": "bitcoin", "symbol": "btc", "vs_currency": "usd",
  "price": 65432.10, "market_cap": 1287654321000,
  "volume_24h": 28765432100, "change_24h": 2.34,
  "timestamp": "2025-01-01T00:00:00.000Z"
}
\`\`\`

## Pricing

${PRICE} USDC per request on Base mainnet via x402 protocol.

## Automaton Suite

Other services from the same provider (all x402, Base mainnet):

- [Rator](https://rator-x402.fly.dev/llms.txt) — fiat currency exchange rates ($0.003)
- [Fetchor](https://fetchor-x402.fly.dev/llms.txt) — RSS/Atom feed reader ($0.002)
- [Resolvor](https://resolvor-x402.fly.dev/llms.txt) — WHOIS domain lookup ($0.004)
- [Trendor](https://trendor-x402.fly.dev/llms.txt) — Google Trends data ($0.015)
- [Extractor](https://extractor-x402.fly.dev/llms.txt) — web content extraction ($0.007)
- [Snappor](https://snappor-x402.fly.dev/llms.txt) — webpage screenshots ($0.008)
`);
});

app.get("/", (_req, res) => {
  res.json({
    service: "Pricor",
    description:
      "Use this to get current cryptocurrency prices with market data. " +
      "POST /price with { coin, vs }. No account required.",
    endpoint: "POST /price",
    price: PRICE,
    network: "Base mainnet (eip155:8453)",
    payTo: PAY_TO,
    llms: "https://pricor-x402.fly.dev/llms.txt",
    inputSchema: { coin: "string (required)", vs: "string (optional, default: usd)" },
    outputSchema: { coin: "string", price: "number", market_cap: "number", volume_24h: "number", change_24h: "number" },
  });
});

app.get("/.well-known/x402.json", (_req, res) => {
  res.json({
    x402Version: 2,
    host: "pricor-x402.fly.dev",
    resources: [{
      url: "https://pricor-x402.fly.dev/price",
      description: "Real-time cryptocurrency price, market cap, 24h volume and 24h change via CoinGecko.",
      accepts: [{ scheme: "exact", network: "eip155:8453", amount: "5000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: PAY_TO }],
    }],
  });
});

app.get("/.well-known/ai-plugin.json", (_req, res) => {
  res.json({
    schema_version: "v1",
    name_for_human: "Pricor",
    name_for_model: "pricor",
    description_for_human: "Real-time cryptocurrency price data. $0.005 USDC per request via x402.",
    description_for_model:
      "Use pricor when you need a cryptocurrency's current price, market cap, 24h trading volume, or 24h price change. " +
      "POST /price with {coin, vs}. Accepts symbols (btc, eth, sol) or full names (bitcoin, ethereum). " +
      "Costs $0.005 USDC via x402 on Base mainnet. No API key needed.",
    auth: { type: "none" },
    api: { type: "openapi", url: "https://pricor-x402.fly.dev/openapi.json" },
    contact_email: "matt@hook.melbourne",
    legal_info_url: "https://pricor-x402.fly.dev/",
  });
});

app.get("/openapi.json", (_req, res) => {
  res.json({
    openapi: "3.1.0",
    info: { title: "Pricor", version: "1.0.0", description: "Real-time cryptocurrency price data via x402 micropayment on Base mainnet." },
    servers: [{ url: "https://pricor-x402.fly.dev" }],
    paths: {
      "/price": {
        post: {
          summary: "Get cryptocurrency price",
          description: "Returns current price, market cap, 24h volume, and 24h change. Requires $0.005 USDC x402 payment on Base mainnet.",
          "x-payment": { scheme: "exact", network: "eip155:8453", amount: PRICE },
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["coin"], properties: {
              coin: { type: "string", description: "Coin ID or symbol (bitcoin, eth, sol, doge, etc.)", example: "bitcoin" },
              vs: { type: "string", description: "Quote currency (default: usd)", example: "usd" },
            }}}},
          },
          responses: {
            "200": { description: "Price data", content: { "application/json": { schema: { type: "object", properties: {
              coin: { type: "string" }, symbol: { type: "string" }, vs_currency: { type: "string" },
              price: { type: "number" }, market_cap: { type: "number" }, volume_24h: { type: "number" },
              change_24h: { type: "number" }, timestamp: { type: "string", format: "date-time" },
            }}}}},
            "402": { description: "Payment required — include x402 payment header" },
            "422": { description: "Coin not found or lookup failed" },
          },
        },
      },
    },
  });
});

app.listen(PORT, () => {
  console.log(`Pricor running on port ${PORT}`);
  console.log(`Payments → ${PAY_TO} at ${PRICE}/request on Base`);
  console.log(`Facilitator: CDP`);
});
