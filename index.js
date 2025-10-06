#!/usr/bin/env node

import express from 'express';
import fetch from 'node-fetch';
import { config } from 'dotenv';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

// Load environment variables (.env.local preferred if present)
try {
  const cwd = process.cwd();
  const envLocal = path.join(cwd, '.env.local');
  const envFile = path.join(cwd, '.env');
  if (fs.existsSync(envLocal)) {
    config({ path: envLocal });
  } else if (fs.existsSync(envFile)) {
    config({ path: envFile });
  } else {
    config();
  }
} catch {
  // Fallback to default dotenv behavior if anything goes wrong
  config();
}

const app = express();
app.use(express.json());

// Trello API configuration
const TRELLO_API_BASE = 'https://api.trello.com/1';
const API_KEY = process.env.TRELLO_API_KEY;
const TOKEN = process.env.TRELLO_TOKEN;
const BOARD_ID = process.env.TRELLO_BOARD_ID;

// Validate required environment variables
if (!API_KEY || !TOKEN) {
  console.error('❌ Error: TRELLO_API_KEY and TRELLO_TOKEN environment variables are required');
  console.error('📝 Please create a .env file with your Trello credentials');
  console.error('💡 See README.md for setup instructions');
  process.exit(1);
}

// Helper to append Trello auth credentials to a URL object
function appendAuthParams(url) {
  if (!url.searchParams.has('key')) {
    url.searchParams.set('key', API_KEY);
  }
  if (!url.searchParams.has('token')) {
    url.searchParams.set('token', TOKEN);
  }
  return url;
}

// Helper function to make Trello API calls with error handling
async function trelloRequest(endpoint, options = {}) {
  const { method = 'GET', query = {}, body = null } = options;
  const url = appendAuthParams(new URL(`${TRELLO_API_BASE}${endpoint}`));

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }

  const fetchOptions = {
    method,
    headers: {
      'User-Agent': 'Trello-MCP-Server/1.0.0',
    },
  };

  if (body && method !== 'GET') {
    if (body instanceof URLSearchParams) {
      fetchOptions.body = body;
      fetchOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    } else {
      fetchOptions.body = JSON.stringify(body);
      fetchOptions.headers['Content-Type'] = 'application/json';
    }
  }

  try {
    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Trello API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`Failed to make Trello request: ${error.message}`);
  }
}

async function fetchAttachmentBinary(urlString) {
  const attemptFetch = async (targetUrl) => {
    const res = await fetch(targetUrl);
    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new Error(`Failed to download attachment: ${res.status} ${res.statusText} ${errorText}`);
    }
    return res;
  };

  let downloadUrl;
  try {
    const parsed = new URL(urlString);
    downloadUrl = parsed;
  } catch {
    throw new Error('Attachment URL is invalid');
  }

  try {
    return await attemptFetch(downloadUrl);
  } catch (error) {
    if (error.message.includes('401') || error.message.includes('403')) {
      const authedUrl = appendAuthParams(new URL(downloadUrl));
      return attemptFetch(authedUrl);
    }
    throw error;
  }
}

const createCardSchema = z.object({
  listId: z.string().min(1, 'listId is required'),
  name: z.string().min(1, 'name is required'),
  description: z.string().optional(),
  pos: z.union([
    z.literal('top'),
    z.literal('bottom'),
    z.number(),
    z.string().min(1),
  ]).optional(),
});

// --- API Endpoints ---

// Get all boards
app.get('/boards', async (req, res, next) => {
  try {
    const boards = await trelloRequest('/members/me/boards');
    res.json(boards);
  } catch (error) {
    next(error);
  }
});

// Get lists in a board
app.get('/boards/:boardId/lists', async (req, res, next) => {
  try {
    const { boardId } = req.params;
    const lists = await trelloRequest(`/boards/${boardId}/lists`);
    res.json(lists);
  } catch (error) {
    next(error);
  }
});

// Get cards in a list
app.get('/lists/:listId/cards', async (req, res, next) => {
    try {
      const { listId } = req.params;
      const cards = await trelloRequest(`/lists/${listId}/cards`);
      res.json(cards);
    } catch (error) {
      next(error);
    }
});

// Get card details
app.get('/cards/:cardId', async (req, res, next) => {
    try {
      const { cardId } = req.params;
      const card = await trelloRequest(`/cards/${cardId}`);
      res.json(card);
    } catch (error) {
      next(error);
    }
});

// Get card attachments
app.get('/cards/:cardId/attachments', async (req, res, next) => {
    try {
      const { cardId } = req.params;
      const attachments = await trelloRequest(`/cards/${cardId}/attachments`);
      res.json(attachments);
    } catch (error) {
      next(error);
    }
});


// Create a new card
app.post('/cards', async (req, res, next) => {
  try {
    const parsed = createCardSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        issues: parsed.error.flatten(),
      });
    }

    const { listId, name, description, pos } = parsed.data;
    const card = await trelloRequest('/cards', {
      method: 'POST',
      query: {
        idList: listId,
        name,
        desc: description ?? undefined,
        pos: pos === undefined ? undefined : String(pos),
      },
    });
    res.status(201).json(card);
  } catch (error) {
    next(error);
  }
});

// Download attachment content (e.g., images)
app.get('/cards/:cardId/attachments/:attachmentId/content', async (req, res, next) => {
  try {
    const { cardId, attachmentId } = req.params;
    const attachment = await trelloRequest(`/cards/${cardId}/attachments/${attachmentId}`);

    if (!attachment?.url) {
      throw new Error('Attachment URL not available');
    }

    const downloadResponse = await fetchAttachmentBinary(attachment.url);
    const arrayBuffer = await downloadResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = attachment.mimeType || downloadResponse.headers.get('content-type') || 'application/octet-stream';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

// --- Error Handling ---
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message });
});


// --- Server ---
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Trello API server listening on port ${PORT}`);
  console.log(`📋 API Key: ${API_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`🔑 Token: ${TOKEN ? '✅ Set' : '❌ Missing'}`);
  console.log(`📌 Default Board: ${BOARD_ID || 'Not set'}`);
});

export default app;
