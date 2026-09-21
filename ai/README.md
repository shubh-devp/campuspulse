# AI layer

Predicts the **category** and **priority** of a complaint, extracts the **places and
facilities** it mentions, and classifies an **uploaded photo**. The Node backend runs
these scripts for every new complaint, before inserting it into the database.

## Files

| File | Purpose |
| ---- | ------- |
| `training_data.py` | 140 labelled campus complaints (text, category, priority) |
| `train_model.py` | Trains the category model and saves it to `model/` |
| `evaluate_model.py` | Trains a candidate from the live feedback dataset and measures it against the model in use |
| `predict.py` | The text script the backend calls: category, priority, entities |
| `cv_classify.py` | The image script: Electrical / Plumbing / Structural / General |
| `nlp_preprocessing.py` | Text cleaning, stopword tokenization, entity extraction |
| `severity.py` | The priority rule |
| `requirements.txt` | Python dependencies |
| `model/` | Trained model (generated, not in Git) |

## How it works

**Category** is a trained model: TF-IDF over single words followed by logistic
regression, fitted on the 140 labelled rows in `training_data.py`. 5-fold cross
validation accuracy: **0.671** over 5 categories (a random guess would be 0.20).

**Priority** is a keyword rule in `severity.py` rather than a second model. The
same TF-IDF + logistic regression scored only **0.50** on the priority labels,
while the keyword rule agrees with them **0.607** of the time. Priority depends on
a handful of severity words ("sparking", "no water", "request"), which is exactly
what a rule is good at, and the rule can be read and adjusted by hand.

The model type stored with every prediction is
`tfidf_logistic_regression+severity_keywords`, because a prediction is produced by
both parts.

**Entities** are also a rule, in `nlp_preprocessing.py` rather than a model. The
vocabulary of a campus is small and known, so two dictionaries of regular expressions
(`LOCATION_RULES`, `FACILITY_RULES`) cover it, and each match is mapped to one
canonical name: `wi-fi`, `wi fi` and `wireless` all become `wifi`. Matches are
returned in the order they appear in the text, at most 4 of each kind, and a shorter
name is dropped when a longer one covers it, so "boys hostel" hides "hostel".

Duplicate detection is not here: it needs the other complaints, so it lives in
`server/services/duplicateDetector.js` on the Node side.

## Image classification

`cv_classify.py` answers with one of Electrical, Plumbing, Structural or General.

ImageNet has no such classes, and there is no labelled set of campus photos to
fine-tune on, so MobileNetV2 pretrained on ImageNet is used zero-shot:

1. The model returns a probability for each of its 1000 labels.
2. `LABEL_GROUPS` lists the labels that do mean something in a building ("electric fan",
   "geyser", "stone wall", ...) and maps them onto the three categories.
3. The first mapped label inside the top 5 decides the category, and the probability
   given to that category's labels is the confidence. Nothing mapped means General.

Measured on 37 Wikimedia Commons photos of campus-type damage, where guessing one of
four categories would score 0.25:

| Model | Correct |
| ----- | ------- |
| `mobilenet_v2_transfer` | 18/37 = 0.49 |
| `color_edge_heuristic` | 13/37 = 0.35 |

Both numbers are low because amateur photos of a cracked wall or a leaking tap are far
from what ImageNet was built for: its top labels are often unrelated ("nematode",
"cowboy hat"). The confidence is reported as measured, so an unrecognised photo comes
out with a low score rather than a false certainty. A few hundred labelled campus
photos would be needed to fine-tune this into something accurate.

If torch is missing or the weights cannot be downloaded, the colour and edge heuristic
in the same file runs instead, so a complaint is never blocked. `model_type` in the
answer says which of the two produced it.

## Two ways to run a script

Each script reads one JSON object from standard input and prints one JSON object, which
is how you test it by hand. Started with `--serve` it stays running instead: one JSON
request per line, one JSON answer per line, plus `READY` once it has finished importing.

The backend uses `--serve` because importing scikit-learn costs about five seconds and
torch about fifteen, which cannot be paid on every request. See
`server/services/pythonBridge.js`.

## Setup

```bash
python -m venv ai/.venv
ai/.venv/Scripts/python -m pip install -r ai/requirements.txt   # Windows
# ai/.venv/bin/python -m pip install -r ai/requirements.txt     # macOS / Linux
```

The backend finds `ai/.venv` automatically. To use a different interpreter, set
`PYTHON_BIN` in `server/.env`.

torch is a large download (about 200 MB) and takes a while to install. It is only
needed for the image classifier: without it `cv_classify.py` falls back to the colour
and edge heuristic and everything else works normally, so you can install
scikit-learn, joblib and Pillow first and add torch later.

## Training

```bash
ai/.venv/Scripts/python ai/train_model.py
```

Prints the cross-validated category accuracy and the priority rule agreement, then
saves `model/complaint_model.joblib`. `predict.py` trains the model on the fly if
the file is missing, so a fresh checkout works without this step.

## Calling it directly

```bash
echo '{"title": "Wi-Fi is not working", "description": "No internet since yesterday"}' | ai/.venv/Scripts/python ai/predict.py
```

```json
{"category": "IT & Network", "priority": "high", "confidence": 0.8325, "model_type": "tfidf_logistic_regression+severity_keywords", "entities": {"locations": ["boys hostel", "block a"], "facilities": ["wifi"]}}
```

`confidence` is the category model's probability. The priority rule is
deterministic, so it has no score of its own.

The image classifier works the same way:

```bash
echo '{"image_path": "C:/path/to/photo.jpg"}' | ai/.venv/Scripts/python ai/cv_classify.py
```

```json
{"image_category": "Structural", "confidence": 0.9995, "model_type": "mobilenet_v2_transfer"}
```

The first call downloads the MobileNetV2 weights (about 14 MB) into the torch cache,
so it takes longer than the ones after it.

Nothing is written to stdout except that one JSON object; problems go to stderr
with a non-zero exit code, which is how the backend knows to fall back.

## Retraining from live data

`evaluate_model.py` is the other half of the learning loop. It reads the labels that
`server/scripts/export-feedback-dataset.js` writes from the `ai_feedback_dataset` view,
trains a candidate, and scores it against the model currently in use on the same held-out
test rows:

```bash
cd server && npm run export:dataset
python ai/evaluate_model.py                 # measure only, change nothing
python ai/evaluate_model.py --promote       # allow a better candidate to replace the model
```

A candidate has to win by at least 0.01 accuracy, and `--promote` has to be passed, before
anything is overwritten. The previous model is backed up to
`model/complaint_model.previous.joblib` first. The report goes to
`model/evaluation_report.json`, and if the set is too small to hold a test set back (fewer
than 25 usable rows) the run reports `insufficient_data` and promotes nothing.

`--corrected-only` trains on just the rows a human corrected, and `--with-base` adds the
140 hand-labelled seed rows back into the training set. The default is neither, because
most labels in the loop are the model's own answer, so training on them is circular. That
is also why the report always separates `human_corrected` from `ai_uncorrected` rows.

## Parts that live in `server/services/` instead

Two of the AI features need data this folder does not have, so they sit on the Node side:

- `aiSummary.js` — Gemini writes the operational summary and the draft reply. It only
  turns facts already in the complaint record into prose; it never decides a category,
  priority, duplicate or cluster.
- `aiInsights.js` — the cards on the admin analytics page. Each one is a count or an
  average over rows that already exist, and carries the figures it was derived from, so an
  admin can check the number rather than take the sentence on trust.

Duplicate detection is on the Node side too (`server/services/duplicateDetector.js`),
because it has to compare against the other complaints.
