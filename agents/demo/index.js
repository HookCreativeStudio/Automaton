import Anthropic from "@anthropic-ai/sdk";
import { wrapFetchWithPayment } from "@x402/fetch";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { tools } from "./tools.js";
import * as readline from "readline";

if (!process.env.WALLET_PRIVATE_KEY) throw new Error("WALLET_PRIVATE_KEY is required");
if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is required");

const wallet = createWalletClient({
  account: privateKeyToAccount(process.env.WALLET_PRIVATE_KEY),
  chain: base,
  transport: http(),
});

const fetch = wrapFetchWithPayment(globalThis.fetch, wallet);
const anthropic = new Anthropic();

const SERVICES = {
  get_crypto_price:  { url: "https://pricor-x402.fly.dev/price",       cost: "$0.005" },
  get_stock_quote:   { url: "https://stockor-x402.fly.dev/stock",       cost: "$0.004" },
  get_exchange_rate: { url: "https://rator-x402.fly.dev/rate",          cost: "$0.003" },
  get_weather:       { url: "https://weathor-x402.fly.dev/weather",     cost: "$0.003" },
  whois_lookup:      { url: "https://resolvor-x402.fly.dev/whois",      cost: "$0.004" },
  read_feed:         { url: "https://fetchor-x402.fly.dev/feed",        cost: "$0.002" },
  locate_ip:         { url: "https://locator-x402.fly.dev/locate",      cost: "$0.002" },
  get_trends:        { url: "https://trendor-x402.fly.dev/trends",      cost: "$0.015" },
  extract_url:       { url: "https://extractor-x402.fly.dev/extract",   cost: "$0.007" },
  screenshot_url:    { url: "https://snappor-x402.fly.dev/snap",        cost: "$0.008" },
};

async function callService(name, args) {
  const { url, cost } = SERVICES[name];
  process.stdout.write(`  [${name} ${cost}] `);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${name} returned ${res.status}`);
  const data = await res.json();
  // Strip base64 image from Snappor — not useful in a text conversation
  if (name === "screenshot_url" && data.image) {
    const { image, ...meta } = data;
    process.stdout.write("done\n");
    return { ...meta, note: "Image captured (base64 omitted)" };
  }
  process.stdout.write("done\n");
  return data;
}

const SYSTEM = `You are a helpful assistant with access to ten real-time data tools: crypto prices, stock quotes, currency exchange rates, weather forecasts, WHOIS lookups, RSS feeds, IP geolocation, Google Trends, web content extraction, and webpage screenshots.

Each tool call costs a small amount of USDC (between $0.002 and $0.015) paid automatically from the user's wallet on Base mainnet. Use tools whenever the user asks for current information. Be concise in your responses.`;

async function chat(messages) {
  while (true) {
    const res = await anthropic.messages.create({
      model: process.env.MODEL || "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM,
      tools,
      messages,
    });

    messages.push({ role: "assistant", content: res.content });

    if (res.stop_reason === "end_turn") {
      const text = res.content.find((b) => b.type === "text");
      return text?.text ?? "";
    }

    const calls = res.content.filter((b) => b.type === "tool_use");
    if (!calls.length) break;

    const results = await Promise.all(
      calls.map(async (call) => {
        try {
          const data = await callService(call.name, call.input);
          return { type: "tool_result", tool_use_id: call.id, content: JSON.stringify(data) };
        } catch (err) {
          return { type: "tool_result", tool_use_id: call.id, content: `Error: ${err.message}`, is_error: true };
        }
      })
    );

    messages.push({ role: "user", content: results });
  }
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const messages = [];

function prompt() {
  rl.question("\n> ", async (input) => {
    const query = input.trim();
    if (!query || query === "exit") { rl.close(); return; }
    messages.push({ role: "user", content: query });
    try {
      const reply = await chat(messages);
      console.log(`\n${reply}`);
    } catch (err) {
      console.error(`\nError: ${err.message}`);
    }
    prompt();
  });
}

console.log("Automaton agent — type a question or 'exit' to quit.");
console.log(`Wallet: ${wallet.account.address}\n`);
prompt();
