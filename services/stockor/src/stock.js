import yahooFinance from "yahoo-finance2";

yahooFinance.setGlobalConfig({ validation: { logErrors: false } });

export async function getStock(symbol) {
  const upper = symbol.toUpperCase();
  const quote = await yahooFinance.quote(upper);
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
