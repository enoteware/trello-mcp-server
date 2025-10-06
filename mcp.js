#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config as dotenvConfig } from 'dotenv';
import fetch from 'node-fetch';

// Load env with .env.local preference from current working directory
try {
  const cwd = process.cwd();
  const envLocal = path.join(cwd, '.env.local');
  const envFile = path.join(cwd, '.env');
  if (fs.existsSync(envLocal)) {
    dotenvConfig({ path: envLocal });
  } else if (fs.existsSync(envFile)) {
    dotenvConfig({ path: envFile });
  } else {
    dotenvConfig();
  }
} catch {
  dotenvConfig();
}

const TRELLO_API_KEY = process.env.TRELLO_API_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const DEFAULT_BOARD_ID = process.env.TRELLO_BOARD_ID || null;

function ensureCreds() {
  if (!TRELLO_API_KEY || !TRELLO_TOKEN) {
    throw new Error('Missing TRELLO_API_KEY or TRELLO_TOKEN in environment');
  }
}

const TRELO_BASE = 'https://api.trello.com/1';

async function trelloFetch(endpoint, params = {}) {
  ensureCreds();
  const url = new URL(`${TRELO_BASE}${endpoint}`);
  url.searchParams.set('key', TRELLO_API_KEY);
  url.searchParams.set('token', TRELLO_TOKEN);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Trello API ${res.status}: ${text}`);
  }
  return res.json();
}

// MCP Server (stdio)
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server(
  { name: 'trello-mcp-server', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

function textContent(data) {
  return { content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data) }] };
}

// Tools
server.tool(
  {
    name: 'listBoards',
    description: 'List all Trello boards accessible by the API key/token.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  async () => {
    const data = await trelloFetch('/members/me/boards', { fields: 'name,url,closed,idOrganization' });
    return textContent(data);
  }
);

server.tool(
  {
    name: 'getBoardLists',
    description: 'Get lists for a board. If boardId is omitted, uses TRELLO_BOARD_ID env if set.',
    inputSchema: {
      type: 'object',
      properties: { boardId: { type: 'string' } },
      additionalProperties: false
    }
  },
  async ({ boardId }) => {
    const id = boardId || DEFAULT_BOARD_ID;
    if (!id) throw new Error('boardId is required (or set TRELLO_BOARD_ID).');
    const data = await trelloFetch(`/boards/${id}/lists`, { fields: 'name,closed' });
    return textContent(data);
  }
);

server.tool(
  {
    name: 'getListCards',
    description: 'Get cards in a list.',
    inputSchema: {
      type: 'object',
      properties: { listId: { type: 'string' } },
      required: ['listId'],
      additionalProperties: false
    }
  },
  async ({ listId }) => {
    const data = await trelloFetch(`/lists/${listId}/cards`, { fields: 'name,desc,url,idList' });
    return textContent(data);
  }
);

server.tool(
  {
    name: 'getCard',
    description: 'Get a card by id.',
    inputSchema: {
      type: 'object',
      properties: { cardId: { type: 'string' } },
      required: ['cardId'],
      additionalProperties: false
    }
  },
  async ({ cardId }) => {
    const data = await trelloFetch(`/cards/${cardId}`);
    return textContent(data);
  }
);

server.tool(
  {
    name: 'getCardAttachments',
    description: 'List attachments on a card.',
    inputSchema: {
      type: 'object',
      properties: { cardId: { type: 'string' } },
      required: ['cardId'],
      additionalProperties: false
    }
  },
  async ({ cardId }) => {
    const data = await trelloFetch(`/cards/${cardId}/attachments`);
    return textContent(data);
  }
);

server.tool(
  {
    name: 'createCard',
    description: 'Create a new card in a list.',
    inputSchema: {
      type: 'object',
      properties: {
        idList: { type: 'string' },
        name: { type: 'string' },
        desc: { type: 'string' },
        pos: { type: 'string' }
      },
      required: ['idList', 'name'],
      additionalProperties: false
    }
  },
  async ({ idList, name, desc, pos }) => {
    const data = await trelloFetch('/cards', { idList, name, desc, pos });
    return textContent(data);
  }
);

// Start stdio transport (no noisy stdout logs)
const transport = new StdioServerTransport();
await server.connect(transport);

