URGENT_WORDS = [
    "sparking",
    "burning",
    "exposed wire",
    "loose wire",
    "hot to touch",
    "power fluctuation",
    "no power supply",
    "sewage",
    "ragging",
    "lift stopped",
    "dirty drinking water",
    "strange taste",
    "emergency",
    "shock",
    "fire",
]

HIGH_WORDS = [
    "leak",
    "crack",
    "unsafe",
    "plaster",
    "seepage",
    "torn",
    "not working",
    "no internet",
    "no water",
    "no power",
    "power cut",
    "blocked",
    "overflowing",
    "not cleaned",
    "not collected",
    "mosquito",
    "insect",
    "cockroach",
    "smell",
    "burnt",
    "fallen",
    "fell down",
    "fell off",
    "fuse",
    "generator",
    "damaged",
    "broken",
    "dangerous",
    "slow",
    "down",
    "offline",
    "faulty",
    "cut",
]

LOW_WORDS = [
    "request",
    "need more",
    "suggestion",
    "missing",
    "too costly",
    "extra",
    "not organised",
    "not available",
    "not issued",
    "does not accept",
]


def predict_priority(text):
    lowered = text.lower()

    if any(word in lowered for word in URGENT_WORDS):
        return "urgent"

    if any(word in lowered for word in HIGH_WORDS):
        return "high"

    if any(word in lowered for word in LOW_WORDS):
        return "low"

    return "medium"
