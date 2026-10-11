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
import { getWeather } from "./weather.js";
import { requestLogger } from "./logger.js";

const app = express();
app.use(express.json());
app.use(requestLogger("weathor"));

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
      "POST /weather": {
        accepts: [{ scheme: "exact", price: PRICE, network: "eip155:8453", payTo: PAY_TO }],
        description:
          "Use this to get current weather conditions and a multi-day forecast for any location. " +
          "Returns temperature, humidity, wind, precipitation, and condition. No account required.",
        inputSchema: {
          type: "object",
          properties: {
            location: { type: "string", description: "City or place name" },
            days: { type: "number", description: "Forecast days 1-7 (default: 3)" },
            units: { type: "string", enum: ["celsius", "fahrenheit"], description: "Temperature units (default: celsius)" },
          },
          required: ["location"],
        },
        outputSchema: {
          type: "object",
          properties: {
            location: { type: "string" },
            country: { type: "string" },
            current: { type: "object" },
            forecast: { type: "array" },
          },
        },
        extensions: declareDiscoveryExtension({
          bodyType: "json",
          input: { location: "Sydney", days: 3, units: "celsius" },
          inputSchema: {
            properties: {
              location: { type: "string", description: "City or place name" },
              days: { type: "number", description: "Forecast days 1-7 (default: 3)" },
              units: { type: "string", enum: ["celsius", "fahrenheit"] },
            },
            required: ["location"],
          },
          output: {
            example: {
              location: "Sydney", country: "Australia", timezone: "Australia/Sydney", units: "°C",
              current: { temperature: 22.1, feels_like: 21.4, humidity_pct: 65, condition: "Partly cloudy", wind_speed_kmh: 18 },
              forecast: [{ date: "2025-01-01", condition: "Mainly clear", temp_max: 25.0, temp_min: 17.0 }],
            },
          },
        }),
      },
    },
    resourceServer
  )
);

