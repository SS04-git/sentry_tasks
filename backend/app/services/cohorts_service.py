import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score


def build_features(events):
    X = np.array([
        [e["arrival_time"], e["session_length"]]
        for e in events
    ])

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    return X_scaled, scaler


def choose_best_k(X, max_k=6):
    best_k = 2
    best_score = -1

    for k in range(2, max_k + 1):
        model = KMeans(n_clusters=k, random_state=42, n_init=10)
        labels = model.fit_predict(X)

        # safety: ensure at least 2 clusters
        if len(set(labels)) < 2:
            continue

        try:
            score = silhouette_score(X, labels)
        except Exception:
            continue

        if score > best_score:
            best_score = score
            best_k = k

    return best_k


def train_cohorts(events):
    X_scaled, scaler = build_features(events)

    k = choose_best_k(X_scaled)

    model = KMeans(n_clusters=k, random_state=42, n_init=10)
    labels = model.fit_predict(X_scaled)

    centroids_scaled = model.cluster_centers_
    centroids = scaler.inverse_transform(centroids_scaled)

    return {
        "k": k,
        "labels": labels.tolist(),
        "centroids": centroids.tolist()
    }