"""2026 Indianapolis 500 Monte Carlo simulation.

Plackett-Luce ordering model. Per-driver strength is a blended prior:
50% odds-implied (vig-normalized), 30% 2026 season form, 20% Indy-specific
historical (wins + log(starts)). Honda/Penske/Ganassi/McLaren/rookie
multipliers and per-driver DNF rates from the briefing pack are applied.
Lap-1 multi-car incident wipes 2-5 random cars with 7% probability.
"""

import numpy as np
from collections import Counter

N_SIM = 1000
SEED = 42

# name, team, engine, decimal_odds, season_pts, indy_starts, indy_wins, status
DRIVERS = [
    ("Palou",         "Ganassi",  "Honda", 5.50,  237, 6,  1, "veteran"),
    ("Newgarden",     "Penske",   "Chevy", 6.50,  162, 14, 2, "veteran"),
    ("O'Ward",        "McLaren",  "Chevy", 7.50,  143, 6,  0, "veteran"),
    ("Malukas",       "Penske",   "Chevy", 9.00,  178, 3,  0, "veteran"),
    ("Kirkwood",      "Andretti", "Honda", 11.0,  210, 4,  0, "veteran"),
    ("McLaughlin",    "Penske",   "Chevy", 11.0,  141, 5,  0, "veteran"),
    ("Rasmussen",     "ECR",      "Chevy", 13.0,  100, 2,  0, "veteran"),
    ("Ericsson",      "Andretti", "Honda", 15.0,  110, 7,  1, "veteran"),
    ("Dixon",         "Ganassi",  "Honda", 16.0,  148, 22, 1, "veteran"),
    ("Power",         "Andretti", "Honda", 17.0,  110, 18, 1, "veteran"),
    ("Sato",          "RLL",      "Honda", 19.0,    0, 16, 2, "indy_only"),
    ("Rossi",         "ECR",      "Chevy", 19.0,  100, 10, 1, "veteran"),
    ("Ferrucci",      "Foyt",     "Chevy", 21.0,   95,  6, 0, "veteran"),
    ("Daly",          "DRR",      "Chevy", 21.0,    0, 12, 0, "indy_only"),
    ("Hunter-Reay",   "McLaren",  "Chevy", 26.0,    0, 15, 1, "indy_only"),
    ("Schumacher",    "RLL",      "Honda", 26.0,   50,  0, 0, "rookie"),
    ("Castroneves",   "MSR",      "Honda", 26.0,    0, 25, 4, "indy_only"),
    ("Rosenqvist",    "MSR",      "Honda", 26.0,   90,  7, 0, "veteran"),
    ("Lundgaard",     "McLaren",  "Chevy", 26.0,  173,  4, 0, "veteran"),
    ("Carpenter",     "ECR",      "Chevy", 31.0,    0, 22, 0, "indy_only"),
    ("Rahal",         "RLL",      "Honda", 31.0,  141, 17, 0, "veteran"),
    ("Hauger",        "Coyne",    "Honda", 41.0,   60,  0, 0, "rookie"),
    ("VeeKay",        "Juncos",   "Chevy", 41.0,   50,  5, 0, "veteran"),
    ("Foster",        "RLL",      "Honda", 51.0,   70,  1, 0, "veteran"),
    ("Armstrong",     "MSR",      "Honda", 51.0,  100,  2, 0, "veteran"),
    ("Grosjean",      "Coyne",    "Honda", 61.0,   50,  3, 0, "veteran"),
    ("Collet",        "Foyt",     "Chevy", 81.0,   40,  0, 0, "rookie"),
    ("Siegel",        "McLaren",  "Chevy", 101.0,  60,  1, 0, "veteran"),
    ("Simpson",       "Ganassi",  "Honda", 101.0,  50,  2, 0, "veteran"),
    ("Harvey",        "DRR",      "Chevy", 151.0,   0,  7, 0, "indy_only"),
    ("Legge",         "Foyt/HMD", "Chevy", 201.0,   0,  5, 0, "indy_only"),
    ("Robb",          "Juncos",   "Chevy", 201.0,  30,  3, 0, "veteran"),
    ("Abel",          "Abel",     "Chevy", 301.0,   0,  0, 0, "rookie"),
]


def build_prior():
    names   = [d[0] for d in DRIVERS]
    teams   = [d[1] for d in DRIVERS]
    engines = [d[2] for d in DRIVERS]
    odds    = np.array([d[3] for d in DRIVERS])
    pts     = np.array([d[4] for d in DRIVERS], dtype=float)
    starts  = np.array([d[5] for d in DRIVERS], dtype=float)
    wins    = np.array([d[6] for d in DRIVERS], dtype=float)
    status  = [d[7] for d in DRIVERS]

    odds_implied = (1.0 / odds)
    odds_implied /= odds_implied.sum()

    if pts.sum() > 0:
        season = pts / pts.sum()
    else:
        season = np.full_like(pts, 1.0 / len(pts))

    indy = wins * 3.0 + np.log1p(starts) * 0.5 + 0.4
    indy /= indy.sum()

    prior = 0.50 * odds_implied + 0.30 * season + 0.20 * indy

    mult = np.ones(len(DRIVERS))
    for i, d in enumerate(DRIVERS):
        if engines[i] == "Honda":
            mult[i] *= 1.015
        if teams[i] == "Penske":
            mult[i] *= 1.025
        if teams[i] == "Ganassi" and names[i] in ("Palou", "Dixon"):
            mult[i] *= 1.030
        if teams[i] == "McLaren":
            mult[i] *= 0.990
        if status[i] == "rookie":
            mult[i] *= 0.94 if names[i] == "Abel" else 0.96

    prior = prior * mult
    prior /= prior.sum()

    dnf = np.array([
        0.18 if s in ("indy_only", "rookie") else 0.12
        for s in status
    ])
    return names, prior, dnf


