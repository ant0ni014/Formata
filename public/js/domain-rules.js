/**
 * Formata - Module: domain-rules.js
 * Bewertet URLs und Domains nach akademischen Zitierstandards (u. a. FOM Hochschule).
 */

const FormataDomainRules = (() => {
  const RULES = [
    // Rote Kategorie: Nicht zitierfähig
    {
      id: "wikipedia",
      regex: /(^|\.)wikipedia\.org$/i,
      level: "RED",
      label: "Nicht zitierfähig",
      badgeClass: "badge-danger",
      description: "Wikipedia ist eine offene Gemeinschaftsenzyklopädie ohne qualifizierte Fachautorenschaft. Nach akademischen Richtlinien (z. B. FOM) unzulässig."
    },
    {
      id: "gutefrage",
      regex: /(^|\.)gutefrage\.net$/i,
      level: "RED",
      label: "Nicht zitierfähig",
      badgeClass: "badge-danger",
      description: "Gutefrage.net ist ein Laien-Forum ohne redaktionelle oder wissenschaftliche Validierung."
    },
    {
      id: "social-media",
      regex: /(^|\.)(quora\.com|reddit\.com|tiktok\.com|instagram\.com|facebook\.com|twitter\.com|x\.com)$/i,
      level: "RED",
      label: "Social Media / Forum",
      badgeClass: "badge-danger",
      description: "Social-Media-Inhalte und Forenbeiträge genügen in der Regel nicht dem Erfordernis wissenschaftlicher Nachprüfbarkeit."
    },
    {
      id: "boulevard",
      regex: /(^|\.)(bild\.de|thesun\.co\.uk|dailymail\.co\.uk|express\.de)$/i,
      level: "RED",
      label: "Boulevardpresse",
      badgeClass: "badge-danger",
      description: "Boulevardmedien sind nicht peer-reviewed und genügen nicht den Kriterien wissenschaftlicher Quellenarbeit."
    },

    // Gelbe Kategorie: Flüchtig oder mit Vorsicht zu genießen
    {
      id: "shortener",
      regex: /(^|\.)(bit\.ly|tinyurl\.com|t\.co|ow\.ly|is\.gd|buff\.ly|goo\.gl)$/i,
      level: "YELLOW",
      label: "Flüchtige Kurz-URL",
      badgeClass: "badge-warning",
      description: "URL-Shortener verschleiern das eigentliche Ziel, bergen Risiken von Link-Rot und sollten durch die Ziel-URL ersetzt werden."
    },
    {
      id: "blog",
      regex: /(^|\.)(medium\.com|substack\.com|wordpress\.com|blogspot\.com)$/i,
      level: "YELLOW",
      label: "Blog-Plattform",
      badgeClass: "badge-warning",
      description: "Freie Blog-Beiträge sind oft subjektiv. Prüfen Sie, ob der Verfasser eine anerkannte Fachautorität ist."
    },

    // Grüne Kategorie: Akademischer Standard
    {
      id: "doi",
      regex: /(^|\.)doi\.org$/i,
      level: "GREEN",
      label: "DOI (Empfohlen)",
      badgeClass: "badge-success",
      description: "Digital Object Identifier (DOI) gewährleistet persistente und dauerhafte Auffindbarkeit wissenschaftlicher Veröffentlichungen."
    },
    {
      id: "academic",
      regex: /\.(edu|ac\.uk|edu\.[a-z]{2})$/i,
      level: "GREEN",
      label: "Akademische Domain",
      badgeClass: "badge-success",
      description: "Offizielle Universitäts- oder Hochschuldomain mit hoher Verlässlichkeit."
    },
    {
      id: "official-gov",
      regex: /\.(gov|bund\.de|destatis\.de|europa\.eu)$/i,
      level: "GREEN",
      label: "Offizielle Quelle",
      badgeClass: "badge-success",
      description: "Staatliche Organisation, EU-Portal oder amtliches Statistikamt."
    }
  ];

  /**
   * Analysiert den Hostnamen einer URL gegen den Regelkatalog
   */
  function evaluateUrl(urlString) {
    try {
      const parsed = new URL(urlString);
      const hostname = parsed.hostname.toLowerCase();

      for (const rule of RULES) {
        if (rule.regex.test(hostname)) {
          return {
            level: rule.level,
            label: rule.label,
            badgeClass: rule.badgeClass,
            description: rule.description,
            hostname
          };
        }
      }

      return {
        level: "NEUTRAL",
        label: "Reguläre Domain",
        badgeClass: "badge-secondary",
        description: "Keine Auffälligkeiten. Bitte prüfen Sie die Quelle im Textkontext eigenständig.",
        hostname
      };
    } catch (e) {
      return {
        level: "RED",
        label: "Syntax-Fehler",
        badgeClass: "badge-danger",
        description: "Die Zeichenkette entspricht keiner validen URL-Struktur.",
        hostname: "ungültig"
      };
    }
  }

  return {
    RULES,
    evaluateUrl
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FormataDomainRules;
}
