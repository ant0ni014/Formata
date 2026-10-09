/**
 * Formata - API: /api/validate
 * Serverless Proxy & Link Integrity Validator (Node.js 18+)
 * 
 * Umgeht CORS-Restriktionen, führt HEAD/GET-Checks mit 5000ms Timeout aus,
 * maskiert User-Agent gegen Bot-Schutz und verfolgt Redirects.
 */

// Tracking Parameter Pattern Blacklist
const TRACKING_PARAM_REGEXES = [
  /^utm_/i,
  /^ga_/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^dclid$/i,
  /^gclsrc$/i,
  /^twclid$/i,
  /^igshid$/i,
  /^mc_cid$/i,
  /^mc_eid$/i,
  /^_hsenc$/i,
  /^_hsmi$/i,
  /^ref$/i,
  /^ref_src$/i,
  /^source$/i,
  /^si$/i // Spotify / YouTube share ID
];

// Wissenschaftliche Bewertungsregeln (Domain-Scoring)
const DOMAIN_RULES = [
  {
    regex: /(^|\.)wikipedia\.org$/i,
    level: "RED",
    label: "Nicht zitierfähig",
    reason: "Offene Enzyklopädie ohne festen wissenschaftlichen Autorenkreis (nach FOM-Leitfaden unzulässig)."
  },
  {
    regex: /(^|\.)gutefrage\.net$/i,
    level: "RED",
    label: "Nicht zitierfähig",
    reason: "Laien-Forum / Social Q&A-Plattform ohne wissenschaftliche Qualitätsprüfung."
  },
  {
    regex: /(^|\.)(quora\.com|reddit\.com|tiktok\.com|instagram\.com)$/i,
    level: "RED",
    label: "Nicht zitierfähig",
    reason: "Social-Media-Plattform bzw. Forum ohne Peer-Review oder akademischen Verfasser."
  },
  {
    regex: /(^|\.)(bild\.de|thesun\.co\.uk|dailymail\.co\.uk)$/i,
    level: "RED",
    label: "Boulevardpresse",
    reason: "Boulevardmedien genügen nicht den akademischen Qualitätsstandards."
  },
  {
    regex: /(^|\.)(bit\.ly|tinyurl\.com|t\.co|ow\.ly|is\.gd|buff\.ly)$/i,
    level: "YELLOW",
    label: "URL-Shortener (Flüchtig)",
    reason: "Kurz-URLs verschleiern das Originalziel, besitzen keine Dauerhaftigkeit und neigen zu Link-Rot."
  },
  {
    regex: /(^|\.)(medium\.com|substack\.com|wordpress\.com|blogspot\.com)$/i,
    level: "YELLOW",
    label: "Blog-Plattform",
    reason: "Freie Blog-Publikation. Autorschaft, Fachkompetenz und dauerhafte Zitierbarkeit manuell prüfen."
  },
  {
    regex: /(^|\.)(doi\.org)$/i,
    level: "GREEN",
    label: "DOI (Goldstandard)",
    reason: "Persistenter Digital Object Identifier mit gesicherter Langzeitverfügbarkeit."
  },
  {
    regex: /\.(edu|ac\.uk|edu\.[a-z]{2})$/i,
    level: "GREEN",
    label: "Akademische Einrichtung",
    reason: "Offizielle Hochschul- oder Universitätsdomain."
  },
  {
    regex: /\.(gov|bund\.de|destatis\.de)$/i,
    level: "GREEN",
    label: "Offizielle Behörde / Statistik",
    reason: "Verifizierte Regierungs- oder statistische Primärquelle."
  }
];

/**
 * Bereinigt eine URL von Tracking-Parametern
 */
