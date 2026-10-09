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

  test('Extrahiert reine DOIs (doi: 10.xxxx/...) und wandelt in https://doi.org/ um', () => {
    const text = 'Ahmed et al. (2022): Deduplication, doi: 10.1016/j.jksuci.2021.04.005, Stand 2024.';
    const results = FormataParser.extractUrls(text);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].url, 'https://doi.org/10.1016/j.jksuci.2021.04.005');
  });

  test('Repariert PDF-Zeilenumbrüche in URLs vor Zugriffsdaten', () => {
    const text = 'Bitkom (2016): Backup, https://www.bitkom.org/sites/\nmain/files/file/import/170125-LF-Backup-Recovery.pdf [Zugriff: 27. 02. 2026]';
    const results = FormataParser.extractUrls(text);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].url, 'https://www.bitkom.org/sites/main/files/file/import/170125-LF-Backup-Recovery.pdf');
  });

  test('Extrahiert alle 18 Quellen fehlerfrei aus dem realen Seminararbeits-Korpus', () => {
    const seminarText = fs.readFileSync(path.join(__dirname, 'sample-real-seminar.txt'), 'utf8');
    const results = FormataParser.extractUrls(seminarText);
    assert.strictEqual(results.length, 18, `Erwartet 18 Quellen, aber ${results.length} erhalten`);
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

  // ----------------------------------------------------
  // TEST-GRUPPE 5: Zitierstile, Fußnoten & Buch-Erkennung
  // ----------------------------------------------------
  console.log('\n📌 Test-Gruppe 5: Zitierstile, Fußnoten & Buch-Erkennung');

  const FormataCitationDetector = require('../public/js/citation-detector');

  test('Erkennt FOM / Harvard Zitierstil zuverlässig', () => {
    const text = `
      Müller, K. (2023): Web-Architekturen im universitären Umfeld, Wiesbaden: Springer.
      Schmidt, T. (2022): IT-Sicherheitskonzepte für Webanwendungen, Berlin: De Gruyter.
    `;
    const style = FormataCitationDetector.detectCitationStyle(text);
    assert.strictEqual(style.style, 'harvard_fom');
  });

  test('Erkennt Deutsche Zitierweise (Fußnoten-Methode)', () => {
    const footnoteText = `
      1 Vgl. Mustermann, Max (2023): Cloud-Sicherheit, S. 45.
      2 Vgl. Schmidt, Anna (2022): Verlässliche Systeme, S. 12-14.
      3 Siehe Bundesamt für Sicherheit in der Informationstechnik (2024), S. 8.
    `;
    const style = FormataCitationDetector.detectCitationStyle(footnoteText);
    assert.strictEqual(style.style, 'footnote');
  });

  test('Erkennt IEEE-Zitierstil (nummerierte eckige Klammern)', () => {
    const ieeeText = `
      [1] J. Doe, "High Performance Computing," IEEE Trans., 2023.
      [2] K. Smith, "Cloud Architecture Reviews," ACM Computing, 2022.
    `;
    const style = FormataCitationDetector.detectCitationStyle(ieeeText);
    assert.strictEqual(style.style, 'ieee');
  });

  test('Extrahiert gedruckte Bücher und ISBN-Nummern', () => {
    const bookBib = `
      Tanenbaum, Andrew S., Wetherall, David J. (2021): Computernetzwerke, Pearson Studium. ISBN 978-3-86894-137-1.
    `;
    const books = FormataCitationDetector.extractBooksAndPrintSources(bookBib);
    assert.strictEqual(books.length, 1);
    assert.strictEqual(books[0].hasIsbn, true);
    assert.strictEqual(books[0].isbn, '9783868941371');
  });

  test('Prüft Plausibilität von Autor und Publikationsjahr', () => {
    const checkFuture = FormataCitationDetector.checkAuthorAndYearPlausibility('Mustermann, M. (2048): Zukunft der IT.');
    assert.strictEqual(checkFuture.isValid, false);
    assert.strictEqual(checkFuture.issues.some(i => i.includes('Zukunft')), true);

    const checkNoAuthor = FormataCitationDetector.checkAuthorAndYearPlausibility('https://example.com/ohne-autor (2023)');
    assert.strictEqual(checkNoAuthor.isValid, false);
    assert.strictEqual(checkNoAuthor.issues.some(i => i.includes('URL ohne Urheber')), true);
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
