import axios from "axios";

export async function getRate(from, to, amount = 1) {
  const { data } = await axios.get("https://api.frankfurter.app/latest", {
    params: { from: from.toUpperCase(), to: to.toUpperCase() },
    timeout: 8000,
  });
  const rate = data.rates[to.toUpperCase()];
  if (!rate) throw new Error(`Currency not found: ${to}`);
  return {
    from: from.toUpperCase(),
    to: to.toUpperCase(),
    rate,
    amount,
    converted: parseFloat((amount * rate).toFixed(6)),
    date: data.date,
  };
}
