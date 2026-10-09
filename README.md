# Formata &mdash; Bibliography & Link Integrity Validator

[![Node.js](https://img.shields.io/badge/Node.js-v18+-green.svg)](https://nodejs.org/)
[![Vercel](https://img.shields.io/badge/Deployment-Vercel%20Serverless-black.svg)](https://vercel.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![FOM Hochschule](https://img.shields.io/badge/FOM-Web%20Technologie-005C6E.svg)](https://www.fom.de/)

**Formata** ist ein webbasierter "Bibliography & Link Validator", der als funktionsfähiger Prototyp für eine universitäre Seminararbeit im Modul **Web Technologie** (FOM Hochschule für Oekonomie & Management) entwickelt wurde.

Das Tool ermöglicht es Studierenden und Forschenden, ihr Literaturverzeichnis per Copy & Paste einzufügen. Das System extrahiert automatisch URLs (unterstützt u.&nbsp;a. das FOM-Format `<https://...>`), entfernt störende Marketing- und Tracking-Parameter (`utm_*`, `fbclid`, etc.), gleicht Quellen gegen akademische Zitierrichtlinien ab (z.&nbsp;B. Sperre für Wikipedia und Laien-Foren) und verifiziert die serverseitige Erreichbarkeit über einen Node.js CORS-Proxy.

---

## 🌟 Kernfunktionen

1. **Intelligente Regex-Extraktion:**
   - Erkennt URLs in spitzen Klammern (`<https://...>`), freistehend sowie mit nachfolgenden Satzzeichen und Datumsangaben (`... Zugriff am: DD.MM.YYYY`).
   - Bereinigt Satzzeichen am URL-Ende automatisch nach RFC 3986.
2. **URL-Hygiene & Tracking-Stripper:**
   - Entfernt automatisch `utm_source`, `utm_medium`, `fbclid`, `gclid`, `si` und weitere Tracking-Parameter via Web API `URLSearchParams`.
   - Bietet einen 1-Klick-Export für das **vollständig bereinigte Literaturverzeichnis** (ersetzt unsaubere URLs direkt im Originaltext).
3. **Akademisches Domain-Scoring:**
   - 🔴 **Rot (Nicht zitierfähig):** Wikipedia, Gutefrage.net, Reddit, Quora, Boulevardmedien.
   - 🟡 **Gelb (Flüchtig / Prüfbedarf):** URL-Shortener (`bit.ly`, `tinyurl.com`), freie Blog-Plattformen (`medium.com`, `wordpress.com`).
   - 🟢 **Grün (Empfohlen):** DOI-Links (`doi.org`), universitäre Domains (`.edu`, `.ac.uk`), offizielle Behörden (`destatis.de`, `.gov`).
4. **CORS-Bypass & Serverless Proxy:**
   - Umgeht Browser-Same-Origin-Policy-Restriktionen über Node.js.
   - HEAD-Request mit automatischem Fallback auf GET bei Blockierung (405 / 403).
   - Harter Timeout von 5.000 ms via `AbortController`.
   - Concurrency-Queue (max. 5 parallele Verbindungen) zur Verhinderung von Serverless-Timeouts.
   - Redirect-Tracking (301/302).
5. **Wissenschaftliche Export-Funktionen:**
   - Bereinigtes Verzeichnis in Zwischenablage.
   - CSV-Export aller Prüfergebnisse zur Dokumentation in Seminararbeiten.

---

## 🏗️ Architekturübersicht

```
[Browser Client]
       │
       ├──> 1. FormataParser (Regex-Extraktion aus Fließtext)
       ├──> 2. FormataHygiene (Lokales Tracking-Stripping)
       ├──> 3. FormataDomainRules (Akademisches Scoring)
       │
       └──> 4. POST /api/validate (JSON Batch Payload)
                     │
                     ▼
          [Node.js / Vercel Serverless Proxy]
                     │
                     ├──> Concurrency Pool (max. 5 parallel)
                     ├──> AbortController (5000 ms Timeout)
                     ├──> HEAD Request (Fallback: GET)
                     │
                     ▼
              [Ziel-Server im Web]
```

---

## 🚀 Lokale Installation & Ausführung

### Voraussetzungen
- **Node.js:** Version 18 oder neuer (getestet mit Node 24)
- **npm:** Vorinstalliert

### Schritt 1: Repository klonen & Abhängigkeiten installieren
```bash
git clone https://github.com/ant0ni014/Formata.git
cd Formata
npm install
```

### Schritt 2: Lokalen Entwicklungsserver starten
```bash
npm start
# oder: npm run dev
```
Öffnen Sie anschließend **[http://localhost:3000](http://localhost:3000)** in Ihrem Webbrowser.

### Schritt 3: Automatisierte Tests ausführen
```bash
npm test
```

---

## ☁️ Deployment auf Vercel

Das Projekt ist für Zero-Config-Deployment auf [Vercel](https://vercel.com/) ausgelegt:

1. Repository auf GitHub pushen.
2. In Vercel ein neues Projekt importieren (`Import Git Repository`).
3. Vercel erkennt die statischen Dateien in `public/` und die Serverless Function in `api/validate.js` über die beiliegende `vercel.json` automatisch.
4. Fertig! Die Web-Applikation ist sofort weltweit unter einer HTTPS-Domain erreichbar.

---

## 📁 Projektstruktur

```
Formata/
├── api/
│   └── validate.js            # Vercel Serverless Function (Proxy, Concurrency & Reachability)
├── public/
│   ├── css/
│   │   └── style.css          # Akademisches Designsystem (Teal, Mint, Badges, Responsive)
│   ├── js/
│   │   ├── app.js             # Controller, Event-Handling, UI State, CSV-Export
│   │   ├── parser.js          # URL-Extraktion & Textrekonstruktion
│   │   ├── hygiene.js         # Tracking-Parameter Bereinigung
│   │   └── domain-rules.js    # Domain-Scoring & Regelkatalog
│   └── index.html             # Semantisches HTML5 Dashboard
├── test/
│   ├── sample-bibliographies.txt # Testdatensätze für Evaluation
│   └── test-validator.js      # Automatisierte Unit- & Integrationstests
├── server.js                  # Lokaler Express-Server für Entwicklung
├── vercel.json                # Vercel Routing & Rewrite Regeln
├── package.json               # Projektabhängigkeiten und Skripte
└── README.md                  # Projektdokumentation
```

---

## 🎓 Relevanz für die Seminararbeit (Modul Web Technologie)

| Thema in Seminararbeit | Technische Entsprechung in "Formata" |
| :--- | :--- |
| **Same-Origin-Policy & CORS** | Begründung der Client-Server-Architektur; Browser verbietet Cross-Origin Link-Pings; Notwendigkeit des Node.js Proxies (`api/validate.js`). |
| **HTTP-Spezifikation (RFC 9110)** | Statuscodes (200, 301, 403, 404, 408, 500), HEAD vs. GET Methoden, Header-Management. |
| **URI-Spezifikation (RFC 3986)** | Query-Parameter-Parsing, URL-Normalisierung, Delimiter und Tracking-Stripping. |
| **Asynchrone Programmierung** | Promises, `Promise.all`, Concurrency-Pools, Event-Loop und `AbortController`. |
| **FOM-Zitierrichtlinien** | Automatisierte Validierung gegen formale Vorgaben (Datum, spitze Klammern, zitierfähige Quellen). |