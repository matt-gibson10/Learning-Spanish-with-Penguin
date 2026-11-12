"""Pure-function tests for server/chat.py (no model needed).
Run:  .venv\\Scripts\\python.exe -m pytest tests/test_chat.py   (or: .venv\\Scripts\\python.exe tests\\test_chat.py)"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server.chat import (align_pieces, make_correction, make_tip, mexicanize, peninsular,  # noqa: E402
                         pieces_ok, split_piece)

ES = "Quiero ir a la playa mañana, pero no sé cómo llegar."
RAW = ["Quiero = I want", "ir = to go", "a la playa = to the beach", "mañana = tomorrow", "pero = but",
       "no sé = I don't know", "cómo llegar = how to get there"]


def test_split_piece():
    assert split_piece("a la playa = to the beach") == ("a la playa", "to the beach")
    assert split_piece({"es": "Hola", "en": "hi"}) == ("Hola", "hi")
    assert split_piece("no equals sign") is None
    assert split_piece(" = nothing") is None


def test_align_exact_keeps_punctuation_from_es():
    p = align_pieces(ES, RAW)
    assert [x["es"] for x in p] == ["Quiero", "ir", "a la playa", "mañana,", "pero", "no sé", "cómo llegar."]
    assert p[1]["en"] == "to go"
    assert pieces_ok(ES, p)


def test_align_ignores_case_accents_and_opening_marks():
    es = "¿Dónde está el baño?"
    p = align_pieces(es, ["donde esta = where is", "el bano = the bathroom"])
    assert [x["es"] for x in p] == ["¿Dónde está", "el baño?"]
    p = align_pieces("¡Qué rico!", ["¡ = !", "qué rico = how tasty"])     # a punctuation-only piece
    assert pieces_ok("¡Qué rico!", p)


def test_align_repairs_a_missing_short_word():
    es = "Quiero ir a la playa."
    p = align_pieces(es, ["Quiero = I want", "ir = to go", "la playa = the beach"])     # "a" left out
    assert pieces_ok(es, p)
    assert [x["es"] for x in p] == ["Quiero", "ir a", "la playa."]


def test_align_repairs_an_extra_word_and_a_spelling_slip():
    es = "Tengo mucha hambre."
    assert pieces_ok(es, align_pieces(es, ["Tengo = I have", "mucha mucha = a lot of", "hambre = hunger"]))
    assert pieces_ok(es, align_pieces(es, ["Tengo = I have", "mucho hambre = a lot of hunger"]))


def test_align_rejects_wrong_pieces():
    assert align_pieces(ES, ["Quiero = I want", "ir = to go"]) == []                 # most words missing
    assert align_pieces("Quiero ir a la playa.", ["Quiero = I want", "playa = beach"]) == []
    assert align_pieces("Me gusta el mar.", ["el mar = the sea", "Me gusta = I like"]) == []     # wrong order
    assert align_pieces("Me gusta el mar.", ["Me gusta = I like", "el mar = "]) == []           # no English
    assert align_pieces("", RAW) == [] and align_pieces(ES, []) == []
    assert not pieces_ok(ES, [])


def test_peninsular_and_mexicanize():
    assert peninsular("¿Vosotros tenéis coche?") == ["vosotros", "tenéis", "coche"]
    assert peninsular("Vale, nos vemos.") == ["vale"]
    assert peninsular("No vale la pena. Mi país es bonito y tengo carro.") == []
    assert mexicanize("Mi coche y el móvil") == "Mi carro y el celular"
    assert mexicanize("Uso el ordenador") == "Uso la computadora"
    assert mexicanize("Coche nuevo") == "Carro nuevo"


def test_tips_fire_only_when_true():
    t = make_tip("I'm hungry.", "Tengo hambre.", [])
    assert "tener" in t and "hunger" in t
    assert "age" in make_tip("I'm 32 years old.", "Tengo 32 años.", []).lower()
    assert "gustan" in make_tip("I like tacos.", "Me gustan los tacos.", [])
    assert "embarazada" in make_tip("I'm embarrassed.", "Me da pena.", [])
    assert "hacer" in make_tip("It's really hot today.", "Hace mucho calor hoy.", [])
    assert "before the verb" in make_tip("I miss you.", "Te extraño.", [{"es": "Te extraño.", "en": "I miss you"}])
    assert "estar" in make_tip("I'm tired.", "Estoy cansado.", [])
    p = [{"es": "Quiero", "en": "I want"}, {"es": "un café.", "en": "a coffee"}]
    assert make_tip("I want a coffee.", "Quiero un café.", p) == "No 'yo' needed: 'Quiero' already means 'I want'."
    # no rule -> no tip; and no tip when the Spanish does not contain the pattern
    assert make_tip("Thanks a lot.", "Muchas gracias.", []) == ""
    assert make_tip("I'm hungry.", "Quiero comer.", []) == "" or "hunger" not in make_tip("I'm hungry.", "Quiero comer.", [])
    assert make_tip("I'm tired.", "Estoy caminando.", []) == ""          # progressive is not the estar tip
    assert make_tip("It's a little expensive.", "Es un poco caro.", []) == ""


def test_correction_filters_still_hold():
    assert make_correction("me gusta los tacos", "me gustan los tacos", "Plural.")["fixed"] == "me gustan los tacos"
    assert make_correction("¿Dónde está el baño?", "¿dónde está el baño?", "") is None         # case only
    assert make_correction("quiero ir to the beach", "", "") is None
    assert make_correction("yo como aguachile", "yo como aguacate", "x") is None               # word swap


def test_idiom_guards_and_language_precheck():
    from server.chat import idiom_problems, maybe_spanish
    assert idiom_problems("I'm hot.", "I'm hot.", "Hace calor.")            # literal weather -> retry hint
    assert not idiom_problems("I'm hot.", "I'm hot.", "Tengo calor.")
    assert not idiom_problems("It's hot today.", "It's hot today.", "Hace calor hoy.")
    assert idiom_problems("I'm embarrassed", "I'm embarrassed", "Estoy embarazada.")
    assert idiom_problems("I'm 32 years old", "", "Soy 32 años.")
    assert maybe_spanish("yo soy cansado") and maybe_spanish("quiero ir to the beach mañana")
    assert not maybe_spanish("I'm hot.") and not maybe_spanish("I like tacos")


def test_claude_path_shape(monkeypatch=None):
    import server.chat as C
    fake = {"input_language": "spanish", "meaning_en": "I like tacos.", "spanish": "Me gustan los tacos.",
            "pieces": ["Me gustan = I like", "los tacos = tacos"], "learner_fixed": "me gustan los tacos",
            "why_en": "Tacos is plural, so 'gustan'.", "tip": ""}
    orig = C._claude_json
    C._claude_json = lambda *a, **k: fake
    try:
        out = C.translate_claude("me gusta los tacos")
    finally:
        C._claude_json = orig
    assert out["es"] == "Me gustan los tacos." and out["input_lang"] == "es"
    assert [p["es"] for p in out["pieces"]] == ["Me gustan", "los tacos."]
    assert out["correction"]["fixed"] == "me gustan los tacos"
    assert "gustan" in out["tip"]                                   # empty Claude tip -> rule-based tip


def test_route_validation_and_shape():
    import json
    import server.chat as C
    # the route function directly (fastapi's TestClient needs httpx, which the venv does not have)
    assert C.translate(C.TranslateIn(text="x" * 301)).status_code == 422
    assert C.translate(C.TranslateIn(text="   ")).status_code == 422
    assert "error" in json.loads(C.translate(C.TranslateIn(text="")).body)
    orig, inst = C.translate_local, C.LOCAL.installed
    C.translate_local = lambda text: C.finish_translation(text, {
        "input_lang": "en", "en": "I'm hungry.", "es": "Tengo hambre.",
        "raw_pieces": ["Tengo hambre = I'm hungry"]}, None)
    C.LOCAL.installed = lambda: True
    try:
        r = C.translate(C.TranslateIn(text="I'm hungry.", backend="local"))
    finally:
        C.translate_local, C.LOCAL.installed = orig, inst
    assert set(r) == {"input_lang", "en", "es", "pieces", "tip", "correction", "backend", "ms"}
    assert r["pieces"] == [{"es": "Tengo hambre.", "en": "I'm hungry"}] and r["backend"] == "local"


def test_translate_server_checks():
    from server.chat import detect_input_lang, fix_gusta_plural, idiom_problems, keep_words_problems
    assert fix_gusta_plural("No me gusta los lugares con mucha gente.") == "No me gustan los lugares con mucha gente."
    assert fix_gusta_plural("Me gusta mucho las playas.") == "Me gustan mucho las playas."
    assert fix_gusta_plural("Me gusta la playa.") == "Me gusta la playa."
    assert detect_input_lang("me gusta los tacos", "en") == "es"
    assert detect_input_lang("yo quiero un cerveza por favor", "en") == "es"
    assert detect_input_lang("dónde está the bathroom?", "es") == "mixed"
    assert detect_input_lang("I'm hungry", "en") == "en"
    assert keep_words_problems("yo soy cansado", "Yo tengo sueño.")
    assert not keep_words_problems("yo soy cansado", "Estoy cansado.")
    assert idiom_problems('How do you say "spoon" in Spanish?', "", "¿Cómo se dice cuchara?")
    assert not idiom_problems('How do you say "spoon" in Spanish?', "", "¿Cómo se dice 'spoon' en español?")
    assert idiom_problems("Last night I slept badly", "", "Ayer dormí mal.")
    # the estar tip must not fire on '¿Dónde está el baño?' ('está el' is not a state)
    assert make_tip("Where is the bathroom?", "¿Dónde está el baño?", []) == ""


# ------------------------------------------------------------------ chat evaluation fixes (docs/CHAT_EVAL.md)
def test_detect_intent():
    from server.chat import detect_intent
    assert detect_intent("no entiendo") == ("no_entiendo", "")
    assert detect_intent("Más despacio, por favor")[0] == "no_entiendo"
    assert detect_intent("¿mande?")[0] == "no_entiendo"
    assert detect_intent("¿cómo se dice 'towel' en español?") == ("como_se_dice", "'towel'")
    assert detect_intent("how do you say luggage?") == ("como_se_dice", "luggage")
    assert detect_intent("¿Qué significa descansar?") == ("que_significa", "descansar")
    assert detect_intent("what does aguachile mean?") == ("que_significa", "aguachile")
    assert detect_intent("¿y tú?")[0] == "y_tu"
    assert detect_intent("¿Te acuerdas de cómo se llama mi perro?")[0] == "remember"
    assert detect_intent("Me gusta mucho la playa.")[0] is None
    assert detect_intent("no entiendo por qué el agua es fría")[0] is None   # a real sentence, not a help request


def test_repetition_and_reminder():
    from server.chat import asked_questions, next_subtopic, reminder, repeated_question
    hist = [{"role": "bot", "text": "¡Hola! ¿Te gusta la playa?"}, {"role": "user", "text": "Sí."},
            {"role": "bot", "text": "¡Qué bueno! ¿Y tú, qué haces en tu tiempo libre?"},
            {"role": "user", "text": "Leo libros."}]
    assert asked_questions(hist) == ["¿Te gusta la playa?", "¿Y tú, qué haces en tu tiempo libre?"]
    assert repeated_question("Muy bien. ¿Qué haces en tu tiempo libre?", hist)
    assert repeated_question("¡Órale! ¿Te gusta la playa?", hist)
    assert not repeated_question("¿Prefieres el mar o la alberca?", hist)
    from server.chat import same_question_stem
    h2 = [{"role": "bot", "text": "¿Te gustaría saber qué equipo es fuerte?"}, {"role": "user", "text": "sí"},
          {"role": "bot", "text": "¡Órale! ¿Te gustaría saber cuál es el clásico?"}, {"role": "user", "text": "sí"}]
    assert same_question_stem("Bueno. ¿Te gustaría saber qué significa la máscara?", h2) == "te gustaria saber"
    assert same_question_stem("¿Vas al estadio?", h2) == ""
    topic = {"subtopics": ["las tortugas", "el atardecer"], "title": "La playa"}
    assert next_subtopic(topic, hist) in topic["subtopics"]
    r = reminder(topic, 1, hist)
    assert "You already asked" in r and '"' not in r
    r = reminder(topic, 1, hist + [{"role": "bot", "text": "¿Vas a nadar?"}, {"role": "user", "text": "no entiendo"}])
    assert "did not understand" in r and '"' not in r
    r = reminder(topic, 1, [{"role": "user", "text": 'how do you say "towel"?'}])
    assert "towel" in r and '"' not in r
    mem = [{"role": "user", "text": "Tengo un perro que se llama Bruno."}, {"role": "bot", "text": "¡Qué padre!"},
           {"role": "user", "text": "¿Te acuerdas cómo se llama mi perro?"}]
    assert "Bruno" in reminder(topic, 2, mem)


def test_history_window_trims_in_blocks():
    from server.chat import MAX_TURNS, TRIM_BLOCK, _window
    h = list(range(MAX_TURNS))
    assert _window(h) == h
    assert _window(list(range(MAX_TURNS + 1))) == list(range(TRIM_BLOCK, MAX_TURNS + 1))
    # the start of the window stays the same while the conversation grows within one block
    starts = {_window(list(range(n)))[0] for n in range(MAX_TURNS + 1, MAX_TURNS + TRIM_BLOCK + 1)}
    assert starts == {TRIM_BLOCK}


def test_banned_forms_voseo_and_spain():
    from server.chat import banned_forms
    assert banned_forms("¡Interesante! ¿Jugás con amigos o en un equipo?") == ["Jugás"]
    assert "llamás" in banned_forms("¿Cómo te llamás y de dónde eres?")
    assert set(banned_forms("¿Vosotros tenéis coche? Vale, os veo.")) >= {"Vosotros", "tenéis", "os", "Vale"}
    assert banned_forms("Nadé en la piscina.") == ["piscina"]
    assert banned_forms("¿Cómo estás? Además, mi país es bonito. ¿Irás a la playa después? ¿Cuánto vale?") == []
    assert banned_forms("Quiero un jugo y rentar un carro ahorita.") == []


def test_level_checks():
    from server.chat import level_problems
    assert level_problems("¡Qué bueno! ¿Te gustaría ir a la playa?", 1)
    assert level_problems("Mañana visitarás Mazunte. ¿Quieres?", 1)
    assert not level_problems("¡Qué bueno! ¿Quieres ir a la playa?", 1)
    assert level_problems("¿Has visto un partido en el Estadio Azteca?", 1)
    from server.chat import fix_reactions, present_tense_l1
    o = fix_reactions({"reply_es": "¡Felicidades! Llevo bloqueador.", "reply_en": "Congratulations! I bring sunscreen."}, "sí")
    assert o["reply_es"] == "¡Qué bueno! Llevo bloqueador." and o["reply_en"] == "Great! I bring sunscreen."
    assert fix_reactions({"reply_es": "¡Felicidades!", "reply_en": "x"}, "Hoy es mi cumpleaños")["reply_es"] == "¡Felicidades!"
    o = present_tense_l1({"reply_es": "¡Órale! ¿Te gustaría verlas?", "reply_en": "Great! Would you like to see them?"})
    assert o["reply_es"] == "¡Órale! ¿Quieres verlas?" and o["reply_en"] == "Great! Do you want to see them?"
    assert not level_problems("¿Te gustaría ir a la playa mañana?", 2)
    long = "Hoy en la playa de Puerto Escondido hay muchas olas muy grandes y mucha gente bonita."
    assert level_problems(long, 1) and not level_problems(long, 3)


def test_suggestion_filter():
    from server.chat import fix_suggestion, suggestion_ok
    for bad in ["Prefiero el agu", "Sí, me gusta el agu-than.", "Speakers juntos.", "¿Vosotros vais?", "Jugás mucho."]:
        assert not suggestion_ok(bad), bad
    for good in ["Sí, quiero ir allí.", "No, prefiero otra playa", "Veo Netflix en casa.", "Me gusta el sol"]:
        assert suggestion_ok(good), good
    assert fix_suggestion("Sí, me gusta mucho", "¡Ah, mira! ¿Te gustan los elotes?") == "Sí, me gustan mucho."
    assert fix_suggestion("Sí, me gusta", "¿Te gusta el mar?") == "Sí, me gusta."


def test_reply_en_check():
    from server.chat import reply_en_ok
    assert reply_en_ok({"reply_es": "Claro. ¿Quieres ir?", "reply_en": "Sure. Do you want to go?"})
    assert not reply_en_ok({"reply_es": "Claro. ¿Quieres ir?", "reply_en": "Claro. ¿Quieres ir?"})
    assert not reply_en_ok({"reply_es": "Toalla se dice toalla.", "reply_en": "Towel se dice 'toalla'. ¿Quieres una toalla?"})


def test_correction_v2_protects_mexican_words_and_drops_inventions():
    assert make_correction("ahorita tengo mucha sed", "ahora tengo mucha sed", "Use ahora.") is None
    assert make_correction("quiero rentar un carro", "quiero alquilar un coche", "") is None
    assert make_correction("oy ase mucho calor", "oyen mucho calor", "Use oyen.") is None
    assert make_correction("yo tambien estoy feliz, gracias", "también estoy feliz", "Placement.") is None
    assert make_correction("me gusta la playa", "me gusta la playa.", "This is correct.") is None
    assert make_correction("la playa bonita", "la playa bonita", "The sentence is correct.") is None
    assert make_correction("¿cómo se dice towel?", "¿cómo se dice toalla?", "") is None       # help request
    assert make_correction("yo juego fútbol", "vos jugás fútbol", "") is None                  # banned form
    # seen live: a "fix" that breaks agreement with a noun the lexicon knows (sed is feminine)
    assert make_correction("ahorita tengo mucha sed", "ahorita tengo mucho sed", "Use mucho with nouns.") is None
    assert make_correction("quiero una agua", "quiero un agua", "")                       # el/un agua is right
    assert make_correction("¿Vosotros vais a la playa mucho?", "¿Yo voy a la playa mucho?", "") is None
    assert make_correction("¿Vosotros vais a la playa mucho?", "¿Ustedes van a la playa mucho?", "")
    assert make_correction("Mi equipo favorito son los Canucks de Vancouver",
                           "Mi equipo favorito es los Canucks de Vancouver", "Use es for singular equipo.") is None
    # kept now (dropped before): new words that are inflections or false-friend fixes
    for a, b in [("cuando era niño jugué futbol", "cuando era niño jugaba futbol"),
                 ("mucho gracias", "muchas gracias"), ("estoy embarazado", "estoy avergonzado")]:
        assert make_correction(a, b, ""), a


def test_why_en_is_kept_only_when_true():
    c = make_correction("me gusta las olas", "me gustan las olas", "Olas is plural, so it is me gustan.")
    assert c["why_en"] == "Olas is plural, so it is me gustan."
    c = make_correction("la casa es bonito", "la casa es bonita", "Casa is feminine, so the adjective is bonita.")
    assert c["why_en"].startswith("Casa is feminine")
    # false reasons are replaced by a neutral line built from the change
    c = make_correction("visité mi abuela", "visité a mi abuela", "Add 'a' before 'mi abuela' because it's feminine.")
    assert c["why_en"] == "Small fix: visité → visité a."
    c = make_correction("ayer yo voy al mercado", "ayer yo fui al mercado", "With 'mañana' use the future tense.")
    assert c["why_en"] == "Small fix: voy → fui."
    c = make_correction("la mar es bonito", "el mar es bonito", "Mar is feminine.")          # lexicon: el mar
    assert c["why_en"] == "la → el: mar is masculine."
    c = make_correction("las flores es muy bonito", "las flores son muy bonitas", "Favorite is feminine.")
    assert c["why_en"].startswith("Small fix: es → son")
    # seen live: the prompt's example copied, and a false 'plural' for un -> una
    c = make_correction("me gusta los tacos", "me gustan los tacos", "Olas is plural, so it is me gustan.")
    assert c["why_en"] == "Small fix: gusta → gustan."
    c = make_correction("cuando era niño, jugué béisbol", "cuando era niño, jugaba béisbol",
                        "With 'cuando era niño' use the past simple: jugaba.")
    assert c["why_en"] == "Small fix: jugué → jugaba."
    c = make_correction("yo quiero un cerveza", "yo quiero una cerveza", "Cerveza is feminine and plural here.")
    assert c["why_en"] == "un → una: cerveza is feminine."


def test_regression_61_beginner_errors():
    """The evaluation's scripted beginner errors (docs/CHAT_EVAL.md §4f) with their right fixes: the filter must
    keep every one (it kept 53 of 68 ideal fixes before the rework)."""
    import json
    cases = json.loads((Path(__file__).parent / "fixtures" / "chat_errors.json").read_text(encoding="utf-8"))
    dropped = [c["learner"] for c in cases if not make_correction(c["learner"], c["fixed"], "")]
    assert len(cases) >= 60 and not dropped, dropped


def test_topics_have_facts_and_about():
    from server.chat import build_system, topics
    t = topics()
    assert len(t) >= 10
    for tid, topic in t.items():
        assert topic.get("about_es", "").startswith("de"), tid
        s = build_system(topic, 1)
        assert '"' not in s.split("JSON FIELDS")[0].split("RULES")[1], tid      # no double quotes in the rules
        if topic.get("facts_es"):
            assert "TRUE FACTS" in s
    assert "Nayarit" in " ".join(t["ch_playa"]["facts_es"])


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
