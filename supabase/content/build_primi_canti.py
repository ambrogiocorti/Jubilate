#!/usr/bin/env python3
"""Generates primi_canti.sql: the first five public-domain songs for Jubilate.

Lines use inline [Chord] markers; this script turns them into the anchored
chord format of the database (section, line, character offset). The SQL runs
as the parish administrator (the earliest active one) through public.admin_save_song, so each
song gets a normal revision history. It is idempotent: a song whose title
already exists is skipped.

    python3 supabase/content/build_primi_canti.py > supabase/content/primi_canti.sql
"""
import json
import re

CHORD = re.compile(r"\[([^\]]+)\]")


def parse_line(raw):
    text, chords, pos = "", [], 0
    for m in CHORD.finditer(raw):
        text += raw[pos:m.start()]
        chords.append((len(text), m.group(1)))
        pos = m.end()
    text += raw[pos:]
    return text, chords


def content(key, sections, sequence):
    out = {"sections": [], "sequence": sequence, "chords": []}
    if key:
        out["key"] = key
    for s in sections:
        lines = []
        for i, raw in enumerate(s["lines"]):
            text, chords = parse_line(raw)
            assert len(text) <= 300
            lines.append(text)
            for off, ch in chords:
                assert off <= len(text), (raw, off)
                out["chords"].append({"section": s["key"], "line": i, "offset": off, "chord": ch})
        out["sections"].append({"key": s["key"], "kind": s["kind"], "label": s["label"], "lines": lines})
    if not out["chords"]:
        del out["chords"]
    return out


