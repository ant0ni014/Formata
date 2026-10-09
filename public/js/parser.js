/**
 * Formata - Module: parser.js
 * Extrahiert URLs und DOIs aus Fließtexten und akademischen Literaturverzeichnissen.
 * Berücksichtigt typische FOM-Zitierformen (<URL>, freistehend, nachfolgendes Zugriffsdatum,
 * sowie PDF-spezifische Zeilenumbrüche und Leerzeichenartefakte).
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

    // Entfernt nachgestellte Interpunktionszeichen
    const invalidEndingChars = ['.', ',', ';', ':', ')', ']', '"', '\'', '»', '«', '>'];
    while (clean.length > 0 && invalidEndingChars.includes(clean[clean.length - 1])) {
      clean = clean.substring(0, clean.length - 1);
    }

    return clean;
  }

  /**
   * Vorverarbeitung für typische PDF-Kopier-Artefakte:
   * - Zeilenumbrüche mitten in URLs vor diversen Zugriffs-/Stand-Vermerken
   * - Zeilenumbrüche vor/innerhalb von DOI-Bezeichnern (z. B. "doi:\n10.1109/..." oder "10.6028/\nNIST...")
   * - Leerzeichenartefakte in Domains (z. B. "https://www. bsi. bund. de/")
   */
  function preprocessPdfArtifacts(rawText) {
    if (!rawText || typeof rawText !== 'string') return '';

    let text = rawText.replace(/\r\n/g, '\n');

    // 1. Repariere Zeilenumbrüche innerhalb/vor DOIs
    text = text.replace(/doi(?::|\s)\s*\n\s*(10\.\d{4,9})/gi, 'doi: $1');
    text = text.replace(/doi(?::|\s)\s*(10\.\d{4,9}\/)\s*\n\s*([A-Za-z0-9._-]+)/gi, 'doi: $1$2');

    // 2. Repariere Leerzeichen in Domain-Namen (z. B. "https://www. bsi. bund. de/")
    text = text.replace(/https?:\/\/\s*www\.\s*(?:[a-zA-Z0-9_-]+\s*\.\s*)+[a-zA-Z]{2,6}\s*\//gi, (m) => m.replace(/\s+/g, ''));

    // 3. Repariere URLs vor Zugriffs-/Stand-Vermerken über Zeilenumbrüche
    // Erkennt: Zugriff, Stand, abgerufen, eingesehen, online, verfügbar, retrieved, accessed, etc.
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

    // 4. Einzelne Spaces in Pfadsegmenten vor Zugriff reparieren (z. B. "/2025- 03/")
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

    // 5. Repariere URLs, die auf Slash / Bindestrich / Unterstrich enden und in der nächsten Zeile weitergehen (ohne Zugriffsvermerk)
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
