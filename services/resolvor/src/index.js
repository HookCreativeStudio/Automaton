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
import { lookupDomain } from "./resolve.js";
import { requestLogger } from "./logger.js";

const app = express();
app.use(express.json());
app.use(requestLogger("resolvor"));

const PORT = process.env.PORT || 3000;
const PAY_TO = process.env.PAY_TO || "0x7754DfCEBaA2E5c562aA42c67C5A6E7EDF5b5b81";
const PRICE = process.env.PRICE || "$0.004";

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
      "POST /resolve": {
        accepts: [{ scheme: "exact", price: PRICE, network: "eip155:8453", payTo: PAY_TO }],
        description:
          "Use this to look up WHOIS domain registration data. " +
          "Returns registrar, creation date, expiry, nameservers, and status for any domain. No account required.",
        inputSchema: {
          type: "object",
          properties: {
            domain: { type: "string", description: "Domain name to look up (e.g. example.com)" },
          },
          required: ["domain"],
        },
        outputSchema: {
          type: "object",
          properties: {
            domain: { type: "string" },
            registrar: { type: "string" },
            created: { type: "string" },
            expires: { type: "string" },
            updated: { type: "string" },
            status: { type: "array" },
            nameservers: { type: "array" },
          },
        },
        extensions: declareDiscoveryExtension({
          bodyType: "json",
          input: { domain: "example.com" },
          inputSchema: {
            properties: {
              domain: { type: "string", description: "Domain name to look up" },
            },
            required: ["domain"],
          },
          output: {
            example: {
              domain: "example.com",
              registrar: "IANA",
              created: "1995-08-14T04:00:00Z",
              expires: "2025-08-13T04:00:00Z",
              updated: "2023-08-14T07:01:38Z",
              status: ["clientDeleteProhibited"],
              nameservers: ["a.iana-servers.net", "b.iana-servers.net"],
            },
          },
        }),
      },
    },
    resourceServer
  )
);

