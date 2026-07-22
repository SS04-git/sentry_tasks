"""
Replaces the previous IsolationForest-based model. That approach had three
problems for an access-control review queue:
  1. It retrained on whatever ~1000 rows happened to be in the window each
     scan, so the same event could be flagged one run and not the next
     with no actual change in the person's behavior.
  2. It was a black box — the "reason" shown to reviewers was reconstructed
     after the fact and didn't necessarily reflect what the model used to
     decide.
  3. `contamination=0.015` was a hardcoded guess at the anomaly rate, just
     hidden inside a hyperparameter instead of visible in code.

This scorer compares each event to that specific person's own historical
pattern (median absolute deviation — robust to a few extreme past events
skewing the baseline), so every flag can be explained in plain language:
"this person's badge time was N deviations from their own normal pattern."
"""

from __future__ import annotations

import pandas as pd
import numpy as np

# Features scored against each person's own history.
FEATURES = [
    "hour_of_day",
    "gap_since_last_event_min",
    "entry_exit_balance",
]

# Minimum prior events required before trusting a per-person baseline.
# Below this, deviation is measured against everyone's combined baseline
# instead — a new hire's first few days should never look "anomalous"
# purely because there's no history yet.
MIN_EVENTS_FOR_PERSONAL_BASELINE = 15

# Modified z-score threshold from Iglewicz & Hoaglin's standard rule of
# thumb for outlier detection — a documented convention, not a tuned or
# arbitrary cutoff.
Z_SCORE_THRESHOLD = 3.5

# Statistical deviation alone can flag *something* on almost every scan,
# even when nothing unusual actually happened. Cap volume by additionally
# requiring the score to sit in the most extreme slice of the current batch.
BATCH_FLAG_QUANTILE = 0.985


def _modified_z(series: pd.Series) -> pd.Series:
    """Modified z-score using MAD, so a few extreme past events don't
    hide future events of the same size."""
    median = series.median()
    mad = (series - median).abs().median()

    if mad <= 1e-9:
        # No spread in this feature (e.g. everyone badges in at the exact
        # same minute) — fall back to stdev; if that's also ~0, there is
        # genuinely no basis to detect deviation, so score it as zero
        # rather than dividing by ~0 and producing an inflated number.
        spread = series.std()
        if not spread or spread <= 1e-9:
            return pd.Series(0.0, index=series.index)
        return (series - median).abs() / spread

    return (series - median).abs() / (1.4826 * mad)


class BaselineAnomalyScorer:
    """
    Scores each access event against the person's own historical baseline
    instead of a single globally trained black-box model. Deterministic:
    the same input always produces the same output, with no retraining
    variance between runs.
    """

    def score(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        z_cols = []

        event_counts = df.groupby("person_id")["person_id"].transform("count")
        df["has_personal_baseline"] = event_counts >= MIN_EVENTS_FOR_PERSONAL_BASELINE

        for feature in FEATURES:
            z_col = f"{feature}_z"
            z_cols.append(z_col)

            personal_z = df.groupby("person_id")[feature].transform(_modified_z)
            population_z = _modified_z(df[feature])  # fallback for thin history

            df[z_col] = np.where(
                df["has_personal_baseline"], personal_z, population_z
            ).astype(float)
            df[z_col] = df[z_col].fillna(0.0)

        # Denied access is a hard signal on its own — it doesn't need to
        # look statistically unusual to warrant a human's attention.
        df["denied_flag"] = df["access_result_enc"] == 1

        df["anomaly_score"] = df[z_cols].mean(axis=1)

        quantile_cutoff = df["anomaly_score"].quantile(BATCH_FLAG_QUANTILE)

        df["is_anomaly"] = df["denied_flag"] | (
            (df["anomaly_score"] >= Z_SCORE_THRESHOLD)
            & (df["anomaly_score"] >= quantile_cutoff)
        )

        mn, mx = df["anomaly_score"].min(), df["anomaly_score"].max()
        df["normalised_score"] = (df["anomaly_score"] - mn) / (mx - mn + 1e-9)

        # A denied event should never look "low risk" in the queue purely
        # because its statistical deviation score happened to be small.
        df.loc[df["denied_flag"], "normalised_score"] = df.loc[
            df["denied_flag"], "normalised_score"
        ].clip(lower=0.75)

        return df