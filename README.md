# Automaton

Ten live data services for AI agents, each paid per-request in USDC on Base mainnet via the [x402 protocol](https://x402.org). No API keys. No accounts. No subscriptions. Fund a wallet once, call any service immediately.

## The pitch

Every other agent toolkit requires a different API key for every data source. Automaton requires none. Payment is a single HTTP header, signed by a wallet the agent controls. A new agent can call all ten services with one environment variable.

## Services

| Service | Endpoint | What it returns | Price |
|---------|----------|-----------------|-------|
| [Pricor](https://pricor-x402.fly.dev) | `POST /price` | Real-time crypto prices (CoinGecko) | $0.005 |
| [Stockor](https://stockor-x402.fly.dev) | `POST /stock` | Stock and ETF quotes (NYSE, NASDAQ) | $0.004 |
| [Rator](https://rator-x402.fly.dev) | `POST /rate` | Fiat currency exchange rates | $0.003 |
| [Weathor](https://weathor-x402.fly.dev) | `POST /weather` | Current weather and 7-day forecasts | $0.003 |
| [Resolvor](https://resolvor-x402.fly.dev) | `POST /whois` | WHOIS domain lookup | $0.004 |
| [Fetchor](https://fetchor-x402.fly.dev) | `POST /feed` | RSS and Atom feed reader | $0.002 |
| [Locator](https://locator-x402.fly.dev) | `POST /locate` | IP address geolocation | $0.002 |
| [Trendor](https://trendor-x402.fly.dev) | `POST /trends` | Google Trends data | $0.015 |
| [Extractor](https://extractor-x402.fly.dev) | `POST /extract` | Web content extraction to Markdown | $0.007 |
| [Snappor](https://snappor-x402.fly.dev) | `POST /snapshot` | Webpage screenshots | $0.008 |

Every service exposes:
- `GET /llms.txt` - machine-readable description for AI agents
- `GET /.well-known/x402.json` - payment manifest for Bazaar/discovery
- `GET /.well-known/ai-plugin.json` - OpenAI plugin format
- `GET /openapi.json` - OpenAPI 3.1 spec
- `GET /health` - health check

## How payment works

Standard HTTP, one extra header. When a client calls a service without payment:

```
HTTP 402 Payment Required
X-Payment-Required: {"scheme":"exact","network":"eip155:8453","amount":"5000",...}
```

The x402 client library signs an ERC-3009 authorization with the caller's wallet and retries. The service verifies on-chain and responds. The whole round trip adds one network hop.

```js
import { wrapFetchWithPayment } from "@x402/fetch";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const wallet = createWalletClient({
  account: privateKeyToAccount(process.env.WALLET_PRIVATE_KEY),
  chain: base,
  transport: http(),
});

const fetch = wrapFetchWithPayment(globalThis.fetch, wallet);

// Payment is automatic from here
const res = await fetch("https://stockor-x402.fly.dev/stock", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ symbol: "AAPL" }),
});
```

The wallet needs USDC on Base mainnet. A few dollars covers thousands of calls.

## Running a service locally

Each service is a standalone Node.js app. Example using Stockor:

```bash
cd services/stockor
npm install

export FACILITATOR_PRIVATE_KEY=0x...   # Base mainnet wallet for settlement
export MONGO_URI=mongodb+srv://...      # Optional: request logging
npm start
```

The `FACILITATOR_PRIVATE_KEY` wallet needs a small amount of Base ETH for gas (a few cents covers months of traffic). Payments are received by the `PAY_TO` address hardcoded in each service's `index.js` -- change it to your own wallet before deploying.

## Deploying your own instance

```bash
cd services/stockor
flyctl apps create your-stockor
flyctl ips allocate-v4 --shared --app your-stockor
flyctl secrets set FACILITATOR_PRIVATE_KEY=0x... --app your-stockor
flyctl deploy --ha=false
```

Replace the `PAY_TO` address and `fly.toml` app name with your own before deploying.

## Adding a service

Each service follows the same structure:

```
services/your-service/
  src/
    index.js      # Express app, x402 middleware, all discovery endpoints
    your-logic.js # The actual data fetch
    logger.js     # MongoDB request logging (copy from any other service)
  package.json
  Dockerfile
  fly.toml
```

The `index.js` pattern is identical across all services: wire up `paymentMiddleware`, define the route, add `llms.txt` / `x402.json` / `ai-plugin.json` / `openapi.json`. Copy any existing service and swap the logic.

## Stack

- **Runtime**: Node.js 22, Express 5
- **Payment**: [@x402/express](https://www.npmjs.com/package/@x402/express)
- **Chain**: Base mainnet (eip155:8453), USDC
- **Facilitator**: Local on-chain via [viem](https://viem.sh)
- **Deploy**: [Fly.io](https://fly.io)
- **Discovery**: [Agent Bazaar](https://bazaar.saylorinnovations.com)

## License

MIT
