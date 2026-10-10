import googleTrends from "google-trends-api";

const TIMEFRAME_MAP = {
  "1m": new Date(Date.now() - 30 * 864e5),
  "3m": new Date(Date.now() - 90 * 864e5),
  "12m": new Date(Date.now() - 365 * 864e5),
  "5y": new Date(Date.now() - 5 * 365 * 864e5),
};

export async function getTrends(keyword, timeframe = "12m", geo = "") {
  const startTime = TIMEFRAME_MAP[timeframe] || TIMEFRAME_MAP["12m"];
  const raw = await googleTrends.interestOverTime({ keyword, startTime, geo });
  const parsed = JSON.parse(raw);
  const timeline = parsed.default.timelineData.map(point => ({
    date: point.formattedTime,
    value: point.value[0],
  }));
  return {
    keyword,
    geo: geo || "worldwide",
    timeframe,
    peak: Math.max(...timeline.map(p => p.value)),
    current: timeline[timeline.length - 1]?.value ?? 0,
    trend: timeline,
  };
}
