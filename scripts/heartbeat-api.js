// Simple Express API to expose heartbeat and status
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.HEARTBEAT_API_PORT || 9100;
const HEARTBEAT_FILE = path.join(__dirname, '../.codespace-heartbeat');
const STATUS_LOG = path.join(__dirname, '../.immortal.log');

app.get('/api/heartbeat', (req, res) => {
  let heartbeat = null;
  try {
    heartbeat = fs.readFileSync(HEARTBEAT_FILE, 'utf8').trim();
  } catch (e) {
    return res.status(500).json({ error: 'Heartbeat file not found' });
  }
  res.json({ heartbeat });
});

app.get('/api/status', (req, res) => {
  let status = null;
  try {
    status = fs.readFileSync(STATUS_LOG, 'utf8').trim().split('\n').slice(-10).join('\n');
  } catch (e) {
    return res.status(500).json({ error: 'Status log not found' });
  }
  res.json({ status });
});

app.listen(PORT, () => {
  console.log(`Heartbeat API running on port ${PORT}`);
});
