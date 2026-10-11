import OpenAI from "openai";
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { toClientEvmSigner } from "@x402/evm";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { tools } from "./tools.js";
import * as readline from "readline";

if (!process.env.WALLET_PRIVATE_KEY) throw new Error("WALLET_PRIVATE_KEY is required");
if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is required");

const account = privateKeyToAccount(process.env.WALLET_PRIVATE_KEY);
const wallet = createWalletClient({
  account,
  chain: base,
  transport: http(),
}).extend(publicActions);

Object.assign(wallet, { address: account.address });
const signer = toClientEvmSigner(wallet);
const client = registerExactEvmScheme(new x402Client(), { signer });
const fetch = wrapFetchWithPayment(globalThis.fetch, client);

const ai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const MODEL = process.env.MODEL || "openai/gpt-4o-mini";

const SERVICES = {
  get_crypto_price:  { url: "https://pricor-x402.fly.dev/price",      cost: "$0.005" },
  get_stock_quote:   { url: "https://stockor-x402.fly.dev/stock",      cost: "$0.004" },
  get_exchange_rate: { url: "https://rator-x402.fly.dev/rate",         cost: "$0.003" },
  get_weather:       { url: "https://weathor-x402.fly.dev/weather",    cost: "$0.003" },
  whois_lookup:      { url: "https://resolvor-x402.fly.dev/resolve",   cost: "$0.004" },
  read_feed:         { url: "https://fetchor-x402.fly.dev/feed",       cost: "$0.002" },
  locate_ip:         { url: "https://locator-x402.fly.dev/locate",     cost: "$0.002" },
  get_trends:        { url: "https://trendor-x402.fly.dev/trends",     cost: "$0.015" },
  extract_url:       { url: "https://extractor-x402.fly.dev/extract",  cost: "$0.007" },
  screenshot_url:    { url: "https://snappor-x402.fly.dev/snap",       cost: "$0.008" },
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
  if (name === "screenshot_url" && data.image) {
    const { image, ...meta } = data;
    process.stdout.write("done\n");
    return { ...meta, note: "Image captured (base64 omitted)" };
  }
  process.stdout.write("done\n");
  return data;
}

const SYSTEM = `You are a helpful assistant with access to ten real-time data tools: crypto prices, stock quotes, currency exchange rates, weather forecasts, WHOIS lookups, RSS feeds, IP geolocation, Google Trends, web content extraction, and webpage screenshots. Each tool call costs a small amount of USDC paid automatically. Use tools whenever the user asks for current information. Be concise.`;

async function chat(messages) {
  while (true) {
    const res = await ai.chat.completions.create({ model: MODEL, messages, tools });
    const msg = res.choices[0].message;
    messages.push(msg);

    if (res.choices[0].finish_reason === "stop" || !msg.tool_calls?.length) {
      return msg.content ?? "";
    }

    const calls = msg.tool_calls;

    for (const call of calls) {
      const args = JSON.parse(call.function.arguments);
      let content;
      try {
        content = JSON.stringify(await callService(call.function.name, args));
      } catch (err) {
        console.error(`  [error] ${err.message}`);
        content = `Error: ${err.message}`;
      }
      messages.push({ role: "tool", tool_call_id: call.id, content });
    }
  }
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const messages = [{ role: "system", content: SYSTEM }];

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

console.log(`Automaton agent (${MODEL})`);
console.log(`Wallet: ${account.address}\n`);
prompt();
