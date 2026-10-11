import axios from "axios";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import * as cheerio from "cheerio";
import OpenAI from "openai";

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

async function fetchHtml(url) {
  const { data } = await axios.get(url, {
    timeout: 10000,
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Extractor/1.0)" },
    maxContentLength: 2 * 1024 * 1024,
  });
  return data;
}

function readabilityExtract(html, url) {
  const { document } = parseHTML(html);
  const base = document.querySelector("base") || document.createElement("base");
  base.setAttribute("href", url);
  document.head?.prepend(base);
  const reader = new Readability(document);
  return reader.parse();
}

export async function extract(url, format = "markdown") {
  const html = await fetchHtml(url);

  const article = readabilityExtract(html, url);

  let title, cleanText;
  if (article) {
    title = article.title || "";
    cleanText = article.textContent?.trim() || "";
  } else {
    const $ = cheerio.load(html);
    $("script, style, nav, footer, header").remove();
    title = $("title").text().trim();
    cleanText = $("body").text().replace(/\s+/g, " ").trim();
    if (!cleanText) throw new Error("Could not extract readable content from URL");
  }
  const wordCount = cleanText.split(/\s+/).filter(Boolean).length;

  if (format === "markdown") {
    const $ = cheerio.load(article?.content || html);
    const markdown = turndown.turndown($.html());
    return { content: markdown, title, source_url: url, word_count: wordCount };
  }

  if (format === "summary") {
    const truncated = cleanText.slice(0, 4000);
    const msg = await openai.chat.completions.create({
      model: "anthropic/claude-haiku-4-5",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: `Summarise this article in 2-3 sentences:\n\nTitle: ${title}\n\n${truncated}`,
        },
      ],
    });
    return { content: msg.choices[0].message.content, title, source_url: url, word_count: wordCount };
  }

  if (format === "json") {
    const truncated = cleanText.slice(0, 4000);
    const msg = await openai.chat.completions.create({
      model: "anthropic/claude-haiku-4-5",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `Extract key structured data from this article as JSON with keys: title, author, date, topics (array), key_points (array of strings), sentiment.\n\nTitle: ${title}\n\n${truncated}\n\nRespond with only valid JSON.`,
        },
      ],
    });
    let parsed;
    try {
      parsed = JSON.parse(msg.choices[0].message.content);
    } catch {
      parsed = { raw: msg.choices[0].message.content };
    }
    return { content: parsed, title, source_url: url, word_count: wordCount };
  }

  throw new Error(`Unknown format: ${format}. Use markdown, summary, or json.`);
}
