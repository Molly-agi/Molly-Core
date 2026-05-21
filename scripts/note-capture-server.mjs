import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3333;

const ECHO_DIR = path.join(__dirname, '../stuff/Titan/echo');

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Ensure directory exists
await fs.mkdir(ECHO_DIR, { recursive: true });

// API endpoint to save note (small files)
app.post('/api/save-note', async (req, res) => {
  try {
    const { title, content } = req.body;

    if (!title?.trim() || !content?.trim()) {
      return res.status(400).json({ error: 'Title and content required' });
    }

    // Sanitize filename
    const sanitizedTitle = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Generate filename with timestamp to avoid collisions
    const timestamp = Date.now();
    const filename = `${sanitizedTitle}-${timestamp}.md`;
    const filepath = path.join(ECHO_DIR, filename);

    // Write the file
    await fs.writeFile(filepath, content, 'utf-8');

    res.json({
      success: true,
      filename,
      path: filepath,
      message: `Saved as ${filename}`
    });
  } catch (error) {
    console.error('Save error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Chunked upload endpoint for large files
app.post('/api/upload-chunk', async (req, res) => {
  try {
    const { chunkIndex, totalChunks, sessionId, chunk, title } = req.body;

    if (!sessionId || chunkIndex === undefined || !chunk) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Store chunks in memory (in production, use temp files)
    if (!req.app.locals.uploadSessions) {
      req.app.locals.uploadSessions = {};
    }

    if (!req.app.locals.uploadSessions[sessionId]) {
      req.app.locals.uploadSessions[sessionId] = {
        chunks: [],
        title,
        createdAt: Date.now()
      };
    }

    const session = req.app.locals.uploadSessions[sessionId];
    session.chunks[chunkIndex] = chunk;

    // Check if all chunks received
    if (session.chunks.filter(Boolean).length === totalChunks) {
      // Combine chunks
      const fullContent = session.chunks.join('');

      // Sanitize filename
      const sanitizedTitle = (title || 'note')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      const timestamp = Date.now();
      const filename = `${sanitizedTitle}-${timestamp}.md`;
      const filepath = path.join(ECHO_DIR, filename);

      // Write the file
      await fs.writeFile(filepath, fullContent, 'utf-8');

      // Clean up
      delete req.app.locals.uploadSessions[sessionId];

      res.json({
        success: true,
        complete: true,
        filename,
        path: filepath,
        message: `Saved as ${filename}`
      });
    } else {
      res.json({
        success: true,
        complete: false,
        progress: (session.chunks.filter(Boolean).length / totalChunks) * 100
      });
    }
  } catch (error) {
    console.error('Chunk upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Session cleanup (optional: remove old sessions after 1 hour)
setInterval(() => {
  if (!app.locals.uploadSessions) return;
  const now = Date.now();
  Object.entries(app.locals.uploadSessions).forEach(([key, session]) => {
    if (now - session.createdAt > 3600000) {
      delete app.locals.uploadSessions[key];
    }
  });
}, 60000);

// Serve the UI
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'note-capture.html'));
});

app.listen(PORT, () => {
  console.log(`📝 Note Capture Server running on http://localhost:${PORT}`);
  console.log(`💾 Saving to: ${ECHO_DIR}`);
});
