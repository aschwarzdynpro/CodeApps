"""Demo-Daten für die Gen Page "Account 360" (ASC SFA CS Playground).

Erzeugt ein Configuration-Migration-Paket (data.xml + data_schema.xml) für
`pac data import`. Alle Firmen, Personen, Domains (*.example) und
Telefonnummern sind erfunden.

GUIDs sind deterministisch (uuid5 aus einem festen Namespace und einem
Schlüssel), ein erneuter Import aktualisiert die Datensätze statt Dubletten
anzulegen. Fälligkeiten liegen relativ zu TODAY; wer das Set später erneut
einspielt, setzt TODAY auf den Präsentationstag.

Im Playground überschreibt der Plugin-Step "SetAutoNumber" (Create von
account) jede Kontonummer mit "123". Deshalb nach dem ersten Import ein
zweites Paket nur mit den Kontonummern einspielen (Update, kein Create):

    python generate.py <ausgabeverzeichnis>
    pac data import --data <ausgabeverzeichnis>
    python generate.py --account-numbers <ausgabeverzeichnis2>
    pac data import --data <ausgabeverzeichnis2>
"""

import datetime as dt
import shutil
import sys
import uuid
from pathlib import Path
from xml.sax.saxutils import quoteattr

TODAY = dt.date(2026, 10, 4)
NAMESPACE = uuid.UUID("6f1c7a52-3d0e-4b8e-9a51-0a3600000360")

PRIORITY = {"niedrig": 0, "normal": 1, "hoch": 2}


def gid(key: str) -> str:
    return str(uuid.uuid5(NAMESPACE, key))


def due(days: int | None, hour_utc: int = 8) -> str | None:
    if days is None:
        return None
    d = TODAY + dt.timedelta(days=days)
    return f"{d.isoformat()}T{hour_utc:02d}:00:00.0000000Z"


# --------------------------------------------------------------------------
# Accounts: key, name, number, phone, domain, street, zip, city, industry,
# revenue, employees, parent key, description
# --------------------------------------------------------------------------
ACCOUNTS = [
    ("nle", "Nordlicht Energie AG", "NL-1000", "+49 40 66969 100", "nordlicht-energie.example",
     "Hafenkante 12", "20457", "Hamburg", 31, 480_000_000, 2350, None,
     "Regionaler Energieversorger, Konzernmutter der Nordlicht Gruppe. Strategischer Kunde, "
     "Rahmenvertrag 2027 in Vorbereitung."),
    ("nln", "Nordlicht Netze GmbH", "NL-1010", "+49 40 66969 200", "nordlicht-netze.example",
     "Am Umspannwerk 3", "22113", "Hamburg", 31, 95_000_000, 410, "nle",
     "Netzbetreiber der Nordlicht Gruppe. Ausschreibung Leitstellensoftware läuft."),
    ("nls", "Nordlicht Service GmbH", "NL-1020", "+49 30 23125 300", "nordlicht-service.example",
     "Spreebogen 7", "10557", "Berlin", 19, 28_000_000, 180, "nle",
     "Servicegesellschaft der Nordlicht Gruppe für Wartung und Kundendienst."),
    ("bmb", "Brückner Maschinenbau GmbH", "BM-2040", "+49 89 99998 400", "brueckner-maschinenbau.example",
     "Industriestraße 40", "81829", "München", 12, 136_000_000, 720, None,
     "Familiengeführter Sondermaschinenbauer. Interesse an Predictive Maintenance."),
    ("alb", "Alpenblick Logistik GmbH", "AL-3110", "+49 89 99998 500", "alpenblick-logistik.example",
     "Speditionsweg 15", "85748", "Garching", 30, 64_000_000, 390, None,
     "Kontraktlogistik und Lebensmitteltransporte im süddeutschen Raum."),
    ("hhk", "Hansekontor Handels AG", "HK-4200", "+49 40 66969 600", "hansekontor.example",
     "Speicherstadt 21", "20457", "Hamburg", 33, 212_000_000, 1150, None,
     "Großhandel für Haushalts- und Elektrowaren. Jahresgespräch heute."),
    ("rwc", "Rheinwerk Consulting GmbH", "RW-5070", "+49 221 4710 700", "rheinwerk-consulting.example",
     "Rheinuferstraße 9", "50678", "Köln", 7, 18_500_000, 95, None,
     "Beratungshaus für Prozessdigitalisierung, potenzieller Implementierungspartner."),
    ("gfb", "Grünfeld Bio-Lebensmittel eG", "GF-6120", "+49 69 90009 800", "gruenfeld-bio.example",
     "Am Mainufer 33", "60311", "Frankfurt am Main", 17, 41_000_000, 260, None,
     "Genossenschaft für regionale Bio-Lebensmittel. Probelieferung in Planung."),
    ("suk", "Spreeufer Kliniken GmbH", "SK-7300", "+49 30 23125 900", "spreeufer-kliniken.example",
     "Uferpromenade 2", "10178", "Berlin", 11, 158_000_000, 1900, None,
     "Klinikverbund mit drei Standorten. Pilotprojekt Stationsdigitalisierung."),
]

