# Trello MCP Server

A comprehensive Model Context Protocol (MCP) server for Trello board management. This server provides AI assistants like Claude with powerful tools to interact with Trello boards, lists, and cards through natural language commands.

## Features

🎯 **Complete Trello Integration**
- List all accessible boards
- Get lists and cards from any board
- Create, update, and move cards
- Archive cards when complete
- View recent board activity

🔒 **Secure & Reliable**
- Environment-based authentication
- Comprehensive error handling
- Rate limiting respect for Trello API
- Input validation and sanitization

🚀 **Easy to Use**
- Simple environment variable configuration
- Clear error messages and debugging
- Compatible with Claude Code and other MCP clients
- Extensive documentation and examples

## Installation

### Option 1: NPM Global Install (Recommended)

```bash
npm install -g trello-mcp-server
```

### Option 2: Clone and Install

```bash
git clone https://github.com/enoteware/trello-mcp-server.git
cd trello-mcp-server
npm install
```

## Configuration

1. **Get Trello API Credentials:**
   - API Key: Visit https://trello.com/app-key
   - Token: Visit the authorization URL (see below)

2. **Generate Token:**
   Replace `YOUR_API_KEY` with your actual API key:
   ```
   https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token&name=Trello%20MCP%20Server&key=YOUR_API_KEY
   ```

3. **Configure Environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

4. **Environment Variables:**
   ```env
   TRELLO_API_KEY=your_api_key_here
   TRELLO_TOKEN=your_token_here
   TRELLO_BOARD_ID=your_default_board_id  # Optional
   ```

## Usage

### Standalone Server
```bash
npm start
# or if installed globally:
trello-mcp-server
```

### With Claude Code

Add to your Claude Code MCP configuration:

```json
{
  "trello": {
    "command": "trello-mcp-server",
    "env": {
      "TRELLO_API_KEY": "your_api_key",
      "TRELLO_TOKEN": "your_token",
      "TRELLO_BOARD_ID": "your_board_id"
    }
  }
}
```

## Available Tools

### `get_boards`
List all Trello boards accessible to your account.

**Example:** "Show me all my Trello boards"

### `get_lists`
Get all lists in a specific board.

**Parameters:**
- `boardId` (optional): Board ID, uses TRELLO_BOARD_ID if not provided

**Example:** "What lists are in my project board?"

### `get_cards`
Get all cards in a specific list.

**Parameters:**
- `listId` (required): List ID to get cards from

**Example:** "Show me all cards in the 'To Do' list"

### `create_card`
Create a new card in a list.

**Parameters:**
- `listId` (required): List ID to create the card in
- `name` (required): Card title
- `desc` (optional): Card description
- `pos` (optional): Position ('top', 'bottom', or number)

**Example:** "Create a card called 'Fix login bug' in the To Do list"

### `update_card`
Update an existing card.

**Parameters:**
- `cardId` (required): Card ID to update
- `name` (optional): New card title
- `desc` (optional): New card description

**Example:** "Update the card description to include the bug reproduction steps"

### `move_card`
Move a card to a different list.

**Parameters:**
- `cardId` (required): Card ID to move
- `listId` (required): Target list ID
- `pos` (optional): Position in target list

**Example:** "Move this card to the 'In Progress' list"

### `archive_card`
Archive (close) a card.

**Parameters:**
- `cardId` (required): Card ID to archive

**Example:** "Archive this completed task"

### `get_board_activity`
Get recent activity on a board.

**Parameters:**
- `boardId` (optional): Board ID, uses TRELLO_BOARD_ID if not provided
- `limit` (optional): Number of activities (default: 10, max: 50)

**Example:** "Show me recent activity on my project board"

## Example Conversations

**Creating a Project Task:**
> User: "Create a new card called 'Implement user authentication' in my development board's To Do list"
> 
> Assistant: I'll create that card for you. Let me first get your board lists and then create the card.

**Managing Workflow:**
> User: "Move all cards from 'In Review' to 'Done' and show me the updated board activity"
>
> Assistant: I'll help you move those cards and show the activity. First, let me get the cards in your 'In Review' list.

**Project Status Check:**
> User: "What's the current status of my project? Show me all lists and recent activity"
>
> Assistant: I'll give you a complete project overview with all lists and recent board activity.

## Development

### Local Development
```bash
git clone https://github.com/enoteware/trello-mcp-server.git
cd trello-mcp-server
npm install
npm run dev  # Runs with --watch for auto-restart
```

### Testing
```bash
# Test the server
npm start

# In another terminal, test with MCP client
# or use with Claude Code
```

## Troubleshooting

### Authentication Issues
- Verify your API key is correct
- Ensure your token has read/write permissions
- Check that your token hasn't expired
- Make sure you're using the right Trello account

### Board/List Not Found
- Verify board/list IDs are correct
- Check that you have access to the board
- Use `get_boards` to see available boards

### Rate Limiting
- The server respects Trello's rate limits
- If you hit limits, wait a moment before retrying
- Consider reducing the frequency of requests

## API Limits

Trello API has the following limits:
- 300 requests per 10 seconds per API key
- 100 requests per 10 seconds per token

The server handles these limits gracefully with proper error messages.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

- Create an issue on GitHub for bugs or feature requests
- Check existing issues for common problems
- Refer to Trello's API documentation for advanced usage

---

Made with ❤️ for the MCP ecosystem