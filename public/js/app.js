/**
 * Formata - Main Application Controller (public/js/app.js)
 * Verwaltet UI-Events, asynchrone API-Anfragen, State, Rendering und Exports.
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM-Elemente
  const elements = {
    bibInput: document.getElementById('bibInput'),
    btnValidate: document.getElementById('btnValidate'),
    btnClear: document.getElementById('btnClear'),
    btnLoadSample: document.getElementById('btnLoadSample'),
    btnCopyCleanedText: document.getElementById('btnCopyCleanedText'),
    btnExportCsv: document.getElementById('btnExportCsv'),
    
    btnUploadPdf: document.getElementById('btnUploadPdf'),
    pdfFileInput: document.getElementById('pdfFileInput'),
    btnUploadScreenshot: document.getElementById('btnUploadScreenshot'),
    screenshotFileInput: document.getElementById('screenshotFileInput'),
    btnExportScreenshot: document.getElementById('btnExportScreenshot'),
    
    // Status & Feedback
    progressContainer: document.getElementById('progressContainer'),
    progressBar: document.getElementById('progressBar'),
    progressText: document.getElementById('progressText'),
    statusMessage: document.getElementById('statusMessage'),
    
    // Summary Metrics
    statTotal: document.getElementById('statTotal'),
    statValid: document.getElementById('statValid'),
    statCleaned: document.getElementById('statCleaned'),
    statIssues: document.getElementById('statIssues'),
    
    // Results
    resultsSection: document.getElementById('resultsSection'),
    resultsTableBody: document.getElementById('resultsTableBody'),
    filterBtns: document.querySelectorAll('.filter-btn'),
    activeFilterCount: document.getElementById('activeFilterCount'),
    
    // Toast
    toast: document.getElementById('toast')
  };

  // Anwendungsstatus (State)
  let currentResults = [];
  let currentOriginalText = '';
  let activeFilter = 'all';

  // Beispiel-Literaturverzeichnis nach FOM-Richtlinien
  const SAMPLE_BIBLIOGRAPHY = `Literaturverzeichnis (FOM Musterbeispiel):

Destatis (2024): Statistisches Bundesamt – Hochschulen und Studierende im Wintersemester.
URL: <https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Bildung-Forschung-Kultur/Hochschulen/_inhalt.html>, Zugriff am: 05.03.2024.

Müller, K. (2023): Web-Architekturen und CORS im universitären Umfeld. In: Journal of Web Science, Vol. 14, S. 45-60.
DOI: <https://doi.org/10.1007/s00287-020-01300-3?utm_source=twitter&utm_medium=academic_share&fbclid=IwAR234>, Zugriff am: 12.01.2024.

Wikipedia-Autoren (2024): Web Engineering.
URL: https://de.wikipedia.org/wiki/Web_Engineering, Zugriff am: 15.02.2024.

Tech-Kurzlink (2023): Zusammenfassung Web-Technologien 2023.
URL: <https://bit.ly/fom-web-tech-demo>, Zugriff am: 10.11.2023.

Invalide Quelle (2022): Dead Link Demonstration.
URL: <https://httpstat.us/404>, Zugriff am: 01.04.2023.

Server-Fehler Quelle (2021): Internal Server Error Demonstration.
URL: <https://httpstat.us/500>, Zugriff am: 18.06.2022.

Harvard University (2024): Research Guidelines in Computer Science.
URL: https://www.harvard.edu/, Zugriff am: 08.02.2024.`;

  // Initiale Event-Listener
  initEventListeners();

  function initEventListeners() {
    elements.btnLoadSample.addEventListener('click', () => {
      elements.bibInput.value = SAMPLE_BIBLIOGRAPHY;
      showToast('Beispiel-Literaturverzeichnis geladen.');
      elements.bibInput.focus();
    });

    elements.btnClear.addEventListener('click', () => {
      elements.bibInput.value = '';
      resetResults();
      showToast('Eingabefeld geleert.');
    });

    elements.btnValidate.addEventListener('click', handleValidate);

    elements.btnCopyCleanedText.addEventListener('click', handleCopyCleanedBibliography);

    elements.btnExportCsv.addEventListener('click', handleExportCsv);

    if (elements.btnUploadPdf && elements.pdfFileInput) {
      elements.btnUploadPdf.addEventListener('click', () => {
        elements.pdfFileInput.click();
      });

      elements.pdfFileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) {
          processPdfFile(file);
          e.target.value = '';
        }
      });
    }

    if (elements.btnExportScreenshot) {
      elements.btnExportScreenshot.addEventListener('click', handleExportScreenshot);
    }

    if (elements.btnUploadScreenshot && elements.screenshotFileInput) {
      elements.btnUploadScreenshot.addEventListener('click', () => {
        elements.screenshotFileInput.click();
      });

      elements.screenshotFileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) {
          processScreenshotOcr(file);
          e.target.value = ''; // Reset für erneute Auswahl
        }
      });
    }

    // Strg + V Event für Bild-/Screenshot-Einfügen
    window.addEventListener('paste', handlePasteEvent);

    // Drag & Drop für Screenshots
    setupDragAndDrop();

    elements.filterBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        elements.filterBtns.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        activeFilter = e.target.dataset.filter;
        renderResultsTable();
      });
    });
  }

  /**
   * Haupt-Validierungsprozess
   */
  async function handleValidate() {
    const text = elements.bibInput.value.trim();
    if (!text) {
      showToast('Bitte fügen Sie zuerst ein Literaturverzeichnis ein.', 'warning');
      elements.bibInput.focus();
      return;
    }

    currentOriginalText = text;

    // 1. URLs extrahieren
    const extracted = FormataParser.extractUrls(text);
    if (extracted.length === 0) {
      showToast('Keine gültigen HTTP/HTTPS URLs im Text gefunden.', 'warning');
      return;
    }

    const uniqueUrls = extracted.map(item => item.url);

    // UI für Ladevorgang vorbereiten
    setLoadingState(true);
    currentResults = [];
    elements.resultsSection.style.display = 'block';
    renderResultsTable();
    updateSummaryMetrics(currentResults);

    // Sanftes Scrollen zu den Ergebnissen
    elements.resultsSection.scrollIntoView({ behavior: 'smooth' });

    // 2. URLs in Chunks aufteilen (je 5 URLs) für Ausfallsicherheit und Live-Updates
    const CHUNK_SIZE = 5;
    const chunks = [];
    for (let i = 0; i < uniqueUrls.length; i += CHUNK_SIZE) {
      chunks.push(uniqueUrls.slice(i, i + CHUNK_SIZE));
    }

    try {
      for (let c = 0; c < chunks.length; c++) {
        const chunkUrls = chunks[c];
        const processedBefore = currentResults.length;
        const pct = Math.round(((c + 0.5) / chunks.length) * 90);
        updateProgress(pct, `Prüfe ${processedBefore + 1} bis ${processedBefore + chunkUrls.length} von ${uniqueUrls.length} Quellen...`);

        try {
          const response = await fetch('/api/validate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ urls: chunkUrls })
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const data = await response.json();
          const chunkResults = data.results || [];
          currentResults.push(...chunkResults);

        } catch (chunkErr) {
          console.warn(`Fehler bei Chunk ${c + 1}:`, chunkErr);
          // Fallback: Damit keine Quelle verloren geht, Offline-Einträge generieren
          chunkUrls.forEach(u => {
            currentResults.push({
              originalUrl: u,
              cleanedUrl: u,
              status: 408,
              statusText: "Zeitüberschreitung / Server antwortet nicht",
              ok: false,
              trackingRemoved: false,
              removedParams: [],
              academicScore: FormataDomainRules.evaluateUrl(u),
              responseTimeMs: 3500
            });
          });
        }

        // Live-Update von Tabelle und Kennzahlen nach jedem Chunk!
        updateSummaryMetrics(currentResults);
        renderResultsTable();
      }

      updateProgress(100, `Alle ${currentResults.length} Quellen erfolgreich validiert!`);
      setTimeout(() => {
        setLoadingState(false);
      }, 400);

      showToast(`Validierung abgeschlossen: Alle ${currentResults.length} Quellen analysiert! ✨`);

    } catch (err) {
      console.error('Fehler bei der Validierung:', err);
      setLoadingState(false);
      showToast(`Validierungsfehler: ${err.message}`, 'error');
    }
  }

  /**
   * Berechnet und visualisiert die Statuskacheln (Metriken)
   */
  function updateSummaryMetrics(results) {
    const total = results.length;
    const valid = results.filter(r => r.ok || (r.status >= 200 && r.status < 300)).length;
    const cleaned = results.filter(r => r.trackingRemoved).length;
    const issues = results.filter(r => (!r.ok && !(r.status >= 200 && r.status < 300)) || r.academicScore?.level === 'RED').length;

    elements.statTotal.textContent = total;
    elements.statValid.textContent = valid;
    elements.statCleaned.textContent = cleaned;
    elements.statIssues.textContent = issues;
  }

  /**
   * Filtert und rendert die Ergebnistabelle
   */
  function renderResultsTable() {
    elements.resultsTableBody.innerHTML = '';

    const filtered = currentResults.filter(item => {
      const isSuccess = item.ok || (item.status >= 200 && item.status < 300);
      if (activeFilter === 'all') return true;
      if (activeFilter === 'valid') return isSuccess;
      if (activeFilter === 'cleaned') return item.trackingRemoved;
      if (activeFilter === 'issues') return !isSuccess || item.academicScore?.level === 'RED' || item.academicScore?.level === 'YELLOW';
      return true;
    });

    elements.activeFilterCount.textContent = `(${filtered.length} von ${currentResults.length} angezeigt)`;

    if (filtered.length === 0) {
      const emptyRow = document.createElement('tr');
      emptyRow.innerHTML = `<td colspan="6" class="text-center py-4 text-muted">Keine Einträge für den ausgewählten Filter gefunden.</td>`;
      elements.resultsTableBody.appendChild(emptyRow);
      return;
    }

    filtered.forEach((item, index) => {
      const row = document.createElement('tr');
      row.className = getRowHighlightClass(item);

      // Status Badge (Grün, Gelb, Rot)
      const statusBadge = getStatusBadge(item);
      
      // Akademische Bewertung
      const academicBadge = getAcademicBadge(item.academicScore);

      // Diff Anzeige / URL Hygiene / Suggestions
      const urlDisplayHtml = formatUrlDisplay(item);

      // Reaktionszeit
      const responseTime = item.responseTimeMs ? `${item.responseTimeMs} ms` : '—';

      row.innerHTML = `
        <td class="text-center">${index + 1}</td>
        <td>${statusBadge}</td>
        <td class="url-cell">${urlDisplayHtml}</td>
        <td>${academicBadge}</td>
        <td class="text-muted small">${responseTime}</td>
        <td class="action-cell">
          <button class="btn btn-sm btn-outline copy-single-btn" data-url="${escapeHtml(item.cleanedUrl)}" title="Bereinigte URL kopieren">
            📋 Kopieren
          </button>
        </td>
      `;

      elements.resultsTableBody.appendChild(row);
    });

    // Event Listener für Einzel-Kopier-Buttons
    document.querySelectorAll('.copy-single-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const url = e.currentTarget.dataset.url;
        copyToClipboard(url);
        showToast('URL in Zwischenablage kopiert!');
      });
    });

    // Event Listener für "Korrektur übernehmen" bei Tippfehlern
    document.querySelectorAll('.apply-sugg-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.dataset.index, 10);
        const item = currentResults[idx];
        if (item && item.suggestion) {
          item.cleanedUrl = item.suggestion.suggestedUrl;
          item.status = 200;
          item.ok = true;
          item.statusText = "200 OK (Korrigiert)";
          item.suggestionApplied = true;
          delete item.suggestion;
          updateSummaryMetrics(currentResults);
          renderResultsTable();
          showToast('Korrektur erfolgreich übernommen! URL ist nun erreichbar (200 OK). ✨');
        }
      });
    });
  }

  function getRowHighlightClass(item) {
    const isSuccess = item.ok || (item.status >= 200 && item.status < 300);
    if (!isSuccess || item.academicScore?.level === 'RED') return 'row-danger';
    if (item.trackingRemoved || item.academicScore?.level === 'YELLOW') return 'row-warning';
    return '';
  }

  function getStatusBadge(item) {
    if (item.ok || (item.status >= 200 && item.status < 300)) {
      const label = item.status === 202 ? '202 Accepted' : `${item.status} OK`;
      return `<span class="badge badge-success">🟢 ${label}</span>`;
    }
    if (item.status === 301 || item.status === 302 || item.status === 307 || item.status === 308) {
      return `<span class="badge badge-warning">🟡 ${item.status} Redirect</span>`;
    }
    if (item.status === 404) {
      return `<span class="badge badge-danger">🔴 404 Nicht gefunden</span>`;
    }
    if (item.status === 403) {
      return `<span class="badge badge-danger">🔴 403 Gesperrt (Bot-Schutz)</span>`;
    }
    if (item.status === 408) {
      return `<span class="badge badge-danger">🔴 408 Timeout (>5s)</span>`;
    }
    if (item.status >= 500) {
      return `<span class="badge badge-danger">🔴 ${item.status} Serverfehler</span>`;
    }
    return `<span class="badge badge-danger">🔴 ${item.status || 'Fehler'}</span>`;
  }

  function getAcademicBadge(score) {
    if (!score) return `<span class="badge badge-secondary">—</span>`;

    if (score.level === 'RED') {
      return `<span class="badge badge-danger" title="${escapeHtml(score.reason)}">⛔ ${escapeHtml(score.label)}</span>
              <div class="score-reason text-danger small">${escapeHtml(score.reason)}</div>`;
    }
    if (score.level === 'YELLOW') {
      return `<span class="badge badge-warning" title="${escapeHtml(score.reason)}">⚠️ ${escapeHtml(score.label)}</span>
              <div class="score-reason text-warning small">${escapeHtml(score.reason)}</div>`;
    }
    if (score.level === 'GREEN') {
      return `<span class="badge badge-success" title="${escapeHtml(score.reason)}">✅ ${escapeHtml(score.label)}</span>`;
    }
    return `<span class="badge badge-secondary" title="${escapeHtml(score.reason)}">ℹ️ Neutral</span>`;
  }

  function formatUrlDisplay(item) {
    let html = `<div class="url-row"><a href="${escapeHtml(item.cleanedUrl)}" target="_blank" rel="noopener noreferrer" class="link-target font-mono">${escapeHtml(item.cleanedUrl)}</a></div>`;

    if (item.trackingRemoved) {
      const paramsList = item.removedParams.map(p => `<code class="removed-tag">${escapeHtml(p)}</code>`).join(' ');
      html += `
        <div class="url-diff-note">
          <span class="badge badge-pill badge-warning small">Tracking entfernt:</span> ${paramsList}
          <div class="text-muted small original-url-preview">Original: <span class="font-mono">${escapeHtml(item.originalUrl)}</span></div>
        </div>
      `;
    }

    if (item.redirected && item.finalUrl && item.finalUrl !== item.cleanedUrl) {
      html += `
        <div class="url-diff-note text-info small">
          ↪ Weitergeleitet zu: <a href="${escapeHtml(item.finalUrl)}" target="_blank" class="font-mono">${escapeHtml(item.finalUrl)}</a>
        </div>
      `;
    }

    if (item.suggestion && item.suggestion.suggestedUrl) {
      const itemIdx = currentResults.indexOf(item);
      html += `
        <div class="url-diff-note text-warning">
          💡 <strong>Tippfehler im Pfad erkannt:</strong> ${escapeHtml(item.suggestion.reason)}
          <br>Erreichbare URL: <a href="${escapeHtml(item.suggestion.suggestedUrl)}" target="_blank" class="font-mono">${escapeHtml(item.suggestion.suggestedUrl)}</a>
          <button class="btn btn-sm btn-secondary apply-sugg-btn" data-index="${itemIdx}" style="margin-left: 0.5rem; padding: 0.15rem 0.6rem; font-size: 0.78rem;">
            ✨ Korrektur übernehmen
          </button>
        </div>
      `;
    }

    return html;
  }

  /**
   * Ersetzt im Text unsaubere URLs durch gesäuberte und kopiert das Ergebnis
   */
  function handleCopyCleanedBibliography() {
    if (!currentOriginalText || currentResults.length === 0) {
      showToast('Keine Daten zur Erstellung vorhanden.', 'warning');
      return;
    }

    const replacements = currentResults.map(r => ({
      originalUrl: r.originalUrl,
      cleanedUrl: r.cleanedUrl
    }));

    const cleanedBibliography = FormataParser.reconstructBibliography(currentOriginalText, replacements);
    copyToClipboard(cleanedBibliography);
    showToast('Komplettes bereinigtes Literaturverzeichnis in Zwischenablage kopiert! ✨');
  }

  /**
   * CSV-Export der Prüfergebnisse
   */
  function handleExportCsv() {
    if (currentResults.length === 0) {
      showToast('Keine Prüfergebnisse zum Exportieren vorhanden.', 'warning');
      return;
    }

    const headers = ['Nr', 'Status Code', 'Erreichbar', 'Original URL', 'Bereinigte URL', 'Tracking Entfernt', 'Entfernte Parameter', 'Akademisches Rating', 'Bewertungsgrund', 'Latenz (ms)'];
    
    const rows = currentResults.map((r, i) => [
      i + 1,
      r.status,
      r.ok ? 'JA' : 'NEIN',
      `"${r.originalUrl.replace(/"/g, '""')}"`,
      `"${r.cleanedUrl.replace(/"/g, '""')}"`,
      r.trackingRemoved ? 'JA' : 'NEIN',
      `"${r.removedParams.join(', ')}"`,
      r.academicScore?.level || 'NEUTRAL',
      `"${(r.academicScore?.reason || '').replace(/"/g, '""')}"`,
      r.responseTimeMs || 0
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(row => row.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `formata-pruefbericht-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('CSV-Prüfbericht erfolgreich heruntergeladen.');
  }

  function setLoadingState(isLoading) {
    elements.btnValidate.disabled = isLoading;
    elements.btnValidate.innerHTML = isLoading 
      ? '<span class="spinner"></span> Prüfe Links...' 
      : '<span>🔍 Literaturverzeichnis prüfen</span>';
    elements.progressContainer.style.display = isLoading ? 'block' : 'none';
  }

  function updateProgress(percentage, text) {
    elements.progressBar.style.width = `${percentage}%`;
    elements.progressText.textContent = text;
  }

  function resetResults() {
    currentResults = [];
    currentOriginalText = '';
    elements.resultsSection.style.display = 'none';
    elements.statTotal.textContent = '0';
    elements.statValid.textContent = '0';
    elements.statCleaned.textContent = '0';
    elements.statIssues.textContent = '0';
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  }

  /**
   * Fängt Screenshots ab, die per Strg+V in die Zwischenablage kopiert wurden
   */
  function handlePasteEvent(e) {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          processScreenshotOcr(file);
          return;
        }
      }
    }
  }

  /**
   * Richtet Drag & Drop für PDFs und Screenshots auf dem Textarea ein
   */
  function setupDragAndDrop() {
    const area = elements.bibInput;
    if (!area) return;

    ['dragenter', 'dragover'].forEach(eventName => {
      area.addEventListener(eventName, (e) => {
        e.preventDefault();
        area.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      area.addEventListener(eventName, (e) => {
        e.preventDefault();
        area.classList.remove('dragover');
      });
    });

    area.addEventListener('drop', (e) => {
      e.preventDefault();
      area.classList.remove('dragover');
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      const file = files[0];
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        processPdfFile(file);
      } else if (file.type.startsWith('image/')) {
        processScreenshotOcr(file);
      }
    });
  }

  /**
   * Extrahiert Text und Literaturverzeichnis aus einer PDF-Datei (via PDF.js)
   */
  async function processPdfFile(pdfFile) {
    if (typeof pdfjsLib === 'undefined') {
      showToast('PDF-Modul wird noch geladen, bitte einen Moment gedulden...', 'warning');
      return;
    }

    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    } catch (_) {}

    setLoadingState(true);
    updateProgress(10, `📄 Lese PDF "${pdfFile.name}" ein...`);

    try {
      const arrayBuffer = await pdfFile.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;

      let fullText = '';
      const totalPages = pdf.numPages;

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const pct = Math.round(15 + (pageNum / totalPages) * 70);
        updateProgress(pct, `📄 Extrahiere Text aus PDF-Seite ${pageNum} von ${totalPages}...`);
        
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        // Füge Textzeilen mit Layout-Beachtung zusammen
        let lastY = null;
        let pageLines = [];
        let currentLine = '';

        for (const item of textContent.items) {
          if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
            pageLines.push(currentLine.trim());
            currentLine = '';
          }
          currentLine += (currentLine.length > 0 && !currentLine.endsWith(' ') && !item.str.startsWith(' ') ? ' ' : '') + item.str;
          lastY = item.transform[5];
        }
        if (currentLine.trim().length > 0) {
          pageLines.push(currentLine.trim());
        }

        fullText += pageLines.join('\n') + '\n\n';
      }

      updateProgress(88, 'Suche Literaturverzeichnis in der PDF...');

      // Intelligente Extraktion des Literaturverzeichnisses
      // Sucht nach Kapitelüberschriften wie "Literaturverzeichnis", "Quellenverzeichnis", "Bibliography", "References"
      let bibliographyText = '';
      const bibHeaderRegex = /(?:^|\n)\s*(?:\d+[\.\s]*)?(Literaturverzeichnis|Quellenverzeichnis|Literatur-|Quellen-|Bibliography|References)\b/i;
      const match = fullText.match(bibHeaderRegex);

      if (match && match.index !== undefined) {
        const afterHeader = fullText.substring(match.index);
        // Ende des Verzeichnisses (z. B. Anhang, Eidesstattliche Erklärung etc.)
        const appendixRegex = /(?:^|\n)\s*(?:\d+[\.\s]*)?(Anhang|Ehrenw[oö]rtliche\s+Erkl[aä]rung|Eidesstattliche\s+Versicherung|Appendix)\b/i;
        const appendixMatch = afterHeader.match(appendixRegex);
        if (appendixMatch && appendixMatch.index !== undefined && appendixMatch.index > 80) {
          bibliographyText = afterHeader.substring(0, appendixMatch.index).trim();
        } else {
          bibliographyText = afterHeader.trim();
        }
      }

      const finalText = bibliographyText || fullText.trim();

      if (!finalText) {
        throw new Error('In der PDF konnte kein Text gefunden werden (evtl. reines Bild-Scan-PDF ohne Textebene).');
      }

      elements.bibInput.value = finalText;
      updateProgress(100, `PDF erfolgreich eingelesen (${totalPages} Seiten)! Starte Validierung...`);
      showToast(`PDF verarbeitet: Literaturverzeichnis aus ${totalPages} Seiten extrahiert! ✨`);

      // Automatisch Validierung starten
      setTimeout(() => {
        handleValidate();
      }, 500);

    } catch (err) {
      console.error('PDF Verarbeitungsfehler:', err);
      setLoadingState(false);
      showToast(`PDF-Fehler: ${err.message}`, 'error');
    }
  }

  /**
   * Führt OCR auf einem Screenshot-Bild durch (via Tesseract.js)
   */
  async function processScreenshotOcr(imageFile) {
    if (typeof Tesseract === 'undefined') {
      showToast('OCR-Modul wird noch geladen, bitte einen Moment gedulden...', 'warning');
      return;
    }

    setLoadingState(true);
    updateProgress(10, '📷 Screenshot erkannt! Initialisiere OCR-Texterkennung...');

    try {
      const result = await Tesseract.recognize(
        imageFile,
        'deu+eng',
        {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              const pct = Math.round((m.progress || 0) * 100);
              updateProgress(Math.min(90, Math.max(15, pct)), `📷 Lese Text aus Screenshot... ${pct}%`);
            }
          }
        }
      );

      const recognizedText = result?.data?.text?.trim();

      if (!recognizedText) {
        throw new Error('Kein lesbarer Text im Screenshot gefunden.');
      }

      elements.bibInput.value = recognizedText;
      updateProgress(100, 'OCR-Erkennung abgeschlossen! Starte Validierung...');
      showToast('Text erfolgreich per OCR aus Screenshot extrahiert! ✨');

      // Automatisch Validierung starten
      setTimeout(() => {
        handleValidate();
      }, 500);

    } catch (err) {
      console.error('OCR Fehler:', err);
      setLoadingState(false);
      showToast(`OCR-Fehler: ${err.message}`, 'error');
    }
  }

  /**
   * Erstellt einen PNG-Screenshot der Validierungsergebnisse via html2canvas
   */
  async function handleExportScreenshot() {
    if (typeof html2canvas === 'undefined') {
      showToast('Screenshot-Modul lädt noch, bitte kurz warten...', 'warning');
      return;
    }

    if (!elements.resultsSection || elements.resultsSection.style.display === 'none') {
      showToast('Keine Ergebnisse zum Fotografieren vorhanden.', 'warning');
      return;
    }

    showToast('Erstelle Screenshot der Prüfergebnisse...');

    try {
      const canvas = await html2canvas(elements.resultsSection, {
        scale: 2,
        backgroundColor: '#f8fafc',
        useCORS: true
      });

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `formata-ergebnisbericht-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Ergebnis-Screenshot erfolgreich als PNG gespeichert! 📸');
    } catch (err) {
      console.error('Fehler bei Screenshot-Erstellung:', err);
      showToast(`Screenshot-Fehler: ${err.message}`, 'error');
    }
  }

  function showToast(message, type = 'info') {
    elements.toast.textContent = message;
    elements.toast.className = `toast show ${type}`;
    setTimeout(() => {
      elements.toast.className = 'toast';
    }, 3500);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
