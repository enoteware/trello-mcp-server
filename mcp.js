#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
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

const TRELLO_BASE = 'https://api.trello.com/1';

function appendAuthParams(url) {
  if (!url.searchParams.has('key')) {
    url.searchParams.set('key', TRELLO_API_KEY);
  }
  if (!url.searchParams.has('token')) {
    url.searchParams.set('token', TRELLO_TOKEN);
  }
  return url;
}

async function trelloFetch(endpoint, options = {}) {
  ensureCreds();

  const normalized = options.method
    ? options
    : { method: 'GET', query: options.query ?? options, body: options.body ?? null };

  const { method = 'GET', query = {}, body = null } = normalized;
  const url = appendAuthParams(new URL(`${TRELLO_BASE}${endpoint}`));

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }

  const fetchOptions = {
    method,
    headers: { 'User-Agent': 'trello-mcp-server/0.1.0' },
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

  const res = await fetch(url, fetchOptions);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Trello API ${res.status}: ${text}`);
  }
  return res.json();
}

async function downloadAttachment(urlString) {
  let parsedUrl;
  try {
    parsedUrl = new URL(urlString);
  } catch {
    throw new Error('Attachment URL is invalid');
  }

  const attemptFetch = async (targetUrl) => {
    const res = await fetch(targetUrl);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Attachment download ${res.status}: ${text}`);
    }
    return res;
  };

  try {
    return await attemptFetch(parsedUrl);
  } catch (error) {
    if (error.message.includes('401') || error.message.includes('403')) {
      const authed = appendAuthParams(new URL(parsedUrl));
      return attemptFetch(authed);
    }
    throw error;
  }
}

// MCP Server (stdio)
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'trello-mcp-server', version: '0.1.0' });

function textContent(data) {
  return { content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data) }] };
}

// Tools
server.registerTool(
  'listBoards',
  {
    title: 'List Boards',
    description: 'List all Trello boards accessible by the API key/token.',
    inputSchema: z.object({}).strict()
  },
  async () => {
    const data = await trelloFetch('/members/me/boards', { fields: 'name,url,closed,idOrganization' });
    return textContent(data);
  }
);

server.registerTool(
  'getBoardLists',
  {
    title: 'Get Board Lists',
    description: 'Get lists for a board. If boardId is omitted, uses TRELLO_BOARD_ID env if set.',
    inputSchema: z.object({ boardId: z.string().optional() })
  },
  async ({ boardId }) => {
    const id = boardId || DEFAULT_BOARD_ID;
    if (!id) throw new Error('boardId is required (or set TRELLO_BOARD_ID).');
    const data = await trelloFetch(`/boards/${id}/lists`, { fields: 'name,closed' });
    return textContent(data);
  }
);

server.registerTool(
  'getListCards',
  {
    title: 'Get List Cards',
    description: 'Get cards in a list.',
    inputSchema: z.object({ listId: z.string() })
  },
  async ({ listId }) => {
    const data = await trelloFetch(`/lists/${listId}/cards`, { fields: 'name,desc,url,idList' });
    return textContent(data);
  }
);

server.registerTool(
  'getCard',
  {
    title: 'Get Card',
    description: 'Get a card by id.',
    inputSchema: z.object({ cardId: z.string() })
  },
  async ({ cardId }) => {
    const data = await trelloFetch(`/cards/${cardId}`);
    return textContent(data);
  }
);

server.registerTool(
  'getCardAttachments',
  {
    title: 'Get Card Attachments',
    description: 'List attachments on a card.',
    inputSchema: z.object({ cardId: z.string() })
  },
  async ({ cardId }) => {
    const data = await trelloFetch(`/cards/${cardId}/attachments`);
    return textContent(data);
  }
);

server.registerTool(
  'createCard',
  {
    title: 'Create Card',
    description: 'Create a new card in a list.',
    inputSchema: z.object({
      idList: z.string(),
      name: z.string(),
      desc: z.string().optional(),
      pos: z.string().optional()
    })
  },
  async ({ idList, name, desc, pos }) => {
    const data = await trelloFetch('/cards', {
      method: 'POST',
      query: { idList, name, desc, pos },
    });
    return textContent(data);
  }
);

server.registerTool(
  'getAttachmentContent',
  {
    title: 'Get Attachment Content',
    description: 'Download an attachment (e.g., an image) and return it as base64 with metadata.',
    inputSchema: z.object({
      cardId: z.string(),
      attachmentId: z.string(),
      includeMeta: z.boolean().optional(),
      includeDataUri: z.boolean().optional(),
    }),
  },
  async ({ cardId, attachmentId, includeMeta = false, includeDataUri = false }) => {
    const attachment = await trelloFetch(`/cards/${cardId}/attachments/${attachmentId}`);
    if (!attachment?.url) {
      throw new Error('Attachment URL not available');
    }

    const downloadResponse = await downloadAttachment(attachment.url);
    const arrayBuffer = await downloadResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = attachment.mimeType || downloadResponse.headers.get('content-type') || 'application/octet-stream';

    const payload = {
      mimeType,
      bytes: buffer.length,
      filename: attachment.fileName || attachment.name || null,
      url: attachment.url,
      base64: buffer.toString('base64'),
    };

    if (includeDataUri) {
      payload.dataUri = `data:${mimeType};base64,${payload.base64}`;
    }

    if (includeMeta) {
      payload.attachment = attachment;
    }

    return textContent(payload);
  }
);

// Start stdio transport (no noisy stdout logs)
const transport = new StdioServerTransport();
await server.connect(transport);
