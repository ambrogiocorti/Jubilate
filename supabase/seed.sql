-- =============================================================================
-- Jubilate — demo seed (DEVELOPMENT ONLY; never applied to production).
--
-- Contents are either PUBLIC DOMAIN (traditional Latin liturgical texts) or
-- ORIGINAL texts written for testing ("Canto dimostrativo"). No text from the
-- parish booklet is included: the booklet has not been provided yet.
-- Chords are given only for the original demo songs, whose harmony is part of
-- the demo itself; public-domain texts are seeded text-only.
-- =============================================================================

do $$
declare v_song uuid; v_cat uuid;
begin
  -- 1. Original demo song with chords --------------------------------------
  insert into public.songs (number, title, alt_titles, author, composer, original_key, time_signature, tempo_bpm,
                            status, text_source, text_rights, text_rights_note)
  values (901, 'Luce del mattino', array['Canto dimostrativo 1'], 'Testo dimostrativo Jubilate', 'Musica dimostrativa Jubilate',
          'G', '4/4', 84, 'published', 'Contenuto originale creato per i test di Jubilate', 'own_work',
          'Testo e accordi dimostrativi, non provengono dal libretto parrocchiale.')
  returning id into v_song;
  perform private.create_revision(v_song, $json${
  "key": "G",
  "sections": [
    {
      "key": "v1",
      "kind": "verse",
      "label": "Strofa 1",
      "lines": [
        "Sorge la luce sopra il colle,",
        "canta la valle il suo stupore;",
        "apri le mani, apri il cuore:",
        "nasce un giorno nuovo per noi."
      ]
    },
    {
      "key": "c",
      "kind": "chorus",
      "label": "Ritornello",
      "lines": [
        "Luce del mattino, guida i nostri passi,",
        "resta accanto a noi lungo la via."
      ]
    },
    {
      "key": "v2",
      "kind": "verse",
      "label": "Strofa 2",
      "lines": [
        "Pane spezzato sulla mensa,",
        "acqua che scorre e dona vita;",
        "ogni fratello è una salita",
        "che ci avvicina un poco al ciel."
      ]
    },
    {
      "key": "v3",
      "kind": "verse",
      "label": "Strofa 3",
      "lines": [
        "Quando la sera scende piano",
        "e la fatica pesa ancora,",
        "tu sei la voce che rincuora,",
        "tu sei la mano che ci tien."
      ]
    }
  ],
  "sequence": [
    "v1",
    "c",
    "v2",
    "c",
    "v3",
    "c"
  ],
  "chords": [
    {"section": "v1", "line": 0, "offset": 0, "chord": "G"},
    {"section": "v1", "line": 0, "offset": 14, "chord": "D/F#"},
    {"section": "v1", "line": 0, "offset": 23, "chord": "Em"},
    {"section": "v1", "line": 1, "offset": 0, "chord": "C"},
    {"section": "v1", "line": 1, "offset": 18, "chord": "G"},
    {"section": "v1", "line": 1, "offset": 25, "chord": "Am7"},
    {"section": "v1", "line": 1, "offset": 27, "chord": "D"},
    {"section": "v1", "line": 2, "offset": 0, "chord": "Em"},
    {"section": "v1", "line": 2, "offset": 14, "chord": "Bm"},
    {"section": "v1", "line": 2, "offset": 22, "chord": "C"},
    {"section": "v1", "line": 3, "offset": 0, "chord": "Am"},
    {"section": "v1", "line": 3, "offset": 9, "chord": "Dsus4"},
    {"section": "v1", "line": 3, "offset": 22, "chord": "D"},
    {"section": "v1", "line": 3, "offset": 26, "chord": "G"},
    {"section": "c", "line": 0, "offset": 0, "chord": "C"},
    {"section": "c", "line": 0, "offset": 9, "chord": "D"},
    {"section": "c", "line": 0, "offset": 18, "chord": "Bm7"},
    {"section": "c", "line": 0, "offset": 26, "chord": "Em"},
    {"section": "c", "line": 0, "offset": 33, "chord": "Am7"},
    {"section": "c", "line": 1, "offset": 0, "chord": "C"},
    {"section": "c", "line": 1, "offset": 16, "chord": "D7"},
    {"section": "c", "line": 1, "offset": 29, "chord": "Gsus4"},
    {"section": "c", "line": 1, "offset": 31, "chord": "G"},
    {"section": "v2", "line": 0, "offset": 0, "chord": "G"},
    {"section": "v2", "line": 0, "offset": 14, "chord": "D/F#"},
    {"section": "v2", "line": 1, "offset": 0, "chord": "C"},
    {"section": "v2", "line": 1, "offset": 19, "chord": "D"},
    {"section": "v2", "line": 2, "offset": 0, "chord": "Em"},
    {"section": "v2", "line": 2, "offset": 16, "chord": "C"},
    {"section": "v2", "line": 3, "offset": 0, "chord": "Am"},
    {"section": "v2", "line": 3, "offset": 19, "chord": "D"},
    {"section": "v2", "line": 3, "offset": 27, "chord": "G"},
    {"section": "v3", "line": 0, "offset": 0, "chord": "G"},
    {"section": "v3", "line": 0, "offset": 15, "chord": "D/F#"},
    {"section": "v3", "line": 1, "offset": 0, "chord": "C"},
    {"section": "v3", "line": 1, "offset": 12, "chord": "D"},
    {"section": "v3", "line": 2, "offset": 0, "chord": "Em"},
    {"section": "v3", "line": 2, "offset": 15, "chord": "C"},
    {"section": "v3", "line": 3, "offset": 0, "chord": "Am"},
    {"section": "v3", "line": 3, "offset": 15, "chord": "D"},
    {"section": "v3", "line": 3, "offset": 22, "chord": "G"}
  ]
}$json$::jsonb, 'Inserimento dimostrativo');
  insert into public.song_category_links (song_id, category_id)
  select v_song, id from public.song_categories where slug in ('ingresso', 'tempo-ordinario', 'animazione-oratorio');

  -- 2. Original demo song (minor key, slash chords, bridge) -----------------
  insert into public.songs (number, title, author, composer, original_key, time_signature, tempo_bpm,
                            status, text_source, text_rights, text_rights_note)
  values (902, 'Resta con noi, Signore', 'Testo dimostrativo Jubilate', 'Musica dimostrativa Jubilate',
          'Dm', '3/4', 72, 'published', 'Contenuto originale creato per i test di Jubilate', 'own_work',
          'Testo e accordi dimostrativi.')
  returning id into v_song;
  perform private.create_revision(v_song, $json${
  "key": "Dm",
  "sections": [
    {
      "key": "r",
      "kind": "refrain",
      "label": "Ritornello",
      "lines": [
        "Resta con noi, Signore, si fa sera,",
        "resta con noi e spezza il pane ancora."
      ]
    },
    {
      "key": "v1",
      "kind": "verse",
      "label": "Strofa 1",
      "lines": [
        "Lungo la strada il cuore ci ardeva,",
        "parola viva che scalda e consola."
      ]
    },
    {
      "key": "v2",
      "kind": "verse",
      "label": "Strofa 2",
      "lines": [
        "Nei nostri occhi stanchi la tua luce,",
        "nelle tue mani il segno dell'amore."
      ]
    },
    {
      "key": "b",
      "kind": "bridge",
      "label": "Ponte",
      "lines": [
        "Alleluia, alleluia."
      ]
    }
  ],
  "sequence": [
    "r",
    "v1",
    "r",
    "v2",
    "r",
    "b",
    "r"
  ],
  "chords": [
    {"section": "r", "line": 0, "offset": 0, "chord": "Dm"},
    {"section": "r", "line": 0, "offset": 15, "chord": "Bb"},
    {"section": "r", "line": 0, "offset": 27, "chord": "C"},
    {"section": "r", "line": 0, "offset": 30, "chord": "F"},
    {"section": "r", "line": 1, "offset": 0, "chord": "Gm"},
    {"section": "r", "line": 1, "offset": 16, "chord": "A7sus4"},
    {"section": "r", "line": 1, "offset": 26, "chord": "A7"},
    {"section": "r", "line": 1, "offset": 33, "chord": "Dm"},
    {"section": "v1", "line": 0, "offset": 0, "chord": "F"},
    {"section": "v1", "line": 0, "offset": 19, "chord": "C/E"},
    {"section": "v1", "line": 0, "offset": 28, "chord": "Dm"},
    {"section": "v1", "line": 1, "offset": 0, "chord": "Bb"},
    {"section": "v1", "line": 1, "offset": 16, "chord": "Gm7"},
    {"section": "v1", "line": 1, "offset": 28, "chord": "A"},
    {"section": "v2", "line": 0, "offset": 0, "chord": "F"},
    {"section": "v2", "line": 0, "offset": 17, "chord": "C/E"},
    {"section": "v2", "line": 0, "offset": 32, "chord": "Dm"},
    {"section": "v2", "line": 1, "offset": 0, "chord": "Bb"},
    {"section": "v2", "line": 1, "offset": 18, "chord": "Gm7"},
    {"section": "v2", "line": 1, "offset": 30, "chord": "A"},
    {"section": "b", "line": 0, "offset": 0, "chord": "Bbmaj7"},
    {"section": "b", "line": 0, "offset": 10, "chord": "C"},
    {"section": "b", "line": 0, "offset": 14, "chord": "Dm"}
  ]
}$json$::jsonb, 'Inserimento dimostrativo');
  insert into public.song_category_links (song_id, category_id)
  select v_song, id from public.song_categories where slug in ('comunione', 'pasqua');

  -- 3. Public-domain Latin texts (text only) --------------------------------
  insert into public.songs (number, title, alt_titles, author, status, text_source, text_rights)
  values (903, 'Salve Regina', array['Antifona mariana'], 'Tradizionale (sec. XI)', 'published',
          'Testo liturgico latino tradizionale', 'public_domain')
  returning id into v_song;
  perform private.create_revision(v_song, $json${
    "sections": [{"key": "a", "kind": "antiphon", "label": "Antifona", "lines": [
      "Salve, Regína, Mater misericórdiæ,",
      "vita, dulcédo et spes nostra, salve.",
      "Ad te clamámus, éxsules fílii Evæ.",
      "Ad te suspirámus geméntes et flentes",
      "in hac lacrimárum valle.",
      "Eia ergo, advocáta nostra,",
      "illos tuos misericórdes óculos ad nos convérte.",
      "Et Iesum, benedíctum fructum ventris tui,",
      "nobis, post hoc exsílium, osténde.",
      "O clemens, o pia, o dulcis Virgo María."]}],
    "sequence": ["a"]}$json$::jsonb, 'Testo di pubblico dominio');
  insert into public.song_category_links (song_id, category_id)
  select v_song, id from public.song_categories where slug in ('canti-mariani', 'finale');

  insert into public.songs (number, title, alt_titles, author, status, text_source, text_rights)
  values (904, 'Adeste fideles', array['Venite fedeli'], 'Attribuito a J. F. Wade (sec. XVIII)', 'published',
          'Testo latino tradizionale', 'public_domain')
  returning id into v_song;
  perform private.create_revision(v_song, $json${
    "sections": [
      {"key": "v1", "kind": "verse", "label": "Strofa 1", "lines": [
        "Adeste fideles, laeti triumphantes,",
        "venite, venite in Bethlehem.",
        "Natum videte Regem angelorum."]},
      {"key": "c", "kind": "chorus", "label": "Ritornello", "lines": [
        "Venite adoremus, venite adoremus,",
        "venite adoremus Dominum."]},
      {"key": "v2", "kind": "verse", "label": "Strofa 2", "lines": [
        "En grege relicto, humiles ad cunas",
        "vocati pastores approperant.",
        "Et nos ovanti gradu festinemus."]},
      {"key": "v3", "kind": "verse", "label": "Strofa 3", "lines": [
        "Aeterni Parentis splendorem aeternum",
        "velatum sub carne videbimus:",
        "Deum infantem, pannis involutum."]}
    ],
    "sequence": ["v1", "c", "v2", "c", "v3", "c"]}$json$::jsonb, 'Testo di pubblico dominio');
  insert into public.song_category_links (song_id, category_id)
  select v_song, id from public.song_categories where slug in ('natale', 'ingresso');

  insert into public.songs (number, title, author, status, text_source, text_rights)
  values (905, 'Veni Creator Spiritus', 'Attribuito a Rabano Mauro (sec. IX)', 'published',
          'Inno latino tradizionale', 'public_domain')
  returning id into v_song;
  perform private.create_revision(v_song, $json${
    "sections": [
      {"key": "v1", "kind": "verse", "label": "Strofa 1", "lines": [
        "Veni, creátor Spíritus,", "mentes tuórum vísita,", "imple supérna grátia,", "quæ tu creásti péctora."]},
      {"key": "v2", "kind": "verse", "label": "Strofa 2", "lines": [
        "Qui díceris Paráclitus,", "altíssimi donum Dei,", "fons vivus, ignis, cáritas,", "et spiritális únctio."]},
      {"key": "v3", "kind": "verse", "label": "Strofa 3", "lines": [
        "Tu septifórmis múnere,", "dígitus patérnæ déxteræ,", "tu rite promíssum Patris,", "sermóne ditans gúttura."]},
      {"key": "fin", "kind": "outro", "label": "Finale", "lines": ["Amen."]}
    ],
    "sequence": ["v1", "v2", "v3", "fin"]}$json$::jsonb, 'Testo di pubblico dominio');
  insert into public.song_category_links (song_id, category_id)
  select v_song, id from public.song_categories where slug in ('altre-celebrazioni', 'ingresso');

  -- 4. A draft (not visible to visitors) -------------------------------------
  insert into public.songs (number, title, status, text_source, text_rights)
  values (906, 'Bozza dimostrativa', 'draft', 'Contenuto originale per i test', 'own_work')
  returning id into v_song;
  perform private.create_revision(v_song, $json${
    "sections": [{"key": "v1", "kind": "verse", "lines": ["Questa è una bozza non pubblicata."]}],
    "sequence": ["v1"]}$json$::jsonb, 'Bozza');
end $$;
