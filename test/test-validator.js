/**
 * Formata - Test Suite (test/test-validator.js)
 * Überprüft Parsing, Tracking-Stripping, Domain-Scoring und Backend-Validierung.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const FormataParser = require('../public/js/parser');
const FormataHygiene = require('../public/js/hygiene');
const FormataDomainRules = require('../public/js/domain-rules');
const validateHandler = require('../api/validate');

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Starte automatisierte Formata-Test-Suite');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}`);
      console.error(`     -> ${err.message}`);
      failed++;
    }
  }

  async function asyncTest(name, fn) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}`);
      console.error(`     -> ${err.message}`);
      failed++;
    }
  }

  // ----------------------------------------------------
  // TEST-GRUPPE 1: Regex & Parser-Logik
  // ----------------------------------------------------
  console.log('📌 Test-Gruppe 1: Parser & Extraktion');

  test('Extrahiert URLs aus spitzen Klammern (<https://...>)', () => {
    const text = 'URL: <https://example.com/paper.pdf>, Zugriff am 12.01.2024.';
    const results = FormataParser.extractUrls(text);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].url, 'https://example.com/paper.pdf');
  });

  test('Bereinigt nachgestellte Satzzeichen (. , ; :) am URL-Ende', () => {
    const text = 'Siehe https://example.com/daten. Und auch https://example.com/info, Zugriff.';
    const results = FormataParser.extractUrls(text);
    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].url, 'https://example.com/daten');
    assert.strictEqual(results[1].url, 'https://example.com/info');
  });

  test('Rekonstruiert Text mit ersetzten gesäuberten URLs', () => {
    const original = 'Quelle: <https://test.de/doc?utm_source=tw>, Stand 2024.';
    const replacements = [{
      originalUrl: 'https://test.de/doc?utm_source=tw',
      cleanedUrl: 'https://test.de/doc'
    }];
    const reconstructed = FormataParser.reconstructBibliography(original, replacements);
    assert.strictEqual(reconstructed, 'Quelle: <https://test.de/doc>, Stand 2024.');
  });

  // ----------------------------------------------------
  // TEST-GRUPPE 2: URL-Hygiene (Tracking Stripping)
  // ----------------------------------------------------
  console.log('\n📌 Test-Gruppe 2: URL-Hygiene & Tracking-Filterung');

  test('Entfernt Google Analytics (utm_*) und Facebook (fbclid) Parameter', () => {
    const dirty = 'https://journal.org/art?utm_source=newsletter&utm_medium=email&fbclid=12345&articleId=99';
    const result = FormataHygiene.cleanUrl(dirty);
    assert.strictEqual(result.isModified, true);
    assert.strictEqual(result.removedParams.includes('utm_source'), true);
    assert.strictEqual(result.removedParams.includes('utm_medium'), true);
    assert.strictEqual(result.removedParams.includes('fbclid'), true);
    assert.strictEqual(result.cleanedUrl, 'https://journal.org/art?articleId=99');
  });

  test('Lässt saubere URLs mit essenziellen Query-Parametern unberührt', () => {
    const clean = 'https://destatis.de/query?page=1&lang=de';
    const result = FormataHygiene.cleanUrl(clean);
    assert.strictEqual(result.isModified, false);
    assert.strictEqual(result.cleanedUrl, clean);
    assert.strictEqual(result.removedParams.length, 0);
  });

  // ----------------------------------------------------
  // TEST-GRUPPE 3: Akademisches Domain-Scoring
  // ----------------------------------------------------
  console.log('\n📌 Test-Gruppe 3: Akademische Bewertungsheuristiken');

  test('Klassifiziert Wikipedia als RED (Nicht zitierfähig)', () => {
    const score = FormataDomainRules.evaluateUrl('https://de.wikipedia.org/wiki/Webtechnologie');
    assert.strictEqual(score.level, 'RED');
    assert.strictEqual(score.label, 'Nicht zitierfähig');
  });

  test('Klassifiziert Gutefrage.net als RED (Nicht zitierfähig)', () => {
    const score = FormataDomainRules.evaluateUrl('https://www.gutefrage.net/frage/beispiel');
    assert.strictEqual(score.level, 'RED');
  });

  test('Klassifiziert bit.ly als YELLOW (Flüchtige Kurz-URL)', () => {
    const score = FormataDomainRules.evaluateUrl('https://bit.ly/sample-link');
    assert.strictEqual(score.level, 'YELLOW');
  });

  test('Klassifiziert doi.org und Hochschulen als GREEN (Akademischer Standard)', () => {
    const doiScore = FormataDomainRules.evaluateUrl('https://doi.org/10.1007/s00287-020-01300-3');
    assert.strictEqual(doiScore.level, 'GREEN');

    const eduScore = FormataDomainRules.evaluateUrl('https://www.oxford.ac.uk/research');
    assert.strictEqual(eduScore.level, 'GREEN');
  });

  // ----------------------------------------------------
  // TEST-GRUPPE 4: Backend Serverless Proxy Integration
  // ----------------------------------------------------
  console.log('\n📌 Test-Gruppe 4: Backend Proxy & Reachability Check');

  await asyncTest('POST /api/validate verarbeitet Batch-Anfrage mit Mock-Response', async () => {
    const mockReq = {
      method: 'POST',
      body: {
        urls: [
          'https://www.destatis.de/DE/Home/_inhalt.html',
          'https://doi.org/10.1007/s00287-020-01300-3?utm_source=twitter'
        ]
      }
    };

    let responseData = null;
    let statusCode = 0;
    const mockRes = {
      setHeader: () => {},
      status: (code) => {
        statusCode = code;
        return {
          json: (data) => {
            responseData = data;
            return data;
          },
          end: () => {}
        };
      }
    };

    await validateHandler(mockReq, mockRes);
    assert.strictEqual(statusCode, 200);
    assert.strictEqual(responseData.success, true);
    assert.strictEqual(responseData.results.length, 2);
    
    // Prüfe erstes Ergebnis (Destatis)
    const destatis = responseData.results[0];
    assert.strictEqual(destatis.ok, true);
    assert.strictEqual(destatis.status, 200);
    assert.strictEqual(destatis.academicScore.level, 'GREEN');

    // Prüfe zweites Ergebnis (DOI mit UTM)
    const doi = responseData.results[1];
    assert.strictEqual(doi.trackingRemoved, true);
    assert.strictEqual(doi.removedParams.includes('utm_source'), true);
  });

  // Abschluss-Auswertung
  console.log('\n====================================================');
  console.log(`Ergebnis: ${passed} bestanden, ${failed} fehlgeschlagen`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