app.post("/weather", async (req, res) => {
  const { location, days = 3, units = "celsius" } = req.body;
  if (!location) return res.status(400).json({ error: "location is required" });
  try {
    const result = await getWeather(location, days, units);
    res.json(result);
  } catch (err) {
    res.status(422).json({ error: "Weather lookup failed", detail: err.message });
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok", service: "weathor", version: "1.0.0" }));

app.get("/llms.txt", (_req, res) => {
  res.type("text/plain").send(`# Weathor

> Use this when you need current weather conditions or a forecast for any location.

Weathor returns real-time weather and up to 7-day forecasts for any city or place — temperature, humidity, wind, precipitation, and condition — via Open-Meteo. No account required.

## When to use

- Need current temperature, wind, or conditions for a location → use Weathor
- Need a multi-day forecast → use Weathor with days=3 to 7
- Supports Celsius and Fahrenheit
- Accepts any city or place name; resolves via geocoding
- Free underlying data (Open-Meteo / ECB); no rate limit concerns

## Endpoint

POST https://weathor-x402.fly.dev/weather
Payment: ${PRICE} USDC (x402, Base mainnet, eip155:8453)
PayTo: ${PAY_TO}

## Input

\`\`\`json
{ "location": "Sydney", "days": 3, "units": "celsius" }
\`\`\`

- \`location\` (required): City or place name
- \`days\` (optional, default: 3, max: 7): Number of forecast days
- \`units\` (optional, default: celsius): celsius | fahrenheit

## Output

\`\`\`json
{
  "location": "Sydney", "country": "Australia", "timezone": "Australia/Sydney", "units": "°C",
  "current": {
    "temperature": 22.1, "feels_like": 21.4, "humidity_pct": 65,
    "precipitation_mm": 0, "wind_speed_kmh": 18, "wind_direction_deg": 220,
    "condition": "Partly cloudy", "time": "2025-01-01T14:00"
  },
  "forecast": [
    { "date": "2025-01-01", "condition": "Mainly clear", "temp_max": 25.0, "temp_min": 17.0, "precipitation_mm": 0, "wind_max_kmh": 22 }
  ]
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
- [Locator](https://locator-x402.fly.dev/llms.txt) — IP geolocation ($0.002)
- [Stockor](https://stockor-x402.fly.dev/llms.txt) — stock & ETF prices ($0.004)
`);
});

app.get("/", (_req, res) => {
  res.json({
    service: "Weathor",
    description: "Current weather and multi-day forecasts for any location. POST /weather with { location, days, units }.",
    endpoint: "POST /weather",
    price: PRICE,
    network: "Base mainnet (eip155:8453)",
    payTo: PAY_TO,
    llms: "https://weathor-x402.fly.dev/llms.txt",
    inputSchema: { location: "string (required)", days: "number (optional, 1-7)", units: "celsius|fahrenheit (optional)" },
    outputSchema: { location: "string", country: "string", current: "object", forecast: "array" },
  });
});

app.get("/.well-known/x402.json", (_req, res) => {
  res.json({
    x402Version: 2,
    resources: [{
      url: "https://weathor-x402.fly.dev/weather",
      description: "Current weather conditions and multi-day forecast for any location. POST with {location, days, units}.",
      accepts: [{ scheme: "exact", network: "eip155:8453", amount: "3000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: PAY_TO, maxTimeoutSeconds: 300 }],
      outputSchema: { type: "object", properties: { location: { type: "string" }, country: { type: "string" }, current: { type: "object" }, forecast: { type: "array" } } },
      tags: ["weather", "forecast", "temperature", "climate"],
    }],
  });
});

app.get("/.well-known/ai-plugin.json", (_req, res) => {
  res.json({
    schema_version: "v1",
    name_for_human: "Weathor",
    name_for_model: "weathor",
    description_for_human: "Current weather and forecasts for any location. $0.003 USDC per request via x402.",
    description_for_model:
      "Use weathor when you need current weather conditions or a forecast for any city or place. " +
      "POST /weather with {location, days, units}. Returns temperature, feels_like, humidity, wind, precipitation, condition, and up to 7-day forecast. " +
      "Costs $0.003 USDC via x402 on Base mainnet.",
    auth: { type: "none" },
    api: { type: "openapi", url: "https://weathor-x402.fly.dev/openapi.json" },
    contact_email: "matt@hook.melbourne",
    legal_info_url: "https://weathor-x402.fly.dev/",
  });
});

app.get("/openapi.json", (_req, res) => {
  res.json({
    openapi: "3.1.0",
    info: { title: "Weathor", version: "1.0.0", description: "Current weather and forecasts via x402 micropayment on Base mainnet." },
    servers: [{ url: "https://weathor-x402.fly.dev" }],
    paths: {
      "/weather": {
        post: {
          summary: "Get weather and forecast",
          description: "Returns current conditions and multi-day forecast. Requires $0.003 USDC x402 payment on Base mainnet.",
          "x-payment": { scheme: "exact", network: "eip155:8453", amount: PRICE },
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["location"], properties: {
              location: { type: "string", description: "City or place name", example: "Sydney" },
              days: { type: "number", description: "Forecast days 1-7 (default: 3)", example: 3 },
              units: { type: "string", enum: ["celsius", "fahrenheit"], description: "Temperature units (default: celsius)" },
            }}}},
          },
          responses: {
            "200": { description: "Weather data", content: { "application/json": { schema: { type: "object", properties: {
              location: { type: "string" }, country: { type: "string" }, timezone: { type: "string" }, units: { type: "string" },
              current: { type: "object" }, forecast: { type: "array" },
            }}}}},
            "402": { description: "Payment required" },
            "422": { description: "Location not found or lookup failed" },
          },
        },
      },
    },
  });
});

app.listen(PORT, () => {
  console.log(`Weathor running on port ${PORT}`);
  console.log(`Payments → ${PAY_TO} at ${PRICE}/request on Base`);
  console.log(`Facilitator wallet: ${account.address}`);
});
