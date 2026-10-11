import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { facilitator } from "@coinbase/x402";
import { HTTPFacilitatorClient } from "@x402/core/http";
import { getStock } from "./stock.js";
import { requestLogger } from "./logger.js";

const app = express();
app.use(express.json());
app.use(requestLogger("stockor"));

const PORT = process.env.PORT || 3000;
const PAY_TO = process.env.PAY_TO || "0x7754DfCEBaA2E5c562aA42c67C5A6E7EDF5b5b81";
const PRICE = process.env.PRICE || "$0.004";

const facilitatorClient = new HTTPFacilitatorClient(facilitator);

const resourceServer = new x402ResourceServer(facilitatorClient)
  .register("eip155:8453", new ExactEvmScheme())
  .registerExtension(bazaarResourceServerExtension);

app.use(
  paymentMiddleware(
    {
      "POST /stock": {
        accepts: [{ scheme: "exact", price: PRICE, network: "eip155:8453", payTo: PAY_TO }],
        description:
          "Use this to get the current price and key stats for any stock or ETF by ticker symbol. " +
          "Returns price, change, volume, market cap, P/E ratio, and 52-week range. No account required.",
        inputSchema: {
          type: "object",
          properties: {
            symbol: { type: "string", description: "Ticker symbol (e.g. AAPL, TSLA, SPY)" },
          },
          required: ["symbol"],
        },
        outputSchema: {
          type: "object",
          properties: {
            symbol: { type: "string" },
            name: { type: "string" },
            price: { type: "number" },
            change: { type: "number" },
            change_percent: { type: "number" },
            volume: { type: "number" },
            market_cap: { type: "number" },
          },
        },
        extensions: declareDiscoveryExtension({
          bodyType: "json",
          input: { symbol: "AAPL" },
          inputSchema: {
            properties: {
              symbol: { type: "string", description: "Ticker symbol (e.g. AAPL, TSLA, SPY)" },
            },
            required: ["symbol"],
          },
          output: {
            example: {
              symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", currency: "USD",
              price: 189.84, previous_close: 188.01, change: 1.83, change_percent: 0.9733,
              day_high: 190.23, day_low: 187.45, volume: 54321000,
              market_cap: 2945000000000, pe_ratio: 31.2, market_state: "REGULAR",
            },
          },
        }),
      },
    },
    resourceServer
  )
);

