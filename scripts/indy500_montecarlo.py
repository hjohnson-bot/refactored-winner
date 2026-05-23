"""2026 Indianapolis 500 Monte Carlo simulation — RACE-EVE UPDATE.

Snapshot: 2026-05-23 (race is 2026-05-24 12:45 PM ET).
Incorporates qualifying (May 17), post-qualifying Monday crash, Carb Day
(May 22), updated race-day odds, and weather risk vs. the May 13 baseline.

Plackett-Luce ordering model with a five-factor blended prior:
  - 30% updated race-day odds (vig-normalized)
  - 25% qualifying speed (4-lap average; estimated by row for non-Fast Six)
  - 15% starting position effect
  - 15% Carb Day race-trim speed
  - 10% Indy-specific historical (wins + log(starts))
  -  5% 2026 season form

Plus team/engine multipliers, rookie penalty, DNF rates, and:
  - Backup-car penalty (O'Ward, Rossi) -15%
  - 7% lap-1 multi-car incident draw
  - Optional weather-disruption draw (48% rain chance per NWS) that
    re-distributes some probability mass toward wet-weather specialists.
"""

import numpy as np
from collections import Counter

N_SIM = 1000
SEED = 42
# Race-day weather: 48% rain probability per NWS (May 23 outlook).
# A rain-disrupted race boosts veteran strategists (Dixon, Power, Sato,
# Castroneves) and modestly compresses the field by adding variance.
RAIN_PROB = 0.48

