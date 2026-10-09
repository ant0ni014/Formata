/**
 * Formata - Module: citation-detector.js
 * Erkennt und analysiert Zitierstile, Fußnoten-Zitationen, Bücher/Monographien (ISBN)
 * und führt Plausibilitätsprüfungen für Autoren und Erscheinungsjahre durch.
 */

const FormataCitationDetector = (() => {

  /**
   * Erkennt den primären Zitierstil eines Textes oder Verzeichnisses.
   * Unterstützt:
   * - FOM / Harvard-Standard (Autor-Jahr im Fließtext / Verzeichnis mit 'Nachname, V. (YYYY): ...')
   * - Deutsche Zitierweise (Fußnoten-Stil: Vgl. Nachname (YYYY), S. XX. bzw. hochgestellte Zahlen / [1], [^1])
   * - APA 7 (American Psychological Association: 'Author, A. (YYYY). Title. ...')
   * - IEEE (Nummerierte eckige Klammern: '[1] A. Author, ...')
   * - MLA (Modern Language Association)
   */
  function detectCitationStyle(text) {
    if (!text || typeof text !== 'string') {
      return {
        style: 'unknown',
        name: 'Unbekannt',
        confidence: 0,
        description: 'Kein analysierbarer Text vorhanden.',
        details: []
      };
    }

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 15);
    if (lines.length === 0) {
      return {
        style: 'unknown',
        name: 'Keine Einträge',
        confidence: 0,
        description: 'Zu wenige Zeilen für eine Stilanalyse.',
        details: []
      };
    }

    let harvardCount = 0;   // Autor (Jahr): ...
    let apaCount = 0;       // Author (Year). ...
    let ieeeCount = 0;      // [1] ...
    let footnoteCount = 0;  // 1 Vgl. ... / Vgl. Nachname (Jahr), S. ... / Fußnoten-Notation

    // Fußnoten-Erkennungsmuster
    const footnotePattern = /^(?:\d+[\.\s]|\^?\d+|\[\^\d+\])\s*(?:Vgl\.|Siehe|Ebd\.|Vgl\s+auch|Cfr\.)\s+[A-ZÄÖÜ][a-zäöüß]+/i;
    const footnoteInTextPattern = /(?:Vgl\.|Siehe|Ebd\.)\s+[A-ZÄÖÜ][a-zäöüß]+(?:\s+et\s+al\.)?\s*\(\d{4}\),?\s*S\.\s*\d+/i;

    // Harvard / FOM: Name, V. (YYYY): ...
    const harvardPattern = /^[A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ]\.?|\s*,\s*[A-ZÄÖÜ][a-zäöüß]+)?.*?\(\d{4}\)\s*:\s*/;

    // APA: Name, A. (YYYY). ... (Punkt nach Klammer, kein Doppelpunkt)
    const apaPattern = /^[A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ]\.?|\s*,\s*[A-ZÄÖÜ]\.?).*?\(\d{4}\)\s*\.\s*(?!:)/;

    // IEEE: [1] oder [12]
    const ieeePattern = /^\[\d{1,3}\]\s+[A-ZÄÖÜ]\./;

    for (const line of lines) {
      if (footnotePattern.test(line) || footnoteInTextPattern.test(line)) {
        footnoteCount++;
      } else if (ieeePattern.test(line)) {
        ieeeCount++;
      } else if (harvardPattern.test(line)) {
        harvardCount++;
      } else if (apaPattern.test(line)) {
        apaCount++;
      }
    }

    const totalDetected = harvardCount + apaCount + ieeeCount + footnoteCount;
    const totalLines = lines.length;

    if (footnoteCount > 0 && footnoteCount >= harvardCount && footnoteCount >= apaCount) {
      const conf = Math.min(100, Math.round((footnoteCount / Math.max(1, totalDetected || totalLines)) * 100));
      return {
        style: 'footnote',
        name: 'Deutsche Zitierweise (Fußnoten-Methode)',
        confidence: conf,
        badgeClass: 'badge-primary',
        description: 'Verwendet Fußnoten am Seitenende (z. B. "¹ Vgl. Mustermann (2023), S. 12"). Links und Vollbelege stehen in der Fußnote oder im Verzeichnis.',
        details: [`${footnoteCount} Fußnoten-Belege erkannt`]
      };
    }

    if (ieeeCount > 0 && ieeeCount >= harvardCount && ieeeCount >= apaCount) {
      const conf = Math.min(100, Math.round((ieeeCount / Math.max(1, totalDetected || totalLines)) * 100));
      return {
        style: 'ieee',
        name: 'IEEE-Standard (Nummeriert)',
        confidence: conf,
        badgeClass: 'badge-info',
        description: 'Technisch-naturwissenschaftlicher Standard mit fortlaufenden Nummern in eckigen Klammern [1], [2].',
        details: [`${ieeeCount} IEEE-Nummerierungen erkannt`]
      };
    }

    if (harvardCount >= apaCount && harvardCount > 0) {
      const conf = Math.min(100, Math.round((harvardCount / Math.max(1, totalDetected || totalLines)) * 100));
      const hasMixedApa = apaCount > 0;
      return {
        style: 'harvard_fom',
        name: 'FOM / Harvard-Zitierweise (Autor-Jahr)',
        confidence: conf,
        badgeClass: 'badge-success',
        description: 'Klassischer Standard an der FOM Hochschule: Nachname, Vorname (Jahr): Titel... mit Doppelpunkt nach der Jahresklammer.',
        warning: hasMixedApa ? `Inkonsistenz: ${apaCount} Quelle(n) verwenden Punkt statt Doppelpunkt (APA-Stil).` : null,
        details: [`${harvardCount} Harvard/FOM-Einträge erkannt`]
      };
    }

    if (apaCount > harvardCount && apaCount > 0) {
      const conf = Math.min(100, Math.round((apaCount / Math.max(1, totalDetected || totalLines)) * 100));
      return {
        style: 'apa',
        name: 'APA 7 (American Psychological Assoc.)',
        confidence: conf,
        badgeClass: 'badge-info',
        description: 'Internationaler Standard: Name (Jahr). Titel. Punkt nach Jahresangabe, keine spitzen Klammern um URLs.',
        details: [`${apaCount} APA-Einträge erkannt`]
      };
    }

    return {
      style: 'mixed_or_generic',
      name: 'Freies / Gemischtes Format',
      confidence: 60,
      badgeClass: 'badge-warning',
      description: 'Literaturverzeichnis weist keine einheitliche Syntax auf oder kombiniert verschiedene Konventionen.',
      details: ['Kein dominanter Standard identifiziert']
    };
  }

  /**
   * Extrahiert gedruckte Bücher und Monographien (Einträge ohne Web-URL/DOI, aber mit Autor, Jahr und Titel)
   * sowie darin enthaltene ISBNs.
   */
  function extractBooksAndPrintSources(rawText) {
    if (!rawText || typeof rawText !== 'string') return [];

    // Teile Text in Absätze/Quelleneinträge
    const entries = rawText
      .split(/\n\s*\n|\n(?=[A-ZÄÖÜ][a-zäöüß]+,\s+[A-ZÄÖÜ]|\b\[\d+\]\s+[A-ZÄÖÜ]|\b\d+[\.\s]+[A-ZÄÖÜ])/g)
      .map(e => e.trim())
      .filter(e => e.length > 25);

    const books = [];

    // Regex für ISBN-10 und ISBN-13: Erfordert entweder "ISBN" Präfix oder explizites 978/979 Format
    const isbnRegex = /(?:ISBN(?:-1[03])?:?\s*(97[89][-\s]?[0-9]{1,5}[-\s]?[0-9]+[-\s]?[0-9]+[-\s]?[0-9]|[0-9]{1,5}[-\s]?[0-9]+[-\s]?[0-9]+[-\s]?[0-9X])|\b(97[89][-\s]?[0-9]{1,5}[-\s]?[0-9]+[-\s]?[0-9]+[-\s]?[0-9])\b)/i;
    
    // Typisches Buch-/Monographie-Muster (Name (Jahr): Titel, Verlag, Ort)
    const bookPattern = /^([A-ZÄÖÜ][a-zäöüß]+(?:,\s+[A-ZÄÖÜ][a-zäöüß]+|\s+[A-ZÄÖÜ]\.)*.*?)\s*\((\d{4})\)\s*[:.]\s*([^,\n\r]+)(?:,\s*([^,\n\r]+))?/i;

    for (const entry of entries) {
      // Wenn der Eintrag bereits eine valide URL oder DOI enthält, ist er Primärquelle/Online-Quelle
      if (/https?:\/\/[^\s]+/i.test(entry) || /\bdoi:\s*10\.\d{4,9}/i.test(entry)) {
        continue;
      }

      const isbnMatch = entry.match(isbnRegex);
      const bookMatch = entry.match(bookPattern);

      // Nur als Buch erfassen, wenn entweder eine ISBN vorliegt oder Autor + Jahr + Titelstruktur
      if (isbnMatch || bookMatch) {
        const rawMatchedIsbn = isbnMatch ? (isbnMatch[1] || isbnMatch[2]) : null;
        const rawIsbn = rawMatchedIsbn ? rawMatchedIsbn.replace(/[-\s]/g, '') : null;
        const author = bookMatch ? bookMatch[1].trim() : 'Autor unbekannt';
        const year = bookMatch ? bookMatch[2] : null;
        const title = bookMatch ? bookMatch[3].trim() : entry.substring(0, 60);

        books.push({
          rawText: entry,
          author: author,
          year: year,
          title: title,
          isbn: rawIsbn,
          hasIsbn: !!rawIsbn,
          type: 'book'
        });
      }
    }

    return books;
  }

  /**
   * Prüft Autor- und Jahresangaben auf Plausibilität (Plausibility Check)
   */
  function checkAuthorAndYearPlausibility(entryText) {
    const currentYear = new Date().getFullYear();
    const issues = [];
    const suggestions = [];

    // 1. Suche nach 4-stelliger Jahreszahl in Klammern: (2023)
    const yearMatch = entryText.match(/\((1[89]\d\d|20\d\d)\)/);
    const noYearMatch = entryText.match(/\(\s*(?:o\.\s*J\.|o\.J\.|n\.d\.|ohne\s*Jahr)\s*\)/i);

    if (yearMatch) {
      const year = parseInt(yearMatch[1], 10);
      if (year > currentYear + 1) {
        issues.push(`Unplausibles Publikationsjahr in der Zukunft: ${year}`);
      } else if (year < 1960 && !entryText.toLowerCase().includes('historisch')) {
        issues.push(`Sehr altes Erscheinungsjahr (${year}) für ein IT-Thema`);
      }
    } else if (noYearMatch) {
      suggestions.push('Quelle ist mit "o. J." (ohne Jahr) gekennzeichnet.');
    } else {
      issues.push('Kein valides Erscheinungsjahr im Format (JJJJ) oder (o. J.) gefunden.');
    }

    // 2. Prüfung auf typische Autorenfehler
    if (/^\s*https?:\/\//i.test(entryText) || /^\s*<https?:\/\//i.test(entryText)) {
      issues.push('Quelle beginnt direkt mit einer URL ohne Urheber/Organisation.');
    }

    // 3. Prüfung auf Fußnoten-Syntax
    const isFootnote = /(?:Vgl\.|Siehe|Ebd\.)/i.test(entryText);

    return {
      isValid: issues.length === 0,
      issues: issues,
      suggestions: suggestions,
      isFootnote: isFootnote
    };
  }

  return {
    detectCitationStyle,
    extractBooksAndPrintSources,
    checkAuthorAndYearPlausibility
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FormataCitationDetector;
}
