"""Generate the bundled sample dataset.

The earlier sample was effectively noise-free: a plain linear regression scored 5-fold CV
R^2 = 0.987 on it, so every model "won" and the comparison demonstrated nothing. This
generator builds data with the properties the app is supposed to handle:

* a saturating fertiliser response and a pest threshold, so linear models genuinely underfit
  and a tree ensemble can win on merit
* irreducible noise around 12% of the target's spread, so R^2 lands in a realistic band
* the same physical field recorded across several seasons, so a shuffled split contains
  entity overlap and the app's warning about it is earned rather than theoretical
* scattered missing values, a handful of outliers, and one near-useless feature

Run from the repository root:

    .venv/Scripts/python.exe backend/scripts/generate_sample_dataset.py
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

SEED = 20260925
FIELDS = 96
SEASONS = ("kharif", "rabi", "zaid")
OUTPUT = Path("public/sample-datasets/sample-field-trials.csv")

REGION_EFFECT = {
    "North": 0.18,
    "Central": -0.05,
    "South": 0.12,
    "Coastal": -0.30,
    "Hills": -0.22,
    "Delta": 0.26,
    "Plateau": -0.08,
}
SOIL_EFFECT = {"Loam": 0.16, "Clay": 0.0, "Sandy": -0.52, "Silt": 0.11, "Black": 0.06}
NOISE_STD = 0.26


def fertiliser_response(rate: float) -> float:
    """Diminishing returns: the first 40 kg/ha matter far more than the last 100."""
    return 0.62 * float(np.log1p(rate / 45.0))


def rainfall_response(rain: float, irrigated: str) -> float:
    """Rain matters hugely on rainfed fields and barely at all where irrigation already supplies water.

    This is an interaction, not a main effect: no single rain coefficient fits both groups, which is
    precisely the structure a linear model cannot represent and an ensemble can.
    """
    if irrigated == "yes":
        return 0.00035 * min(rain, 950.0)
    return 0.0021 * min(rain, 950.0) - 0.0016 * max(rain - 950.0, 0.0)


def temperature_response(temp: float) -> float:
    """Weak, peaked near 27 C."""
    return -0.0022 * (temp - 27.0) ** 2


def pest_response(pressure: float) -> float:
    """A threshold effect: low pressure is harmless, high pressure bites hard."""
    return -1.45 * max(pressure - 0.45, 0.0) / 0.55


def build() -> pd.DataFrame:
    rng = np.random.default_rng(SEED)

    rows = []
    for field_number in range(1, FIELDS + 1):
        # Field-level properties stay fixed across the seasons that field is observed.
        region = str(rng.choice(list(REGION_EFFECT)))
        soil_type = str(rng.choice(list(SOIL_EFFECT)))
        irrigated = str(rng.choice(["yes", "no"], p=[0.55, 0.45]))
        for season in SEASONS:
            rainfall = float(np.clip(rng.normal(690, 175), 180, 1450))
            temperature = float(np.clip(rng.normal(26.5, 4.0), 14, 38))
            fertiliser = float(rng.uniform(30, 260))
            pest = float(rng.uniform(0, 1))
            density = float(rng.uniform(180, 320))

            y = (
                2.30
                + REGION_EFFECT[region]
                + SOIL_EFFECT[soil_type]
                + (0.55 if irrigated == "yes" else 0.0)
                + rainfall_response(rainfall, irrigated)
                + temperature_response(temperature)
                + fertiliser_response(fertiliser)
                + pest_response(pest)
                + rng.normal(0, NOISE_STD)
                + 0.0004 * (density - 250)  # a genuinely near-useless feature
            )

            rows.append(
                {
                    "field_id": f"F{field_number:03d}",
                    "region": region,
                    "season": season,
                    "soil_type": soil_type,
                    "irrigated": irrigated,
                    "sowing_date": f"2025-{rng.integers(5, 8):02d}-{rng.integers(1, 28):02d}",
                    "rainfall_mm": round(rainfall, 1),
                    "avg_temp_c": round(temperature, 1),
                    "fertilizer_kg_ha": round(fertiliser, 1),
                    "pest_pressure": round(pest, 3),
                    "sowing_density_k_per_ha": round(density, 1),
                    "yield_t_ha": round(float(y), 3),
                }
            )

    frame = pd.DataFrame(rows)

    # Scattered missing values: the pipeline imputes these, the report should count them.
    for column in ("rainfall_mm", "fertilizer_kg_ha", "pest_pressure"):
        missing = rng.choice(frame.index.to_numpy(), size=int(len(frame) * 0.015), replace=False)
        frame.loc[missing, column] = np.nan

    # A few impossible readings and a couple of failed plots, for the outlier check to find.
    frame.loc[frame.index[:2], "rainfall_mm"] = [1890.0, 1735.0]
    frame.loc[frame.index[2:4], "yield_t_ha"] = [1.75, 1.92]

    order = [
        "field_id",
        "region",
        "season",
        "soil_type",
        "irrigated",
        "sowing_date",
        "rainfall_mm",
        "avg_temp_c",
        "fertilizer_kg_ha",
        "pest_pressure",
        "sowing_density_k_per_ha",
        "yield_t_ha",
    ]
    return frame[order]


def main() -> None:
    frame = build()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(OUTPUT, index=False)
    target = frame["yield_t_ha"]
    print(f"wrote {OUTPUT} — {len(frame)} rows, {len(frame.columns)} columns")
    print(f"target mean {target.mean():.3f}  std {target.std():.3f}  min {target.min():.3f}  max {target.max():.3f}")
    print(f"fields {frame['field_id'].nunique()} across {len(SEASONS)} seasons -> {len(frame) / frame['field_id'].nunique():.1f} rows per field")


if __name__ == "__main__":
    main()
