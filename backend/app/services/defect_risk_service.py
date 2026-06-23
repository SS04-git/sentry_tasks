import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler, RobustScaler
from sklearn.pipeline import Pipeline
from sklearn.metrics import roc_auc_score, precision_score, recall_score

FEATURE_COLS = ["churn", "complexity", "authors", "change_frequency", "bug_history"]


def build_features(rows: list[dict]):
    X = np.array([[r[f] for f in FEATURE_COLS] for r in rows], dtype=float)
    y = np.array([r["label"] for r in rows])
    return X, y


def _make_labels(rows: list[dict]) -> list[int]:
    """
    Tiered labelling — tries increasingly loose heuristics until both
    classes (0 and 1) exist, so the classifier always has signal to learn.

    Tier 1: bug_history >= 2  OR  (top-25% freq AND bug_history >= 1)
    Tier 2: bug_history >= 1  OR  top-25% change_frequency
    Tier 3: top-25% churn (lines changed) — pure size signal
    Tier 4: top-50% change_frequency — always produces both classes
    """
    n = len(rows)
    freqs   = sorted(r["change_frequency"] for r in rows)
    churns  = sorted(r["churn"]            for r in rows)
    p75_freq  = freqs[int(n * 0.75)]  if n else 0
    p75_churn = churns[int(n * 0.75)] if n else 0
    p50_freq  = freqs[int(n * 0.50)]  if n else 0

    tiers = [
        lambda r: r["bug_history"] >= 2 or (r["change_frequency"] >= p75_freq and r["bug_history"] >= 1),
        lambda r: r["bug_history"] >= 1 or r["change_frequency"] >= p75_freq,
        lambda r: r["churn"] >= p75_churn,
        lambda r: r["change_frequency"] >= p50_freq,
    ]

    for tier_fn in tiers:
        labels = [int(tier_fn(r)) for r in rows]
        if 0 < sum(labels) < n:
            return labels

    # Absolute fallback: top half
    return [int(r["change_frequency"] >= p50_freq) for r in rows]


def train_model(rows: list[dict]):
    labels   = _make_labels(rows)
    enriched = [{**r, "label": lbl} for r, lbl in zip(rows, labels)]

    X, y = build_features(enriched)

    split = max(1, int(len(X) * 0.8))
    X_train, X_test = X[:split], X[split:]
    y_train, y_test = y[:split], y[split:]

    single_class_train = len(set(y_train.tolist())) < 2

    if single_class_train:
        # Not enough labelled diversity in the training window —
        # train on the full dataset and skip held-out metrics
        X_train, y_train = X, y
        X_test, y_test   = np.empty((0, X.shape[1])), np.empty(0)
        clf = LogisticRegression(max_iter=500)
    else:
        clf = GradientBoostingClassifier(
            n_estimators=100, max_depth=3, learning_rate=0.1, random_state=42
        )

    # RobustScaler handles outlier churns (huge lock-file changes etc.) better
    model = Pipeline([("scaler", RobustScaler()), ("clf", clf)])
    model.fit(X_train, y_train)

    if len(X_test) == 0 or len(set(y_test.tolist())) < 2:
        metrics = {"roc_auc": None, "precision": None, "recall": None}
    else:
        probs  = model.predict_proba(X_test)[:, 1]
        preds  = (probs > 0.5).astype(int)
        metrics = {
            "roc_auc":   round(float(roc_auc_score(y_test, probs)), 4),
            "precision": round(float(precision_score(y_test, preds, zero_division=0)), 4),
            "recall":    round(float(recall_score(y_test, preds, zero_division=0)), 4),
        }

    return model, metrics, labels


def predict_risk(model, rows: list[dict], labels: list[int]) -> list[dict]:
    enriched = [{**r, "label": lbl} for r, lbl in zip(rows, labels)]
    X        = np.array([[r[f] for f in FEATURE_COLS] for r in enriched], dtype=float)
    scores   = model.predict_proba(X)[:, 1]
    return [{**r, "risk_score": round(float(s), 4)} for r, s in zip(enriched, scores)]