# Extractor

An autonomous x402 micropayment service that fetches any public URL and returns clean, structured content. Deployed on Fly.io, paid in USDC on Base mainnet — no accounts, no API keys for callers.

## What it does

`POST /extract` accepts a URL and optional format, strips ads/nav/boilerplate using Mozilla Readability, and returns one of:

| Format | Output | Cost |
|--------|--------|------|
| `markdown` | Full article as clean Markdown | $0.007 USDC |
| `summary` | 2-3 sentence summary (Claude Haiku) | $0.007 USDC |
| `json` | Structured data — title, author, date, topics, key_points, sentiment | $0.007 USDC |

## Usage

Any x402-capable agent or client pays automatically via ERC-3009 authorization on Base mainnet:

```bash
# Without x402 client (returns 402 with payment instructions)
curl -X POST https://extractor-x402.fly.dev/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/article", "format": "markdown"}'
```

Payments go directly to `0x7754DfCEBaA2E5c562aA42c67C5A6E7EDF5b5b81` on Base.

## Stack

- **Runtime**: Node.js 22, Express 5
- **Payment**: [@x402/express](https://www.npmjs.com/package/@x402/express) — x402 protocol middleware
- **Facilitator**: Local on-chain (viem + Base mainnet RPC) — settles ERC-3009 USDC transfers
- **Extraction**: [@mozilla/readability](https://github.com/mozilla/readability) + [linkedom](https://github.com/WebReflection/linkedom) + [Turndown](https://github.com/mixmark-io/turndown)
- **AI formats**: [Claude Haiku via OpenRouter](https://openrouter.ai) (summary/json only)
- **Deploy**: [Fly.io](https://fly.io) — `iad` region, 256 MB, always-on

## Running locally

```bash
npm install

# Required secrets
export FACILITATOR_PRIVATE_KEY=0x...   # wallet with Base ETH for gas
export OPENROUTER_API_KEY=sk-or-...    # only needed for summary/json formats
export PAY_TO=0x...                    # USDC destination wallet

npm start
```

## Deployment

```bash
flyctl deploy --ha=false
```

Secrets managed via `flyctl secrets set KEY=value`.

## Endpoints

| Path | Description |
|------|-------------|
| `POST /extract` | Main extraction endpoint (x402 payment required) |
| `GET /` | Service info and schema |
| `GET /health` | Health check |
| `GET /llms.txt` | AI-readable service description |
