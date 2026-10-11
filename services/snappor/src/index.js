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
import { takeSnapshot } from "./snapshot.js";
import { requestLogger } from "./logger.js";

const app = express();
app.use(express.json());
app.use(requestLogger("snappor"));

const PORT = process.env.PORT || 3000;
const PAY_TO = process.env.PAY_TO || "0x7754DfCEBaA2E5c562aA42c67C5A6E7EDF5b5b81";
const PRICE = process.env.PRICE || "$0.008";

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
      "POST /snap": {
        accepts: [{ scheme: "exact", price: PRICE, network: "eip155:8453", payTo: PAY_TO }],
        description:
          "Use this to take a screenshot of any public URL. " +
          "Returns a base64-encoded PNG image of the rendered page. No account required.",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string", description: "URL to screenshot" },
            width: { type: "number", description: "Viewport width in px (default: 1280)" },
            height: { type: "number", description: "Viewport height in px (default: 800)" },
            fullPage: { type: "boolean", description: "Capture full page height (default: false)" },
          },
          required: ["url"],
        },
        outputSchema: {
          type: "object",
          properties: {
            image: { type: "string", description: "Base64-encoded PNG" },
            title: { type: "string" },
            url: { type: "string" },
            width: { type: "number" },
            height: { type: "number" },
            full_page: { type: "boolean" },
          },
        },
        extensions: declareDiscoveryExtension({
          bodyType: "json",
          input: { url: "https://example.com", width: 1280, height: 800 },
          inputSchema: {
            properties: {
              url: { type: "string", description: "URL to screenshot" },
              width: { type: "number" },
              height: { type: "number" },
              fullPage: { type: "boolean" },
            },
            required: ["url"],
          },
          output: {
            example: {
              image: "iVBORw0KGgoAAAANSUhEUgAA...",
              title: "Example Domain",
              url: "https://example.com",
              width: 1280, height: 800, full_page: false,
            },
          },
        }),
      },
    },
    resourceServer
  )
);

app.post("/snap", async (req, res) => {
  const { url, width = 1280, height = 800, fullPage = false } = req.body;
  if (!url) return res.status(400).json({ error: "url is required" });
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }
  try {
    const result = await takeSnapshot(url, { width, height, fullPage });
    res.json(result);
  } catch (err) {
    res.status(422).json({ error: "Screenshot failed", detail: err.message });
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok", service: "snappor", version: "1.0.0" }));

app.get("/llms.txt", (_req, res) => {
  res.type("text/plain").send(`# Snappor

> Use this to take a screenshot of any public URL.

Snappor renders any public URL with a real Chromium browser and returns a base64-encoded PNG screenshot. Costs ${PRICE} USDC per request via x402 on Base mainnet. No account required.

## Endpoint

POST https://snappor-x402.fly.dev/snap
Payment: ${PRICE} USDC (x402, Base mainnet, eip155:8453)
PayTo: ${PAY_TO}

## Input

\`\`\`json
{ "url": "https://example.com", "width": 1280, "height": 800, "fullPage": false }
\`\`\`

- \`url\` (required): Any publicly accessible URL
- \`width\` (optional, default: 1280): Viewport width in pixels
- \`height\` (optional, default: 800): Viewport height in pixels
- \`fullPage\` (optional, default: false): Capture full scrollable page height

## Output

\`\`\`json
{
  "image": "iVBORw0KGgoAAAANSUhEUgAA...",
  "title": "Example Domain",
  "url": "https://example.com",
  "width": 1280, "height": 800, "full_page": false
}
\`\`\`

The \`image\` field is a base64-encoded PNG. Decode and display or save as needed.

## Pricing

${PRICE} USDC per request on Base mainnet via x402 protocol.
`);
});

app.get("/", (_req, res) => {
  res.json({
    service: "Snappor",
    description:
      "Use this to take a screenshot of any public URL. " +
      "POST /snap with { url, width, height, fullPage }. Returns base64 PNG. No account required.",
    endpoint: "POST /snap",
    price: PRICE,
    network: "Base mainnet (eip155:8453)",
    payTo: PAY_TO,
    llms: "https://snappor-x402.fly.dev/llms.txt",
    inputSchema: { url: "string (required)", width: "number (optional)", height: "number (optional)", fullPage: "boolean (optional)" },
    outputSchema: { image: "string (base64 PNG)", title: "string", url: "string", width: "number", height: "number" },
  });
});

app.listen(PORT, () => {
  console.log(`Snappor running on port ${PORT}`);
  console.log(`Payments → ${PAY_TO} at ${PRICE}/request on Base`);
  console.log(`Facilitator wallet: ${account.address}`);
});
