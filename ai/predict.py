import json
import sys
from pathlib import Path

AI_DIR = Path(__file__).parent
sys.path.insert(0, str(AI_DIR))

import joblib

from nlp_preprocessing import extract_entities
from severity import predict_priority

MODEL_PATH = AI_DIR / "model" / "complaint_model.joblib"
MODEL_TYPE = "tfidf_logistic_regression+severity_keywords"


def load_model():
    if not MODEL_PATH.exists():
        # training the model so the API works without an extra step
        print("model not found, training it now", file=sys.stderr)
        from train_model import train_and_save

        train_and_save(verbose=False)

    return joblib.load(MODEL_PATH)


def predict(title, description):
    text = f"{title}. {description}".strip()
    bundle = load_model()
    category_model = bundle["category_model"]

    category = category_model.predict([text])[0]
    confidence = float(max(category_model.predict_proba([text])[0]))

    return {
        "category": category,
        "priority": predict_priority(text),
        "confidence": round(confidence, 4),
        "model_type": bundle.get("model_type", MODEL_TYPE),
        "entities": extract_entities(text),
    }


def answer(raw):
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as error:
        return None, f"invalid input json: {error}"

    title = (payload.get("title") or "").strip()
    description = (payload.get("description") or "").strip()

    if not title and not description:
        return None, "no complaint text received"

    try:
        return predict(title, description), None
    except Exception as error:
        return None, f"could not predict: {error}"


def serve():
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)

    load_model()
    print("READY", flush=True)

    for line in sys.stdin:
        if not line.strip():
            continue

        result, problem = answer(line)

        if problem:
            print(problem, file=sys.stderr)
            print(json.dumps({"error": problem}), flush=True)
        else:
            print(json.dumps(result), flush=True)

    return 0


def main():
    if "--serve" in sys.argv:
        return serve()

    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")

    result, problem = answer(sys.stdin.read())

    if problem:
        print(problem, file=sys.stderr)
        return 1

    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())

