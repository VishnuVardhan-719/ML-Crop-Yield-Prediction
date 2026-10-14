"""Fast checks for the separate, out-of-time real-data benchmark."""

import importlib
import importlib.util

import numpy as np
import pandas as pd
import pytest


def benchmark():
    name = "backend.scripts.benchmark_real_data"
    assert importlib.util.find_spec(name) is not None, "Real-data benchmark CLI is missing"
    return importlib.import_module(name)


def observations():
    return pd.DataFrame(
        [
            {"country": country, "year": year, "yield_t_ha": 1 + (year - 2000) * 0.1 + offset}
            for country, offset in [("India", 0), ("Nepal", 0.3)]
            for year in range(2000, 2012)
        ]
    )


def test_previous_season_feature_is_country_specific_and_strictly_earlier():
    module = benchmark()
    frame = module.prepare_dataset(observations().sample(frac=1, random_state=42))
    assert len(frame) == 22
    assert frame.year.min() == 2001
    india = frame[frame.country.eq("India")]
    np.testing.assert_allclose(india.previous_season_t_ha, observations().query("country == 'India'").yield_t_ha.iloc[:-1])
    changed = observations()
    changed.loc[(changed.country == "India") & (changed.year == 2011), "yield_t_ha"] = 100
    pd.testing.assert_series_equal(module.prepare_dataset(changed).previous_season_t_ha, frame.previous_season_t_ha)


@pytest.mark.parametrize("invalid", ["duplicate", "gap", "infinite", "fractional-year", "missing-country"])
def test_invalid_observations_fail_explicitly(invalid):
    module = benchmark()
    frame = observations()
    if invalid == "duplicate":
        frame = pd.concat([frame, frame.iloc[:1]])
    elif invalid == "gap":
        frame = frame.drop(2)
    elif invalid == "infinite":
        frame.loc[0, "yield_t_ha"] = np.inf
    elif invalid == "fractional-year":
        frame["year"] = frame.year.astype(float)
        frame.loc[0, "year"] = 2000.5
    else:
        frame.loc[0, "country"] = None
    with pytest.raises(ValueError):
        module.prepare_dataset(frame)


def test_holdout_is_whole_future_years_and_rejects_too_few_training_years():
    module = benchmark()
    frame = module.prepare_dataset(observations())
    train, test = module.split_years(frame, 3)
    assert train.year.max() < test.year.min()
    assert sorted(test.year.unique()) == [2009, 2010, 2011]
    assert len(test) == 6
    with pytest.raises(ValueError):
        module.split_years(frame, 10)
    with pytest.raises(ValueError):
        module.split_years(frame, 0)


def test_final_labels_never_change_cv_ranking_or_fitted_predictions(monkeypatch):
    module = benchmark()
    # Exercise real pipelines without repeatedly building forests in unit tests.
    monkeypatch.setattr(module, "MODEL_DEFINITIONS", module.MODEL_DEFINITIONS[:2])
    frame = module.prepare_dataset(observations())
    first = module.evaluate(frame, 3)
    changed = frame.copy()
    changed.loc[changed.year.ge(2009), "yield_t_ha"] += 100
    second = module.evaluate(changed, 3)
    assert first["selection"] == second["selection"]
    assert [row["predicted"] for row in first["predictions"]] == [row["predicted"] for row in second["predictions"]]
    assert first["metrics"] != second["metrics"]
    assert first["holdout"]["years"] == [2009, 2010, 2011]
    assert set(first["by_country"]) == {"India", "Nepal"}
    assert set(first["by_year"]) == {"2009", "2010", "2011"}
    for fold in first["selection"]["folds"]:
        assert max(fold["train_years"]) < min(fold["validation_years"])
        assert max(fold["validation_years"]) < 2009


def test_cli_rejects_a_modified_snapshot_before_model_fitting(tmp_path, monkeypatch, capsys):
    module = benchmark()
    data = tmp_path / "data.csv"
    metadata = tmp_path / "metadata.json"
    data.write_text("modified data")
    metadata.write_text('{"snapshot_sha256": "wrong"}')
    monkeypatch.setattr(module, "DATA", data)
    monkeypatch.setattr(module, "MANIFEST", metadata)
    monkeypatch.setattr("sys.argv", ["benchmark"])
    with pytest.raises(SystemExit) as error:
        module.main()
    assert error.value.code == 1
    assert "checksum mismatch" in capsys.readouterr().err


def test_download_never_overwrites_a_recorded_snapshot(tmp_path, monkeypatch):
    module = benchmark()
    data = tmp_path / "data.csv"
    data.write_text("keep this")
    monkeypatch.setattr(module, "DATA", data)
    with pytest.raises(ValueError, match="already exists"):
        module.download_snapshot()
    assert data.read_text() == "keep this"
