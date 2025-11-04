# Merlin Telegram Bot - Standalone

A standalone Telegram bot for Merlin Solana Assistant.

## Features

- ✅ Create Solana wallets
- ✅ Import existing wallets (encrypted storage)
- ✅ Check SOL balance
- ✅ Send SOL
- ✅ Beautiful button-based UI
- ✅ Secure encryption of private keys

## Setup

### 1. Install Dependencies
```bash
cd telegram-bot
npm install
```

### 2. Database Setup
```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 3. Environment Variables
Copy `.env.example` to `.env` and fill in:
```env
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
ENCRYPTION_SECRET=your-strong-random-secret-key
DATABASE_URL="file:./bot.db"
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

### 4. Run the Bot

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

## Deployment Options

### Option 1: Railway (Recommended)
1. Push to GitHub
2. Connect to [Railway](https://railway.app)
3. Add environment variables
4. Deploy!

### Option 2: Render
1. Create new Web Service on [Render](https://render.com)
2. Connect GitHub repo
3. Set start command: `npm start`
4. Add environment variables
5. Deploy!

### Option 3: Vercel (Serverless)
1. Create `vercel.json`:
```json
{
  "version": 2,
  "builds": [
    {
      "src": "index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "index.js"
    }
  ]
}
```
2. Deploy to Vercel
3. Set environment variables
4. Use webhook instead of polling

### Option 4: Simple Node.js Server
- Can run on any VPS (DigitalOcean, AWS, etc.)
- Just run `npm start`
- Use PM2 for process management

## Webhook vs Polling

**For Vercel/Railway/Render (Serverless):**
- Use webhooks: `bot.api.setWebhook('https://your-app.com/webhook')`

**For VPS/Simple Server:**
- Use polling: `bot.start()` (already set up)

## Commands

- `/start` - Start the bot
- `/help` - Show help
- `/balance` - Check balance
- `/wallet` - Manage wallet


