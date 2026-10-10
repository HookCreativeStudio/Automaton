import axios from "axios";

const BASE = "https://api.coingecko.com/api/v3";
const SYMBOL_MAP = {
  btc: "bitcoin", eth: "ethereum", sol: "solana", usdc: "usd-coin",
  usdt: "tether", bnb: "binancecoin", xrp: "ripple", ada: "cardano",
  doge: "dogecoin", avax: "avalanche-2", dot: "polkadot", link: "chainlink",
  matic: "matic-network", uni: "uniswap", ltc: "litecoin", base: "base",
};

export async function getPrice(coin, vs = "usd") {
  const id = SYMBOL_MAP[coin.toLowerCase()] || coin.toLowerCase();
  const headers = process.env.COINGECKO_API_KEY
    ? { "x-cg-demo-api-key": process.env.COINGECKO_API_KEY }
    : {};
  const { data } = await axios.get(`${BASE}/simple/price`, {
    params: {
      ids: id,
      vs_currencies: vs,
      include_market_cap: true,
      include_24hr_change: true,
      include_24hr_vol: true,
    },
    timeout: 8000,
    headers,
  });
  if (!data[id]) throw new Error(`Coin not found: ${coin}`);
  const r = data[id];
  return {
    coin: id,
    symbol: coin.toLowerCase(),
    vs_currency: vs,
    price: r[vs],
    market_cap: r[`${vs}_market_cap`],
    volume_24h: r[`${vs}_24h_vol`],
    change_24h: r[`${vs}_24h_change`],
    timestamp: new Date().toISOString(),
  };
}