SONGS = [
    {
        "meta": {
            "title": "Adeste fideles",
            "alt_titles": ["Venite, adoremus"],
            "author": "Attribuito a John Francis Wade (1751)",
            "composer": "Attribuito a John Francis Wade (1751)",
            "original_key": "G", "time_signature": "4/4", "tempo_bpm": 92,
            "text_source": "Inno latino tradizionale (manoscritto di J. F. Wade, 1751); strofe 2-4 nella versione liturgica corrente.",
            "text_rights": "public_domain",
            "text_rights_note": "Testo e melodia del XVIII secolo, di pubblico dominio. Accordi: armonizzazione semplice per chitarra scritta per Jubilate.",
        },
        "categories": ["natale", "ingresso"],
        "sections": [
            {"key": "v1", "kind": "verse", "label": "Strofa 1", "lines": [
                "A[G]deste fi[D]de[G]les, [D]laeti tri[G]um[C]phan[G]tes,",
                "ve[Em]nite, [D]ve[A]ni[D]te in [A]Bethle[D]hem.",
                "[G]Natum vi[D]dete [G]Regem an[C]gelo[D]rum."]},
            {"key": "c", "kind": "chorus", "label": "Ritornello", "lines": [
                "[G]Venite adoremus, venite ado[D]remus,",
                "[G]venite ado[D]re[Em]mus [C]Do[D]mi[G]num."]},
            {"key": "v2", "kind": "verse", "label": "Strofa 2", "lines": [
                "En [G]grege re[D]lic[G]to, [D]humiles [G]ad [C]cu[G]nas,",
                "vo[Em]cati [D]pa[A]sto[D]res ap[A]prope[D]rant.",
                "[G]Et nos o[D]vanti [G]gradu fe[C]stine[D]mus."]},
            {"key": "v3", "kind": "verse", "label": "Strofa 3", "lines": [
                "Ae[G]terni Pa[D]ren[G]tis [D]splendorem [G]ae[C]ter[G]num",
                "ve[Em]latum [D]sub [A]car[D]ne vi[A]debi[D]mus:",
                "[G]Deum in[D]fantem, [G]pannis in[C]volu[D]tum."]},
            {"key": "v4", "kind": "verse", "label": "Strofa 4", "lines": [
                "Pro [G]nobis e[D]ge[G]num [D]et foeno [G]cu[C]ban[G]tem",
                "[Em]piis [D]fo[A]vea[D]mus am[A]plexi[D]bus:",
                "[G]sic nos a[D]mantem [G]quis non re[C]ama[D]ret?"]},
        ],
        "sequence": ["v1", "c", "v2", "c", "v3", "c", "v4", "c"],
    },
    {
        "meta": {
            "title": "Tu scendi dalle stelle",
            "alt_titles": ["Canzoncina a Gesù Bambino"],
            "author": "Sant'Alfonso Maria de' Liguori (1754)",
            "composer": "Sant'Alfonso Maria de' Liguori (1754)",
            "original_key": "C", "time_signature": "6/8", "tempo_bpm": 56,
            "text_source": "Sant'Alfonso Maria de' Liguori, «Canzoncina a Gesù Bambino» (Nola, 1754); le due strofe più cantate.",
            "text_rights": "public_domain",
            "text_rights_note": "Testo e melodia del 1754, di pubblico dominio. Accordi: armonizzazione semplice per chitarra scritta per Jubilate.",
        },
        "categories": ["natale", "finale"],
        "sections": [
            {"key": "v1", "kind": "verse", "label": "Strofa 1", "lines": [
                "Tu [C]scendi dalle [G7]stelle, o Re del [C]Cielo,",
                "e vieni in una [G7]grotta al freddo e al [C]gelo.",
                "O Bam[F]bino mio di[C]vino,",
                "io ti [G7]vedo qui a tre[C]mar;",
                "o Dio be[F]ato!",
                "Ah, [C]quanto ti co[G7]stò l'avermi a[C]mato!"]},
            {"key": "v2", "kind": "verse", "label": "Strofa 2", "lines": [
                "A [C]te, che sei del [G7]mondo il Crea[C]tore,",
                "mancano panni e [G7]fuoco, o mio Si[C]gnore.",
                "Caro e[F]letto Pargo[C]letto,",
                "quanto [G7]questa pover[C]tà",
                "più m'inna[F]mora,",
                "giac[C]ché ti fece a[G7]mor povero an[C]cora."]},
        ],
        "sequence": ["v1", "v2"],
    },
    {
        "meta": {
            "title": "O sanctissima",
            "alt_titles": ["Inno dei marinai siciliani"],
            "author": "Tradizionale (sec. XVIII)",
            "composer": "Melodia tradizionale siciliana (sec. XVIII)",
            "original_key": "G", "time_signature": "4/4", "tempo_bpm": 80,
            "text_source": "Inno mariano latino tradizionale, pubblicato in Europa alla fine del Settecento.",
            "text_rights": "public_domain",
            "text_rights_note": "Testo e melodia tradizionali del XVIII secolo, di pubblico dominio. Accordi: armonizzazione semplice per chitarra scritta per Jubilate.",
        },
        "categories": ["canti-mariani", "finale"],
        "sections": [
            {"key": "v1", "kind": "verse", "label": "Strofa 1", "lines": [
                "O [G]sanctissima, o [D]pi[G]issima,",
                "[C]dulcis [G]Virgo Ma[D]ri[G]a!",
                "[D]Mater a[G]mata, [D]intemer[G]ata,",
                "[C]ora, [G]ora pro [D]no[G]bis."]},
            {"key": "v2", "kind": "verse", "label": "Strofa 2", "lines": [
                "Tu so[G]latium et [D]re[G]fugium,",
                "[C]Virgo [G]Mater Ma[D]ri[G]a!",
                "[D]Quidquid op[G]tamus, [D]per te spe[G]ramus;",
                "[C]ora, [G]ora pro [D]no[G]bis."]},
            {"key": "v3", "kind": "verse", "label": "Strofa 3", "lines": [
                "Ecce [G]debiles, per[D]quam [G]flebiles:",
                "[C]salva [G]nos, o Ma[D]ri[G]a!",
                "[D]Tolle lan[G]guores, [D]sana do[G]lores;",
                "[C]ora, [G]ora pro [D]no[G]bis."]},
        ],
        "sequence": ["v1", "v2", "v3"],
    },
    {
        "meta": {
            "title": "Salve Regina",
            "alt_titles": ["Antifona mariana"],
            "author": "Attribuito a Ermanno il Contratto (sec. XI)",
            "composer": "Canto gregoriano, tono semplice (modo V)",
            "time_signature": "", "original_key": "", "tempo_bpm": "",
            "text_source": "Antifona mariana della liturgia latina (Liturgia delle Ore, Compieta).",
            "text_rights": "public_domain",
            "text_rights_note": "Testo liturgico latino e melodia gregoriana medievali, di pubblico dominio. Canto gregoriano a ritmo libero: senza accordi né metro.",
        },
        "categories": ["canti-mariani", "finale"],
        "sections": [
            {"key": "a", "kind": "antiphon", "label": "Antifona", "lines": [
                "Salve, Regína, Mater misericórdiæ,",
                "vita, dulcédo et spes nostra, salve.",
                "Ad te clamámus, éxsules fílii Evæ.",
                "Ad te suspirámus geméntes et flentes",
                "in hac lacrimárum valle.",
                "Eia ergo, advocáta nostra,",
                "illos tuos misericórdes óculos ad nos convérte.",
                "Et Iesum, benedíctum fructum ventris tui,",
                "nobis, post hoc exsílium, osténde.",
                "O clemens, o pia, o dulcis Virgo María."]},
        ],
        "sequence": ["a"],
    },
    {
        "meta": {
            "title": "Tantum ergo",
            "alt_titles": ["Pange lingua (strofe 5-6)"],
            "author": "San Tommaso d'Aquino (1264)",
            "composer": "Canto gregoriano (modo III)",
            "time_signature": "", "original_key": "", "tempo_bpm": "",
            "text_source": "Ultime due strofe dell'inno «Pange lingua» per la solennità del Corpus Domini.",
            "text_rights": "public_domain",
            "text_rights_note": "Testo latino del XIII secolo e melodia gregoriana, di pubblico dominio. Canto gregoriano a ritmo libero: senza accordi né metro.",
        },
        "categories": ["adorazione", "comunione"],
        "sections": [
            {"key": "v1", "kind": "verse", "label": "Strofa 1", "lines": [
                "Tantum ergo Sacraméntum",
                "venerémur cérnui:",
                "et antíquum documéntum",
                "novo cedat rítui:",
                "præstet fides suppleméntum",
                "sénsuum deféctui."]},
            {"key": "v2", "kind": "verse", "label": "Strofa 2", "lines": [
                "Genitóri, Genitóque",
                "laus et iubilátio,",
                "salus, honor, virtus quoque",
                "sit et benedíctio:",
                "procedénti ab utróque",
                "compar sit laudátio."]},
            {"key": "fin", "kind": "outro", "label": "Finale", "lines": ["Amen."]},
        ],
        "sequence": ["v1", "v2", "fin"],
    },
]


