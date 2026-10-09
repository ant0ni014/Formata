/**
 * Formata - Module: hygiene.js
 * Identifiziert und entfernt Marketing- und Telemetrie-Trackingparameter aus URLs.
 */

const FormataHygiene = (() => {
  const TRACKING_PATTERNS = [
    // Google Analytics & Ads
    /^utm_/i,
    /^ga_/i,
    /^gclid$/i,
    /^dclid$/i,
    /^gclsrc$/i,
    // Meta / Facebook / Instagram
    /^fbclid$/i,
    /^igshid$/i,
    // Twitter / X
    /^twclid$/i,
    // Microsoft / Bing
    /^msclkid$/i,
    // Newsletter & Mail Marketing
    /^mc_cid$/i,
    /^mc_eid$/i,
    /^_hsenc$/i,
    /^_hsmi$/i,
    // Plattformspezifische Tracker
    /^si$/i,       // Spotify / YouTube Sharing
    /^ref$/i,      // Generischer Referrer
    /^ref_src$/i,  // Twitter Web Referrer
    /^source$/i    // Kampagnenquelle
  ];

  /**
   * Bereinigt eine gegebene URL von bekannten Tracking-Parametern
   */
  function cleanUrl(rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      const removedParams = [];
      const keysToDelete = [];

      for (const key of parsed.searchParams.keys()) {
        const isTracking = TRACKING_PATTERNS.some(regex => regex.test(key));
        if (isTracking) {
          keysToDelete.push(key);
        }
      }

      for (const key of keysToDelete) {
        removedParams.push(key);
        parsed.searchParams.delete(key);
      }

      return {
        originalUrl: rawUrl,
        cleanedUrl: parsed.toString(),
        isModified: removedParams.length > 0,
        removedParams
      };
    } catch (e) {
      return {
        originalUrl: rawUrl,
        cleanedUrl: rawUrl,
        isModified: false,
        removedParams: []
      };
    }
  }

  return {
    cleanUrl,
    TRACKING_PATTERNS
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FormataHygiene;
}
