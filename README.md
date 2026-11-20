# Token Radar — radar-2

A token launch radar: it reads a sealed DefiLlama snapshot of 758 protocols and ranks the ones
that could plausibly launch a token of their own by what a launch would be worth, each with a
seven-step farm plan. An AI judge compares the dashboards two at a time; the 10 best share
$1,325.

## The model (radar-2)

The board ranks 178 protocols: the snapshot's 40-protocol watchlist plus every other pre-token
protocol that passes the watchlist's own rule — no wrapped, staked or bridged product of a token
that already trades, no exchange product, no versioned pool. WBTC is Bitcoin on another chain,
not a protocol waiting on a launch of its own.

Implied value is derived only from the snapshot's figures, and its base multiple comes from the
market itself: for each category, the median market-cap-to-TVL ratio of the live-token protocols
in that same category (the overall median where a category has fewer than three live
comparables), clamped to [0.05, 1.50]. A recorded market cap of $0 is not a live comparable: 15
protocols in the snapshot record a token with no value left, and their zero ratios would drag the
overall median from 0.214 down to 0.169. Then:

```
implied = round( tvl_usd x category multiple
  x (1 + clamp(change_7d, -50, 150) / 100 x 0.6)
  x (0.5 + min(age_days, 1460) / 1460 x 0.5)
  x (1 + 0.03 x min(chains - 1, 4)) )
```

Age is the time since the protocol was first listed; an unlisted age uses the median age of the
ranked set. No protocol name is ever special-cased.

## The dashboard

`dashboard/` is a static, offline page: a sortable, filterable board, a detail view for every
protocol (model breakdown plus farm plan), a live-token view showing where the comparables come
from, and a model sandbox that re-ranks the top ten under different weights. The page recomputes
every row from the same arithmetic, so the board and the code agree.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

`main.ts` (Node 22, standard library only) writes `board.json`, `data.js`, `dashboard/`,
`screenshots/` and `dossier.json` into the output directory. It is deterministic: the same
snapshot always writes the same bytes.

## Files

- `main.ts` — the runner
- `lib/model.ts` — the radar-2 model, the board and the farm plans
- `vendor/makefun-board.ts` — make.fun's dossier library, byte for byte from the kit
- `dashboard/` — the static page (index.html, app.css, app.js)
- `screenshots/` — the board, a detail view and a filtered view