# --------------------------------------------------------------------------
# Contacts: account key, first, last, job title, phone, mobile, primary?
# --------------------------------------------------------------------------
CONTACTS = [
    ("nle", "Katrin", "Albers", "Vorständin Vertrieb", "+49 40 66969 101", "+49 171 39200 11", True),
    ("nle", "Jonas", "Petersen", "Leiter Einkauf", "+49 40 66969 102", None, False),
    ("nle", "Mira", "Hansen", "Projektleiterin Netzausbau", "+49 40 66969 103", "+49 171 39200 12", False),
    ("nle", "Ole", "Brandt", "IT-Architekt", "+49 40 66969 104", None, False),
    ("nln", "Henrik", "Thomsen", "Geschäftsführer", "+49 40 66969 201", "+49 171 39200 21", True),
    ("nln", "Lea", "Jansen", "Assistenz der Geschäftsführung", "+49 40 66969 202", None, False),
    ("nls", "Sandra", "Wulff", "Leiterin Kundenservice", "+49 30 23125 301", "+49 171 39200 31", True),
    ("nls", "Timo", "Krüger", "Teamleiter Außendienst", None, "+49 171 39200 32", False),
    ("bmb", "Martin", "Brückner", "Geschäftsführender Gesellschafter", "+49 89 99998 401", None, True),
    ("bmb", "Elena", "Vogt", "Einkaufsleiterin", "+49 89 99998 402", "+49 171 39200 41", False),
    ("bmb", "Florian", "Haas", "Leiter Konstruktion", "+49 89 99998 403", None, False),
    ("alb", "Theresa", "Huber", "Leiterin Disposition", "+49 89 99998 501", "+49 171 39200 51", True),
    ("alb", "Benedikt", "Gruber", "Kaufmännischer Leiter", "+49 89 99998 502", None, False),
    ("hhk", "Christian", "Meyer-Lindholm", "Vorstand Einkauf", "+49 40 66969 601", None, True),
    ("hhk", "Nadine", "Fischer", "Category Managerin", "+49 40 66969 602", "+49 171 39200 61", False),
    ("hhk", "Paul", "Schröder", "Controller", "+49 40 66969 603", None, False),
    ("rwc", "Julia", "Becker", "Partnerin", "+49 221 4710 701", "+49 171 39200 71", True),
    ("rwc", "Malte", "Schmitz", "Senior Consultant", "+49 221 4710 702", None, False),
    ("gfb", "Anna", "Lehmann", "Vorständin", "+49 69 90009 801", None, True),
    ("gfb", "Jakob", "Weber", "Leiter Qualitätssicherung", "+49 69 90009 802", "+49 171 39200 81", False),
    ("suk", "Thomas", "Neumann", "Kaufmännischer Direktor", "+49 30 23125 901", None, True),
    ("suk", "Sabine", "Koch", "Leiterin Einkauf", "+49 30 23125 902", "+49 171 39200 91", False),
    ("suk", "David", "Richter", "IT-Leiter", "+49 30 23125 903", None, False),
]

