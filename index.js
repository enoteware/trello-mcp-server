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

// Helper function to make Trello API calls with error handling
async function trelloRequest(endpoint, method = 'GET', body = null) {
  const url = `${TRELLO_API_BASE}${endpoint}?key=${API_KEY}&token=${TOKEN}`;

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Trello-MCP-Server/1.0.0',
    },
  };

  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Trello API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`Failed to make Trello request: ${error.message}`);
  }
}

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
    const { listId, name, description } = req.body;
    const card = await trelloRequest('/cards', 'POST', {
      idList: listId,
      name: name,
      desc: description || '',
    });
    res.status(201).json(card);
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
