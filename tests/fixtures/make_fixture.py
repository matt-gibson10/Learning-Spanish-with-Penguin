"""Writes a small, schema-correct sample of content/*.json into tests/fixtures/content/ (used to develop and
test scripts/build_course.py and the app before the real content lands).

    python tests/fixtures/make_fixture.py
    python scripts/build_course.py --content tests/fixtures/content
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parent / "content"


def reg(stem, kind, irregular=False, **over):
    end = {"ar": ("o", "as", "a", "amos", "an"), "er": ("o", "es", "e", "emos", "en"), "ir": ("o", "es", "e", "imos", "en")}[kind]
    pret = {"ar": ("é", "aste", "ó", "amos", "aron"), "er": ("í", "iste", "ió", "imos", "ieron"), "ir": ("í", "iste", "ió", "imos", "ieron")}[kind]
    imp = {"ar": ("aba", "abas", "aba", "ábamos", "aban"), "er": ("ía", "ías", "ía", "íamos", "ían"), "ir": ("ía", "ías", "ía", "íamos", "ían")}[kind]
    subj = {"ar": ("e", "es", "e", "emos", "en"), "er": ("a", "as", "a", "amos", "an"), "ir": ("a", "as", "a", "amos", "an")}[kind]
    inf = stem + kind
    c = {
        "pres": [stem + e for e in end], "pret": [stem + e for e in pret], "imp": [stem + e for e in imp],
        "fut": [inf + e for e in ("é", "ás", "á", "emos", "án")], "subj": [stem + e for e in subj],
        "cmd": {"tu": stem + end[2], "usted": stem + subj[2]},
        "ger": stem + ("ando" if kind == "ar" else "iendo"), "part": stem + ("ado" if kind == "ar" else "ido"),
        "irregular": irregular, "reflexive": False,
    }
    c.update(over)
    return c


def irr(pres, pret, imp, fut, subj, tu, usted, ger, part):
    return dict(pres=pres.split(), pret=pret.split(), imp=imp.split(), fut=fut.split(), subj=subj.split(),
                cmd={"tu": tu, "usted": usted}, ger=ger, part=part, irregular=True, reflexive=False)


N = lambda i, es, en, rank, topic, g, art, pl, exs, exe, **kw: dict(id=i, es=es, en=en, pos="noun", rank=rank, topic=topic, gender=g, article=art, plural=pl, ex_es=exs, ex_en=exe, **kw)
nouns = [
    N("v_casa", "casa", "house, home", 120, "home", "f", "la", "casas", "Mi casa es tu casa.", "My house is your house."),
    N("v_agua", "agua", "water", 310, "drink", "f", "el", "aguas", "Un agua natural, por favor.", "A still water, please.", note="Feminine, but takes el in the singular: el agua fría."),
    N("v_cuenta", "cuenta", "bill, check; account", 400, "restaurant", "f", "la", "cuentas", "La cuenta, por favor.", "The check, please."),
    N("v_bano", "baño", "bathroom, restroom", 900, "places", "m", "el", "baños", "¿Dónde está el baño?", "Where is the bathroom?"),
    N("v_hotel", "hotel", "hotel", 1100, "hotel", "m", "el", "hoteles", "El hotel está en el centro.", "The hotel is downtown."),
    N("v_taco", "taco", "taco", 2600, "food", "m", "el", "tacos", "Tres tacos al pastor, por favor.", "Three al pastor tacos, please."),
    N("v_dia", "día", "day", 80, "time", "m", "el", "días", "Buenos días, ¿cómo está?", "Good morning, how are you?", note="Ends in -a but masculine: el día."),
    N("v_mano", "mano", "hand", 260, "body", "f", "la", "manos", "Lávate las manos.", "Wash your hands.", note="Ends in -o but feminine: la mano."),
    N("v_carro", "carro", "car", 700, "transport", "m", "el", "carros", "Vamos en carro.", "Let's go by car.", note="Mexico says carro; Spain says coche."),
    N("v_boleto", "boleto", "ticket", 1900, "transport", "m", "el", "boletos", "Un boleto para Puebla, por favor.", "A ticket to Puebla, please.", note="Mexico: boleto. Spain: billete."),
    N("v_estudiante", "estudiante", "student", 1200, "school", "mf", "el/la", "estudiantes", "Soy estudiante de español.", "I'm a Spanish student."),
    N("v_calle", "calle", "street", 500, "city", "f", "la", "calles", "La calle está cerrada.", "The street is closed."),
]
V = lambda i, es, en, rank, topic, conj, exs, exe, **kw: dict(id=i, es=es, en=en, pos="verb", rank=rank, topic=topic, conj=conj, ex_es=exs, ex_en=exe, **kw)
verbs = [
    V("v_ser", "ser", "to be (identity, origin, time)", 2, "function",
      irr("soy eres es somos son", "fui fuiste fue fuimos fueron", "era eras era éramos eran", "seré serás será seremos serán", "sea seas sea seamos sean", "sé", "sea", "siendo", "sido"),
      "Soy de Texas.", "I'm from Texas."),
    V("v_estar", "estar", "to be (location, state)", 6, "function",
      irr("estoy estás está estamos están", "estuve estuviste estuvo estuvimos estuvieron", "estaba estabas estaba estábamos estaban", "estaré estarás estará estaremos estarán", "esté estés esté estemos estén", "está", "esté", "estando", "estado"),
      "¿Dónde está el metro?", "Where is the metro?", natural=["'toy", "'tá"]),
    V("v_tener", "tener", "to have", 9, "function",
      irr("tengo tienes tiene tenemos tienen", "tuve tuviste tuvo tuvimos tuvieron", "tenía tenías tenía teníamos tenían", "tendré tendrás tendrá tendremos tendrán", "tenga tengas tenga tengamos tengan", "ten", "tenga", "teniendo", "tenido"),
      "¿Tiene mesa para dos?", "Do you have a table for two?"),
    V("v_ir", "ir", "to go", 12, "actions",
      irr("voy vas va vamos van", "fui fuiste fue fuimos fueron", "iba ibas iba íbamos iban", "iré irás irá iremos irán", "vaya vayas vaya vayamos vayan", "ve", "vaya", "yendo", "ido"),
      "Voy al centro.", "I'm going downtown."),
    V("v_querer", "querer", "to want; to love", 30, "actions",
      irr("quiero quieres quiere queremos quieren", "quise quisiste quiso quisimos quisieron", "quería querías quería queríamos querían", "querré querrás querrá querremos querrán", "quiera quieras quiera queramos quieran", "quiere", "quiera", "queriendo", "querido"),
      "Quiero un café, por favor.", "I want a coffee, please."),
    V("v_poder", "poder", "can, to be able to", 20, "function",
      irr("puedo puedes puede podemos pueden", "pude pudiste pudo pudimos pudieron", "podía podías podía podíamos podían", "podré podrás podrá podremos podrán", "pueda puedas pueda podamos puedan", "puede", "pueda", "pudiendo", "podido"),
      "¿Me puede ayudar?", "Can you help me?"),
    V("v_hablar", "hablar", "to speak, to talk", 70, "communication", reg("habl", "ar"), "¿Habla inglés?", "Do you speak English?"),
    V("v_comer", "comer", "to eat", 190, "food", reg("com", "er"), "¿Dónde comemos hoy?", "Where are we eating today?"),
    V("v_vivir", "vivir", "to live", 150, "home", reg("viv", "ir"), "Vivo en Houston.", "I live in Houston."),
    V("v_gustar", "gustar", "to like (lit. to please)", 210, "emotions", reg("gust", "ar"), "Me gustan los tacos.", "I like tacos.",
      note="Backwards from English: me gusta el café = coffee pleases me."),
    V("v_pagar", "pagar", "to pay", 600, "money",
      reg("pag", "ar", pret=["pagué", "pagaste", "pagó", "pagamos", "pagaron"], subj=["pague", "pagues", "pague", "paguemos", "paguen"], cmd={"tu": "paga", "usted": "pague"}),
      "¿Puedo pagar con tarjeta?", "Can I pay by card?"),
]
O = lambda i, es, en, pos, rank, topic, exs, exe, **kw: dict(id=i, es=es, en=en, pos=pos, rank=rank, topic=topic, ex_es=exs, ex_en=exe, **kw)
other = [
    O("v_el", "el", "the (masculine)", "det", 1, "function", "el carro rojo", "the red car"),
    O("v_de", "de", "of, from", "prep", 3, "function", "Soy de Chicago.", "I'm from Chicago."),
    O("v_que", "que", "that, which", "conj", 4, "function", "Creo que sí.", "I think so.", natural=["ke"]),
    O("v_y", "y", "and", "conj", 5, "function", "Tacos y una coca.", "Tacos and a Coke."),
    O("v_no", "no", "no, not", "adv", 8, "function", "No hablo mucho español.", "I don't speak much Spanish."),
    O("v_para", "para", "for, in order to", "prep", 14, "function", "Una mesa para dos.", "A table for two.", natural=["pa'"]),
    O("v_bueno", "bueno", "good; well…; hello? (phone)", "adj", 60, "description", "La comida está muy buena.", "The food is really good.", fem="buena", plural="buenos", natural=["'ueno"]),
    O("v_bonito", "bonito", "pretty, nice", "adj", 800, "description", "Qué bonita ciudad.", "What a pretty city.", fem="bonita", plural="bonitos"),
    O("v_grande", "grande", "big, large", "adj", 110, "description", "Un café grande, por favor.", "A large coffee, please.", fem="grande", plural="grandes"),
    O("v_aqui", "aquí", "here", "adv", 90, "directions", "Aquí está la llave.", "Here is the key."),
    O("v_donde", "dónde", "where", "adv", 95, "directions", "¿Dónde está la estación?", "Where is the station?"),
    O("v_tres", "tres", "three", "num", 130, "numbers", "Tres tacos, por favor.", "Three tacos, please."),
    O("v_gracias", "gracias", "thank you, thanks", "interj", 140, "courtesy", "Muchas gracias, joven.", "Thank you very much."),
    O("v_hola", "hola", "hello, hi", "interj", 300, "courtesy", "Hola, buenas tardes.", "Hi, good afternoon."),
    O("v_todo", "todo", "all, everything", "det", 25, "function", "Todo bien, gracias.", "All good, thanks.", fem="toda", plural="todos", natural=["to'o"]),
    O("v_mucho", "mucho", "a lot, much, many", "det", 45, "function", "Mucho gusto.", "Nice to meet you.", fem="mucha", plural="muchos"),
    O("v_ahorita", "ahorita", "right now; in a bit (Mexico)", "adv", 1800, "time", "Ahorita vengo.", "I'll be right back.",
      note="In Mexico ahorita can mean 'right now' or 'later, maybe'."),
]


def tier(r):
    return 1 if r <= 500 else 2 if r <= 1000 else 3 if r <= 1500 else 4 if r <= 2000 else 5 if r <= 2500 else 6


for lst in (nouns, verbs, other):
    for e in lst:
        e["tier"] = tier(e["rank"])

C = lambda i, es, en, rank, topic, kind, exs, exe, **kw: dict(id=i, es=es, en=en, rank=rank, tier=1, topic=topic, kind=kind, slot=kw.pop("slot", None), ex_es=exs, ex_en=exe, **kw)
chunks = [
    C("c_por_favor", "por favor", "please", 1, "courtesy", "phrase", "Una mesa para dos, por favor.", "A table for two, please.", natural=["porfa", "por fa'"], sound_rules=["s_apocope"]),
    C("c_buenos_dias", "buenos días", "good morning", 2, "courtesy", "phrase", "Buenos días, ¿cómo está?", "Good morning, how are you?", natural=["buen día"]),
    C("c_mucho_gusto", "mucho gusto", "nice to meet you", 3, "courtesy", "reply", "Mucho gusto, soy Matt.", "Nice to meet you, I'm Matt."),
    C("c_donde_esta", "¿dónde está…?", "where is…?", 4, "directions", "frame", "¿Dónde está el baño?", "Where is the bathroom?",
      slot="¿Dónde está ___?", slot_examples=["el baño", "el metro", "el hotel"], natural=["¿ónde 'tá?"], sound_rules=["s_aspiration"]),
    C("c_me_da", "¿me da…?", "can I have…? (ordering)", 5, "restaurant", "frame", "¿Me da la cuenta, por favor?", "Can I have the check, please?",
      slot="¿Me da ___, por favor?", slot_examples=["la cuenta", "un agua"], note="The everyday Mexican way to order or ask for something."),
    C("c_mande", "¿mande?", "pardon? / yes? (Mexico)", 6, "communication", "reply", "¿Mande? No le entendí.", "Pardon? I didn't understand you.",
      note="Polite Mexican way to say 'sorry, what?' or answer when called."),
    C("c_cuanto_cuesta", "¿cuánto cuesta?", "how much is it?", 7, "shopping", "question", "¿Cuánto cuesta el boleto?", "How much is the ticket?"),
    C("c_la_cuenta", "la cuenta, por favor", "the check, please", 8, "restaurant", "phrase", "Joven, la cuenta, por favor.", "Excuse me, the check, please.", natural=["la cuenta, porfa"]),
    C("c_no_entiendo", "no entiendo", "I don't understand", 9, "communication", "reply", "Perdón, no entiendo.", "Sorry, I don't understand."),
    C("c_mas_despacio", "más despacio, por favor", "slower, please", 10, "communication", "phrase", "¿Puede hablar más despacio, por favor?", "Can you speak more slowly, please?"),
    C("c_que_onda", "¿qué onda?", "what's up?", 20, "courtesy", "question", "¿Qué onda? ¿Todo bien?", "What's up? All good?", note="Casual Mexican greeting among friends.", natural=["¿quiubo?"]),
    C("c_este", "este…", "um… (filler)", 30, "function", "filler", "Este… quiero dos tacos.", "Um… I want two tacos.", natural=["esteee"]),
    C("c_para_que", "para que", "so that", 60, "function", "collocation", "Te lo digo para que sepas.", "I'm telling you so you know.", natural=["pa' que"], sound_rules=["s_apocope"]),
    C("c_lo_que_es", "lo que es", "what it is", 70, "function", "collocation", "No sé lo que es.", "I don't know what it is.", natural=["lo kes"], sound_rules=["s_sinalefa"]),
]

EX = lambda w, s, en: dict(written=w, sounds=s, en=en, slow=w, fast=s)
sounds = [
    dict(id="s_sinalefa", name="Vowel linking (sinalefa)", summary="Vowels at word edges melt into one syllable.",
         explain="When one word ends in a vowel and the next starts with one, Spanish speakers glide them together into a single syllable. 'lo que es' comes out as 'lo kes', 'va a ir' as 'vair'. Words seem to vanish: they're still there, just merged. Reading the written form while listening helps you map the blur back onto words.",
         mexico="Very strong in fast Mexican speech, especially with que, de, la, lo.",
         examples=[EX("lo que es", "lo kes", "what it is"), EX("de usted", "dusted", "of you"), EX("va a ir", "vair", "is going to go")],
         drills=[dict(type="hear_pick", say="lo kes", options=["lo que es", "lo que hay", "el queso"], answer="lo que es"),
                 dict(type="hear_type", say="vair", answer="va a ir"),
                 dict(type="hear_pick", say="dusted", options=["de usted", "deuda", "dos de"], answer="de usted")]),
    dict(id="s_apocope", name="Clipped words (pa', porfa)", summary="Common words lose their ends: para → pa', por favor → porfa.",
         explain="Very frequent words get chopped in casual speech. 'para' is almost always 'pa'' when people talk fast, 'por favor' becomes 'porfa', 'está' becomes ''tá'. If you hear a short 'pa' before a noun or verb, think 'para'.",
         mexico="pa'l (para el), pa' que, porfa and 'ta bien (está bien) are everywhere in Mexico.",
         examples=[EX("para que", "pa' que", "so that"), EX("está bien", "ta bien", "it's fine"), EX("por favor", "porfa", "please")],
         drills=[dict(type="hear_pick", say="pa' que", options=["para que", "por qué", "pague"], answer="para que"),
                 dict(type="hear_type", say="ta bien", answer="está bien"),
                 dict(type="hear_pick", say="porfa", options=["por favor", "por fin", "perfecto"], answer="por favor")]),
    dict(id="s_aspiration", name="Dropped d (cansao, to'o)", summary="A d between vowels softens or disappears.",
         explain="Between vowels, Spanish d is soft, and in fast speech it can disappear completely, especially in -ado endings and in 'todo' and 'nada'. 'Cansado' sounds like 'cansao', 'todo' like 'to'o'. When a word seems to have a gap in the middle, try putting a d back in.",
         mexico="Less extreme than in the Caribbean, but common in to'o, na'a and -ado in casual Mexican speech.",
         examples=[EX("todo bien", "to'o bien", "all good"), EX("cansado", "cansao", "tired")],
         drills=[dict(type="hear_pick", say="to'o bien", options=["todo bien", "toro bien", "tú bien"], answer="todo bien"),
                 dict(type="hear_type", say="cansao", answer="cansado")]),
]

D = lambda t, q, a, why, **kw: dict(type=t, q=q, answer=a, why=why, **kw)
grammar = [
    dict(id="g_gender", title="Masculine & feminine nouns (o / a)", order=1, tier=1,
         summary="Every noun is masculine or feminine; the article and adjectives follow it.",
         explain="Every Spanish noun has a gender. It matters because **the words around it change** to match.\n\n| | masculine | feminine |\n|---|---|---|\n| the | **el** carro | **la** casa |\n| a | **un** boleto | **una** cuenta |\n\n- Most nouns ending in **-o** are masculine: *el taco, el boleto*.\n- Most nouns ending in **-a** are feminine: *la casa, la cuenta*.\n- Learn the exceptions as you meet them: *el día, la mano*.\n\nTip: always learn a noun **with its article**: not *casa* but *la casa*.",
         rules=[dict(rule="Nouns ending in -o are usually masculine.", examples=["el libro", "el vaso"], exceptions=["la mano", "la foto", "la radio"]),
                dict(rule="Nouns ending in -a are usually feminine.", examples=["la casa", "la mesa"], exceptions=["el día", "el mapa", "el problema"])],
         drills=[D("choice", "___ casa", "la", "casa ends in -a → feminine", options=["el", "la"]),
                 D("choice", "___ carro", "el", "carro ends in -o → masculine", options=["el", "la"]),
                 D("choice", "___ día", "el", "día is an exception: masculine", options=["el", "la"]),
                 D("choice", "___ mano", "la", "mano is an exception: feminine", options=["el", "la"]),
                 D("choice", "___ cuenta", "una", "cuenta is feminine → una", options=["un", "una"]),
                 D("choice", "___ boleto", "un", "boleto is masculine → un", options=["un", "una"]),
                 D("fill", "___ calle (the)", "la", "calle is feminine"),
                 D("fill", "___ hotel (the)", "el", "hotel is masculine"),
                 D("translate", "the house", "la casa", "casa is feminine"),
                 D("translate", "a ticket", "un boleto", "boleto is masculine"),
                 D("translate", "the check", "la cuenta", "cuenta is feminine"),
                 D("transform", "el carro → plural", "los carros", "el → los, add -s")]),
    dict(id="g_agreement", title="Adjectives agree (bonito / bonita)", order=2, tier=1, summary="Adjectives copy the noun's gender and number.",
         explain="Adjectives usually go **after** the noun and **match it**:\n\n- *el carro rojo* → *la casa roja*\n- *los carros rojos* → *las casas rojas*\n\nAdjectives ending in **-e** or a consonant don't change for gender: *un café grande, una casa grande*.",
         rules=[dict(rule="-o adjectives change to -a for feminine nouns.", examples=["la casa bonita", "el carro bonito"], exceptions=[]),
                dict(rule="Add -s (or -es) for plural.", examples=["las casas bonitas", "los hoteles grandes"], exceptions=[])],
         drills=[D("fill", "La casa es ___ (bonito).", "bonita", "casa is feminine"),
                 D("fill", "El hotel es ___ (bonito).", "bonito", "hotel is masculine"),
                 D("choice", "una ciudad ___", "bonita", "ciudad is feminine", options=["bonito", "bonita"]),
                 D("choice", "los tacos ___", "buenos", "tacos: masculine plural", options=["buenos", "buenas", "bueno"]),
                 D("transform", "la casa bonita → plural", "las casas bonitas", "everything goes plural"),
                 D("transform", "el carro grande → plural", "los carros grandes", "grande → grandes"),
                 D("translate", "a big coffee", "un café grande", "grande doesn't change"),
                 D("translate", "the pretty house", "la casa bonita", "adjective after the noun, feminine", alts=["la bonita casa"]),
                 D("choice", "una casa ___", "grande", "-e adjectives don't change", options=["grande", "granda"]),
                 D("fill", "Las calles son ___ (bonito).", "bonitas", "feminine plural"),
                 D("translate", "the good tacos", "los tacos buenos", "masculine plural", alts=["los buenos tacos"]),
                 D("fill", "La comida está muy ___ (bueno).", "buena", "comida is feminine")]),
    dict(id="g_present_ar", title="Present tense: -ar verbs", order=3, tier=1, summary="hablo, hablas, habla, hablamos, hablan.",
         explain="Drop **-ar** and add the ending for *who* is doing it:\n\n| | hablar |\n|---|---|\n| yo | habl**o** |\n| tú | habl**as** |\n| usted / él / ella | habl**a** |\n| nosotros | habl**amos** |\n| ustedes / ellos | habl**an** |\n\nIn Mexico use **usted** with strangers and **ustedes** for any group (never *vosotros*). You can usually drop the pronoun: *Hablo inglés.*",
         rules=[dict(rule="yo → -o, tú → -as, usted → -a, nosotros → -amos, ustedes → -an.", examples=["hablo", "pagas", "habla"], exceptions=[])],
         drills=[D("fill", "Yo ___ inglés. (hablar)", "hablo", "yo → -o"),
                 D("fill", "¿Usted ___ inglés? (hablar)", "habla", "usted → -a"),
                 D("fill", "Tú ___ muy bien. (hablar)", "hablas", "tú → -as"),
                 D("fill", "Nosotros ___ con tarjeta. (pagar)", "pagamos", "nosotros → -amos"),
                 D("fill", "Ellos ___ la cuenta. (pagar)", "pagan", "ellos → -an"),
                 D("choice", "Yo ___ con tarjeta. (pagar)", "pago", "yo → pago", options=["pago", "pagas", "pagan"]),
                 D("translate", "I speak a little Spanish.", "hablo un poco de español", "yo → hablo", alts=["yo hablo un poco de español"]),
                 D("translate", "Do you speak English? (usted)", "¿habla inglés?", "usted → habla", alts=["¿usted habla inglés?", "¿habla usted inglés?"]),
                 D("transform", "hablo → nosotros", "hablamos", "-amos"),
                 D("transform", "pagas → ustedes", "pagan", "-an"),
                 D("choice", "Ustedes ___ español.", "hablan", "ustedes → -an (vosotros is Spain only)", options=["hablan", "habláis", "hablamos"]),
                 D("fill", "¿Dónde ___ la cuenta? (pagar, yo)", "pago", "yo → -o")]),
]
prompts = [
    dict(id="p_greet", tier=1, after_grammar=None, situation="Hotel lobby", prompt_en="The receptionist greets you. Say good morning and that it's nice to meet them.",
         prompt_es="¡Buenos días! Bienvenido.", targets=["buenos días", "mucho gusto"], grammar=[], models=["Buenos días, mucho gusto.", "¡Buenos días! Mucho gusto, soy Matt."],
         hints=["Buenos días works until about noon."]),
    dict(id="p_order_tacos", tier=1, after_grammar="g_gender", situation="Taquería", prompt_en="The taquero asks what you want. Order three tacos al pastor and a Coke.",
         prompt_es="¿Qué le damos, joven?", targets=["tres", "tacos", "pastor", "por favor"], grammar=["g_gender"],
         models=["Quiero tres tacos al pastor y una Coca, por favor.", "Me da tres de pastor y una coca, por favor."], hints=["'Me da…' is the natural way to order in Mexico."]),
    dict(id="p_bathroom", tier=1, after_grammar=None, situation="Restaurant", prompt_en="Ask the waiter where the bathroom is.", prompt_es="¿Algo más?",
         targets=["dónde", "baño"], grammar=[], models=["Perdón, ¿dónde está el baño?", "¿Dónde está el baño, por favor?"], hints=["Use está for location."]),
    dict(id="p_speak_english", tier=1, after_grammar="g_present_ar", situation="Street",
         prompt_en="Someone asks you something fast. Say you speak a little Spanish and ask if they speak English.",
         prompt_es="Oiga, ¿sabe dónde queda la calle Madero?", targets=["hablo", "español", "habla", "inglés"], grammar=["g_present_ar"],
         models=["Perdón, hablo un poco de español. ¿Habla inglés?"], hints=["usted → habla"]),
]
B = lambda en, hint, targets: dict(en=en, hint_es=hint, targets=targets)
stories = [
    dict(id="st_first_night", tier=1, after_grammar="g_present_ar", title="My first night in Mexico City",
         goal_en="Write 5–8 sentences: you land, take a taxi to the hotel, check in, and go find tacos.",
         beats=[B("You land at the airport.", "Llego al aeropuerto…", ["llego", "aeropuerto"]),
                B("You take a taxi to the hotel.", "Tomo un taxi…", ["taxi", "hotel"]),
                B("You say good evening at reception and that you have a reservation.", "Buenas noches, tengo…", ["buenas noches", "tengo", "reservación"]),
                B("You ask where there are good tacos.", "¿Dónde hay…?", ["dónde", "tacos"]),
                B("You order three tacos and pay.", "Me da… / Quiero…", ["tres", "tacos", "pago"])],
         vocab_focus=["aeropuerto", "taxi", "hotel", "cuarto", "llave"], grammar_focus=["g_present_ar"],
         model_es="Llego al aeropuerto a las nueve. Tomo un taxi al hotel. En la recepción digo: «Buenas noches, tengo una reservación». Después pregunto: «¿Dónde hay tacos buenos?». Voy a una taquería y pido tres tacos al pastor. Pago con tarjeta. ¡Qué rico!",
         model_en="I land at the airport at nine. I take a taxi to the hotel. At reception I say: 'Good evening, I have a reservation.' Then I ask: 'Where are there good tacos?' I go to a taquería and order three al pastor tacos. I pay by card. Delicious!"),
    dict(id="st_market", tier=1, after_grammar="g_agreement", title="A morning at the market",
         goal_en="Write 4–6 sentences about buying fruit at a market: greet, ask prices, describe what you buy, pay.",
         beats=[B("You greet the vendor.", "Buenos días…", ["buenos días"]),
                B("You ask how much the mangoes cost.", "¿Cuánto cuestan…?", ["cuánto", "mangos"]),
                B("You say they're very pretty and big.", "Están muy…", ["bonitos", "grandes"]),
                B("You pay and say thanks.", "Gracias…", ["gracias"])],
         vocab_focus=["mercado", "mango", "cuánto"], grammar_focus=["g_agreement"],
         model_es="Buenos días, señora. ¿Cuánto cuestan los mangos? Están muy bonitos y grandes. Me da un kilo, por favor. Aquí tiene. ¡Muchas gracias!",
         model_en="Good morning, ma'am. How much are the mangoes? They're very pretty and big. I'll have a kilo, please. Here you go. Thank you very much!"),
]
about = [
    dict(id="a_frequency", title="The most frequent words first", body="About 3,000 word families cover roughly 90% of everyday conversation. Learning in frequency order means every word you learn pays off immediately.", source="Nation (2006); Davies, A Frequency Dictionary of Spanish"),
    dict(id="a_spacing", title="Spaced repetition", body="Reviewing a word just as you're about to forget it makes the memory last longer. The review queue schedules every card for you.", source="Ebbinghaus; Cepeda et al. (2006)"),
    dict(id="a_chunks", title="Chunks, not just words", body="Native speakers lean on ready-made phrases (¿me da…?, ¿qué onda?). Learning them whole gets you speaking faster and helps you hear them in fast speech.", source="Wray (2002)"),
]

readings = [
    dict(id="rd_el_taxi", tier=1, after_grammar="g_present_ar", title="El taxi", title_en="The taxi", topic="transport",
         level_note="present tense, ~60 words",
         sentences=[
             dict(es="Matt llega al aeropuerto a las once de la noche.", en="Matt arrives at the airport at eleven at night.",
                  gist="He lands late at night.", words=[dict(es="llega", en="arrives (llegar)"), dict(es="noche", en="night")],
                  natural="Matt llegal aeropuerto a lasonce de la noche."),
             dict(es="Está cansado, pero tiene mucha hambre.", en="He's tired, but he's very hungry.",
                  gist="Tired and hungry.", words=[dict(es="cansado", en="tired"), dict(es="hambre", en="hunger")]),
             dict(es="Toma un taxi y le dice al taxista: «Al centro, por favor».", en="He takes a taxi and tells the driver: 'Downtown, please.'",
                  gist="He asks the taxi to take him downtown.", words=[dict(es="taxista", en="taxi driver"), dict(es="centro", en="downtown")]),
             dict(es="El taxista habla muy rápido y Matt dice: «¿Mande?».", en="The driver talks very fast and Matt says: 'Pardon?'",
                  gist="He doesn't catch what the driver says.", words=[dict(es="rápido", en="fast"), dict(es="¿mande?", en="pardon? (Mexico)")]),
             dict(es="Al final, los dos se ríen y Matt paga con tarjeta.", en="In the end, they both laugh and Matt pays by card.",
                  gist="It ends well; he pays.", words=[dict(es="se ríen", en="they laugh (reírse)"), dict(es="paga", en="pays (pagar)")]),
         ]),
]

OUT.mkdir(parents=True, exist_ok=True)
for name, data in [("vocab_nouns", nouns), ("vocab_verbs", verbs), ("vocab_other", other), ("chunks", chunks), ("sounds", sounds),
                   ("grammar", grammar), ("prompts", prompts), ("stories", stories), ("readings", readings), ("about", about)]:
    (OUT / f"{name}.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("wrote", OUT)
