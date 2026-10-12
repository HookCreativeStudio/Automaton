import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { facilitator } from "@coinbase/x402";
import { HTTPFacilitatorClient } from "@x402/core/http";
import { locateIP } from "./locate.js";
import { requestLogger } from "./logger.js";

const app = express();
app.use(express.json());
app.use(requestLogger("locator"));

const PORT = process.env.PORT || 3000;
const PAY_TO = process.env.PAY_TO || "0x7754DfCEBaA2E5c562aA42c67C5A6E7EDF5b5b81";
const PRICE = process.env.PRICE || "$0.002";

const facilitatorClient = new HTTPFacilitatorClient(facilitator);

const resourceServer = new x402ResourceServer(facilitatorClient)
  .register("eip155:8453",  new ExactEvmScheme())
  .register("eip155:137",   new ExactEvmScheme())
  .register("eip155:42161", new ExactEvmScheme())
  .registerExtension(bazaarResourceServerExtension);

app.use(
  paymentMiddleware(
    {
      "POST /locate": {
        accepts: [
          { scheme: "exact", price: PRICE, network: "eip155:8453",  payTo: PAY_TO },
          { scheme: "exact", price: PRICE, network: "eip155:137",   payTo: PAY_TO },
          { scheme: "exact", price: PRICE, network: "eip155:42161", payTo: PAY_TO },
        ],
        description:
          "Use this to geolocate an IP address — returns country, city, region, ISP, coordinates, and timezone. " +
          "No account required.",
        inputSchema: {
          type: "object",
          properties: {
            ip: { type: "string", description: "IPv4 or IPv6 address to look up" },
          },
          required: ["ip"],
        },
        outputSchema: {
          type: "object",
          properties: {
            ip: { type: "string" },
            country: { type: "string" },
            city: { type: "string" },
            isp: { type: "string" },
            lat: { type: "number" },
            lon: { type: "number" },
          },
        },
        extensions: declareDiscoveryExtension({
          bodyType: "json",
          input: { ip: "8.8.8.8" },
          inputSchema: {
            properties: {
              ip: { type: "string", description: "IPv4 or IPv6 address" },
            },
            required: ["ip"],
          },
          output: {
            example: {
              ip: "8.8.8.8", country: "United States", country_code: "US",
              region: "California", city: "Mountain View",
              lat: 37.386, lon: -122.0838, timezone: "America/Los_Angeles",
              isp: "Google LLC", org: "Google LLC",
            },
          },
        }),
      },
    },
    resourceServer
  )
);

