"""Survey PDMX (public-domain MusicXML from MuseScore) for liturgical songs.

Reads PDMX.csv and prints how many scores match a list of sacred titles,
split by licence, so we can decide whether a Jubilate score catalogue built
from PDMX is worth it. Output goes to stdout and to survey.md.
"""
import csv, re, sys, collections, unicodedata

csv.field_size_limit(sys.maxsize)

TITLES = [
    "adeste fideles", "tu scendi dalle stelle", "astro del ciel", "stille nacht", "silent night",
    "o sanctissima", "salve regina", "tantum ergo", "pange lingua", "ave maria", "ave verum",
    "panis angelicus", "regina coeli", "regina caeli", "alma redemptoris", "ave regina caelorum",
    "veni creator", "veni sancte spiritus", "te deum", "magnificat", "adoro te", "o salutaris",
    "ubi caritas", "christus vincit", "victimae paschali", "dies irae", "stabat mater",
    "attende domine", "rorate caeli", "puer natus", "in dulci jubilo", "gloria in excelsis",
    "agnus dei", "kyrie", "sanctus", "pater noster", "ave maris stella", "inviolata",
    "noi canteremo gloria", "resta con noi", "dell'aurora tu sorgi", "mira il tuo popolo",
    "nome dolcissimo", "lodate maria", "o del cielo gran regina", "andro a vederla",
    "e l'ora che pia", "evviva maria", "t'adoriam ostia divina", "noel", "o come all ye faithful",
]

def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z' ]+", " ", s).strip()

path = sys.argv[1]
lic = collections.Counter()
hits = collections.defaultdict(lambda: collections.Counter())
samples = collections.defaultdict(list)
cols = None
n = 0
with open(path, newline="", encoding="utf-8") as f:
    r = csv.DictReader(f)
    cols = r.fieldnames
    for row in r:
        n += 1
        l = row.get("license") or ""
        lic[l] += 1
        name = norm((row.get("title") or "") + " " + (row.get("song_name") or ""))
        for t in TITLES:
            if t in name:
                hits[t][l] += 1
                if len(samples[t]) < 3:
                    samples[t].append(f"{row.get('title')} | {row.get('composer_name')} | {l} | lyrics={row.get('has_lyrics')} | tracks={row.get('n_tracks')} | conflict={row.get('license_conflict')} | {row.get('mxl')}")
                break

out = [f"# PDMX survey", f"rows: {n}", f"columns: {cols}", "", "## Licences"]
out += [f"- {k!r}: {v}" for k, v in lic.most_common(20)]
out += ["", "## Matches per title (by licence)"]
for t in TITLES:
    c = hits.get(t)
    if not c:
        out.append(f"- {t}: 0"); continue
    out.append(f"- {t}: {sum(c.values())}  " + ", ".join(f"{k or 'none'}={v}" for k, v in c.most_common()))
    for s in samples[t]:
        out.append(f"    - {s}")
text = "\n".join(out)
print(text)
open("survey.md", "w").write(text)