# ---------------------------------------------------------------------------
# Driver table — race-eve snapshot
# Fields: name, team, engine, decimal_odds, season_pts, indy_starts,
#         indy_wins, status, start_pos, qual_speed_mph, backup_car,
#         carb_day_top5, wet_weather_spec
# Notes:
#   - Speed values for rows 1-2 are confirmed (Fast Six + Fast 12 leaders).
#   - Speeds for positions 7-33 are estimated from row-average qualifying
#     speeds and Day-2 practice no-tow benchmarks; ranges 226-230 mph.
#   - Collet (qual P10) and Harvey (qual P29) DQ'd for ECU hardware
#     violations and demoted to back of grid (P32, P33).
# ---------------------------------------------------------------------------
DRIVERS = [
    # name        team       engine  odds  pts  starts wins status  pos  qual    backup carb wet
    ("Palou",     "Ganassi", "Honda", 3.5, 237,  6, 1, "vet",      1, 232.248, False, False, False),
    ("Rossi",     "ECR",     "Chevy", 10.0,100, 10, 1, "vet",      2, 231.990, True,  False, False),
    ("Malukas",   "Penske",  "Chevy", 8.5, 178,  3, 0, "vet",      3, 231.877, False, True,  False),
    ("Rosenqvist","MSR",     "Honda", 12.0, 90,  7, 0, "vet",      4, 231.375, False, False, False),
    ("Ferrucci",  "Foyt",    "Chevy", 14.0, 95,  6, 0, "vet",      5, 230.846, False, False, False),
    ("O'Ward",    "McLaren", "Chevy", 7.5, 143,  6, 0, "vet",      6, 230.442, True,  False, False),
    ("Simpson",   "Ganassi", "Honda", 35.0, 50,  2, 0, "vet",      7, 230.10,  False, False, False),
    ("Daly",      "DRR",     "Chevy", 18.0,  0, 12, 0, "indy",     8, 230.05,  False, True,  False),
    ("McLaughlin","Penske",  "Chevy", 14.0,141,  5, 0, "vet",      9, 229.95,  False, False, False),
    ("Dixon",     "Ganassi", "Honda", 15.0,148, 22, 1, "vet",     10, 229.85,  False, False, True),
    ("VeeKay",    "Juncos",  "Chevy", 35.0, 50,  5, 0, "vet",     11, 229.75,  False, False, False),
    ("Sato",      "RLL",     "Honda", 19.0,  0, 16, 2, "indy",    12, 229.65,  False, True,  True),
    ("Carpenter", "ECR",     "Chevy", 31.0,  0, 22, 0, "indy",    13, 229.50,  False, False, False),
    ("Castroneves","MSR",    "Honda", 26.0,  0, 25, 4, "indy",    14, 229.35,  False, False, True),
    ("Rasmussen", "ECR",     "Chevy", 13.0,100,  2, 0, "vet",     15, 229.20,  False, True,  False),
    ("Armstrong", "MSR",     "Honda", 51.0,100,  2, 0, "vet",     16, 229.05,  False, False, False),
    ("Ericsson",  "Andretti","Honda", 17.0,110,  7, 1, "vet",     17, 228.90,  False, False, False),
    ("Foster",    "RLL",     "Honda", 60.0, 70,  1, 0, "vet",     18, 228.75,  False, False, False),
    ("Power",     "Andretti","Honda", 18.0,110, 18, 1, "vet",     20, 228.40,  False, False, True),
    ("Lundgaard", "McLaren", "Chevy", 22.0,173,  4, 0, "vet",     19, 228.55,  False, False, False),
    ("Siegel",    "McLaren", "Chevy", 101.0,60,  1, 0, "vet",     21, 228.25,  False, False, False),
    ("Hunter-Reay","McLaren","Chevy", 26.0,  0, 15, 1, "indy",    22, 228.10,  False, False, False),
    ("Newgarden", "Penske",  "Chevy", 11.0,162, 14, 2, "vet",     23, 227.95,  False, True,  False),
    ("Grosjean",  "Coyne",   "Honda", 61.0, 50,  3, 0, "vet",     24, 227.80,  False, False, False),
    ("Kirkwood",  "Andretti","Honda", 14.0,210,  4, 0, "vet",     26, 227.50,  False, False, False),
    ("Rahal",     "RLL",     "Honda", 31.0,141, 17, 0, "vet",     25, 227.65,  False, False, False),
    ("Legge",     "Foyt/HMD","Chevy", 201.0, 0,  5, 0, "indy",    27, 227.35,  False, False, False),
    ("Schumacher","RLL",     "Honda", 26.0, 50,  0, 0, "rookie",  28, 227.20,  False, False, False),
    ("Robb",      "Juncos",  "Chevy", 201.0,30,  3, 0, "vet",     30, 226.90,  False, False, False),
    ("Hauger",    "Coyne",   "Honda", 41.0, 60,  0, 0, "rookie",  31, 226.75,  False, False, False),
    ("Abel",      "Abel",    "Chevy", 301.0, 0,  0, 0, "rookie",  29, 227.05,  False, False, False),
    ("Collet",    "Foyt",    "Chevy", 81.0, 40,  0, 0, "rookie",  32, 229.20,  False, False, False),  # DQ'd from P10
    ("Harvey",    "DRR",     "Chevy", 151.0, 0,  7, 0, "indy",    33, 226.60,  False, False, False),  # DQ'd from P29
]


def normalize(v):
    s = float(np.sum(v))
    return v / s if s > 0 else np.full_like(v, 1.0 / len(v), dtype=float)


