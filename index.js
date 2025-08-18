#!/usr/bin/env node

import { fastmcp } from "fastmcp";
import fetch from "node-fetch";
import { config } from "dotenv";

// Load environment variables
config();

const server = fastmcp("Trello MCP Server", {
  version: "1.0.0",
  description: "Model Context Protocol server for Trello board management with full CRUD operations"
});

// Trello API configuration
const TRELLO_API_BASE = "https://api.trello.com/1";
const API_KEY = process.env.TRELLO_API_KEY;
const TOKEN = process.env.TRELLO_TOKEN;
const BOARD_ID = process.env.TRELLO_BOARD_ID;

// Validate required environment variables
if (!API_KEY || !TOKEN) {
  console.error("❌ Error: TRELLO_API_KEY and TRELLO_TOKEN environment variables are required");
  console.error("📝 Please create a .env file with your Trello credentials");
  console.error("💡 See README.md for setup instructions");
  process.exit(1);
}

// Helper function to make Trello API calls with error handling
async function trelloRequest(endpoint, method = "GET", body = null) {
  const url = `${TRELLO_API_BASE}${endpoint}?key=${API_KEY}&token=${TOKEN}`;
  
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Trello-MCP-Server/1.0.0"
    },
  };
  
  if (body && method !== "GET") {
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

// Get all boards accessible to the user
server.tool("get_boards", "Get all Trello boards accessible to the user", {}, async () => {
  try {
    const boards = await trelloRequest(`/members/me/boards`);
    
    const boardList = boards.map(board => 
      `• ${board.name} (ID: ${board.id})\n  URL: ${board.url}`
    ).join('\n\n');
    
    return {
      content: [
        {
          type: "text",
          text: `Found ${boards.length} accessible boards:\n\n${boardList}`
        }
      ]
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error fetching boards: ${error.message}` }],
      isError: true
    };
  }
});

// Get lists in a board
server.tool("get_lists", "Get all lists in a Trello board", {
  boardId: {
    type: "string",
    description: "Board ID (optional, uses TRELLO_BOARD_ID environment variable if not provided)",
    required: false
  }
}, async ({ boardId }) => {
  try {
    const targetBoardId = boardId || BOARD_ID;
    if (!targetBoardId) {
      throw new Error("No board ID provided and TRELLO_BOARD_ID environment variable not set");
    }
    
    const lists = await trelloRequest(`/boards/${targetBoardId}/lists`);
    
    const listInfo = lists.map(list => 
      `• ${list.name} (ID: ${list.id})\n  Position: ${list.pos}`
    ).join('\n\n');
    
    return {
      content: [
        {
          type: "text",
          text: `Lists in board ${targetBoardId}:\n\n${listInfo}`
        }
      ]
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error fetching lists: ${error.message}` }],
      isError: true
    };
  }
});

// Get cards in a list
server.tool("get_cards", "Get all cards in a Trello list", {
  listId: {
    type: "string",
    description: "List ID to get cards from",
    required: true
  }
}, async ({ listId }) => {
  try {
    const cards = await trelloRequest(`/lists/${listId}/cards`);
    
    if (cards.length === 0) {
      return {
        content: [{ type: "text", text: "No cards found in this list" }]
      };
    }
    
    const cardInfo = cards.map(card => 
      `• ${card.name} (ID: ${card.id})\n  Description: ${card.desc || 'No description'}\n  URL: ${card.url}`
    ).join('\n\n');
    
    return {
      content: [
        {
          type: "text",
          text: `Found ${cards.length} cards in list:\n\n${cardInfo}`
        }
      ]
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error fetching cards: ${error.message}` }],
      isError: true
    };
  }
});

// Create a new card
server.tool("create_card", "Create a new card in a Trello list", {
  listId: {
    type: "string",
    description: "List ID to create the card in",
    required: true
  },
  name: {
    type: "string",
    description: "Card title/name",
    required: true
  },
  desc: {
    type: "string",
    description: "Card description (optional)",
    required: false
  },
  pos: {
    type: "string",
    description: "Position in list: 'top', 'bottom', or a positive number (optional)",
    required: false
  }
}, async ({ listId, name, desc, pos }) => {
  try {
    const cardData = {
      idList: listId,
      name,
      desc: desc || ""
    };
    
    if (pos) {
      cardData.pos = pos;
    }
    
    const card = await trelloRequest(`/cards`, "POST", cardData);
    
    return {
      content: [
        {
          type: "text",
          text: `✅ Successfully created card "${card.name}"\n` +
                `Card ID: ${card.id}\n` +
                `URL: ${card.url}`
        }
      ]
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error creating card: ${error.message}` }],
      isError: true
    };
  }
});

