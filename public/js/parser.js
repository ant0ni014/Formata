/**
 * Formata - Module: parser.js
 * Extrahiert URLs und DOIs aus Fließtexten und akademischen Literaturverzeichnissen.
 * Berücksichtigt typische FOM-Zitierformen (<URL>, freistehend, nachfolgendes Zugriffsdatum)
 * sowie OCR- und PDF-spezifische Scan- und Umbruch-Artefakte.
 */

const FormataParser = (() => {
  // Regex für URL-Kandidaten (HTTP/HTTPS)
  const RAW_URL_REGEX = /https?:\/\/[^\s<>"]+/gi;
  // Regex für DOIs (z.B. doi: 10.1016/... oder doi 10.1007/... oder https://doi.org/10....)
  const DOI_REGEX = /\bdoi(?::|\s)\s*(10\.\d{4,9}\/[^\s\n\r]+)/gi;

  /**
   * Bereinigt nachgestellte Satzzeichen, die typischerweise am Ende
   * von Sätzen oder Zitationen stehen, aber nicht zur URL gehören.
   */
  function stripTrailingPunctuation(url) {
    let clean = url.trim();

    // Entfernt spitze Klammern am Anfang/Ende falls vorhanden
    if (clean.startsWith('<')) clean = clean.substring(1);
    if (clean.endsWith('>')) clean = clean.substring(0, clean.length - 1);

    // Entfernt Anführungszeichen und Ticks am Anfang/Ende
    clean = clean.replace(/^['"‘“`]+|['"’”`]+$/g, '');

    // Entfernt nachgestellte Interpunktionszeichen
    const invalidEndingChars = ['.', ',', ';', ':', ')', ']', '"', '\'', '»', '«', '>'];
    while (clean.length > 0 && invalidEndingChars.includes(clean[clean.length - 1])) {
      clean = clean.substring(0, clean.length - 1);
    }

    // Entfernt OCR-Ticks innerhalb von Pfaden (z. B. /'main/ -> /main/)
    clean = clean.replace(/\/['‘`"]+/g, '/');

    return clean;
  }

  /**
   * Umfassende Vorverarbeitung für typische PDF- & OCR-Artefakte (aus Scans / Screenshots):
   */
  function preprocessPdfArtifacts(rawText) {
    if (!rawText || typeof rawText !== 'string') return '';

    let text = rawText.replace(/\r\n/g, '\n');

    // 1. Protokoll-Reparatur bei OCR-Fehlern: "hitps:/", "htps:/", "https:/" -> "https://"
    text = text.replace(/\b(?:h[it]{1,2}ps?|htps?):\/*(?=[a-zA-Z0-9])/gi, 'https://');
    text = text.replace(/\bhttp:\/*(?=[a-zA-Z0-9])/gi, 'http://');

    // 2. DOI OCR-Erkennung: "bor:", "dol:", "d0i:", "bo1:", "dor:" vor "10.xxxx" -> "doi: "
    text = text.replace(/\b(?:bor|dol|d0i|bo1|do1|dor|bol)[:\s]+(?=10\.\d{4,9})/gi, 'doi: ');

    // Repariere Zeilenumbrüche innerhalb/vor DOIs
    text = text.replace(/doi(?::|\s)\s*\n\s*(10\.\d{4,9})/gi, 'doi: $1');
    text = text.replace(/doi(?::|\s)\s*(10\.\d{4,9}\/)\s*\n\s*([A-Za-z0-9._-]+)/gi, 'doi: $1$2');

    // DOI eckige Klammer statt Slash: "10.1016] " -> "10.1016/"
    text = text.replace(/(10\.\d{4,9})[\]\}\)]\s*([a-zA-Z0-9._-]+)/gi, '$1/$2');

    // Fehlender Slash nach DOI Prefix bei OCR: "10.1109ACCESS" -> "10.1109/ACCESS"
    text = text.replace(/(10\.\d{4,9})(?=[A-Za-z])/gi, '$1/');

    // OCR-Leerzeichen innerhalb bekannter DOI-Muster reparieren
    text = text.replace(/(doi:\s*10\.\d{4,9}\/[^\s\n\r]+)(?:\s+([0-9]{4})\s+([0-9]+))/gi, '$1.$2.$3');

    // 3. Häufige OCR-Trenn- und Domain-Fehler
    text = text.replace(/\bbirkom\.\s*org\b/gi, 'bitkom.org');
    text = text.replace(/\benisaeuropa\.eu\b/gi, 'enisa.europa.eu');
    text = text.replace(/\bBSUGrundschutz\b/gi, 'BSI/Grundschutz');

    // Leerzeichen vor Top-Level-Domains entfernen: ". org" -> ".org", ". de" -> ".de"
    text = text.replace(/\.\s+(org|de|com|eu|net|edu|gov|cn|uk)\b/gi, '.$1');

    // Leerzeichen in Domain-Namen reparieren (z. B. "https://www. bsi. bund. de/")
    text = text.replace(/https?:\/\/\s*www\.\s*(?:[a-zA-Z0-9_-]+\s*\.\s*)+[a-zA-Z]{2,6}\s*\//gi, (m) => m.replace(/\s+/g, ''));

    // OCR-Dateiendungs- und Pfadfehler
    text = text.replace(/\brule\s+hum\b/gi, 'rule.html');
    text = text.replace(/\/ile\/import\//gi, '/file/import/');

    // 4. Repariere URLs vor Zugriffs-/Stand-Vermerken über Zeilenumbrüche
    const ACCESS_KEYWORDS = '(?:Zugriff|Stand|abgerufen|eingesehen|online|verf[uü]gbar|retrieved|accessed|letzter\\s+Abruf)';
    const accessPattern = new RegExp(
      '(' +
      'https?:\\/\\/[^\\s\\[\\(\\>\\n\\r]+' +
      '(?:\\s*\\n\\s*[^\\s\\[\\(\\>\\n\\r]+)+' +
      ')' +
      '(\\s*(?:[\\[\\(,;\\s]|\\b)' + ACCESS_KEYWORDS + ')',
      'gi'
    );

    text = text.replace(accessPattern, (fullMatch, urlPart, accessTag) => {
      const cleanUrl = urlPart.replace(/\s+/g, '');
      return cleanUrl + ' ' + accessTag;
    });

    // 5. Einzelne Spaces in Pfadsegmenten vor Zugriff reparieren
    const spacePattern = new RegExp(
      '(' +
      'https?:\\/\\/[^\\s\\[\\(\\>]+' +
      '(?:\\s+[^\\s\\[\\(\\>]+)+' +
      ')' +
      '(\\s*(?:[\\[\\(,;\\s]|\\b)' + ACCESS_KEYWORDS + ')',
      'gi'
    );

    text = text.replace(spacePattern, (m, urlPart, accessTag) => {
      if (!urlPart.includes('http://') && !urlPart.includes('https://', 7)) {
        return urlPart.replace(/\s+/g, '') + ' ' + accessTag;
      }
      return m;
    });

    // 6. Repariere URLs, die auf Slash / Bindestrich / Unterstrich enden und in der nächsten Zeile weitergehen
    text = text.replace(/(https?:\/\/[^\s\n\r]+[/_\-])\n\s*([a-zA-Z0-9._~%/-]+)(?!\s*\()/gi, (m, p1, p2) => {
      if (/^[A-Z][a-z]+,\s*[A-Z]/.test(p2) || /^\d{4}:/.test(p2)) {
        return m;
      }
      return p1 + p2;
    });

    return text;
  }

  /**
   * Extrahiert eindeutige URLs und DOIs aus dem Text
   */
  function extractUrls(rawText) {
    if (!rawText || typeof rawText !== 'string') {
      return [];
    }

    const preprocessed = preprocessPdfArtifacts(rawText);
    const extractedList = [];
    const seen = new Set();

    // 1. DOIs extrahieren und in kanonische URLs umwandeln
    let doiMatch;
    const doiSearchRegex = new RegExp(DOI_REGEX.source, 'gi');
    while ((doiMatch = doiSearchRegex.exec(preprocessed)) !== null) {
      let cleanDoi = stripTrailingPunctuation(doiMatch[1].trim());
      const canonicalUrl = `https://doi.org/${cleanDoi}`;
      if (!seen.has(canonicalUrl)) {
        seen.add(canonicalUrl);
        extractedList.push({
          rawMatch: doiMatch[0],
          url: canonicalUrl,
          isDoi: true,
          doi: cleanDoi
        });
      }
    }

    // 2. Reguläre URLs extrahieren
    const urlMatches = preprocessed.match(RAW_URL_REGEX) || [];
    for (const match of urlMatches) {
      const sanitized = stripTrailingPunctuation(match);
      if (sanitized && isValidHttpUrl(sanitized)) {
        if (!seen.has(sanitized)) {
          seen.add(sanitized);
          extractedList.push({
            rawMatch: match,
            url: sanitized,
            isDoi: sanitized.includes('doi.org/')
          });
        }
      }
    }

    return extractedList;
  }

  /**
   * Prüft, ob ein String eine wohlgeformte HTTP/HTTPS-URL darstellt
   */
  function isValidHttpUrl(string) {
    try {
      const parsed = new URL(string);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (_) {
      return false;
    }
  }

  /**
   * Ersetzt im ursprünglichen Text alte unbereinigte URLs durch bereinigte URLs
   */
  function reconstructBibliography(originalText, urlReplacements) {
    let updatedText = originalText;
    
    // urlReplacements: [{ originalUrl, cleanedUrl }]
    for (const item of urlReplacements) {
      if (item.originalUrl && item.cleanedUrl && item.originalUrl !== item.cleanedUrl) {
        const escaped = item.originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const reg = new RegExp(escaped, 'g');
        updatedText = updatedText.replace(reg, item.cleanedUrl);
      }
    }

    return updatedText;
  }

  return {
    extractUrls,
    preprocessPdfArtifacts,
    stripTrailingPunctuation,
    isValidHttpUrl,
    reconstructBibliography
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FormataParser;
}
