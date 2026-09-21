from datetime import datetime, timezone
from pathlib import Path
import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.pipeline import Pipeline

from severity import predict_priority
from training_data import CATEGORIES, PRIORITIES, TRAINING_DATA

MODEL_DIR = Path(__file__).parent / "model"
MODEL_PATH = MODEL_DIR / "complaint_model.joblib"
MODEL_TYPE = "tfidf_logistic_regression+severity_keywords"


def build_pipeline():
    return Pipeline(
        [
            ("tfidf", TfidfVectorizer(ngram_range=(1, 1), sublinear_tf=True)),
            ("classifier", LogisticRegression(max_iter=2000, C=5.0)),
        ]
    )


def train_and_save(verbose=True):
    texts = [row[0] for row in TRAINING_DATA]
    categories = [row[1] for row in TRAINING_DATA]
    priorities = [row[2] for row in TRAINING_DATA]

    folds = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    category_scores = cross_val_score(build_pipeline(), texts, categories, cv=folds)

    rule_hits = sum(
        1 for text, expected in zip(texts, priorities)
        if predict_priority(text) == expected
    )

    if verbose:
        print(f"labelled rows: {len(texts)} ({len(CATEGORIES)} categories)")
        print(f"category accuracy (5-fold cv): {category_scores.mean():.3f}")
        print(f"priority rule agreement: {rule_hits / len(texts):.3f}")

    category_model = build_pipeline().fit(texts, categories)

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "category_model": category_model,
            "model_type": MODEL_TYPE,
            "categories": CATEGORIES,
            "priorities": PRIORITIES,
            "category_cv_accuracy": round(float(category_scores.mean()), 4),
            "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        },
        MODEL_PATH,
    )

    return MODEL_PATH


if __name__ == "__main__":
    saved_path = train_and_save()
    print(f"model saved to {saved_path}")