function cleanTrackingParams(rawUrl) {
  try {
    const urlObj = new URL(rawUrl);
    const removedParams = [];
    const keysToDelete = [];

    for (const key of urlObj.searchParams.keys()) {
      const isTracking = TRACKING_PARAM_REGEXES.some(r => r.test(key));
      if (isTracking) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      removedParams.push(key);
      urlObj.searchParams.delete(key);
    }

    return {
      cleanedUrl: urlObj.toString(),
      trackingRemoved: removedParams.length > 0,
      removedParams
    };
  } catch (e) {
    return {
      cleanedUrl: rawUrl,
      trackingRemoved: false,
      removedParams: []
    };
  }
}

/**
 * Ermittelt die akademische Bewertung anhand der Host-Domain
 */
function evaluateAcademicScore(urlString) {
  try {
    const host = new URL(urlString).hostname.toLowerCase();
    for (const rule of DOMAIN_RULES) {
      if (rule.regex.test(host)) {
        return {
          level: rule.level,
          label: rule.label,
          reason: rule.reason
        };
      }
    }
    return {
      level: "NEUTRAL",
      label: "Keine Auffälligkeit",
      reason: "Domain nicht in Negativ- oder Positivlisten erfasst. Manuelle Inhaltsprüfung empfohlen."
    };
  } catch (e) {
    return {
      level: "NEUTRAL",
      label: "Ungültige URL",
      reason: "Hostname konnte nicht geparst werden."
    };
  }
}

/**
 * Führt einen asynchronen HTTP-Reachability-Check durch
 * HEAD-Request mit Fallback auf GET bei 405/403
 * Hartes Timeout: 5000 ms
 */
async function checkLinkReachability(targetUrl) {
  const timeoutMs = 5000;
  const startTime = Date.now();
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 FormataAcademicValidator/1.0",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7"
  };

  const executeFetch = async (method) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(targetUrl, {
        method,
        headers,
        redirect: "follow",
        signal: controller.signal
      });
      clearTimeout(timer);
      return response;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  };

  try {
    // 1. HEAD Request versuchen
    let response;
    let methodUsed = "HEAD";
    try {
      response = await executeFetch("HEAD");
      // Fallback auf GET, falls HEAD vom Server abgewiesen wird (z. B. 400, 403, 404, 405 bei BSI/NIST/Archiven)
      if (!response.ok) {
        try {
          const getResponse = await executeFetch("GET");
          if (getResponse.ok || response.status >= 400) {
            response = getResponse;
            methodUsed = "GET";
          }
        } catch (_) {
          // Behalte die ursprüngliche HEAD-Antwort bei Fehlern im GET-Versuch
        }
      }
    } catch (headErr) {
      if (headErr.name !== "AbortError") {
        methodUsed = "GET";
        response = await executeFetch("GET");
      } else {
        throw headErr;
      }
    }

    const duration = Date.now() - startTime;
    return {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      redirected: response.redirected,
      finalUrl: response.url || targetUrl,
      responseTimeMs: duration,
      methodUsed,
      error: null
    };
  } catch (err) {
    const duration = Date.now() - startTime;
    let errorMessage = err.message || "Netzwerkfehler";
    let status = 0;

    if (err.name === "AbortError" || duration >= timeoutMs) {
      errorMessage = "Timeout überschritten (5000 ms)";
      status = 408; // Request Timeout
    } else if (err.cause?.code) {
      errorMessage = `Netzwerkfehler: ${err.cause.code}`;
    }

    return {
      status,
      statusText: errorMessage,
      ok: false,
      redirected: false,
      finalUrl: null,
      responseTimeMs: duration,
      methodUsed: "FAILED",
      error: errorMessage
    };
  }
}

/**
 * Sucht bei HTTP 404 nach typischen Silbentrennungsfehlern (fehlende Bindestriche durch PDF-Umbruch)
 */
