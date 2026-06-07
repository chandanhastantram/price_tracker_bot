# Telegram Price Tracker Bot

A Telegram chatbot for tracking product purchase prices across vendors.

## Deploy to Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app)

### Environment Variables
| Variable | Description |
|----------|-------------|
| `BOT_TOKEN` | Your Telegram bot token from @BotFather |

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
