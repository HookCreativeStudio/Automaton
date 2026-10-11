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

> Use this to look up WHOIS domain registration data.

Resolvor queries WHOIS for any domain and returns registrar, creation date, expiry, nameservers, and status. Costs ${PRICE} USDC per request via x402 on Base mainnet. No account required.

## Endpoint

POST https://resolvor-x402.fly.dev/resolve
Payment: ${PRICE} USDC (x402, Base mainnet, eip155:8453)
PayTo: ${PAY_TO}

## Input

\`\`\`json
{ "domain": "example.com" }
\`\`\`

- \`domain\` (required): Domain name to look up

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

app.listen(PORT, () => {
  console.log(`Resolvor running on port ${PORT}`);
  console.log(`Payments → ${PAY_TO} at ${PRICE}/request on Base`);
  console.log(`Facilitator wallet: ${account.address}`);
});