# --------------------------------------------------------------------------
# Tasks: account key, subject, days from TODAY (None = no due date),
# priority, done (completed X days ago, None = open), description
# --------------------------------------------------------------------------
TASKS = [
    ("nle", "Angebot Smart-Meter-Rollout nachfassen", -5, "hoch", None,
     "Angebot vom 15.09. liegt beim Einkauf. Entscheidung war für Ende September zugesagt."),
    ("nle", "Workshop Netzausbau terminieren", 4, "normal", None, "Mit Mira Hansen zwei Termine abstimmen."),
    ("nle", "Rahmenvertrag 2027 vorbereiten", 11, "hoch", None, "Konditionen mit Vertriebsleitung abstimmen."),
    ("nle", "Referenzbesuch abstimmen", None, "niedrig", None, "Möglicher Referenzkunde für die Nordlicht Netze."),
    ("nle", "Kick-off-Protokoll versenden", -12, "normal", 12, "Protokoll an alle Teilnehmer."),
    ("nle", "Ansprechpartner Einkauf klären", -20, "normal", 19, None),
    ("nln", "Ausschreibung Leitstellensoftware prüfen", 2, "hoch", None, "Abgabefrist der Unterlagen beachten."),
    ("nln", "Preisblatt aktualisieren", -8, "normal", 7, None),
    ("nls", "Wartungsvertrag verlängern", -3, "normal", None, "Vertrag läuft zum Jahresende aus."),
    ("nls", "Feedback-Gespräch Q3", 17, "normal", None, None),
    ("bmb", "Rückruf Einkaufsleiterin", -4, "hoch", None, "Frau Vogt bat um Rückruf zu Lieferzeiten."),
    ("bmb", "Demo Predictive Maintenance vorbereiten", 5, "hoch", None, "Demo-Umgebung und Sensordaten vorbereiten."),
    ("bmb", "Messe-Einladung versenden", 23, "niedrig", None, None),
    ("bmb", "NDA unterzeichnen lassen", -15, "normal", 14, None),
    ("alb", "Tourenplanung-Pilot auswerten", 9, "normal", None, "Kennzahlen aus vier Wochen Pilotbetrieb."),
    ("alb", "Vertragsentwurf an Rechtsabteilung", None, "niedrig", None, None),
    ("hhk", "Jahresgespräch vorbereiten", 0, "hoch", None, "Umsatzentwicklung und Ziele 2027 aufbereiten."),
    ("hhk", "Listungsunterlagen anfordern", -9, "normal", None, None),
    ("hhk", "Mengenstaffel kalkulieren", 13, "normal", None, None),
    ("hhk", "Bedarfsanalyse abschließen", -18, "normal", 16, None),
    ("rwc", "Partnerprogramm vorstellen", 6, "normal", None, "Unterlagen zum Partnerprogramm mitbringen."),
    ("gfb", "Zertifikate Bio-Siegel anfordern", -8, "niedrig", None, None),
    ("gfb", "Probelieferung abstimmen", 10, "normal", None, "Liefertermin mit Jakob Weber abstimmen."),
    ("suk", "Datenschutz-Folgenabschätzung liefern", -2, "hoch", None, "Vom Datenschutzbeauftragten angefordert."),
    ("suk", "Termin Klinikleitung bestätigen", 1, "normal", None, None),
    ("suk", "Pilotstation auswählen", 19, "normal", None, None),
    ("suk", "Erstgespräch dokumentieren", -25, "normal", 24, None),
]

