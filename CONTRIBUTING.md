# Contributing to JP GOD EYE

Two applications, one origin: the Cesium globe (`src/`, Vite) and OSIRIS (`osiris/`, Next.js).

1. **Real data only.** Never `Math.random()` in place of a live feed.
2. **€0 running cost.** New sources need a genuinely free tier with no required payment method.
3. **Respect rate limits.** Cache, coalesce, back off.
4. **Attribution.** Every source goes in `DATA_SOURCES.md` and `src/data/dataCredits.js`.
5. **OSIRIS runs under `basePath: /osiris`** — client fetches must carry that prefix.
6. **The setup wizard is loopback-only** and writes an allowlist. Never widen either without a test.

```bash
npm test                      # 2,608 globe tests
npm --prefix osiris run test  # 365 OSIRIS tests
npm run build
```

## Known issue
The `long Enter hold` check in `npm run qa:map-source-tray` fails in roughly 1 run in 3 on a loaded machine.
Holding Enter on the Map Source disclosure long enough to trigger auto-repeat races the 240 ms focus handover,
the pointer-away auto-dismiss and chip re-rendering. Two real defects behind it were fixed (focus restored before
an auto-collapse; focus preserved across a chip re-render); the residual race is not yet eliminated.
Normal clicks and short key presses are unaffected.
