import argparse
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

AI_DIR = Path(__file__).parent
sys.path.insert(0, str(AI_DIR))

import joblib
from sklearn.metrics import f1_score
from sklearn.model_selection import train_test_split
from train_model import MODEL_PATH, MODEL_TYPE, build_pipeline
from training_data import CATEGORIES, PRIORITIES, TRAINING_DATA

MODEL_DIR = AI_DIR / "model"
REPORT_PATH = MODEL_DIR / "evaluation_report.json"
BACKUP_PATH = MODEL_DIR / "complaint_model.previous.joblib"


REQUIRED_IMPROVEMENT = 0.01


MIN_ROWS = 25


def load_dataset(path):
    # Reading the JSON written by server/scripts/export-feedback-dataset.js
    if not path.exists():
        raise SystemExit(
            f"dataset not found: {path}\n"
            "Run: node server/scripts/export-feedback-dataset.js"
        )

    payload = json.loads(path.read_text(encoding="utf-8"))
    rows = payload.get("rows", [])

    usable = [
        row
        for row in rows
        if row.get("text") and row.get("label") in CATEGORIES
    ]

    return payload, usable


def score(model, texts, labels):
    predictions = model.predict(texts)
    correct = sum(1 for a, b in zip(predictions, labels) if a == b)
    return {
        "accuracy": round(correct / len(labels), 4),
        "macro_f1": round(float(f1_score(labels, predictions, average="macro", zero_division=0)), 4),
    }


def needs_stratified_split(labels):
    counts = {}
    for label in labels:
        counts[label] = counts.get(label, 0) + 1
    return all(count >= 2 for count in counts.values()) and len(counts) > 1


def evaluate(dataset_path, test_size, with_base, corrected_only, promote):
    payload, rows = load_dataset(dataset_path)

    label_sources = {}
    for row in rows:
        source = row.get("label_source", "unknown")
        label_sources[source] = label_sources.get(source, 0) + 1

    if corrected_only:
        rows = [row for row in rows if row.get("label_source") == "human_corrected"]

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "dataset_file": str(dataset_path),
        "dataset_rows": len(rows),
        "label_sources": label_sources,
        "corrected_only": corrected_only,
        "with_base_training_rows": with_base,
        "required_improvement": REQUIRED_IMPROVEMENT,
        "decision": None,
        "promoted": False,
        "notes": [],
    }

    if len(rows) < MIN_ROWS:
        report["decision"] = "insufficient_data"
        report["notes"].append(
            f"{len(rows)} usable labelled rows, {MIN_ROWS} are needed before a "
            "candidate can be compared honestly on a held-out set."
        )
        return finish(report, promote)

    texts = [row["text"] for row in rows]
    labels = [row["label"] for row in rows]

    stratify = labels if needs_stratified_split(labels) else None
    train_texts, test_texts, train_labels, test_labels = train_test_split(
        texts,
        labels,
        test_size=test_size,
        random_state=42,
        stratify=stratify,
    )

    if stratify is None:
        report["notes"].append(
            "At least one category has fewer than two rows, so the split is not "
            "stratified and the test set may miss that category."
        )

    base_rows = TRAINING_DATA if with_base else []
    candidate = build_pipeline().fit(
        list(train_texts) + [row[0] for row in base_rows],
        list(train_labels) + [row[1] for row in base_rows],
    )

    report["train_rows"] = len(train_texts) + len(base_rows)
    report["test_rows"] = len(test_texts)
    report["candidate_model"] = score(candidate, test_texts, test_labels)

    if not MODEL_PATH.exists():
        report["decision"] = "no_current_model"
        report["notes"].append(
            "No saved model to compare against. Run ai/train_model.py first."
        )
        return finish(report, promote)

    current = joblib.load(MODEL_PATH)
    report["current_model"] = score(current["category_model"], test_texts, test_labels)
    report["current_model"]["trained_at"] = current.get("trained_at")

    improvement = round(
        report["candidate_model"]["accuracy"] - report["current_model"]["accuracy"], 4
    )
    report["improvement"] = improvement

    if improvement >= REQUIRED_IMPROVEMENT:
        report["decision"] = "promote"
    else:
        report["decision"] = "keep_current"

    return finish(report, promote, candidate)


def finish(report, promote, candidate=None):
    if report["decision"] == "promote" and promote:
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        if MODEL_PATH.exists():
            shutil.copy2(MODEL_PATH, BACKUP_PATH)
            report["notes"].append(f"previous model backed up to {BACKUP_PATH.name}")

        joblib.dump(
            {
                "category_model": candidate,
                "model_type": MODEL_TYPE,
                "categories": CATEGORIES,
                "priorities": PRIORITIES,
                "category_cv_accuracy": report["candidate_model"]["accuracy"],
                "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "trained_on": "ai_feedback_dataset",
                "trained_rows": report["train_rows"],
            },
            MODEL_PATH,
        )
        report["promoted"] = True
    elif report["decision"] == "promote":
        report["notes"].append(
            "The candidate is better but --promote was not passed, so the model in "
            "use has not been changed."
        )

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(json.dumps(report, indent=2))
    print(f"\nreport written to {REPORT_PATH}")
    return report


def main():
    parser = argparse.ArgumentParser(description="Evaluate a retrained category model.")
    parser.add_argument("--dataset", type=Path, default=MODEL_DIR / "feedback_dataset.json")
    parser.add_argument("--test-size", type=float, default=0.25)
    parser.add_argument(
        "--with-base",
        action="store_true",
        help="also train the candidate on the 140 hand-labelled seed rows",
    )
    parser.add_argument(
        "--corrected-only",
        action="store_true",
        help="use only rows a human corrected, ignoring the model's own answers",
    )
    parser.add_argument(
        "--promote",
        action="store_true",
        help="replace the model in use if, and only if, the candidate wins",
    )
    args = parser.parse_args()

    evaluate(
        dataset_path=args.dataset,
        test_size=args.test_size,
        with_base=args.with_base,
        corrected_only=args.corrected_only,
        promote=args.promote,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
