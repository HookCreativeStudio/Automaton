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

> Use this when you need a visual screenshot of a webpage.

Snappor renders any public URL in a real Chromium browser and returns a base64-encoded PNG. Handles JavaScript-rendered content. No account required.

## When to use

- Need a visual capture of a webpage → use Snappor
- Need to verify what a page looks like right now → use Snappor
- Need clean readable text from a page → use Extractor instead (cheaper, no image)
- Renders JavaScript; works on SPAs and dynamic pages
- Does not work on login-gated pages

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

## Automaton Suite

Other services from the same provider (all x402, Base mainnet):

- [Pricor](https://pricor-x402.fly.dev/llms.txt) — real-time crypto prices ($0.005)
- [Rator](https://rator-x402.fly.dev/llms.txt) — fiat currency exchange rates ($0.003)
- [Fetchor](https://fetchor-x402.fly.dev/llms.txt) — RSS/Atom feed reader ($0.002)
- [Resolvor](https://resolvor-x402.fly.dev/llms.txt) — WHOIS domain lookup ($0.004)
- [Trendor](https://trendor-x402.fly.dev/llms.txt) — Google Trends data ($0.015)
- [Extractor](https://extractor-x402.fly.dev/llms.txt) — web content extraction ($0.007)
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

app.get("/.well-known/x402.json", (_req, res) => {
  res.json({
    x402Version: 2,
    host: "snappor-x402.fly.dev",
    resources: [{
      url: "https://snappor-x402.fly.dev/snap",
      description: "Full-page or viewport screenshot of any public URL using Chromium. Returns base64 PNG.",
      accepts: [{ scheme: "exact", network: "eip155:8453", amount: "8000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: PAY_TO }],
    }],
  });
});

app.get("/.well-known/ai-plugin.json", (_req, res) => {
  res.json({
    schema_version: "v1",
    name_for_human: "Snappor",
    name_for_model: "snappor",
    description_for_human: "Webpage screenshot service. $0.008 USDC per request via x402.",
    description_for_model:
      "Use snappor when you need a visual screenshot of a webpage. " +
      "POST /snap with {url, width, height, fullPage}. Returns base64-encoded PNG. " +
      "Renders JavaScript using Chromium, works on SPAs and dynamic pages. " +
      "For text content use Extractor instead (cheaper). Costs $0.008 USDC via x402 on Base mainnet.",
    auth: { type: "none" },
    api: { type: "openapi", url: "https://snappor-x402.fly.dev/openapi.json" },
    contact_email: "matt@hook.melbourne",
    legal_info_url: "https://snappor-x402.fly.dev/",
  });
});

app.get("/openapi.json", (_req, res) => {
  res.json({
    openapi: "3.1.0",
    info: { title: "Snappor", version: "1.0.0", description: "Webpage screenshot service via x402 micropayment on Base mainnet." },
    servers: [{ url: "https://snappor-x402.fly.dev" }],
    paths: {
      "/snap": {
        post: {
          summary: "Take webpage screenshot",
          description: "Renders a URL in Chromium and returns a base64-encoded PNG. Requires $0.008 USDC x402 payment on Base mainnet.",
          "x-payment": { scheme: "exact", network: "eip155:8453", amount: PRICE },
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["url"], properties: {
              url: { type: "string", description: "Public URL to screenshot", example: "https://example.com" },
              width: { type: "number", description: "Viewport width in pixels (default: 1280)", example: 1280 },
              height: { type: "number", description: "Viewport height in pixels (default: 800)", example: 800 },
              fullPage: { type: "boolean", description: "Capture full scrollable page (default: false)", example: false },
            }}}},
          },
          responses: {
            "200": { description: "Screenshot", content: { "application/json": { schema: { type: "object", properties: {
              image: { type: "string", description: "Base64-encoded PNG" },
              title: { type: "string" }, url: { type: "string" },
              width: { type: "number" }, height: { type: "number" }, full_page: { type: "boolean" },
            }}}}},
            "402": { description: "Payment required — include x402 payment header" },
            "422": { description: "URL unreachable or render failed" },
          },
        },
      },
    },
  });
});

app.listen(PORT, () => {
  console.log(`Snappor running on port ${PORT}`);
  console.log(`Payments → ${PAY_TO} at ${PRICE}/request on Base`);
  console.log(`Facilitator wallet: ${account.address}`);
});
