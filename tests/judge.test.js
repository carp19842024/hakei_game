// Checks the delivery verdict in index.html: ranks, headings and advice must agree with the numbers.
// Run: node tests/judge.test.js
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const grab = (re) => { const m = html.match(re); if (!m) throw new Error("not found: " + re); return m[0]; };
const src = [
  grab(/var MOOD = \{[^}]*\};/), grab(/var RANK = \{[^}]*\};/), grab(/var RANKS = \[[^\]]*\];/),
  grab(/function judgeDelivery\(r\)\{[\s\S]*?\n  \}/)
].join("\n");
const { judgeDelivery, MOOD, RANK } = new Function(src + "; return { judgeDelivery, MOOD, RANK };")();

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; if (fails <= 20) console.log("FAIL:", msg); } };
const base = { pct: 0.8, mood: 80, successes: 6, missions: 6, span: 150, under: 0, over: 0, short: 0, noriHigh: 0 };
const J = (o) => judgeDelivery(Object.assign({}, base, o));

// 1. Boundary table
const table = [
  [{ pct: 0.75 }, "マスタリング職人", "ok"],
  [{ pct: 0.7499 }, "マスタリングエンジニア", "ok"],
  [{ pct: 0.55 }, "マスタリングエンジニア", "ok"],
  [{ pct: 0.5499 }, "アシスタント", "minor"],          // mood 80 but rank < engineer → no "一発OK"
  [{ pct: 0.30 }, "アシスタント", "minor"],
  [{ pct: 0.2999 }, "見習い", "minor"],
  [{ mood: 70 }, "マスタリング職人", "ok"],
  [{ mood: 69 }, "マスタリングエンジニア", "minor"],
  [{ mood: 40 }, "マスタリングエンジニア", "minor"],
  [{ mood: 39 }, "アシスタント", "retake"],             // retake caps the rank
  [{ mood: 39, pct: 0.2 }, "見習い", "retake"],
  [{ successes: 5 }, "マスタリング職人", "ok"],          // ceil(6*0.7)=5
  [{ successes: 4 }, "マスタリングエンジニア", "ok"],
  [{ missions: 0, successes: 0 }, "マスタリング職人", "ok"],
];
for (const [o, rank, verdict] of table) {
  const j = J(o);
  ok(j.rank === rank && j.verdict === verdict, `${JSON.stringify(o)} → ${j.rank}/${j.verdict}, expected ${rank}/${verdict}`);
}

// 2. Invariants over a grid
for (let p = 0; p <= 1.001; p += 0.01) for (let mood = 0; mood <= 100; mood += 1)
  for (let missions = 0; missions <= 6; missions++) for (let s = 0; s <= missions; s++) {
    const r = { pct: p, mood, successes: s, missions };
    const j = J(r);
    if (j.level === 3) ok(j.verdict === "ok", `職人 must be 一発OK ${JSON.stringify(r)}`);
    if (j.verdict === "retake") ok(j.level <= 1, `retake must be ≤ assistant ${JSON.stringify(r)}`);
    if (j.verdict === "ok") ok(j.level >= 2, `一発OK must be ≥ engineer ${JSON.stringify(r)}`);
    ok((j.verdict === "retake") === (mood < MOOD.retake), `retake iff mood < ${MOOD.retake} ${JSON.stringify(r)}`);
    const up = J(Object.assign({}, r, { pct: p + 0.01 }));
    ok(up.level >= j.level, `rank must not drop when pct rises ${JSON.stringify(r)}`);
    const happier = J(Object.assign({}, r, { mood: Math.min(100, mood + 1) }));
    ok(happier.level >= j.level, `rank must not drop when mood rises ${JSON.stringify(r)}`);
    if (j.level === 3) ok(/文句なし/.test(j.advice), "職人 gets the praise line");
    else ok(!/文句なし/.test(j.advice), `non-職人 must not get the praise line ${JSON.stringify(r)}`);
  }

// 3. Advice names the biggest loss
ok(/海苔が65以上/.test(J({ pct: 0.6, noriHigh: 40, over: 10 }).advice), "nori-high dominates → nori advice");
ok(/左（音圧不足）/.test(J({ pct: 0.4, under: 60 }).advice), "under dominates → under advice");
ok(/右（音圧過多）/.test(J({ pct: 0.4, over: 60, under: 20 }).advice), "over dominates → over advice");
ok(/山が枠の下限より低い/.test(J({ pct: 0.5, short: 40 }).advice), "short dominates → short advice");
ok(/次は課題/.test(J({ pct: 0.7, successes: 2 }).advice), "missions missed → mission advice");
ok(/機嫌/.test(J({ pct: 0.7, mood: 60 }).advice), "low mood → mood advice");
ok(/職人に届きます/.test(J({ pct: 0.7 }).advice), "close to master → centre advice");
ok(!/職人に届きます/.test(J({ pct: 0.8 }).advice), "never tell a master-level score to reach master");

// 4. The completion rate shown on screen must agree with the rank thresholds
const shownExpr = grab(/statCell\("攻略率", .+? \+ " %"/).match(/statCell\("攻略率", (.+?) \+ " %"/)[1];
const shown = new Function("pct", "return " + shownExpr + ";");
for (const t of [RANK.master, RANK.engineer, RANK.assistant])
  for (let d = -0.002; d <= 0.002; d += 0.0001) {
    const pct = t + d;
    ok((shown(pct) >= Math.round(t * 100)) === (pct >= t - 1e-12), `shown ${shown(pct)}% vs threshold ${t} at pct=${pct}`);
  }

console.log(`${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