def build_prior():
    n = len(DRIVERS)
    names    = [d[0] for d in DRIVERS]
    teams    = [d[1] for d in DRIVERS]
    engines  = [d[2] for d in DRIVERS]
    odds     = np.array([d[3] for d in DRIVERS], dtype=float)
    pts      = np.array([d[4] for d in DRIVERS], dtype=float)
    starts   = np.array([d[5] for d in DRIVERS], dtype=float)
    wins     = np.array([d[6] for d in DRIVERS], dtype=float)
    status   = [d[7] for d in DRIVERS]
    start_p  = np.array([d[8] for d in DRIVERS], dtype=float)
    qual     = np.array([d[9] for d in DRIVERS], dtype=float)
    backup   = np.array([d[10] for d in DRIVERS], dtype=bool)
    carb_top = np.array([d[11] for d in DRIVERS], dtype=bool)
    wet_spec = np.array([d[12] for d in DRIVERS], dtype=bool)

    # 1) Odds-implied (race-day prices)
    p_odds = normalize(1.0 / odds)
    # 2) Qualifying speed -- center at field mean, scale by stddev
    qz = (qual - qual.mean()) / qual.std()
    p_qual = normalize(np.exp(0.9 * qz))
    # 3) Starting position effect (modest)
    p_pos = normalize(np.exp(-0.05 * (start_p - 1)))
    # 4) Carb Day race-trim bonus
    p_carb = normalize(np.where(carb_top, 2.0, 1.0))
    # 5) Indy historical
    indy_raw = 3.0 * wins + 0.5 * np.log1p(starts) + 0.4
    p_indy = normalize(indy_raw)
    # 6) 2026 season form
    p_season = normalize(pts) if pts.sum() > 0 else np.full(n, 1.0 / n)

    prior = (0.30 * p_odds
             + 0.25 * p_qual
             + 0.15 * p_pos
             + 0.15 * p_carb
             + 0.10 * p_indy
             + 0.05 * p_season)

    # Team / engine / rookie multipliers
    mult = np.ones(n)
    for i in range(n):
        if engines[i] == "Honda":
            mult[i] *= 1.015
        if teams[i] == "Penske":
            mult[i] *= 1.025
        if teams[i] == "Ganassi" and names[i] in ("Palou", "Dixon"):
            mult[i] *= 1.030
        if teams[i] == "McLaren":
            mult[i] *= 0.99
        if status[i] == "rookie":
            mult[i] *= 0.94 if names[i] == "Abel" else 0.96
        if backup[i]:
            mult[i] *= 0.85   # backup-car penalty (Rossi, O'Ward)

    prior = normalize(prior * mult)

    dnf = np.array([
        0.18 if s in ("indy", "rookie") else 0.12
        for s in status
    ])
    # Backup cars carry +5% additional DNF risk
    dnf = np.where(backup, dnf + 0.05, dnf)

    return names, teams, engines, prior, dnf, wet_spec, start_p


def simulate(prior, dnf_rates, wet_spec, start_p, n_sim, rng):
    n = len(prior)
    log_strength = np.log(prior + 1e-12)
    log_pos_bias = -0.02 * (start_p - 1)  # small race-long bias from grid

    win = np.zeros(n)
    podium = np.zeros(n)
    top5 = np.zeros(n)
    top10 = np.zeros(n)
    dnf_total = np.zeros(n)
    lap1 = 0
    wet_races = 0

    for _ in range(n_sim):
        wet = rng.random() < RAIN_PROB
        if wet:
            wet_races += 1
            # Compress field + boost wet specialists
            strength_adj = log_strength.copy()
            strength_adj[wet_spec] += 0.30
            scale = 1.20  # more variance under wet/restart chaos
        else:
            strength_adj = log_strength
            scale = 1.0

        out = rng.random(n) < dnf_rates
        if rng.random() < 0.07:
            lap1 += 1
            k = int(rng.integers(2, 6))
            aff = rng.choice(n, size=k, replace=False)
            out[aff] = True

        u = rng.random(n)
        gumbel = -np.log(-np.log(np.clip(u, 1e-12, 1 - 1e-12)))
        score = strength_adj + log_pos_bias + scale * gumbel
        score[out] = -np.inf
        order = np.argsort(-score)

        if np.isfinite(score[order[0]]):
            win[order[0]] += 1
            for k in (3, 5, 10):
                arr = (podium, top5, top10)[(3, 5, 10).index(k)]
                idxs = order[:k]
                arr[idxs] += np.isfinite(score[idxs]).astype(float)

        dnf_total += out

    return {
        "win": win / n_sim,
        "podium": podium / n_sim,
        "top5": top5 / n_sim,
        "top10": top10 / n_sim,
        "dnf": dnf_total / n_sim,
        "lap1_rate": lap1 / n_sim,
        "wet_rate": wet_races / n_sim,
    }