def sql_literal(s):
    return "$j$" + s + "$j$"


def main():
    print("-- Generated by supabase/content/build_primi_canti.py. Do not edit by hand.")
    print("-- First five public-domain songs, saved as the earliest active administrator")
    print("-- (so revisions have an author). Safe to run more than once.")
    print("do $$")
    print("declare v_admin uuid; v_cats uuid[];")
    print("begin")
    print("  select user_id into v_admin from public.user_roles")
    print("    where role = 'admin' and revoked_at is null order by granted_at limit 1;")
    print("  if v_admin is null then raise exception 'no active administrator'; end if;")
    print("  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);")
    for s in SONGS:
        meta = dict(s["meta"], status="published")
        body = content(meta.get("original_key") or None, s["sections"], s["sequence"])
        cats = ", ".join("'" + c + "'" for c in s["categories"])
        print(f"  -- {meta['title']}")
        print(f"  if not exists (select 1 from public.songs where title = {sql_literal(meta['title'])} and deleted_at is null) then")
        print(f"    select array_agg(id) into v_cats from public.song_categories where slug in ({cats});")
        print(f"    perform public.admin_save_song(null, {sql_literal(json.dumps(meta, ensure_ascii=False))}::jsonb,")
        print(f"      {sql_literal(json.dumps(body, ensure_ascii=False))}::jsonb, 'Primo inserimento', v_cats);")
        print("  end if;")
    print("end $$;")


if __name__ == "__main__":
    main()