app.post("/resolve", async (req, res) => {
  const { domain } = req.body;
  if (!domain) return res.status(400).json({ error: "domain is required" });
  try {
    const result = await lookupDomain(domain);
    res.json(result);
  } catch (err) {
    res.status(422).json({ error: "WHOIS lookup failed", detail: err.message });
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok", service: "resolvor", version: "1.0.0" }));

app.get("/llms.txt", (_req, res) => {
  res.type("text/plain").send(`# Resolvor

> Use this when you need to check who owns a domain or when it expires.

Resolvor queries WHOIS for any domain and returns registrar, creation date, expiry, nameservers, and registration status. No account required.

## When to use

- Need to know who registered a domain, or when it expires → use Resolvor
- Need to check if a domain is available → Resolvor will show if it's registered and expiry date
- Supports .com, .org, .net, .io, .co, and most country-code TLDs
- Does not perform DNS lookups (for DNS use a dig service)

## Endpoint

POST https://resolvor-x402.fly.dev/resolve
Payment: ${PRICE} USDC (x402, Base mainnet, eip155:8453)
PayTo: ${PAY_TO}

## Input

\`\`\`json
{ "domain": "example.com" }
\`\`\`

- \`domain\` (required): Domain name to look up (e.g. example.com, not https://example.com)

## Output

\`\`\`json
{
  "domain": "example.com",
  "registrar": "IANA",
  "created": "1995-08-14T04:00:00Z",
  "expires": "2025-08-13T04:00:00Z",
  "status": ["clientDeleteProhibited"],
  "nameservers": ["a.iana-servers.net", "b.iana-servers.net"]
}
\`\`\`

## Pricing

${PRICE} USDC per request on Base mainnet via x402 protocol.

## Automaton Suite

Other services from the same provider (all x402, Base mainnet):

- [Pricor](https://pricor-x402.fly.dev/llms.txt) — real-time crypto prices ($0.005)
- [Rator](https://rator-x402.fly.dev/llms.txt) — fiat currency exchange rates ($0.003)
- [Fetchor](https://fetchor-x402.fly.dev/llms.txt) — RSS/Atom feed reader ($0.002)
- [Trendor](https://trendor-x402.fly.dev/llms.txt) — Google Trends data ($0.015)
- [Extractor](https://extractor-x402.fly.dev/llms.txt) — web content extraction ($0.007)
- [Snappor](https://snappor-x402.fly.dev/llms.txt) — webpage screenshots ($0.008)
`);
});

app.get("/", (_req, res) => {
  res.json({
    service: "Resolvor",
    description:
      "Use this to look up WHOIS domain registration data. " +
      "POST /resolve with { domain }. No account required.",
    endpoint: "POST /resolve",
    price: PRICE,
    network: "Base mainnet (eip155:8453)",
    payTo: PAY_TO,
    llms: "https://resolvor-x402.fly.dev/llms.txt",
    inputSchema: { domain: "string (required)" },
    outputSchema: { domain: "string", registrar: "string", created: "string", expires: "string", nameservers: "array" },
  });
});

app.get("/.well-known/x402.json", (_req, res) => {
  res.json({
    x402Version: 2,
    host: "resolvor-x402.fly.dev",
    resources: [{
      url: "https://resolvor-x402.fly.dev/resolve",
      description: "WHOIS domain lookup — registrar, creation date, expiry, nameservers, and status.",
      accepts: [{ scheme: "exact", network: "eip155:8453", amount: "4000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: PAY_TO }],
    }],
  });
});

app.get("/.well-known/ai-plugin.json", (_req, res) => {
  res.json({
    schema_version: "v1",
    name_for_human: "Resolvor",
    name_for_model: "resolvor",
    description_for_human: "WHOIS domain lookup. $0.004 USDC per request via x402.",
    description_for_model:
      "Use resolvor when you need to find out who registered a domain, when it expires, its nameservers, or registration status. " +
      "POST /resolve with {domain}. Supports .com, .org, .net, .io, .co, and most ccTLDs. " +
      "Costs $0.004 USDC via x402 on Base mainnet. Does not perform DNS lookups.",
    auth: { type: "none" },
    api: { type: "openapi", url: "https://resolvor-x402.fly.dev/openapi.json" },
    contact_email: "matt@hook.melbourne",
    legal_info_url: "https://resolvor-x402.fly.dev/",
  });
});

app.get("/openapi.json", (_req, res) => {
  res.json({
    openapi: "3.1.0",
    info: { title: "Resolvor", version: "1.0.0", description: "WHOIS domain lookup via x402 micropayment on Base mainnet." },
    servers: [{ url: "https://resolvor-x402.fly.dev" }],
    paths: {
      "/resolve": {
        post: {
          summary: "WHOIS domain lookup",
          description: "Returns registrar, creation date, expiry, nameservers, and status. Requires $0.004 USDC x402 payment on Base mainnet.",
          "x-payment": { scheme: "exact", network: "eip155:8453", amount: PRICE },
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["domain"], properties: {
              domain: { type: "string", description: "Domain name to look up (e.g. example.com)", example: "example.com" },
            }}}},
          },
          responses: {
            "200": { description: "WHOIS data", content: { "application/json": { schema: { type: "object", properties: {
              domain: { type: "string" }, registrar: { type: "string" }, created: { type: "string" },
              expires: { type: "string" }, status: { type: "array", items: { type: "string" } },
              nameservers: { type: "array", items: { type: "string" } },
            }}}}},
            "402": { description: "Payment required — include x402 payment header" },
            "422": { description: "Domain not found or WHOIS lookup failed" },
          },
        },
      },
    },
  });
});

app.listen(PORT, () => {
  console.log(`Resolvor running on port ${PORT}`);
  console.log(`Payments → ${PAY_TO} at ${PRICE}/request on Base`);
  console.log(`Facilitator wallet: ${account.address}`);
});
