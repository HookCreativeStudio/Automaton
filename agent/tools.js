export const tools = [
  {
    type: "function",
    function: {
      name: "get_crypto_price",
      description:
        "Get real-time price, market cap, 24h volume, and 24h change for any cryptocurrency. " +
        "Use for Bitcoin, Ethereum, Solana, or any CoinGecko-listed coin. Do not use for stocks or ETFs.",
      parameters: {
        type: "object",
        properties: {
          coin: { type: "string", description: "Coin ID or symbol (e.g. bitcoin, ethereum, solana, BTC)" },
          vs: { type: "string", description: "Quote currency (default: usd)" },
        },
        required: ["coin"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_stock_quote",
      description:
        "Get current price, change, volume, market cap, and P/E ratio for any US stock or ETF. " +
        "Use for NYSE and NASDAQ listed equities. Do not use for crypto.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Ticker symbol (e.g. AAPL, TSLA, SPY, QQQ)" },
        },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_exchange_rate",
      description: "Get live fiat currency exchange rates and convert amounts between currencies.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Source currency code (e.g. USD, EUR, GBP, AUD)" },
          to: { type: "string", description: "Target currency code" },
          amount: { type: "number", description: "Amount to convert (default: 1)" },
        },
        required: ["from", "to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weather",
      description:
        "Get current weather conditions and a multi-day forecast for any city or location. " +
        "Returns temperature, humidity, wind, precipitation, and condition.",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string", description: "City or place name (e.g. Tokyo, Sydney, New York)" },
          days: { type: "number", description: "Forecast days 1-7 (default: 3)" },
          units: { type: "string", enum: ["celsius", "fahrenheit"], description: "Temperature units (default: celsius)" },
        },
        required: ["location"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "whois_lookup",
      description: "Look up WHOIS registration data for any domain name. Returns registrar, dates, nameservers, and status.",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Domain name (e.g. example.com)" },
        },
        required: ["domain"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_feed",
      description: "Fetch and parse any RSS or Atom feed URL. Returns the latest items with titles, links, and summaries.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "RSS or Atom feed URL" },
          limit: { type: "number", description: "Max items to return (default: 10)" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "locate_ip",
      description: "Geolocate an IP address. Returns country, city, region, ISP, coordinates, and timezone.",
      parameters: {
        type: "object",
        properties: {
          ip: { type: "string", description: "IPv4 or IPv6 address to look up" },
        },
        required: ["ip"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_trends",
      description: "Get Google Trends interest-over-time data for any keyword. Returns trend timeline, peak value, and regional breakdown.",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "Search keyword or topic" },
          timeframe: { type: "string", enum: ["1m", "3m", "12m", "5y"], description: "Time range (default: 12m)" },
          geo: { type: "string", description: "Country code e.g. US, GB, AU (default: worldwide)" },
        },
        required: ["keyword"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "extract_url",
      description:
        "Fetch any public URL and extract clean readable content. " +
        "Use markdown for full article text, summary for a 2-3 sentence summary, json for structured data.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Public URL to fetch and extract" },
          format: { type: "string", enum: ["markdown", "summary", "json"], description: "Output format (default: markdown)" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "screenshot_url",
      description: "Take a screenshot of any public webpage. Returns the image as a base64-encoded PNG.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to screenshot" },
          fullPage: { type: "boolean", description: "Capture full page height (default: false)" },
        },
        required: ["url"],
      },
    },
  },
];
