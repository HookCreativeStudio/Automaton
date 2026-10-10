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
import { getPrice } from "./price.js";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const PAY_TO = process.env.PAY_TO || "0x7754DfCEBaA2E5c562aA42c67C5A6E7EDF5b5b81";
const PRICE = process.env.PRICE || "$0.005";

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

> Use this to get current cryptocurrency prices with market data.

Pricor returns real-time crypto price data — price, market cap, 24h volume, and 24h change for any coin via CoinGecko. Costs ${PRICE} USDC per request via x402 on Base mainnet. No account required.

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

app.listen(PORT, () => {
  console.log(`Pricor running on port ${PORT}`);
  console.log(`Payments → ${PAY_TO} at ${PRICE}/request on Base`);
  console.log(`Facilitator wallet: ${account.address}`);
});
