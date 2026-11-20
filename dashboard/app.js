// Token Radar's dashboard (radar-2). It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a filterable table, a per-protocol detail dialog with
// the model's own inputs and the protocol's farm plan, and a model sandbox. No network: every
// byte it shows is in data.js.
//
// The model in one function, the same arithmetic lib/model.ts runs: the page recomputes a row
// from the snapshot figures and checks the number board.json carries, so the page's code and the
// board's data are visibly the same. The farm plan is the same derivation main.ts writes to
// board.json: category, chains, TVL and age decide the action, the capital, the hold and every
// cost and time. No name is special-cased.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var state = { q: '', category: 'all', chain: 'all', watchlistOnly: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  var WATCH = {};
  DATA.watchlist.forEach(function (s) { WATCH[s] = true; });

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return (Math.round(n * 10000) / 10000).toFixed(4).replace(/0+$/, '').replace(/\.$/, '.0'); }

  // The model, as lib/model.ts computes it. `w` overrides the weights for the sandbox preview.
  function impliedOf(row, w) {
    var m = DATA.model;
    var gw = w ? w.growth : m.growth_weight;
    var mf = w ? w.maturity : m.maturity_floor;
    var bp = w ? w.breadth : m.breadth_per_chain;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * gw;
    var age = row.age_days === null || row.age_days === undefined ? DATA.median_age_days : row.age_days;
    var maturity = mf + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * (1 - mf);
    var extra = Math.max(0, Math.min((row.chains || []).length - 1, m.breadth_max_chains));
    var breadth = 1 + extra * bp;
    return Math.max(1, Math.round(row.tvl_usd * row.comparable_multiple * growthMult * maturity * breadth));
  }

  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 1e9) return 200;
    if (p.tvl_usd >= 1e8) return 120;
    return 60;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 45;
    if (age < 180) return 90;
    if (age < 365) return 60;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0) return 'Lend $' + capital + ' of USDC on ' + name + ' (' + chain + ') and leave the loan open so the position ages.';
    if (c.indexOf('dex') >= 0 || c.indexOf('amm') >= 0) return 'Swap $' + capital + ' through ' + name + "'s pools on " + chain + ', then add $' + capital + ' of liquidity to its deepest pair.';
    if (c.indexOf('yield') >= 0 || c.indexOf('vault') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and hold the vault shares.';
    if (c.indexOf('bridge') >= 0) return 'Move $' + capital + ' of USDC across ' + name + ' to ' + chain + ', then put the bridged funds to work in its app.';
    if (c.indexOf('stak') >= 0) return "Stake $" + capital + " of the chain asset via " + name + ' and keep the staking receipt in the same wallet.';
    if (c.indexOf('perp') >= 0 || c.indexOf('deriv') >= 0) return 'Post $' + capital + ' of USDC as margin on ' + name + ' and hold one small hedged position.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of " + name + "'s tokenised asset on " + chain + ' and hold it through one yield cycle.';
    if (c.indexOf('stable') >= 0) return 'Mint $' + capital + ' of the stable asset on ' + name + ' (' + chain + ') and keep it supplied.';
    if (c.indexOf('predict') >= 0) return 'Back one outcome with $' + capital + ' on ' + name + ' and leave the position to settle.';
    if (c.indexOf('leverag') >= 0) return 'Open a $' + capital + ' leveraged position on ' + name + ' and keep collateral above the liquidation line.';
    if (c.indexOf('insur') >= 0) return 'Buy $' + capital + ' of cover on ' + name + ' (' + chain + ') and keep the policy live.';
    if (c.indexOf('basis') >= 0 || c.indexOf('option') >= 0) return 'Place $' + capital + " into " + name + "'s basis trade on " + chain + ' and hold it for one funding cycle.';
    return 'Use ' + name + ' on ' + chain + ' with $' + capital + ': deposit, swap or vote, and keep the position open.';
  }
  function secondActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    var secondChain = p.chains.length > 1 ? p.chains[1] : chain;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0) return 'Borrow a small amount against the deposit on ' + name + ' and repay it in the same week, so the wallet shows both sides.';
    if (c.indexOf('dex') >= 0 || c.indexOf('amm') >= 0) return 'Run a second swap on ' + name + ' on ' + secondChain + ' if it is live there, so the activity spans two chains.';
    if (c.indexOf('yield') >= 0 || c.indexOf('vault') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Top the vault up once with another $' + Math.round(capital / 2) + ' after two weeks, so the deposit is not a single event.';
    if (c.indexOf('bridge') >= 0) return 'Bridge a second, smaller amount back the other way through ' + name + ' to show round-trip use.';
    if (c.indexOf('stak') >= 0) return 'Claim or restake the staking rewards once, keeping the receipt in the same wallet.';
    if (c.indexOf('perp') >= 0 || c.indexOf('deriv') >= 0) return 'Close and reopen the hedge once a month, keeping the margin posted throughout.';
    if (c.indexOf('rwa') >= 0) return "Check the asset's backing report once and keep the holding through the next distribution.";
    if (c.indexOf('stable') >= 0) return "Swap half the stable position into the protocol's other pool once, then restore it.";
    if (c.indexOf('predict') >= 0) return 'Settle one market and open a second, smaller one, so the wallet has more than one outcome.';
    return 'Do a second, different action on ' + name + ' — a swap, a vote or a deposit — so the wallet is not a one-trick account.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Open a fresh wallet that holds only the funds you plan to farm, and store its seed phrase offline on paper.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 200 ? 10 : 5) + ' of gas', time: '20 minutes to set up' },
      { text: secondActionFor(p, capital, chain), cost: 'about $' + Math.round(capital / 2) + ' of capital and $3 of gas', time: '15 minutes' },
      { text: 'Do one qualifying action each week — a deposit, a borrow, a swap or a vote — and vary the action.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Watch the protocol's own points or rewards page weekly, and claim only from the link it publishes — never from a link in a message.", cost: 'no fee to check, and never pay to claim', time: '5 minutes a week' },
      { text: 'Log the wallet, the dates and every transaction hash, so you can repeat the position or unwind it cleanly.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('watchlist')) state.watchlistOnly = params.get('watchlist') === '1';
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchlistOnly) params.set('watchlist', '1');
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watchlistOnly && !WATCH[r.slug]) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function renderMeta() {
    var meta = document.getElementById('top-meta');
    meta.textContent = '';
    [['Snapshot ' + DATA.as_of, null], ['DefiLlama protocol index', null], [DATA.model_version + ' model', null]].forEach(function (pair) {
      meta.appendChild(el('span', { text: pair[0] }));
    });
    document.getElementById('foot-asof').textContent = DATA.as_of;
    var facts = document.getElementById('facts');
    facts.textContent = '';
    [
      ['Watchlist covered', DATA.watchlist_size + ' / ' + DATA.watchlist_size],
      ['Pre-token rows scored', String(DATA.board_size)],
      ['Early rows below the floor', String(DATA.early_size)],
      ['Live-token protocols set aside', String(DATA.live_size)]
    ].forEach(function (f) {
      facts.appendChild(el('div', { class: 'fact' }, el('span', { text: f[0] }), el('b', { text: f[1] })));
    });
    var m = DATA.model;
    document.getElementById('formula').textContent =
      'implied = round( tvl_usd x category multiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ')' +
      ' x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + (1 - m.maturity_floor).toFixed(2) + ')' +
      ' x (1 + 0.03 x min(chains - 1, 4)) )';
    var comps = document.getElementById('comps');
    comps.textContent = '';
    DATA.comparables.forEach(function (c) {
      comps.appendChild(el('span', null, c.category + ' ', el('b', { text: 'x' + fmtMult(c.multiple) }), ' (' + c.count + ' live)'));
    });
    comps.appendChild(el('span', null, 'other categories ', el('b', { text: 'overall median' })));
  }

  function fillControls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var catSel = document.getElementById('category');
    catSel.textContent = '';
    catSel.appendChild(el('option', { value: 'all', text: 'All categories' }));
    categories.forEach(function (c) {
      catSel.appendChild(el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }));
    });
    var chainCounts = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (ch) { chainCounts[ch] = (chainCounts[ch] || 0) + 1; }); });
    var chains = Object.keys(chainCounts).sort(function (a, b) { return chainCounts[b] - chainCounts[a]; }).slice(0, 14);
    var chainSel = document.getElementById('chain');
    chainSel.textContent = '';
    chainSel.appendChild(el('option', { value: 'all', text: 'All chains' }));
    chains.forEach(function (ch) {
      chainSel.appendChild(el('option', { value: ch, text: ch + ' (' + chainCounts[ch] + ')', selected: ch === state.chain ? 'selected' : null }));
    });
    var q = document.getElementById('q');
    q.value = state.q;
    document.getElementById('watchlist-only').checked = state.watchlistOnly;
    document.getElementById('tab-pre').setAttribute('aria-selected', state.tab === 'pre-token' ? 'true' : 'false');
    document.getElementById('tab-live').setAttribute('aria-selected', state.tab === 'live' ? 'true' : 'false');
    document.getElementById('board-panel').hidden = state.tab !== 'pre-token';
    document.getElementById('live-panel').hidden = state.tab !== 'live';
    document.getElementById('sandbox').hidden = state.tab !== 'pre-token';
  }

  function renderBoard() {
    var list = sortedRows(filteredRows());
    var tbody = document.getElementById('board-body');
    tbody.textContent = '';
    document.getElementById('board-empty').hidden = list.length !== 0;
    document.getElementById('count').textContent = state.tab === 'pre-token' ? list.length + ' rows shown' : DATA.live.length + ' live-token protocols';
    if (list.length === 0) return;
    var max = list[0].implied_value_usd || 1;
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
  }

  function renderLive() {
    var tbody = document.getElementById('live-body');
    tbody.textContent = '';
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'status live', text: 'live' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.multiple === null ? 'n/a' : 'x' + fmtMult(r.multiple) })
      ));
    });
  }

  function renderSandbox() {
    var gw = parseFloat(document.getElementById('w-growth').value);
    var mf = parseFloat(document.getElementById('w-maturity').value);
    var bp = parseFloat(document.getElementById('w-breadth').value);
    document.getElementById('w-growth-out').textContent = gw.toFixed(2);
    document.getElementById('w-maturity-out').textContent = mf.toFixed(2);
    document.getElementById('w-breadth-out').textContent = bp.toFixed(2);
    var rescored = DATA.rows.map(function (r) { return { row: r, value: impliedOf(r, { growth: gw, maturity: mf, breadth: bp }) }; });
    rescored.sort(function (a, b) { return b.value - a.value || (a.row.slug < b.row.slug ? -1 : 1); });
    var preview = document.getElementById('preview');
    preview.textContent = '';
    rescored.slice(0, 10).forEach(function (item, i) {
      var move = item.row.rank - (i + 1);
      var arrow = move > 0 ? '▲' + move : move < 0 ? '▼' + (-move) : '–';
      preview.appendChild(el('li', null,
        el('span', null, el('b', { text: (i + 1) + '. ' + item.row.name }), ' ' + arrow),
        el('span', { class: 'num', text: fmtUsd(item.value) })
      ));
    });
  }

  var dialog = document.getElementById('detail');
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row);
    var compLabel = row.comparable_count > 0
      ? (row.category || 'Other') + ' median, ' + row.comparable_count + ' live protocols'
      : 'overall median (too few live in this category)';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' — records no token' })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Comparable multiple' }), el('b', { class: 'num', text: 'x' + fmtMult(row.comparable_multiple) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity x breadth' }), el('b', { class: 'num', text: String(row.maturity_multiplier) + ' x ' + String(row.breadth_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: 'Chains' }), el('b', { class: 'num', text: String((row.chains || []).length) })),
        el('div', null, el('span', { text: 'Watchlist' }), el('b', { class: 'num', text: WATCH[row.slug] ? 'yes' : 'no' }))
      ),
      el('p', { class: 'sub', text: 'Comparable multiple: ' + compLabel + '. Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    fillControls();
    renderBoard();
    renderLive();
    renderSandbox();
    if (state.selected) openDetail(state.selected);
  }

  document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; writeHash(); renderBoard(); });
  document.getElementById('category').addEventListener('change', function (e) { state.category = e.target.value; writeHash(); renderBoard(); });
  document.getElementById('chain').addEventListener('change', function (e) { state.chain = e.target.value; writeHash(); renderBoard(); });
  document.getElementById('watchlist-only').addEventListener('change', function (e) { state.watchlistOnly = e.target.checked; writeHash(); renderBoard(); });
  document.getElementById('tab-pre').addEventListener('click', function () { state.tab = 'pre-token'; writeHash(); render(); });
  document.getElementById('tab-live').addEventListener('click', function () { state.tab = 'live'; writeHash(); render(); });
  document.getElementById('clear-filters').addEventListener('click', function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlistOnly = false; writeHash(); render(); });
  Array.prototype.forEach.call(document.querySelectorAll('#board-table th button'), function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.getAttribute('data-sort');
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = -1; }
      renderBoard();
    });
  });
  ['w-growth', 'w-maturity', 'w-breadth'].forEach(function (id) {
    document.getElementById(id).addEventListener('input', renderSandbox);
  });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });

  readHash();
  renderMeta();
  render();
})();
