import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({
  validation: { logErrors: false },
  suppressNotices: ["yahooSurvey"],
});

async function fetchQuote(symbol, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const q = await yahooFinance.quote(symbol);
      if (q) return q;
    } catch (err) {
      if (i < retries - 1 && (err.message?.includes("Too Many") || err.message?.includes("429"))) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Symbol not found: ${symbol}`);
}

export async function getStock(symbol) {
  const upper = symbol.toUpperCase();
  const quote = await fetchQuote(upper);
  if (!quote) throw new Error(`Symbol not found: ${symbol}`);

  const prev = quote.regularMarketPreviousClose ?? quote.chartPreviousClose ?? 0;
  const price = quote.regularMarketPrice ?? 0;

  return {
    symbol: quote.symbol,
    name: quote.longName ?? quote.shortName ?? quote.symbol,
    exchange: quote.fullExchangeName ?? quote.exchange,
    currency: quote.currency,
    price,
    previous_close: prev,
    change: parseFloat((price - prev).toFixed(4)),
    change_percent: prev ? parseFloat(((price - prev) / prev * 100).toFixed(4)) : null,
    day_high: quote.regularMarketDayHigh,
    day_low: quote.regularMarketDayLow,
    volume: quote.regularMarketVolume,
    market_cap: quote.marketCap ?? null,
    pe_ratio: quote.trailingPE ?? null,
    fifty_two_week_high: quote.fiftyTwoWeekHigh ?? null,
    fifty_two_week_low: quote.fiftyTwoWeekLow ?? null,
    market_state: quote.marketState,
    timestamp: quote.regularMarketTime instanceof Date
      ? quote.regularMarketTime.toISOString()
      : new Date(quote.regularMarketTime * 1000).toISOString(),
  };
}
