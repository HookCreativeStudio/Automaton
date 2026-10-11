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
import { getRate } from "./rate.js";
import { requestLogger } from "./logger.js";

const app = express();
app.use(express.json());
app.use(requestLogger("rator"));

const PORT = process.env.PORT || 3000;
const PAY_TO = process.env.PAY_TO || "0x7754DfCEBaA2E5c562aA42c67C5A6E7EDF5b5b81";
const PRICE = process.env.PRICE || "$0.003";

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
      "POST /rate": {
        accepts: [{ scheme: "exact", price: PRICE, network: "eip155:8453", payTo: PAY_TO }],
        description:
          "Use this to convert currencies and get live exchange rates. " +
          "Returns the current rate, converted amount, and ECB date. No account required.",
        inputSchema: {
          type: "object",
          properties: {
            from: { type: "string", description: "Source currency code (e.g. USD, EUR, GBP)" },
            to: { type: "string", description: "Target currency code" },
            amount: { type: "number", description: "Amount to convert (default: 1)" },
          },
          required: ["from", "to"],
        },
        outputSchema: {
          type: "object",
          properties: {
            from: { type: "string" },
            to: { type: "string" },
            rate: { type: "number" },
            amount: { type: "number" },
            converted: { type: "number" },
            date: { type: "string" },
          },
        },
        extensions: declareDiscoveryExtension({
          bodyType: "json",
          input: { from: "USD", to: "EUR", amount: 100 },
          inputSchema: {
            properties: {
              from: { type: "string", description: "Source currency code" },
              to: { type: "string", description: "Target currency code" },
              amount: { type: "number", description: "Amount to convert (default: 1)" },
            },
            required: ["from", "to"],
          },
          output: {
            example: {
              from: "USD", to: "EUR", rate: 0.921,
              amount: 100, converted: 92.1, date: "2025-01-01",
            },
          },
        }),
      },
    },
    resourceServer
  )
);