CUSTOM_ADDRESSES = [
    ("nle", "Rechnungsadresse: Postfach 10 20 30, 20005 Hamburg"),
    ("nle", "Lieferadresse Lager Harburg: Lagerweg 4, 21079 Hamburg"),
    ("nle", "Baustelle Umspannwerk Nord: Feldstraße 1, 22111 Hamburg"),
    ("bmb", "Lieferadresse Werk 2: Gewerbering 18, 85609 Aschheim"),
    ("bmb", "Rechnungsadresse: Industriestraße 40, 81829 München"),
    ("hhk", "Zentrallager: Containerkai 5, 21129 Hamburg"),
    ("gfb", "Abholstation: Hofgut Grünfeld, 61118 Bad Vilbel"),
    ("suk", "Standort Mitte: Uferpromenade 2, 10178 Berlin"),
    ("suk", "Standort Süd: Parkallee 14, 12099 Berlin"),
]

ELASTIC = [
    ("nle", "Portal-Login durch Katrin Albers"),
    ("nle", "Angebotsdokument geöffnet (Smart-Meter-Rollout)"),
    ("nle", "Newsletter-Klick: Netzausbau 2027"),
    ("bmb", "Webinar-Teilnahme: Predictive Maintenance"),
    ("bmb", "Whitepaper heruntergeladen"),
    ("suk", "Kontaktformular: Anfrage Stationsdigitalisierung"),
]


# --------------------------------------------------------------------------
# XML
# --------------------------------------------------------------------------
def field(name: str, value, lookup: tuple[str, str] | None = None) -> str:
    if value is None:
        return ""
    attrs = f'name={quoteattr(name)} value={quoteattr(str(value))}'
    if lookup:
        attrs += f" lookupentity={quoteattr(lookup[0])} lookupentityname={quoteattr(lookup[1])}"
    return f"        <field {attrs} />\n"


def record(rid: str, fields: list[str]) -> str:
    return f'      <record id="{rid}">\n' + "".join(fields) + "      </record>\n"


def entity(name: str, display: str, records: list[str]) -> str:
    return (f'  <entity name="{name}" displayname="{display}">\n    <records>\n'
            + "".join(records)
            + "    </records>\n    <m2mrelationships />\n  </entity>\n")


