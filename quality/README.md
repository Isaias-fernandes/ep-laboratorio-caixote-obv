# EP quality validation v1

The three BUY candidates run in SHADOW mode. Existing EP decision engines and alerts are preserved. No backtest percentage is hard-coded as a probability.

## Rule identity

- `TRV_CONFIRMED`: original Analítico pattern detector and policy, requiring breakout, three-bar volume / preceding twenty-bar volume >= 1.2, positive three- and ten-bar OBV deltas. The 35-bar pivot geometry and resistance-distance limits are unchanged.
- `BULL_FLAG_BREAKOUT`: the original Bull Flag candidate plus explicit breakout above the previous twenty-bar resistance by 0.15 ATR. **This is stricter than original Bull Flag confirmation**, which required volume/OBV; it must be validated separately.
- `MIN30_FLOW`: 720 contiguous closed Spot H1 candles; close within 0.5% of the rolling minimum arms a six-hour window, invalidated below the anchor minimum or above 3% from arm price. Confirmation needs rising OBV, volume >= 1.2, buyer quote-volume share >= 55%, and an up candle. This is a new candidate, not a claim to reproduce every score gate of `m6-entry-v2`.
- A 24-bar same-strategy cooldown limits repeated observations; episodes can still overlap. Reported rates are descriptive, not independent statistical trials.
- Bollinger is an experimental arm. The pre-leg exclusion arm only runs when an upstream provider explicitly certifies coverage and supplies the prior-24-hour observation. Missing context is UNKNOWN, never false. The current shared collector does not certify that context.

`provenance.json` pins the original GitHub source SHA-256 values. Tests compare the extracted pattern function to original JavaScript on 600 seeded paths. The PDF-reconstructed code is not used.

## Measurement

A signal is born at candle close; the first executable reference is next candle open. Birth snapshots are separate from mutable outcome tracking. The Worker refuses conflicting birth hashes. Open candles, gaps and duplicate bars cannot create complete observations.

All +3/+5/+10/+20/+50% targets are evaluated in three explicitly named settings: 96h/-3%, 30d/-3%, 30d/-10%. Opening gaps have known precedence. Same-bar target plus stop is AMBIGUOUS. Rates wait for the entire requested window to mature, including signals that hit early. Retroactively recovered births are excluded from prospective statistics.

Separate simulated exits: +10/-3 over 96h; +20/-5 over 30d; +20 with structural stop when initial distance is at most 10%; 3 ATR trailing stop with initial -3%; one-third at +5, one-third at +10, remainder trailing. ATR stops only ratchet after the candle closes. Ambiguous exits have no point return. Excursions continue after an exit and never replace simulated returns.

The baseline chooses one seeded UTC hour per symbol/day without future prices. Comparison matches symbol, UTC month and six-hour time bucket. Reused controls and overlapping signals are correlated; lift is not proof of statistical significance. No promotion to alerts is automatic. Missing brokerage costs remain unknown.

## Existing deployment

`automation/scan-live.mjs` shares the already scheduled Binance requests. It warms a local 720-bar H1 cache once and then reuses overlapping updates; it adds no Supabase reads/writes or cron frequency changes. Closing candles are captured even with the browser closed. GitHub scheduling is not a guaranteed real-time service.

`automation/send-quality-batch.mjs` uses the existing Actions secret `EP_SIGNAL_INGEST_TOKEN` to send paginated births and outcomes to the existing Worker/Postgres connection. An acknowledgement is persisted only after a successful response. No privileged key is included in the pages or data files.

The public panel reads the bounded summary once per hour, offers per-platform cost inputs and exports selected records. The full archive remains in `data/quality/births` and `outcomes`; pending state and candles are in `state.json`. The API `/analytics/quality` provides paginated database reads.

## Reproduction and optional continuous host

Run tests: `node --test tests/*.test.mjs` (Node 24).

Replay a supplied historical file: `node automation/backtest-quality.mjs candles.json result.json`. Input schema: `{ "symbols": { "BTCUSDT": [{"t":0,"o":100,"h":101,"l":99,"c":100,"v":100,"q":10000,"tq":5500}] } }`, with enough consecutive UTC H1 rows. Output includes input SHA-256, rule identity, complete records and a time split with 720h purge. Selecting parameters after viewing holdout invalidates that holdout.

`automation/quality-stream.mjs` and `deploy/ep-quality.service` are prepared for an existing Node 24 host with persistent disk. The optional runner uses Binance closed-kline WebSocket messages and REST recovery. **It is not provisioned or running on a VPS by this commit.** Do not run it concurrently with the scheduled collector against the same writable directory. Provisioning/migrating databases, WhatsApp/Telegram credentials and model training are separate deployment decisions; this release uses the existing database and on-screen display.