app.post("/rate", async (req, res) => {
  const { from, to, amount = 1 } = req.body;
  if (!from || !to) return res.status(400).json({ error: "from and to are required" });
  try {
    const result = await getRate(from, to, amount);
    res.json(result);
  } catch (err) {
    res.status(422).json({ error: "Rate lookup failed", detail: err.message });
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok", service: "rator", version: "1.0.0" }));

app.get("/llms.txt", (_req, res) => {
  res.type("text/plain").send(`# Rator

> Use this when you need to convert between fiat currencies or get an exchange rate.

Rator returns live currency exchange rates from the European Central Bank via Frankfurter — rate, converted amount, and rate date. No account required.

## When to use

- Need to convert USD to EUR, GBP to JPY, or any fiat pair → use Rator
- Need crypto prices → use Pricor instead
- Rates are ECB reference rates, updated daily (not live mid-market)
- Supports ~170 currencies; does not support crypto

## Endpoint

POST https://rator-x402.fly.dev/rate
Payment: ${PRICE} USDC (x402, Base mainnet, eip155:8453)
PayTo: ${PAY_TO}

## Input

\`\`\`json
{ "from": "USD", "to": "EUR", "amount": 100 }
\`\`\`

- \`from\` (required): Source currency code (USD, EUR, GBP, JPY, AUD, etc.)
- \`to\` (required): Target currency code
- \`amount\` (optional, default: 1): Amount to convert

## Output

\`\`\`json
{
  "from": "USD", "to": "EUR", "rate": 0.921,
  "amount": 100, "converted": 92.1, "date": "2025-01-01"
}
\`\`\`

## Pricing

${PRICE} USDC per request on Base mainnet via x402 protocol.

## Automaton Suite

Other services from the same provider (all x402, Base mainnet):

- [Pricor](https://pricor-x402.fly.dev/llms.txt) — real-time crypto prices ($0.005)
- [Fetchor](https://fetchor-x402.fly.dev/llms.txt) — RSS/Atom feed reader ($0.002)
- [Resolvor](https://resolvor-x402.fly.dev/llms.txt) — WHOIS domain lookup ($0.004)
- [Trendor](https://trendor-x402.fly.dev/llms.txt) — Google Trends data ($0.015)
- [Extractor](https://extractor-x402.fly.dev/llms.txt) — web content extraction ($0.007)
- [Snappor](https://snappor-x402.fly.dev/llms.txt) — webpage screenshots ($0.008)
`);
});

app.get("/", (_req, res) => {
  res.json({
    service: "Rator",
    description:
      "Use this to convert currencies and get live exchange rates. " +
      "POST /rate with { from, to, amount }. No account required.",
    endpoint: "POST /rate",
    price: PRICE,
    network: "Base mainnet (eip155:8453)",
    payTo: PAY_TO,
    llms: "https://rator-x402.fly.dev/llms.txt",
    inputSchema: { from: "string (required)", to: "string (required)", amount: "number (optional, default: 1)" },
    outputSchema: { from: "string", to: "string", rate: "number", amount: "number", converted: "number", date: "string" },
  });
});

app.get("/.well-known/x402.json", (_req, res) => {
  res.json({
    x402Version: 2,
    host: "rator-x402.fly.dev",
    resources: [{
      url: "https://rator-x402.fly.dev/rate",
      description: "Fiat currency exchange rates from the European Central Bank via Frankfurter.",
      accepts: [{ scheme: "exact", network: "eip155:8453", amount: "3000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: PAY_TO }],
    }],
  });
});

app.get("/.well-known/ai-plugin.json", (_req, res) => {
  res.json({
    schema_version: "v1",
    name_for_human: "Rator",
    name_for_model: "rator",
    description_for_human: "Live fiat currency exchange rates. $0.003 USDC per request via x402.",
    description_for_model:
      "Use rator when you need to convert between fiat currencies or get an exchange rate. " +
      "POST /rate with {from, to, amount}. Supports ~170 currencies (USD, EUR, GBP, JPY, AUD, etc.). " +
      "ECB reference rates, updated daily. Does not support crypto. Costs $0.003 USDC via x402 on Base mainnet.",
    auth: { type: "none" },
    api: { type: "openapi", url: "https://rator-x402.fly.dev/openapi.json" },
    contact_email: "matt@hook.melbourne",
    legal_info_url: "https://rator-x402.fly.dev/",
  });
});

app.get("/openapi.json", (_req, res) => {
  res.json({
    openapi: "3.1.0",
    info: { title: "Rator", version: "1.0.0", description: "Fiat currency exchange rates via x402 micropayment on Base mainnet." },
    servers: [{ url: "https://rator-x402.fly.dev" }],
    paths: {
      "/rate": {
        post: {
          summary: "Get currency exchange rate",
          description: "Returns rate, converted amount, and rate date. ECB reference rates. Requires $0.003 USDC x402 payment on Base mainnet.",
          "x-payment": { scheme: "exact", network: "eip155:8453", amount: PRICE },
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["from", "to"], properties: {
              from: { type: "string", description: "Source currency code", example: "USD" },
              to: { type: "string", description: "Target currency code", example: "EUR" },
              amount: { type: "number", description: "Amount to convert (default: 1)", example: 100 },
            }}}},
          },
          responses: {
            "200": { description: "Exchange rate data", content: { "application/json": { schema: { type: "object", properties: {
              from: { type: "string" }, to: { type: "string" }, rate: { type: "number" },
              amount: { type: "number" }, converted: { type: "number" }, date: { type: "string" },
            }}}}},
            "402": { description: "Payment required — include x402 payment header" },
            "422": { description: "Currency not found or lookup failed" },
          },
        },
      },
    },
  });
});

app.listen(PORT, () => {
  console.log(`Rator running on port ${PORT}`);
  console.log(`Payments → ${PAY_TO} at ${PRICE}/request on Base`);
  console.log(`Facilitator wallet: ${account.address}`);
});
