import { config } from 'dotenv';
import Groq from 'groq-sdk';
import OpenAI from 'openai';

// Load environment variables
config();

// Initialize AI clients
const groq = process.env.GROQ_API_KEY 
  ? new Groq({
      apiKey: process.env.GROQ_API_KEY,
    })
  : null;

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  : null;

// Enhanced system prompt for natural language processing
const SYSTEM_PROMPT = `You are Merlin, a Solana blockchain AI assistant. You help users with blockchain operations through natural conversation.

Your capabilities:
- Send SOL and tokens
- Check balances
- Bridge tokens between chains
- Swap tokens (including buying tokens with SOL)
- Stake SOL
- View transaction history
- Resolve .sol domains
- Handle group chat transactions with @username mentions

Parse user queries into structured actions. Available actions:
- connect: Connect wallet
- create_wallet: Create a new wallet (for users who don't have one yet)
- send: Send SOL or tokens (requires amount, token, to address, domain, or username)
- balance: Check SOL balance
- swap: Swap tokens (requires fromToken, toToken, amount)
- bridge: Bridge tokens between chains (requires fromChain, toChain, token, amount, toAddress)
- stake: Stake SOL (requires amount)
- tx: View transaction history
- chat: General conversation (for non-blockchain queries)

IMPORTANT LANGUAGE INTERPRETATIONS:
- "buy [token_address]" means swap SOL for that token (action: swap, fromToken: SOL, toToken: [token_address])
- "sell [token_address]" means swap that token for SOL (action: swap, fromToken: [token_address], toToken: SOL)
- When a user says "buy 0.1 sol of [token_address]", interpret as: swap 0.1 SOL for [token_address]
- Tokens are identified by their mint address (usually starts with letters/numbers and is long)

GROUP CHAT TRANSACTIONS:
- In group chats, users can mention other users with @username (e.g., "@askmerlin_bot send 1 SOL to @anotheruser")
- When you see "@username" in the message, extract it as the recipient
- Use "toUsername" in params for @username mentions (e.g., {"amount": "1", "toUsername": "anotheruser"})
- Users can also send to Solana addresses or .sol domains in group chats

IMPORTANT: Users can provide .sol domains (like pinkpotato.sol) instead of wallet addresses. 
When you see a .sol domain, include it in the params as "domain" and the system will resolve it to an address.

Always respond in this JSON format:
{
  "action": "action_name",
  "params": {"param1": "value1", "param2": "value2"},
  "response": "Natural language response to user"
}

For high-risk actions like sending tokens or bridging, always ask for confirmation.
If the query is not blockchain-related, respond normally but set action to "chat".
If unclear, ask for clarification.`;

/**
 * Process a message using AI (GROQ or OpenAI)
 * @param {string} message - User message
 * @returns {Promise<{action: string, params: object, response: string, success: boolean}>}
 */
export async function processMessageWithAI(message) {
  if (!message) {
    return {
      action: "chat",
      params: {},
      response: "Please provide a message.",
      success: false
    };
  }

  console.log('🤖 Processing message with AI:', message);

  // Try GROQ first, then OpenAI
  if (groq) {
    try {
      const completion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: message }
        ],
        model: 'llama-3.1-8b-instant',
        temperature: 0.1,
        max_tokens: 1000,
        stream: false
      });

      const aiResponse = completion.choices[0]?.message?.content;
      
      if (aiResponse) {
        console.log('🤖 GROQ response:', aiResponse);
        try {
          const parsed = JSON.parse(aiResponse);
          return {
            action: parsed.action || "chat",
            params: parsed.params || {},
            response: parsed.response || aiResponse,
            success: true
          };
        } catch (parseError) {
          console.error('❌ GROQ response JSON parsing failed, using raw response:', parseError);
          return {
            action: "chat",
            params: {},
            response: aiResponse,
            success: true
          };
        }
      }
    } catch (groqError) {
      console.error('❌ GROQ API error:', groqError);
      // Fall through to OpenAI
    }
  }

  // Fallback to OpenAI
  if (openai) {
    try {
      const completion = await openai.chat.completions.create({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: message }
        ],
        model: 'gpt-3.5-turbo',
        temperature: 0.1,
        max_tokens: 1000,
        stream: false
      });

      const aiResponse = completion.choices[0]?.message?.content;
      
      if (aiResponse) {
        console.log('🤖 OpenAI response:', aiResponse);
        try {
          const parsed = JSON.parse(aiResponse);
          return {
            action: parsed.action || "chat",
            params: parsed.params || {},
            response: parsed.response || aiResponse,
            success: true
          };
        } catch (parseError) {
          console.error('❌ OpenAI response JSON parsing failed, using raw response:', parseError);
          return {
            action: "chat",
            params: {},
            response: aiResponse,
            success: true
          };
        }
      }
    } catch (openaiError) {
      console.error('❌ OpenAI API error:', openaiError);
    }
  }

  // No AI configured
  if (!groq && !openai) {
    return {
      action: "chat",
      params: {},
      response: "AI is not configured. Please set GROQ_API_KEY or OPENAI_API_KEY environment variable.",
      success: false
    };
  }

  // Both failed
  return {
    action: "chat",
    params: {},
    response: "Sorry, I'm having trouble connecting to my AI brain. Please try again later.",
    success: false
  };
}

