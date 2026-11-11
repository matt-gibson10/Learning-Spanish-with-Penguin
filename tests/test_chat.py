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


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