async function findHyphenCorrection(failedUrl) {
  try {
    const parsed = new URL(failedUrl);
    const path = parsed.pathname;
    const joinWords = ['for', 'work', 'incremental', 'failover', 'and', 'with', 'together'];
    const candidates = new Set();

    for (const word of joinWords) {
      const reg = new RegExp('([a-z]{3,})(' + word + ')(?=[/.-]|$)', 'gi');
      if (reg.test(path)) {
        const fixedPath = path.replace(reg, '$1-$2');
        const fixedUrl = new URL(parsed.toString());
        fixedUrl.pathname = fixedPath;
        candidates.add(fixedUrl.toString());

        if (fixedUrl.pathname.includes('/de/blogs/')) {
          const noDe = new URL(fixedUrl.toString());
          noDe.pathname = noDe.pathname.replace('/de/blogs/', '/blogs/');
          candidates.add(noDe.toString());
        }
      }
    }

    for (const cand of candidates) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(cand, {
          method: 'GET',
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
          },
          redirect: 'follow',
          signal: controller.signal
        });
        clearTimeout(timer);
        if (res.ok) {
          return {
            suggestedUrl: cand,
            reason: "Tippfehler im Pfad erkannt (fehlender Bindestrich, z. B. durch Silbentrennung im PDF). Korrigierte URL ist erreichbar!"
          };
        }
      } catch (_) {}
    }
    return null;
  } catch (_) {
    return null;
  }
}

/**
 * Concurrency Pool zur Vermeidung von Socket-Überlastung
 */
async function processBatch(urls, concurrency = 5) {
  const results = [];
  const queue = [...urls];
  
  const worker = async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;

      const { cleanedUrl, trackingRemoved, removedParams } = cleanTrackingParams(item);
      const academicScore = evaluateAcademicScore(cleanedUrl);
      
      let reachability;
      try {
        reachability = await checkLinkReachability(cleanedUrl);
        if (!reachability.ok && reachability.status === 404) {
          const suggestion = await findHyphenCorrection(cleanedUrl);
          if (suggestion) {
            reachability.suggestion = suggestion;
          }
        }
      } catch (e) {
        reachability = {
          status: 0,
          statusText: e.message,
          ok: false,
          redirected: false,
          finalUrl: null,
          responseTimeMs: 0,
          methodUsed: "NONE",
          error: e.message
        };
      }

      results.push({
        originalUrl: item,
        cleanedUrl,
        trackingRemoved,
        removedParams,
        academicScore,
        ...reachability
      });
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, () => worker());
  await Promise.all(workers);

  // Ergebnisse in ursprünglicher Reihenfolge sortieren
  const urlOrderMap = new Map(urls.map((u, i) => [u, i]));
  results.sort((a, b) => (urlOrderMap.get(a.originalUrl) ?? 0) - (urlOrderMap.get(b.originalUrl) ?? 0));

  return results;
}

/**
 * Haupt-Handler (Vercel Serverless Function & Express Middleware)
 */
module.exports = async function handler(req, res) {
  // CORS-Header für flexible Aufrufbarkeit
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Nur POST-Anfragen sind zulässig." });
  }

  try {
    let body = req.body;
    if (!body && req.readable) {
      const buffers = [];
      for await (const chunk of req) {
        buffers.push(chunk);
      }
      const rawText = Buffer.concat(buffers).toString('utf-8');
      if (rawText) {
        try { body = JSON.parse(rawText); } catch (_) { body = {}; }
      }
    } else if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (_) { body = {}; }
    }
    body = body || {};
    const urls = Array.isArray(body.urls) ? body.urls : [];

    if (urls.length === 0) {
      return res.status(400).json({ error: "Keine URLs zur Validierung übermittelt." });
    }

    if (urls.length > 50) {
      return res.status(400).json({ error: "Maximal 50 URLs pro Prüfvorgang zulässig." });
    }

    // Validieren
    const results = await processBatch(urls, 5);

    return res.status(200).json({
      success: true,
      total: results.length,
      processedAt: new Date().toISOString(),
      results
    });
  } catch (error) {
    console.error("Fehler bei Link-Validierung:", error);
    return res.status(500).json({
      error: "Interner Serverfehler während der Validierung.",
      details: error.message
    });
  }
};