def main():
    rng = np.random.default_rng(SEED)
    names, teams, engines, prior, dnf, wet_spec, start_p = build_prior()
    r = simulate(prior, dnf, wet_spec, start_p, N_SIM, rng)

    print(f"\n=== 2026 INDIANAPOLIS 500 — MONTE CARLO (race-eve update) ===")
    print(f"    Snapshot: 2026-05-23  ·  Race: 2026-05-24 12:45 PM ET")
    print(f"    Runs: {N_SIM:,}  ·  Lap-1 incident draw: {r['lap1_rate']*100:.1f}%"
          f"  ·  Wet-race share: {r['wet_rate']*100:.1f}%\n")

    rows = list(zip(names, range(len(names)), r["win"], r["podium"],
                    r["top5"], r["top10"], r["dnf"]))
    rows.sort(key=lambda x: -x[2])

    print(f"{'#':>3} {'Driver':<14} {'Grid':>4} {'Win%':>6} {'Pod%':>6} {'T5%':>6} {'T10%':>6} {'DNF%':>6}")
    print("-" * 64)
    for rank, (n, i, w, p, t5, t10, d) in enumerate(rows, 1):
        pos = int(start_p[i])
        flag = ""
        if DRIVERS[i][10]: flag = " ⚠backup"
        print(f"{rank:>3} {n:<14} {pos:>4} {w*100:>5.1f}% {p*100:>5.1f}% "
              f"{t5*100:>5.1f}% {t10*100:>5.1f}% {d*100:>5.1f}%{flag}")

    print("\n--- Manufacturer win share ---")
    mfg = {"Honda": 0.0, "Chevy": 0.0}
    for d, w in zip(DRIVERS, r["win"]):
        mfg[d[2]] += w
    for k, v in mfg.items():
        print(f"  {k:<6}: {v*100:.1f}%")

    print("\n--- Team win share ---")
    teamcnt = Counter()
    for d, w in zip(DRIVERS, r["win"]):
        teamcnt[d[1]] += w
    for t, v in sorted(teamcnt.items(), key=lambda kv: -kv[1]):
        if v > 0:
            print(f"  {t:<10}: {v*100:.1f}%")

    print("\n--- Movers since May 13 baseline ---")
    baseline = {  # win % from the original sim
        "Newgarden": 10.2, "Palou": 9.0, "Kirkwood": 7.8, "Malukas": 5.4,
        "Dixon": 5.0, "O'Ward": 4.8, "McLaughlin": 4.7, "Power": 4.6,
        "Castroneves": 4.5, "Lundgaard": 4.4, "Rossi": 2.5,
        "Rosenqvist": 2.6, "Ferrucci": 2.8, "Newgarden": 10.2,
    }
    movers = []
    for name, i, w, *_ in [(n,i,w,*rest) for n,i,w,*rest in rows]:
        if name in baseline:
            delta = w*100 - baseline[name]
            movers.append((name, baseline[name], w*100, delta))
    movers.sort(key=lambda m: -abs(m[3]))
    for name, old, new, delta in movers[:8]:
        arrow = "↑" if delta > 0 else "↓"
        print(f"  {name:<12} {old:>5.1f}%  →  {new:>5.1f}%   {arrow} {abs(delta):>4.1f} pts")

    print("\n--- Headline ---")
    top3 = rows[:3]
    print(f"  Modal winner   : {top3[0][0]} ({top3[0][2]*100:.1f}%)")
    print(f"  Co-favorites   : {top3[1][0]} ({top3[1][2]*100:.1f}%), "
          f"{top3[2][0]} ({top3[2][2]*100:.1f}%)")
    spec_names = ["Sato", "Castroneves", "Daly", "Rosenqvist", "Newgarden"]
    print("  Watch list (top-10 %):")
    for nm in spec_names:
        idx = names.index(nm)
        print(f"    {nm:<12}: top-10 {r['top10'][idx]*100:>4.1f}%, "
              f"win {r['win'][idx]*100:>4.1f}%, grid P{int(start_p[idx])}")
    print()


if __name__ == "__main__":
    main()