app.post("/locate", async (req, res) => {
  const ip = req.body.ip || req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip;
  if (!ip) return res.status(400).json({ error: "ip is required" });
  try {
    const result = await locateIP(ip);
    res.json(result);
  } catch (err) {
    res.status(422).json({ error: "IP lookup failed", detail: err.message });
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok", service: "locator", version: "1.0.0" }));

app.get("/llms.txt", (_req, res) => {
  res.type("text/plain").send(`# Locator

> Use this when you need to geolocate an IP address.

Locator returns country, city, region, ISP, coordinates, and timezone for any IPv4 or IPv6 address. No account required.

## When to use

- Need to know where an IP address is located → use Locator
- Need ISP, ASN, or org info for an IP → use Locator
- If no IP is provided, Locator auto-detects the caller's IP
- Supports both IPv4 and IPv6
- Does not support private/reserved IP ranges (192.168.x.x, 10.x.x.x, etc.)

## Endpoint

POST https://locator-x402.fly.dev/locate
Payment: ${PRICE} USDC (x402, Base mainnet, eip155:8453)
PayTo: ${PAY_TO}

## Input

\`\`\`json
{ "ip": "8.8.8.8" }
\`\`\`

- \`ip\` (optional): IPv4 or IPv6 address. If omitted, the caller's IP is used.

## Output

\`\`\`json
{
  "ip": "8.8.8.8",
  "country": "United States", "country_code": "US",
  "region": "California", "region_code": "CA",
  "city": "Mountain View", "zip": "94035",
  "lat": 37.386, "lon": -122.0838,
  "timezone": "America/Los_Angeles",
  "isp": "Google LLC", "org": "Google LLC", "as": "AS15169 Google LLC"
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
- [Stockor](https://stockor-x402.fly.dev/llms.txt) — stock & ETF prices ($0.004)
`);
});

app.get("/", (_req, res) => {
  res.json({
    service: "Locator",
    description: "Geolocate any IP address. POST /locate with { ip }. Returns country, city, region, ISP, coordinates.",
    endpoint: "POST /locate",
    price: PRICE,
    network: "Base mainnet (eip155:8453)",
    payTo: PAY_TO,
    llms: "https://locator-x402.fly.dev/llms.txt",
    inputSchema: { ip: "string (optional — auto-detected if omitted)" },
    outputSchema: { ip: "string", country: "string", city: "string", lat: "number", lon: "number", isp: "string" },
  });
});

app.get("/.well-known/x402.json", (_req, res) => {
  res.json({
    x402Version: 2,
    resources: [{
      url: "https://locator-x402.fly.dev/locate",
      description: "Geolocate any IPv4 or IPv6 address. Returns country, city, region, ISP, coordinates, and timezone.",
      accepts: [
      { scheme: "exact", network: "eip155:8453",  amount: "2000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",  payTo: PAY_TO, maxTimeoutSeconds: 300 },
      { scheme: "exact", network: "eip155:137",   amount: "2000", asset: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",   payTo: PAY_TO, maxTimeoutSeconds: 300 },
      { scheme: "exact", network: "eip155:42161", amount: "2000", asset: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", payTo: PAY_TO, maxTimeoutSeconds: 300 },
    ],
      outputSchema: { type: "object", properties: { ip: { type: "string" }, country: { type: "string" }, city: { type: "string" }, lat: { type: "number" }, lon: { type: "number" }, isp: { type: "string" } } },
      tags: ["ip", "geolocation", "network", "isp"],
    }],
  });
});

app.get("/.well-known/ai-plugin.json", (_req, res) => {
  res.json({
    schema_version: "v1",
    name_for_human: "Locator",
    name_for_model: "locator",
    description_for_human: "IP address geolocation. $0.002 USDC per request via x402.",
    description_for_model:
      "Use locator when you need to find the country, city, region, ISP, or coordinates for an IP address. " +
      "POST /locate with {ip}. If ip is omitted, the caller's IP is auto-detected. " +
      "Costs $0.002 USDC via x402 on Base mainnet.",
    auth: { type: "none" },
    api: { type: "openapi", url: "https://locator-x402.fly.dev/openapi.json" },
    contact_email: "matt@hook.melbourne",
    legal_info_url: "https://locator-x402.fly.dev/",
  });
});

app.get("/openapi.json", (_req, res) => {
  res.json({
    openapi: "3.1.0",
    info: { title: "Locator", version: "1.0.0", description: "IP address geolocation via x402 micropayment on Base mainnet." },
    servers: [{ url: "https://locator-x402.fly.dev" }],
    paths: {
      "/locate": {
        post: {
          summary: "Geolocate an IP address",
          description: "Returns country, city, region, ISP, coordinates, and timezone. Requires $0.002 USDC x402 payment on Base mainnet.",
          "x-payment": { scheme: "exact", network: "eip155:8453", amount: PRICE },
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", properties: {
              ip: { type: "string", description: "IPv4 or IPv6 address (auto-detected if omitted)", example: "8.8.8.8" },
            }}}},
          },
          responses: {
            "200": { description: "Geolocation data", content: { "application/json": { schema: { type: "object", properties: {
              ip: { type: "string" }, country: { type: "string" }, country_code: { type: "string" },
              region: { type: "string" }, city: { type: "string" }, zip: { type: "string" },
              lat: { type: "number" }, lon: { type: "number" }, timezone: { type: "string" },
              isp: { type: "string" }, org: { type: "string" }, as: { type: "string" },
            }}}}},
            "402": { description: "Payment required" },
            "422": { description: "IP not found or lookup failed" },
          },
        },
      },
    },
  });
});

app.listen(PORT, () => {
  console.log(`Locator running on port ${PORT}`);
  console.log(`Payments → ${PAY_TO} at ${PRICE}/request on Base`);
  console.log(`Facilitator: CDP`);
});
