"""Builds Jubilate's catalogue of free sacred scores from PDMX.

PDMX (Long et al., 2024, https://zenodo.org/records/15571083, CC BY 4.0) is a
dataset of ~254k MusicXML scores from MuseScore marked public domain or CC0 by
their authors. This script keeps the sacred and liturgical ones and writes:

  <out>/index.json   compact list the app searches by title
  <out>/<id>.mxl     the compressed MusicXML files

Usage: build_catalog.py PDMX.csv mxl.tar.gz OUT_DIR
Run by .github/workflows/deploy-pages.yml; the result is served next to the app
(same origin), so the search works without any third-party service.
"""
import csv, json, math, os, re, sys, tarfile, unicodedata

csv.field_size_limit(sys.maxsize)
MAX_ITEMS = 6000
MAX_TRACKS = 8
MAX_BYTES = 400_000

# Titles (or parts of titles) of sacred and liturgical music: Latin chant and
# hymns, Mass parts, Marian antiphons, Italian traditional songs, carols.
KEYWORDS = """
adeste fideles|tu scendi dalle stelle|astro del ciel|stille nacht|silent night|o sanctissima|salve regina|
tantum ergo|pange lingua|ave maria|ave verum|panis angelicus|regina coeli|regina caeli|alma redemptoris|
ave regina caelorum|veni creator|veni sancte spiritus|te deum|magnificat|adoro te|o salutaris|ubi caritas|
christus vincit|victimae paschali|dies irae|stabat mater|attende domine|rorate|puer natus|in dulci jubilo|
gloria in excelsis|agnus dei|kyrie|sanctus|benedictus|pater noster|ave maris stella|inviolata|
mira il tuo popolo|dell'aurora|nome dolcissimo|lodate maria|gran regina|evviva maria|ostia divina|
noel|o come all ye faithful|hark the herald|joy to the world|o little town|away in a manger|
what child is this|angels we have heard|go tell it|god rest ye|the holly and the ivy|good king wenceslas|
o holy night|minuit chretiens|cantique de noel|gaudete|veni veni emmanuel|o come o come emmanuel|
es ist ein ros|lo how a rose|vom himmel hoch|nun komm der heiden|wachet auf|ein feste burg|
a mighty fortress|amazing grace|holy holy holy|abide with me|nearer my god|rock of ages|
crown him|praise to the lord|lobe den herren|now thank we all|nun danket|old hundredth|doxology|
jesu joy|jesus bleibet|ave regina|regina caeli|o filii et filiae|lauda sion|laudate|jubilate deo|
exsultate|alleluia|hosanna|miserere|de profundis|requiem|lux aeterna|libera me|in paradisum|
crux fidelis|vexilla regis|o sacrum convivium|ecce panis|sub tuum|virgo|
o sacred head|o haupt voll blut|herzlich tut mich|corpus christi|resurrexit|surrexit|
gloria patri|credo|missa|mass in|messe|messa|hymn|inno|salmo|psalm|canticle|cantico|
o salutaris|jesu dulcis|o esca viatorum|caro mea|ego sum panis|o quam suavis|
natale|christmas carol|carol|tollite hostias|
""".replace("\n", "").split("|")
KEYWORDS = sorted({k.strip() for k in KEYWORDS if k.strip()}, key=len, reverse=True)
TAG_WORDS = ("hymn", "sacred", "church", "liturg", "religio", "christmas", "carol", "chant", "gregorian", "worship", "catholic")
# Clearly modern pop/film tunes that slip through "christmas" tags.
EXCLUDE = re.compile(r"\b(mariah|last christmas|all i want|jingle bell rock|rockin|feliz navidad|santa|rudolph|frosty|let it snow|grinch|white christmas|requiem for a dream|hallelujah|undertale|minecraft|anime|pokemon|zelda|mario)\b")


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9' ]+", " ", s)).strip()


def clean(s, limit=120):
    s = re.sub(r"\s+", " ", (s or "").strip())
    return "" if s in ("NA", "nan") else s[:limit]


def truthy(v):
    return str(v).strip().lower() in ("true", "1")


def main(csv_path, tar_path, out):
    picked = {}
    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if not truthy(row.get("subset:no_license_conflict")) or not truthy(row.get("subset:all_valid")):
                continue
            if truthy(row.get("is_draft")):
                continue
            try:
                tracks = int(float(row.get("n_tracks") or 0))
            except ValueError:
                continue
            if tracks < 1 or tracks > MAX_TRACKS or not row.get("mxl"):
                continue
            title = clean(row.get("title")) or clean(row.get("song_name"))
            if not title:
                continue
            text = norm(" ".join([title, row.get("song_name") or "", row.get("subtitle") or ""]))
            tags = (row.get("genres") or "").lower() + " " + (row.get("tags") or "").lower() + " " + (row.get("groups") or "").lower()
            if EXCLUDE.search(text):
                continue
            if not (any(k in text for k in KEYWORDS) or any(w in tags for w in TAG_WORDS)):
                continue
            views = float(row.get("n_views") or 0)
            rating = float(row.get("rating") or 0)
            lyrics = truthy(row.get("has_lyrics"))
            rank = math.log10(views + 10) + rating / 2 + (0.5 if lyrics else 0)
            mxl = row["mxl"].lstrip("./")
            pid = os.path.splitext(os.path.basename(mxl))[0]
            picked[mxl] = {
                "i": pid,
                "t": title,
                "c": clean(row.get("composer_name") or row.get("artist_name"), 80),
                "l": "cc0" if row.get("license") == "cc-zero" else "pd",
                "y": 1 if lyrics else 0,
                "n": tracks,
                "_rank": rank,
            }
    chosen = sorted(picked.items(), key=lambda kv: kv[1]["_rank"], reverse=True)[:MAX_ITEMS]
    wanted = dict(chosen)
    print(f"candidates: {len(picked)}, kept: {len(wanted)}")

    os.makedirs(out, exist_ok=True)
    found = {}
    with tarfile.open(tar_path, "r|gz") as tar:
        for m in tar:
            if not m.isfile():
                continue
            name = m.name.lstrip("./")
            if name not in wanted or m.size > MAX_BYTES:
                continue
            data = tar.extractfile(m).read()
            if data[:2] != b"PK":
                continue
            entry = wanted[name]
            with open(os.path.join(out, entry["i"] + ".mxl"), "wb") as fh:
                fh.write(data)
            found[name] = entry
    items = []
    for name, e in chosen:
        if name in found:
            items.append({k: v for k, v in e.items() if not k.startswith("_")})
    with open(os.path.join(out, "index.json"), "w", encoding="utf-8") as fh:
        json.dump({"source": "PDMX (Long et al., 2024), zenodo.org/records/15571083, CC BY 4.0", "items": items},
                  fh, ensure_ascii=False, separators=(",", ":"))
    size = sum(os.path.getsize(os.path.join(out, x)) for x in os.listdir(out))
    print(f"written: {len(items)} scores, {size / 1e6:.1f} MB")


if __name__ == "__main__":
    main(*sys.argv[1:4])