// Update an existing card
server.tool("update_card", "Update an existing Trello card", {
  cardId: {
    type: "string",
    description: "Card ID to update",
    required: true
  },
  name: {
    type: "string",
    description: "New card title/name (optional)",
    required: false
  },
  desc: {
    type: "string",
    description: "New card description (optional)",
    required: false
  }
}, async ({ cardId, name, desc }) => {
  try {
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (desc !== undefined) updates.desc = desc;
    
    if (Object.keys(updates).length === 0) {
      throw new Error("No updates provided. Please specify name or desc to update.");
    }
    
    const card = await trelloRequest(`/cards/${cardId}`, "PUT", updates);
    
    return {
      content: [
        {
          type: "text",
          text: `✅ Successfully updated card "${card.name}"\n` +
                `Card ID: ${card.id}\n` +
                `URL: ${card.url}`
        }
      ]
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error updating card: ${error.message}` }],
      isError: true
    };
  }
});

// Move a card to a different list
server.tool("move_card", "Move a card to a different list", {
  cardId: {
    type: "string",
    description: "Card ID to move",
    required: true
  },
  listId: {
    type: "string",
    description: "Target list ID to move the card to",
    required: true
  },
  pos: {
    type: "string",
    description: "Position in target list: 'top', 'bottom', or a positive number (optional)",
    required: false
  }
}, async ({ cardId, listId, pos }) => {
  try {
    const updates = { idList: listId };
    if (pos) updates.pos = pos;
    
    const card = await trelloRequest(`/cards/${cardId}`, "PUT", updates);
    
    return {
      content: [
        {
          type: "text",
          text: `✅ Successfully moved card "${card.name}" to new list\n` +
                `Card ID: ${card.id}\n` +
                `URL: ${card.url}`
        }
      ]
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error moving card: ${error.message}` }],
      isError: true
    };
  }
});

// Archive (close) a card
server.tool("archive_card", "Archive (close) a Trello card", {
  cardId: {
    type: "string",
    description: "Card ID to archive",
    required: true
  }
}, async ({ cardId }) => {
  try {
    const card = await trelloRequest(`/cards/${cardId}`, "PUT", { closed: true });
    
    return {
      content: [
        {
          type: "text",
          text: `✅ Successfully archived card "${card.name}"\nCard ID: ${card.id}`
        }
      ]
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error archiving card: ${error.message}` }],
      isError: true
    };
  }
});

// Get recent board activity
server.tool("get_board_activity", "Get recent activity on a Trello board", {
  boardId: {
    type: "string",
    description: "Board ID (optional, uses TRELLO_BOARD_ID environment variable if not provided)",
    required: false
  },
  limit: {
    type: "number",
    description: "Number of activities to return (default: 10, max: 50)",
    required: false
  }
}, async ({ boardId, limit = 10 }) => {
  try {
    const targetBoardId = boardId || BOARD_ID;
    if (!targetBoardId) {
      throw new Error("No board ID provided and TRELLO_BOARD_ID environment variable not set");
    }
    
    const maxLimit = Math.min(limit, 50);
    const actions = await trelloRequest(`/boards/${targetBoardId}/actions?limit=${maxLimit}`);
    
    if (actions.length === 0) {
      return {
        content: [{ type: "text", text: "No recent activity found on this board" }]
      };
    }
    
    const activityList = actions.map(action => {
      const date = new Date(action.date).toLocaleString();
      const member = action.memberCreator?.fullName || 'Unknown';
      const target = action.data.card?.name || action.data.list?.name || action.data.board?.name || '';
      
      return `• ${date} - ${member} ${action.type} ${target}`;
    }).join('\n');
    
    return {
      content: [
        {
          type: "text",
          text: `Recent board activity (last ${actions.length} actions):\n\n${activityList}`
        }
      ]
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error fetching board activity: ${error.message}` }],
      isError: true
    };
  }
});

// Start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("🚀 Starting Trello MCP Server...");
  console.log(`📋 API Key: ${API_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`🔑 Token: ${TOKEN ? '✅ Set' : '❌ Missing'}`);
  console.log(`📌 Default Board: ${BOARD_ID || 'Not set'}`);
  console.log("");
  
  server.run();
}

export { server };