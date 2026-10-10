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

const app = express();
app.use(express.json());

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

> Use this to get Google Trends interest-over-time data for any keyword.

Trendor returns Google Trends data — interest timeline, peak value, and current interest for any keyword. Costs ${PRICE} USDC per request via x402 on Base mainnet. No account required.

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

app.listen(PORT, () => {
  console.log(`Trendor running on port ${PORT}`);
  console.log(`Payments → ${PAY_TO} at ${PRICE}/request on Base`);
  console.log(`Facilitator wallet: ${account.address}`);
});
