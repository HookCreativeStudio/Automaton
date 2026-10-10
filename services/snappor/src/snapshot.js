import puppeteer from "puppeteer-core";

const CHROME_PATH = process.env.CHROME_PATH || "/usr/bin/chromium";

export async function takeSnapshot(url, options = {}) {
  const { width = 1280, height = 800, fullPage = false } = options;
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    const image = await page.screenshot({ fullPage, encoding: "base64", type: "png" });
    const title = await page.title();
    return { image, title, url, width, height, full_page: fullPage };
  } finally {
    await browser.close();
  }
}
