"""Classifies one uploaded infrastructure photo into a rough issue category.

The Node backend runs this file and writes a JSON object to its standard input:

    {"image_path": "C:\\\\...\\\\server\\\\uploads\\\\1699999999-123.png"}

Exactly one JSON object is printed on standard output:

    {"image_category": "Electrical", "confidence": 0.82,
     "model_type": "mobilenet_v2_transfer"}

How the category is chosen
--------------------------
ImageNet has no Electrical, Plumbing or Structural class, and there is no labelled
set of campus photos to fine-tune on, so the pretrained model is used zero-shot:

1. MobileNetV2 pretrained on ImageNet (torchvision) returns a probability for each
   of its 1000 labels.
2. The labels that do mean something in a building are listed in LABEL_GROUPS and
   mapped onto the three categories. A photo is "General" when none of them appear.
3. The first mapped label inside the top 5 decides the category, and the probability
   the model gave those labels is the confidence.

Measured on 37 Wikimedia Commons photos of campus-type damage, 4 categories, where
guessing would score 0.25:

    mobilenet_v2_transfer   18/37 = 0.49
    color_edge_heuristic    13/37 = 0.35

Those numbers are low on purpose: amateur photos of a cracked wall or a leaking tap
are far outside what ImageNet was built for, and the top labels are often unrelated
("nematode", "cowboy hat"). The confidence is reported as measured, so a photo the
model does not recognise comes out with a low score instead of a false certainty.
Training on a few hundred labelled campus photos is what would make this accurate.

If torch is missing or the weights cannot be downloaded, the colour and edge
heuristic further down runs instead, so a complaint is never blocked. `model_type`
says which of the two produced the answer.

Anything that goes wrong is written to standard error with a non-zero exit code,
so the backend can fall back to "General".
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

MODEL_TYPE_MOBILENET = "mobilenet_v2_transfer"
MODEL_TYPE_HEURISTIC = "color_edge_heuristic"

DEFAULT_CATEGORY = "General"

# Rank of the last label considered: the top 5 of 1000
TOP_LABELS = 5

# ImageNet labels that mean something in a building, grouped by campus category

LABEL_GROUPS = {
    # Electrical equipment, lighting and appliances
    "Electrical": [
        "electric fan", "television", "entertainment center", "screen", "monitor",
        "laptop", "desktop computer", "hand-held computer", "printer", "photocopier",
        "modem", "oscilloscope", "space heater", "radiator", "table lamp", "lampshade",
        "torch", "spotlight", "traffic light", "solar dish", "iron", "toaster",
        "microwave", "refrigerator", "washer", "dishwasher", "vacuum",
        "sewing machine", "power drill", "chain saw", "lawn mower",
        "computer keyboard", "typewriter keyboard", "mouse", "remote control",
        "cellular telephone", "dial telephone", "radio", "loudspeaker",
        "cassette player", "CD player", "iPod", "projector",
    ],
    # Water and the fixtures that carry it
    "Plumbing": [
        "geyser", "fountain", "water tower", "washbasin", "bathtub", "toilet seat",
        "shower curtain", "rain barrel", "water jug", "water bottle",
    ],
    # Building fabric and civil structures
    "Structural": [
        "stone wall", "tile roof", "chainlink fence", "picket fence", "vault",
        "megalith", "dome", "barn", "castle", "palace", "monastery", "church",
        "bell cote", "boathouse", "greenhouse", "pier", "breakwater", "dam",
        "viaduct", "steel arch bridge", "suspension bridge", "cliff dwelling", "patio",
    ],
}

# The colour and edge heuristic, used when the pretrained model is unavailable

# Small, because every measurement is an average over the whole photo
SAMPLE_SIZE = (160, 160)

# The score "nothing in particular stands out" always carries. Below MIN_SCORE a
# category is not trusted and the photo is called General instead.
BASELINE = 0.55
MIN_SCORE = 0.35


def ramp(value, low, high):
    """Scales a measurement into 0..1, flat outside the two ends."""
    return float(min(1.0, max(0.0, (value - low) / (high - low))))


def measure(image):
    """Turns the photo into the handful of numbers the scoring uses."""
    small = image.convert("RGB").resize(SAMPLE_SIZE)
    pixels = np.asarray(small, dtype=np.float32) / 255.0

    red, green, blue = pixels[..., 0], pixels[..., 1], pixels[..., 2]
    brightest = pixels.max(axis=2)
    darkest = pixels.min(axis=2)
    saturation = (brightest - darkest) / np.maximum(brightest, 1e-6)
    grey = pixels.mean(axis=2)

    # A pixel only counts as coloured when it is clearly brighter in one channel
    # and is not almost grey, which keeps white walls out of the blue and warm counts
    coloured = saturation > 0.15

    return {
        "brightness": float(grey.mean()),
        "contrast": float(grey.std()),
        # Water, taps and spray read as blue
        "blue": float(np.mean((blue > red + 0.08) & (blue > green + 0.03) & coloured)),
        # Fire, sparks, rust and warning paint read as warm
        "warm": float(np.mean((red > blue + 0.10) & (red >= green) & (saturation > 0.25))),
        # Vegetation around an outdoor shot
        "green": float(np.mean((green > red + 0.05) & (green > blue + 0.05))),
        # Concrete, plaster, metal and bare wires are almost grey
        "grey": float(np.mean(saturation < 0.12)),
        # Cracks, rubble, cables and clutter all add up to strong local changes
        "edges": (float(np.abs(np.diff(grey, axis=0)).mean())
                  + float(np.abs(np.diff(grey, axis=1)).mean())) / 2 * 8,
    }


def score(measured):
    """One score per category, built from named measurements so it can be read."""
    brightness = ramp(measured["brightness"], 0.25, 0.65)
    contrast = ramp(measured["contrast"], 0.12, 0.30)
    blue = ramp(measured["blue"], 0.02, 0.30)
    warm = ramp(measured["warm"], 0.02, 0.25)
    grey = ramp(measured["grey"], 0.35, 0.80)
    edges = ramp(measured["edges"], 0.20, 0.60)
    green = ramp(measured["green"], 0.10, 0.45)

    return {
        # Sparks, burning wiring and rust, usually against something dark
        "Electrical": max(0.0, 0.45 * warm + 0.30 * contrast + 0.25 * edges - 0.20 * green),
        # Water and taps: blue and smooth, so a busy texture counts against it
        "Plumbing": max(0.0, 0.55 * blue + 0.25 * (1.0 - edges) + 0.20 * brightness - 0.20 * green),
        # Cracks and damaged plaster: grey and full of edges
        "Structural": max(0.0, 0.40 * grey + 0.40 * edges + 0.20 * (1.0 - brightness)),
    }


def heuristic_classify(image):
    """The fallback: colour and edge measurements only, no model and no downloads."""
    measured = measure(image)

    # "General" is not scored: it is what is left when nothing else stands out
    scores = score(measured)
    best_category = max(scores, key=scores.get)

    if scores[best_category] < MIN_SCORE:
        return DEFAULT_CATEGORY, 0.30

    # Confidence is the share of the points the winner took, so a photo that
    # scores the same for two categories comes out near 0.5 instead of pretending
    confidence = (scores[best_category] + BASELINE / 2) / (sum(scores.values()) + BASELINE)

    return best_category, round(confidence, 4)


_model = None
_model_failed = False


def load_model():
    """Loads MobileNetV2 once per process, or returns None if it is not usable.

    The weights are about 14 MB and are downloaded to the torch cache the first
    time. Any problem at all - torch not installed, no internet, a broken download
    - leaves the caller on the heuristic instead of failing the request.
    """
    global _model, _model_failed

    if _model is not None or _model_failed:
        return _model

    try:
        import torch
        from torchvision.models import MobileNet_V2_Weights, mobilenet_v2

        weights = MobileNet_V2_Weights.IMAGENET1K_V1
        network = mobilenet_v2(weights=weights).eval()

        # Only labels that really exist in this version of the label list
        names = weights.meta["categories"]
        index_of = {name: index for index, name in enumerate(names)}
        groups = {}
        for category, labels in LABEL_GROUPS.items():
            indexes = [index_of[label] for label in labels if label in index_of]
            if indexes:
                groups[category] = indexes

        _model = (torch, network, weights.transforms(), names, groups)
    except Exception as error:  # noqa: BLE001 - any failure means "use the heuristic"
        print(f"mobilenet unavailable, using the heuristic: {error}", file=sys.stderr)
        _model_failed = True

    return _model


def mobilenet_classify(image, bundle):
    """The top 5 labels decide the category; unseen labels leave it as General."""
    torch, network, preprocess, names, groups = bundle

    batch = preprocess(image.convert("RGB")).unsqueeze(0)

    with torch.no_grad():
        probabilities = network(batch).softmax(dim=1)[0]

    top = torch.topk(probabilities, TOP_LABELS)

    for index in top.indices:
        for category, indexes in groups.items():
            if int(index) in indexes:
                # Every label of the winning category inside the top 5 counts, which
                # keeps the confidence meaningful when two of them appear
                same_group = sum(
                    float(score)
                    for score, other in zip(top.values, top.indices)
                    if int(other) in indexes
                )
                return category, round(same_group, 4)

    return DEFAULT_CATEGORY, round(float(top.values[0]), 4)


def classify(image_path):
    with Image.open(image_path) as image:
        bundle = load_model()

        if bundle is None:
            category, confidence = heuristic_classify(image)
            return {
                "image_category": category,
                "confidence": confidence,
                "model_type": MODEL_TYPE_HEURISTIC,
            }

        category, confidence = mobilenet_classify(image, bundle)

    return {
        "image_category": category,
        "confidence": confidence,
        "model_type": MODEL_TYPE_MOBILENET,
    }


def serve():
    """Kept-alive mode: one JSON request per line in, one JSON answer per line out.

    The backend starts this once (with --serve) because importing torch takes about
    15 seconds, which is far too long to pay for every uploaded photo. The model is
    loaded before READY is printed, so the caller knows when requests can be sent.
    A bad request is answered with the fallback instead of ending the process.
    """
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)

    load_model()
    print("READY", flush=True)

    for line in sys.stdin:
        if not line.strip():
            continue

        try:
            payload = json.loads(line)
            result = classify((payload.get("image_path") or "").strip())
        except Exception as error:  # noqa: BLE001 - keep serving the next request
            print(f"could not classify {line.strip()}: {error}", file=sys.stderr)
            result = {
                "image_category": DEFAULT_CATEGORY,
                "confidence": 0.0,
                "model_type": MODEL_TYPE_HEURISTIC,
            }

        print(json.dumps(result), flush=True)

    return 0


def main():
    if "--serve" in sys.argv:
        return serve()

    # Windows defaults to the local code page, paths may contain any characters
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")

    try:
        payload = json.loads(sys.stdin.read())
    except json.JSONDecodeError as error:
        print(f"invalid input json: {error}", file=sys.stderr)
        return 1

    image_path = (payload.get("image_path") or "").strip()

    if not image_path or not Path(image_path).exists():
        print(f"image not found: {image_path}", file=sys.stderr)
        return 1

    try:
        result = classify(image_path)
    except OSError as error:
        print(f"could not read image: {error}", file=sys.stderr)
        return 1

    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
