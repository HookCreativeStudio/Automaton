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

const app = express();
app.use(express.json());

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

> Use this to convert currencies and get live exchange rates.

Rator returns real-time currency exchange rates via Frankfurter (ECB data) — rate, converted amount, and rate date. Costs ${PRICE} USDC per request via x402 on Base mainnet. No account required.

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

app.listen(PORT, () => {
  console.log(`Rator running on port ${PORT}`);
  console.log(`Payments → ${PAY_TO} at ${PRICE}/request on Base`);
  console.log(`Facilitator wallet: ${account.address}`);
});
