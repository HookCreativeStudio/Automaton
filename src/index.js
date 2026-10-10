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
import { extract } from "./extract.js";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const PAY_TO = process.env.PAY_TO || "0x7754DfCEBaA2E5c562aA42c67C5A6E7EDF5b5b81";
const PRICE = process.env.PRICE || "$0.007";

// Local on-chain facilitator — verifies and settles EIP-3009 payments on Base mainnet
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
      "POST /extract": {
        accepts: [
          {
            scheme: "exact",
            price: PRICE,
            network: "eip155:8453",
            payTo: PAY_TO,
          },
        ],
        description:
          "Use this when you need clean structured content from any URL. " +
          "Accepts a URL and format preference (markdown, summary, json). " +
          "Returns structured content. No account required.",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string", description: "The URL to extract content from" },
            format: {
              type: "string",
              enum: ["markdown", "summary", "json"],
              description: "Output format",
            },
          },
          required: ["url"],
        },
        outputSchema: {
          type: "object",
          properties: {
            content: { description: "Extracted content in requested format" },
            title: { type: "string" },
            source_url: { type: "string" },
            word_count: { type: "number" },
          },
        },
        extensions: declareDiscoveryExtension({
          bodyType: "json",
          input: { url: "https://example.com/article", format: "markdown" },
          inputSchema: {
            properties: {
              url: { type: "string", description: "The URL to extract content from" },
              format: { type: "string", enum: ["markdown", "summary", "json"], description: "Output format" },
            },
            required: ["url"],
          },
          output: {
            example: {
              content: "# Article Title\n\nArticle body in markdown...",
              title: "Article Title",
              source_url: "https://example.com/article",
              word_count: 450,
            },
          },
        }),
      },
    },
    resourceServer
  )
);

app.post("/extract", async (req, res) => {
  const { url, format = "markdown" } = req.body;

  if (!url) return res.status(400).json({ error: "url is required" });
  if (!["markdown", "summary", "json"].includes(format)) {
    return res.status(400).json({ error: "format must be markdown, summary, or json" });
  }

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }

  try {
    const result = await extract(url, format);
    res.json(result);
  } catch (err) {
    if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND" || err.response?.status >= 400) {
      res.status(422).json({ error: "Could not fetch URL", detail: err.message });
    } else {
      res.status(500).json({ error: "Extraction failed", detail: err.message });
    }
  }
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "extractor", version: "1.0.0" });
});

app.get("/llms.txt", (_req, res) => {
  res.type("text/plain").send(`# Extractor

> Use this when you need clean structured content from any URL.

Extractor fetches any public URL and returns its content as clean markdown, a 2-3 sentence summary, or structured JSON — stripping ads, navigation, and boilerplate. Costs $0.007 USDC per request via x402 on Base mainnet. No account required.

## Endpoint

POST https://extractor-x402.fly.dev/extract
Payment: $0.007 USDC (x402, Base mainnet, eip155:8453)
PayTo: ${PAY_TO}

## Input

\`\`\`json
{
  "url": "https://example.com/article",
  "format": "markdown"
}
\`\`\`

- \`url\` (required): Any publicly accessible URL
- \`format\` (optional, default: markdown): \`markdown\` | \`summary\` | \`json\`

## Output

\`\`\`json
{
  "content": "# Article Title\\n\\nClean article body...",
  "title": "Article Title",
  "source_url": "https://example.com/article",
  "word_count": 450
}
\`\`\`

- **markdown**: Full article as clean Markdown (fast, no AI)
- **summary**: 2-3 sentence summary (Claude Haiku)
- **json**: Structured data — title, author, date, topics, key_points, sentiment (Claude Haiku)

## Pricing

$0.007 USDC per request on Base mainnet via x402 protocol.
`);
});

app.get("/", (_req, res) => {
  res.json({
    service: "Extractor",
    description:
      "Use this when you need clean structured content from any URL. " +
      "POST /extract with { url, format } — format is markdown, summary, or json. " +
      "Costs " + PRICE + " USDC per request via x402.",
    endpoint: "POST /extract",
    price: PRICE,
    network: "Base mainnet (eip155:8453)",
    payTo: PAY_TO,
    llms: "https://extractor-x402.fly.dev/llms.txt",
    inputSchema: { url: "string (required)", format: "markdown | summary | json (default: markdown)" },
    outputSchema: { content: "string | object", title: "string", source_url: "string", word_count: "number" },
  });
});

app.listen(PORT, () => {
  console.log(`Extractor running on port ${PORT}`);
  console.log(`Payments → ${PAY_TO} at ${PRICE}/request on Base`);
  console.log(`Facilitator wallet: ${account.address}`);
});