app.post("/stock", async (req, res) => {
  const { symbol } = req.body;
  if (!symbol) return res.status(400).json({ error: "symbol is required" });
  try {
    const result = await getStock(symbol);
    res.json(result);
  } catch (err) {
    res.status(422).json({ error: "Stock lookup failed", detail: err.message });
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok", service: "stockor", version: "1.0.0" }));

app.get("/llms.txt", (_req, res) => {
  res.type("text/plain").send(`# Stockor

> Use this when you need the current price or stats for a stock or ETF.

Stockor returns real-time price, change, volume, market cap, P/E ratio, and 52-week range for any NYSE/NASDAQ-listed stock or ETF by ticker symbol. No account required.

## When to use

- Need the current price of a stock or ETF → use Stockor
- Need day high/low, volume, or market cap → use Stockor
- Need P/E ratio or 52-week range → use Stockor
- For crypto prices use Pricor instead
- For historical price data, Stockor returns current data only
- Works for US-listed stocks and ETFs (NYSE, NASDAQ, AMEX)

## Endpoint

POST https://stockor-x402.fly.dev/stock
Payment: ${PRICE} USDC (x402, Base mainnet, eip155:8453)
PayTo: ${PAY_TO}

## Input

\`\`\`json
{ "symbol": "AAPL" }
\`\`\`

- \`symbol\` (required): Ticker symbol (AAPL, TSLA, SPY, etc.)

## Output

\`\`\`json
{
  "symbol": "AAPL", "name": "Apple Inc.", "exchange": "NASDAQ", "currency": "USD",
  "price": 189.84, "previous_close": 188.01, "change": 1.83, "change_percent": 0.97,
  "day_high": 190.23, "day_low": 187.45, "volume": 54321000,
  "market_cap": 2945000000000, "pe_ratio": 31.2,
  "fifty_two_week_high": 199.62, "fifty_two_week_low": 164.08,
  "market_state": "REGULAR", "timestamp": "2025-01-01T21:00:00.000Z"
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
- [Trendor](https://trendor-x402.fly.dev/llms.txt) — Google Trends data ($0.015)
- [Extractor](https://extractor-x402.fly.dev/llms.txt) — web content extraction ($0.007)
- [Snappor](https://snappor-x402.fly.dev/llms.txt) — webpage screenshots ($0.008)
- [Weathor](https://weathor-x402.fly.dev/llms.txt) — weather & forecasts ($0.003)
- [Locator](https://locator-x402.fly.dev/llms.txt) — IP geolocation ($0.002)
`);
});

app.get("/", (_req, res) => {
  res.json({
    service: "Stockor",
    description: "Current stock and ETF prices. POST /stock with { symbol }. Returns price, change, volume, market cap, P/E.",
    endpoint: "POST /stock",
    price: PRICE,
    network: "Base mainnet (eip155:8453)",
    payTo: PAY_TO,
    llms: "https://stockor-x402.fly.dev/llms.txt",
    inputSchema: { symbol: "string (required)" },
    outputSchema: { symbol: "string", price: "number", change: "number", change_percent: "number", volume: "number", market_cap: "number" },
  });
});

app.get("/.well-known/x402.json", (_req, res) => {
  res.json({
    x402Version: 2,
    resources: [{
      url: "https://stockor-x402.fly.dev/stock",
      description: "Current stock and ETF price, change, volume, market cap, P/E ratio, and 52-week range by ticker symbol.",
      accepts: [{ scheme: "exact", network: "eip155:8453", amount: "4000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: PAY_TO, maxTimeoutSeconds: 300 }],
      outputSchema: { type: "object", properties: { symbol: { type: "string" }, name: { type: "string" }, price: { type: "number" }, change: { type: "number" }, change_percent: { type: "number" }, volume: { type: "number" }, market_cap: { type: "number" } } },
      tags: ["stocks", "equities", "finance", "market-data", "etf"],
    }],
  });
});

app.get("/.well-known/ai-plugin.json", (_req, res) => {
  res.json({
    schema_version: "v1",
    name_for_human: "Stockor",
    name_for_model: "stockor",
    description_for_human: "Stock and ETF prices. $0.004 USDC per request via x402.",
    description_for_model:
      "Use stockor when you need the current price, change, volume, market cap, or P/E for a stock or ETF. " +
      "POST /stock with {symbol}. Works for US-listed equities and ETFs (NYSE, NASDAQ). " +
      "For crypto use Pricor instead. Costs $0.004 USDC via x402 on Base mainnet.",
    auth: { type: "none" },
    api: { type: "openapi", url: "https://stockor-x402.fly.dev/openapi.json" },
    contact_email: "matt@hook.melbourne",
    legal_info_url: "https://stockor-x402.fly.dev/",
  });
});

app.get("/openapi.json", (_req, res) => {
  res.json({
    openapi: "3.1.0",
    info: { title: "Stockor", version: "1.0.0", description: "Stock and ETF prices via x402 micropayment on Base mainnet." },
    servers: [{ url: "https://stockor-x402.fly.dev" }],
    paths: {
      "/stock": {
        post: {
          summary: "Get stock or ETF price",
          description: "Returns current price, change, volume, market cap, P/E ratio, and 52-week range. Requires $0.004 USDC x402 payment on Base mainnet.",
          "x-payment": { scheme: "exact", network: "eip155:8453", amount: PRICE },
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["symbol"], properties: {
              symbol: { type: "string", description: "Ticker symbol", example: "AAPL" },
            }}}},
          },
          responses: {
            "200": { description: "Stock data", content: { "application/json": { schema: { type: "object", properties: {
              symbol: { type: "string" }, name: { type: "string" }, exchange: { type: "string" }, currency: { type: "string" },
              price: { type: "number" }, previous_close: { type: "number" }, change: { type: "number" }, change_percent: { type: "number" },
              day_high: { type: "number" }, day_low: { type: "number" }, volume: { type: "number" },
              market_cap: { type: "number" }, pe_ratio: { type: "number" },
              fifty_two_week_high: { type: "number" }, fifty_two_week_low: { type: "number" },
              market_state: { type: "string" }, timestamp: { type: "string" },
            }}}}},
            "402": { description: "Payment required" },
            "422": { description: "Symbol not found or lookup failed" },
          },
        },
      },
    },
  });
});

app.listen(PORT, () => {
  console.log(`Stockor running on port ${PORT}`);
  console.log(`Payments → ${PAY_TO} at ${PRICE}/request on Base`);
  console.log(`Facilitator: CDP`);
});
