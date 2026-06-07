# Telegram Price Tracker Bot

A Telegram chatbot for tracking product purchase prices across vendors.

## Deploy to Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app)

### Environment Variables
| Variable | Description | Default |
|----------|-------------|---------|
| `BOT_TOKEN` | Your Telegram bot token from @BotFather | (Required) |
| `DB_PATH` | Path to save the SQLite database file | `pricetracker.db` |

### Database Persistence on Railway
By default, Railway deployments have an ephemeral filesystem. To prevent losing your database on restarts/re-deployments:
1. In your Railway project, click **+ New** -> **Volume**.
2. Mount the volume to a path, e.g., `/data`.
3. Add the `DB_PATH` environment variable in your service Settings:
   `DB_PATH = /data/pricetracker.db`

## Local Development

```bash
npm install
cp .env.example .env
# Add your BOT_TOKEN to .env
npm start
```

## Commands
- `bought cement from Raj at 380` — Record purchase
- `price cement` — Price history  
- `compare cement` — Best vendor
- `/stats` — Dashboard
- `/help` — All commands