def build() -> str:
    acc_name = {a[0]: a[1] for a in ACCOUNTS}
    primary = {c[0]: c for c in CONTACTS if c[6]}

    accounts = []
    for (key, name, number, phone, domain, street, zip_, city, industry,
         revenue, employees, parent, description) in ACCOUNTS:
        p = primary[key]
        accounts.append(record(gid(f"account:{key}"), [
            field("accountid", gid(f"account:{key}")),
            field("name", name),
            field("accountnumber", number),
            field("telephone1", phone),
            field("emailaddress1", f"info@{domain}"),
            field("websiteurl", f"https://www.{domain}"),
            field("address1_line1", street),
            field("address1_postalcode", zip_),
            field("address1_city", city),
            field("address1_country", "Deutschland"),
            field("industrycode", industry),
            field("revenue", revenue),
            field("numberofemployees", employees),
            field("description", description),
            field("primarycontactid", gid(f"contact:{key}:{p[2]}"), ("contact", f"{p[1]} {p[2]}")),
            field("parentaccountid", gid(f"account:{parent}") if parent else None,
                  ("account", acc_name[parent]) if parent else None),
        ]))

    contacts = []
    for key, first, last, title, phone, mobile, _ in CONTACTS:
        domain = next(a[4] for a in ACCOUNTS if a[0] == key)
        mail_local = (f"{first}.{last}".lower()
                      .replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss"))
        contacts.append(record(gid(f"contact:{key}:{last}"), [
            field("contactid", gid(f"contact:{key}:{last}")),
            field("firstname", first),
            field("lastname", last),
            field("jobtitle", title),
            field("emailaddress1", f"{mail_local}@{domain}"),
            field("telephone1", phone),
            field("mobilephone", mobile),
            field("parentcustomerid", gid(f"account:{key}"), ("account", acc_name[key])),
        ]))

    tasks = []
    for key, subject, days, prio, done_days_ago, description in TASKS:
        tid = gid(f"task:{key}:{subject}")
        closed = done_days_ago is not None
        tasks.append(record(tid, [
            field("activityid", tid),
            field("subject", subject),
            field("description", description),
            field("scheduledend", due(days)),
            field("prioritycode", PRIORITY[prio]),
            field("regardingobjectid", gid(f"account:{key}"), ("account", acc_name[key])),
            field("actualend", due(-done_days_ago, 15) if closed else None),
            field("statecode", 1 if closed else 0),
            field("statuscode", 5 if closed else 2),
        ]))

    addresses = [
        record(gid(f"address:{key}:{name}"), [
            field("pro_customaddressid", gid(f"address:{key}:{name}")),
            field("pro_name", name),
            field("pro_account", gid(f"account:{key}"), ("account", acc_name[key])),
        ])
        for key, name in CUSTOM_ADDRESSES
    ]

    elastic = [
        record(gid(f"elastic:{key}:{name}"), [
            field("pro_elasticdemoid", gid(f"elastic:{key}:{name}")),
            field("pro_name", name),
            field("pro_account", gid(f"account:{key}"), ("account", acc_name[key])),
        ])
        for key, name in ELASTIC
    ]

    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.0000000Z")
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<entities xmlns:xsd="http://www.w3.org/2001/XMLSchema" '
        f'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" timestamp="{stamp}">\n'
        + entity("account", "Account", accounts)
        + entity("contact", "Contact", contacts)
        + entity("task", "Task", tasks)
        + entity("pro_customaddress", "Custom Address", addresses)
        + entity("pro_elasticdemo", "Elastic Demo", elastic)
        + "</entities>\n"
    )


ACCOUNT_NUMBER_SCHEMA = """<?xml version="1.0" encoding="utf-8"?>
<entities dateMode="absolute">
  <entity name="account" displayname="Account" etc="1" primaryidfield="accountid" primarynamefield="name" disableplugins="false">
    <fields>
      <field displayname="Account" name="accountid" type="guid" primaryKey="true" />
      <field displayname="Account Number" name="accountnumber" type="string" />
    </fields>
    <relationships />
  </entity>
</entities>
"""


def build_account_numbers() -> str:
    """Second pass: only accountid + accountnumber, imported as an update."""
    records = [
        record(gid(f"account:{a[0]}"), [field("accountid", gid(f"account:{a[0]}")), field("accountnumber", a[2])])
        for a in ACCOUNTS
    ]
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<entities xmlns:xsd="http://www.w3.org/2001/XMLSchema" '
        'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n'
        + entity("account", "Account", records)
        + "</entities>\n"
    )


def main() -> None:
    args = sys.argv[1:]
    numbers_only = "--account-numbers" in args
    args = [a for a in args if a != "--account-numbers"]
    if len(args) != 1:
        sys.exit(__doc__)
    out = Path(args[0])
    out.mkdir(parents=True, exist_ok=True)
    if numbers_only:
        (out / "data.xml").write_text(build_account_numbers(), encoding="utf-8")
        (out / "data_schema.xml").write_text(ACCOUNT_NUMBER_SCHEMA, encoding="utf-8")
        print(f"{len(ACCOUNTS)} account numbers -> {out}")
        return
    (out / "data.xml").write_text(build(), encoding="utf-8")
    shutil.copyfile(Path(__file__).with_name("data_schema.xml"), out / "data_schema.xml")
    print(f"{len(ACCOUNTS)} accounts, {len(CONTACTS)} contacts, {len(TASKS)} tasks, "
          f"{len(CUSTOM_ADDRESSES)} custom addresses, {len(ELASTIC)} elastic rows -> {out}")


if __name__ == "__main__":
    main()
