# Automaton Agent

A conversational agent that uses all ten Automaton services. Ask it anything about crypto prices, stocks, weather, currency rates, trending topics, domain info, IP locations, RSS feeds, or web content.

No API keys. No accounts. One wallet.

## Requirements

- Node.js 22+
- A wallet funded with a few dollars of USDC on Base mainnet
- An [OpenRouter](https://openrouter.ai) API key

## Setup

```bash
cp .env.example .env
# Fill in WALLET_PRIVATE_KEY and OPENROUTER_API_KEY
npm install
npm start
```

## Usage

```
Automaton agent (openai/gpt-4o-mini)
Wallet: 0xYourWalletAddress

> What's bitcoin doing today?
  [get_crypto_price $0.005] done

Bitcoin is trading at $67,420 (+2.3% in the last 24h). Market cap is $1.33T
with $38B in 24h volume.

> What's the weather in Tokyo this week?
  [get_weather $0.003] done

Tokyo is currently 18°C and partly cloudy. This week: Tuesday 20°C, Wednesday
22°C with light rain, Thursday back to clear skies around 19°C.

> exit
```

Each tool call is logged with its cost. The wallet pays automatically via x402 on Base mainnet.

## What it can do

| Question type | Tool | Cost |
|--------------|------|------|
| Crypto prices | Pricor | $0.005 |
| Stock quotes | Stockor | $0.004 |
| Currency conversion | Rator | $0.003 |
| Weather and forecasts | Weathor | $0.003 |
| Domain WHOIS | Resolvor | $0.004 |
| RSS feed reader | Fetchor | $0.002 |
| IP geolocation | Locator | $0.002 |
| Google Trends | Trendor | $0.015 |
| Web content extraction | Extractor | $0.007 |
| Webpage screenshots | Snappor | $0.008 |

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `WALLET_PRIVATE_KEY` | Yes | Private key of a Base mainnet wallet holding USDC |
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key |
| `MODEL` | No | Any OpenRouter model with tool use support (default: `openai/gpt-4o-mini`) |

Other models known to work well: `anthropic/claude-haiku-4-5`, `anthropic/claude-sonnet-4-6`, `openai/gpt-4o-mini`.

## Funding the wallet

The wallet only needs USDC on Base mainnet. A few dollars covers hundreds of queries. Get Base USDC via [Coinbase](https://coinbase.com) or bridge from another chain. The wallet address is printed on startup.
