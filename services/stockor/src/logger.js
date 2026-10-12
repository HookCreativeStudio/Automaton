import { decodePaymentResponseHeader } from "@x402/core/http";

let mongoose = null;
let Log = null;

async function ensureConnected() {
  if (Log || !process.env.MONGO_URI) return;
  const { default: mg } = await import("mongoose");
  mongoose = mg;
  const schema = new mongoose.Schema({
    ts:          { type: Date, default: Date.now, index: true },
    service:     String,
    route:       String,
    payer:       String,
    tx:          String,
    duration_ms: Number,
    status:      Number,
    params:      mongoose.Schema.Types.Mixed,
    error:       String,
  }, { collection: "service_logs" });
  Log = mongoose.model("ServiceLog", schema);
  await mongoose.connect(process.env.MONGO_URI, { dbName: "automaton" });
}

export function requestLogger(service) {
  return (req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      if (req.path === "/health" || req.path === "/" || req.path === "/llms.txt") return;
      let payer = null, tx = null;
      try {
        const header = res.getHeader("PAYMENT-RESPONSE");
        if (header) {
          const decoded = decodePaymentResponseHeader(header);
          payer = decoded?.payer ?? null;
          tx   = decoded?.transaction ?? null;
        }
      } catch {}
      ensureConnected()
        .then(() => Log?.create({
          service, route: req.path,
          payer, tx,
          duration_ms: Date.now() - start,
          status: res.statusCode,
          params: req.body || {},
          error: res.statusCode >= 400 ? res.locals.error ?? null : null,
        }))
        .catch(err => console.error("[logger]", err.message));
    });
    next();
  };
}
