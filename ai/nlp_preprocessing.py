import re

STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of",
    "is", "are", "was", "were", "be", "been", "not", "no", "with", "from",
    "this", "that", "these", "those", "it", "its", "has", "have", "had", "since",
    "very", "there", "here", "also", "again", "all", "any", "some", "our", "we",
    "i", "my", "me", "you", "your", "they", "them", "he", "she", "his", "her",
    "do", "does", "did", "can", "could", "will", "would", "should", "please",
    "kindly", "request", "need", "problem", "issue", "complaint",
}


LOCATION_RULES = {
    "boys hostel": ["boys hostel", "boy hostel", "boys' hostel", "boy's hostel"],
    "girls hostel": ["girls hostel", "girl hostel", "girls' hostel", "girl's hostel"],
    "computer lab": ["computer lab", "computer laboratory"],
    "seminar hall": ["seminar hall", "auditorium"],
    "sports ground": ["sports ground", "playground", "play ground"],
    "reading room": ["reading room"],
    "main gate": ["main gate", "college gate"],
    "washroom": ["washroom", "wash room", "toilet", "restroom", "bathroom"],
    "hostel": ["hostel"],
    "lab": ["lab", "laboratory"],
    "library": ["library"],
    "canteen": ["canteen", "cafeteria", "mess"],
    "classroom": ["classroom", "class room", "lecture hall"],
    "block a": ["block a"],
    "block b": ["block b"],
    "block c": ["block c"],
    "parking": ["parking"],
    "ground": ["ground"],
    "corridor": ["corridor", "staircase", "stairs"],
    "office": ["office", "admin block"],
}

FACILITY_RULES = {
    "wifi": ["wifi", "wi-fi", "wi fi", "wireless", "internet", "network", "lan"],
    "water": ["water", "tap", "cooler", "drinking water"],
    "electricity": ["electricity", "power", "current", "voltage", "generator", "inverter"],
    "light": ["light", "lights", "bulb", "tube light", "street light"],
    "fan": ["fan", "fans", "ceiling fan"],
    "ac": ["ac", "air conditioner", "air conditioning"],
    "projector": ["projector", "smart board", "smartboard"],
    "computer": ["computer", "desktop", "laptop", "pc"],
    "printer": ["printer", "scanner"],
    "switch board": ["switch board", "switchboard", "socket", "plug point", "charging point", "switch"],
    "lift": ["lift", "elevator"],
    "cctv": ["cctv", "camera"],
    "furniture": ["bench", "desk", "chair", "table", "blackboard"],
    "door": ["door", "lock", "window"],
    "dustbin": ["dustbin", "garbage bin", "bin"],
    "attendance machine": ["attendance machine", "biometric"],
    "portal": ["portal", "website", "college app"],
}

# Keeping the stored summary short
MAX_ENTITIES_PER_KIND = 4


def clean_text(text):
    lowered = (text or "").lower()
    without_punctuation = re.sub(r"[^a-z0-9\s\-]", " ", lowered)
    return re.sub(r"\s+", " ", without_punctuation).strip()


def tokenize(text):
    words = clean_text(text).replace("-", " ").split()
    return [word for word in words if len(word) > 2 and word not in STOPWORDS]


def _match(cleaned_text, rules):
    found = []

    for canonical, patterns in rules.items():
        position = None

        for pattern in patterns:
            match = re.search(rf"\b{re.escape(pattern)}\b", cleaned_text)
            if match and (position is None or match.start() < position):
                position = match.start()

        if position is not None:
            found.append((position, canonical))

    found.sort(key=lambda item: item[0])
    names = [canonical for _, canonical in found]

    return [name for name in names if not any(name != other and name in other for other in names)]


def extract_entities(text):
    cleaned = clean_text(text)

    return {
        "locations": _match(cleaned, LOCATION_RULES)[:MAX_ENTITIES_PER_KIND],
        "facilities": _match(cleaned, FACILITY_RULES)[:MAX_ENTITIES_PER_KIND],
    }
