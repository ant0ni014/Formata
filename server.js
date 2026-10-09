const express = require('express');
const cors = require('cors');
const path = require('path');
const validateHandler = require('./api/validate');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Serverless Handler Wrapper für Express
app.post('/api/validate', (req, res) => {
  validateHandler(req, res);
});

// Statische Dateien aus public/ bereitstellen
app.use(express.static(path.join(__dirname, 'public')));

// Fallback auf index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n=================================================`);
    console.log(`🚀 Formata Server aktiv auf http://localhost:${PORT}`);
    console.log(`📚 Web-Applikation bereit für wissenschaftliche Validierung`);
    console.log(`=================================================\n`);
  });
}

module.exports = app;
