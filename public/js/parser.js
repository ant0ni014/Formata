/**
 * Formata - Module: parser.js
 * Extrahiert URLs aus Fließtexten und akademischen Literaturverzeichnissen.
 * Berücksichtigt typische FOM-Zitierformen (<URL>, freistehend, nachfolgendes Zugriffsdatum).
 */

const FormataParser = (() => {
  // Regex für URL-Kandidaten (HTTP/HTTPS)
  const RAW_URL_REGEX = /https?:\/\/[^\s<>"]+/gi;

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
    const invalidEndingChars = ['.', ',', ';', ':', ')', ']', '"', '\'', '»', '«'];
    while (clean.length > 0 && invalidEndingChars.includes(clean[clean.length - 1])) {
      clean = clean.substring(0, clean.length - 1);
    }

    return clean;
  }

  /**
   * Extrahiert eindeutige URLs und deren Vorkommen im Text
   */
  function extractUrls(rawText) {
    if (!rawText || typeof rawText !== 'string') {
      return [];
    }

    const matches = rawText.match(RAW_URL_REGEX) || [];
    const extractedList = [];
    const seen = new Set();

    for (const match of matches) {
      const sanitized = stripTrailingPunctuation(match);
      if (sanitized && isValidHttpUrl(sanitized)) {
        if (!seen.has(sanitized)) {
          seen.add(sanitized);
          extractedList.push({
            rawMatch: match,
            url: sanitized
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
        // Globales Ersetzen der spezifischen URL
        const escaped = item.originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const reg = new RegExp(escaped, 'g');
        updatedText = updatedText.replace(reg, item.cleanedUrl);
      }
    }

    return updatedText;
  }

  return {
    extractUrls,
    stripTrailingPunctuation,
    isValidHttpUrl,
    reconstructBibliography
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FormataParser;
}
