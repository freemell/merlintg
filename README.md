# Merlin Telegram Bot

🧙‍♂️ **Merlin** - Your Solana Blockchain Assistant on Telegram

## Features

- ✅ Create and manage Solana wallets
- ✅ Send SOL to addresses, .sol domains, or @usernames
- ✅ Check balances
- ✅ Group chat support with @username mentions
- ✅ AI-powered natural language processing
- ✅ Secure encrypted wallet storage
- ✅ Transaction history with confirmation links

## Quick Start

### Deploy to Railway (Recommended)

1. **Make Repository Private:**
   - Go to https://github.com/freemell/merlintg
   - Settings → General → Danger Zone → Make private

2. **Deploy:**
   - Go to [railway.app](https://railway.app)
   - New Project → Deploy from GitHub repo
   - Select `freemell/merlintg`
   - Set **Root Directory** to: `telegram-bot`

3. **Add Environment Variables:**
   ```
   TELEGRAM_BOT_TOKEN=your_bot_token
   ENCRYPTION_SECRET=your_encryption_secret
   DATABASE_URL=file:./dev.db
   SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
   GROQ_API_KEY=your_groq_key
   OPENAI_API_KEY=your_openai_key
   SOCKET_API_KEY=your_socket_api_key
   SOCKET_API_URL=https://api.socket.tech/v2
   USE_WEBHOOK=false
   ```
   
   **Note:** 
   - Bridge functionality uses Bungee Exchange public backend by default (free, no API key required)
   - `SOCKET_API_URL` is optional (defaults to `https://public-backend.bungee.exchange`)
   - **Bungee Public Backend**: Free for testing, but has very limited rate limits (shared RPS across all users, not suitable for production)
   - For production: Use Socket.tech API with `SOCKET_API_KEY` and set `SOCKET_API_URL=https://api.socket.tech/v2`
   - Get Socket.tech API key at: https://docs.socket.tech/socket-api

4. **Deploy!** Railway will automatically start the bot.

## Database Persistence

✅ **Your wallets are preserved!** The `dev.db` file is included in the repository, so Railway uses the same database with all existing wallets.

## Local Development

```bash
npm install
npx prisma generate
npm start
```

## Usage

### Private Chat
- `/start` - Start the bot
- `/balance` - Check balance
- Natural language: "send 1 SOL to address..." or "check my balance"

### Group Chat
- `@askmerlin_bot send 1 SOL to @username`
- `@askmerlin_bot check my balance`
- `@askmerlin_bot create wallet`

## Security

- 🔒 Private keys are encrypted before storage
- 🔐 Each user's wallet is isolated by Telegram user ID
- 🛡️ Secure username-to-userID resolution for transactions

## Support

See [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md) for detailed deployment instructions.