def simulate(prior, dnf_rates, n_sim, rng):
    n = len(prior)
    log_strength = np.log(prior + 1e-12)

    win = np.zeros(n)
    top3 = np.zeros(n)
    top5 = np.zeros(n)
    top10 = np.zeros(n)
    podium = np.zeros(n)
    dnf_total = np.zeros(n)
    laps_led_share = np.zeros(n)
    lap1_incidents = 0

    for _ in range(n_sim):
        dnf = rng.random(n) < dnf_rates
        if rng.random() < 0.07:
            lap1_incidents += 1
            n_aff = rng.integers(2, 6)
            aff = rng.choice(n, size=n_aff, replace=False)
            dnf[aff] = True

        u = rng.random(n)
        gumbel = -np.log(-np.log(np.clip(u, 1e-12, 1 - 1e-12)))
        score = log_strength + gumbel
        score[dnf] = -np.inf
        order = np.argsort(-score)

        winner = order[0]
        if np.isfinite(score[winner]):
            win[winner] += 1
            podium[order[:3]] += np.isfinite(score[order[:3]]).astype(float)
            top3[order[:3]] += np.isfinite(score[order[:3]]).astype(float)
            top5[order[:5]] += np.isfinite(score[order[:5]]).astype(float)
            top10[order[:10]] += np.isfinite(score[order[:10]]).astype(float)
            # crude "laps led" proxy: top-3 cars split most laps, weighted
            lead_pool = np.array([0.55, 0.25, 0.10])
            laps_led_share[order[:3]] += lead_pool

        dnf_total += dnf

    return {
        "win": win / n_sim,
        "podium": podium / n_sim,
        "top5": top5 / n_sim,
        "top10": top10 / n_sim,
        "dnf": dnf_total / n_sim,
        "laps": laps_led_share / n_sim,
        "lap1_incident_rate": lap1_incidents / n_sim,
    }


def main():
    rng = np.random.default_rng(SEED)
    names, prior, dnf_rates = build_prior()
    res = simulate(prior, dnf_rates, N_SIM, rng)

    print(f"\n=== 2026 INDIANAPOLIS 500 — MONTE CARLO ({N_SIM:,} runs) ===")
    print(f"Lap-1 multi-car incident rate: {res['lap1_incident_rate']*100:.1f}%\n")

    rows = sorted(
        zip(names, res["win"], res["podium"], res["top5"], res["top10"],
            res["dnf"], res["laps"]),
        key=lambda r: -r[1],
    )

    print(f"{'#':>3} {'Driver':<14} {'Win%':>6} {'Pod%':>6} {'T5%':>6} {'T10%':>6} {'DNF%':>6} {'Lead%':>6}")
    print("-" * 64)
    for i, (n, w, p, t5, t10, d, ll) in enumerate(rows, 1):
        print(f"{i:>3} {n:<14} {w*100:>5.1f}% {p*100:>5.1f}% {t5*100:>5.1f}% {t10*100:>5.1f}% {d*100:>5.1f}% {ll*100:>5.1f}%")

    # Summaries
    print("\n--- Win share by manufacturer ---")
    eng_share = {"Honda": 0.0, "Chevy": 0.0}
    for d, w in zip(DRIVERS, res["win"]):
        eng_share[d[2]] += w
    for k, v in eng_share.items():
        print(f"  {k:<6}: {v*100:.1f}%")

    print("\n--- Win share by team ---")
    team_share = Counter()
    for d, w in zip(DRIVERS, res["win"]):
        team_share[d[1]] += w
    for team, share in sorted(team_share.items(), key=lambda kv: -kv[1]):
        if share > 0:
            print(f"  {team:<10}: {share*100:.1f}%")

    # Headline summary
    top3 = rows[:3]
    print("\n--- Headline ---")
    print(f"  Modal winner : {top3[0][0]} ({top3[0][1]*100:.1f}%)")
    print(f"  Co-favorites : {top3[1][0]} ({top3[1][1]*100:.1f}%), "
          f"{top3[2][0]} ({top3[2][1]*100:.1f}%)")
    # Specialist watch
    specialists = ["Sato", "Castroneves", "Daly", "Rosenqvist"]
    print("  Specialist watch (top-10 %):")
    for name in specialists:
        idx = names.index(name)
        print(f"    {name:<12}: top-10 {res['top10'][idx]*100:.1f}%, "
              f"win {res['win'][idx]*100:.1f}%")
    print()


if __name__ == "__main__":
    main()
