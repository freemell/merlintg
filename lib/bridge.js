// Bridge implementation for Telegram bot using Socket.tech API
// Real cross-chain bridge implementation

import { Connection, PublicKey, VersionedTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { config } from 'dotenv';

config();

// Get RPC URL from environment (default to mainnet)
const getRpcUrl = () => {
  if (process.env.SOLANA_RPC_URL) {
    return process.env.SOLANA_RPC_URL;
  }
  if (process.env.NEXT_PUBLIC_SOLANA_RPC_URL) {
    return process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  }
  return 'https://api.mainnet-beta.solana.com';
};

// Create Solana connection
const createConnection = () => {
  const rpcUrl = getRpcUrl();
  return new Connection(rpcUrl, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000,
  });
};

export class MerlinBridge {
  constructor() {
    // Socket.tech API base URL
    this.socketApiUrl = 'https://api.socket.tech/v2';
  }

  // Normalize chain names (handle common variations)
  normalizeChainName(chain) {
    if (!chain) return null;
    
    const chainLower = chain.toLowerCase();
    
    // Map common variations to standard names
    const chainAliases = {
      'sol': 'solana',
      'solana': 'solana',
      'eth': 'ethereum',
      'ethereum': 'ethereum',
      'base': 'base',
      'polygon': 'polygon',
      'arbitrum': 'arbitrum',
      'optimism': 'optimism',
      'avalanche': 'avalanche',
      'avax': 'avalanche',
      'bsc': 'bsc',
      'bnb': 'bsc', // BNB Smart Chain (BSC)
      'binance': 'bsc',
      'binance smart chain': 'bsc',
    };
    
    return chainAliases[chainLower] || chainLower;
  }

  // Chain ID mappings for Socket API
  getChainId(chain) {
    const normalizedChain = this.normalizeChainName(chain);
    
    const chainMapping = {
      'solana': 1399811149, // Socket chain ID for Solana
      'ethereum': 1,
      'base': 8453,
      'polygon': 137,
      'arbitrum': 42161,
      'optimism': 10,
      'avalanche': 43114,
      'bsc': 56, // BNB Smart Chain
    };
    
    return chainMapping[normalizedChain] || null;
  }

  // Token address mappings
  getTokenAddress(chain, token) {
    const tokenUpper = token.toUpperCase();
    
    // Solana token addresses
    if (chain.toLowerCase() === 'solana') {
      const solanaTokens = {
        'SOL': 'So11111111111111111111111111111111111111112',
        'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        'USDT': 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
      };
      return solanaTokens[tokenUpper] || token; // Return as-is if not in mapping
    }
    
    // EVM token addresses (mainnet)
    const normalizedChain = this.normalizeChainName(chain);
    const evmTokens = {
      'USDC': normalizedChain === 'ethereum' ? '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' :
              normalizedChain === 'base' ? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' :
              normalizedChain === 'polygon' ? '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' :
              normalizedChain === 'arbitrum' ? '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' :
              normalizedChain === 'bsc' ? '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d' : // BSC USDC
              '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      'USDT': normalizedChain === 'ethereum' ? '0xdAC17F958D2ee523a2206206994597C13D831ec7' :
              normalizedChain === 'polygon' ? '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' :
              normalizedChain === 'bsc' ? '0x55d398326f99059fF775485246999027B3197955' : // BSC USDT
              '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    };
    
    return evmTokens[tokenUpper] || '0x0000000000000000000000000000000000000000'; // Native token (ETH, BNB, MATIC, etc.)
  }

  async executeBridge(params, keypair) {
    try {
      const { fromChain, toChain, token, amount, toAddress } = params;

      console.log('🌉 Executing bridge:', { fromChain, toChain, token, amount, toAddress });

      // Validate parameters
      if (!fromChain || !toChain) {
        return {
          success: false,
          message: 'Missing chain parameters',
          error: `Invalid chain parameters: fromChain=${fromChain}, toChain=${toChain}`
        };
      }

      if (!toAddress) {
        return {
          success: false,
          message: 'Missing destination address',
          error: 'toAddress is required for bridging'
        };
      }

      if (!keypair) {
        return {
          success: false,
          message: 'Missing keypair',
          error: 'Wallet keypair is required for bridging'
        };
      }

      // Normalize chain names
      const normalizedFromChain = this.normalizeChainName(fromChain);
      const normalizedToChain = this.normalizeChainName(toChain);

      // Get chain IDs
      const fromChainId = this.getChainId(normalizedFromChain);
      const toChainId = this.getChainId(normalizedToChain);

      if (!fromChainId || !toChainId) {
        return {
          success: false,
          message: 'Unsupported chain',
          error: `Chain not supported: fromChain=${fromChain} (normalized: ${normalizedFromChain}), toChain=${toChain} (normalized: ${normalizedToChain}). Supported chains: Solana, Ethereum, Base, Polygon, Arbitrum, Optimism, Avalanche, BSC/BNB`
        };
      }

      // For Solana to EVM bridges, use Socket API
      if (normalizedFromChain === 'solana' && this.isEvmChain(normalizedToChain)) {
        return await this.bridgeSolanaToEvm(params, keypair, fromChainId, toChainId, normalizedToChain);
      }

      return {
        success: false,
        message: 'Bridge not yet implemented for this chain combination',
        error: `Bridge from ${fromChain} to ${toChain} not supported yet. Currently only Solana to EVM chains are supported.`
      };

    } catch (error) {
      console.error('❌ Bridge execution error:', error);
      return {
        success: false,
        message: 'Bridge execution failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async bridgeSolanaToEvm(params, keypair, fromChainId, toChainId, normalizedToChain) {
    const { amount, toAddress, token } = params;
    
    try {
      const userPublicKey = keypair.publicKey.toString();
      const tokenAddress = this.getTokenAddress('solana', token || 'SOL');
      
      // Convert amount to smallest unit
      let amountInSmallestUnit;
      if (token === 'SOL' || !token) {
        const amountNum = parseFloat(amount);
        amountInSmallestUnit = Math.floor(amountNum * LAMPORTS_PER_SOL);
      } else {
        // For SPL tokens, we'd need to get decimals - for now assume 6 decimals for USDC/USDT
        const amountNum = parseFloat(amount);
        amountInSmallestUnit = Math.floor(amountNum * 1e6);
      }

      console.log('🌉 Getting bridge quote from Socket...');

      // Step 1: Get bridge quote from Socket API
      const quoteUrl = `${this.socketApiUrl}/quote?` + new URLSearchParams({
        fromChainId: fromChainId.toString(),
        toChainId: toChainId.toString(),
        fromTokenAddress: tokenAddress,
        toTokenAddress: this.getTokenAddress(normalizedToChain, token || 'SOL'),
        fromAmount: amountInSmallestUnit.toString(),
        userAddress: userPublicKey,
        recipient: toAddress,
        uniqueRoutesPerBridge: 'true',
        sort: 'output',
        singleTxOnly: 'true',
      });

      const quoteResponse = await fetch(quoteUrl, {
        headers: {
          'API-KEY': process.env.SOCKET_API_KEY || '', // Optional API key for higher rate limits
        }
      });

      if (!quoteResponse.ok) {
        const errorText = await quoteResponse.text();
        console.error('❌ Socket quote error:', errorText);
        throw new Error(`Failed to get bridge quote: ${errorText}`);
      }

      const quote = await quoteResponse.json();
      console.log('✅ Got bridge quote:', quote);

      if (!quote.result || !quote.result.routes || quote.result.routes.length === 0) {
        throw new Error('No bridge routes available for this transaction');
      }

      // Step 2: Build bridge transaction
      const route = quote.result.routes[0]; // Use best route
      const buildTxUrl = `${this.socketApiUrl}/build-tx`;

      const buildTxResponse = await fetch(buildTxUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'API-KEY': process.env.SOCKET_API_KEY || '',
        },
        body: JSON.stringify({
          route: route,
          userAddress: userPublicKey,
          recipient: toAddress,
        }),
      });

      if (!buildTxResponse.ok) {
        const errorText = await buildTxResponse.text();
        throw new Error(`Failed to build bridge transaction: ${errorText}`);
      }

      const buildTxData = await buildTxResponse.json();
      console.log('✅ Bridge transaction built');

      // Step 3: Sign and send transaction on Solana
      if (!buildTxData.result || !buildTxData.result.txData) {
        throw new Error('Invalid transaction data from Socket');
      }

      // For Solana, the transaction is base64 encoded
      const txData = buildTxData.result.txData;
      const transactionBuf = Buffer.from(txData, 'base64');
      const transaction = VersionedTransaction.deserialize(transactionBuf);

      // Sign the transaction
      transaction.sign([keypair]);

      // Send transaction
      const connection = createConnection();
      const signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });

      console.log('📤 Bridge transaction sent:', signature);

      // Wait for confirmation
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      // Step 4: Get bridge status
      const bridgeStatus = await this.getBridgeStatus(signature);

      return {
        success: true,
        transactionHash: signature,
        bridgeTxId: bridgeStatus?.bridgeTxId || signature,
        message: `✅ Bridge transaction initiated! ${amount} ${token || 'SOL'} bridging from Solana to ${normalizedToChain}. Transaction: ${signature}`,
        estimatedTime: route.estimatedTime || '3-5 minutes',
      };

    } catch (error) {
      console.error('❌ Bridge error:', error);
      return {
        success: false,
        message: 'Bridge transaction failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getBridgeStatus(txHash) {
    try {
      // Check bridge status via Socket API
      const statusUrl = `${this.socketApiUrl}/bridge-status?txHash=${txHash}`;
      const response = await fetch(statusUrl, {
        headers: {
          'API-KEY': process.env.SOCKET_API_KEY || '',
        }
      });

      if (response.ok) {
        const data = await response.json();
        return data.result;
      }
    } catch (error) {
      console.warn('⚠️ Could not fetch bridge status:', error.message);
    }
    return null;
  }

  isEvmChain(chain) {
    const normalizedChain = this.normalizeChainName(chain);
    const evmChains = ['ethereum', 'base', 'polygon', 'arbitrum', 'optimism', 'avalanche', 'bsc'];
    return evmChains.includes(normalizedChain);
  }

  async getBridgeQuote(params) {
    // Calculate bridge quote based on amount and destination chain
    const { amount, toChain } = params;
    const normalizedToChain = this.normalizeChainName(toChain);
    
    let bridgeFee = 0.0005; // Base fee in SOL
    let estimatedTime = '3-5 minutes';
    
    // Adjust fee based on amount
    if (amount === 'all') {
      bridgeFee = 0.001;
    } else if (amount === 'half') {
      bridgeFee = 0.0007;
    } else if (typeof amount === 'number' && amount > 10) {
      bridgeFee = 0.0008;
    }

    // Adjust time based on destination chain
    if (['ethereum', 'base'].includes(normalizedToChain)) {
      estimatedTime = '3-5 minutes';
    } else if (['polygon', 'avalanche', 'bsc'].includes(normalizedToChain)) {
      estimatedTime = '2-4 minutes';
    } else {
      estimatedTime = '5-10 minutes';
    }

    return {
      estimatedTime,
      bridgeFee: `${bridgeFee} SOL`,
      slippage: '0.5%',
      minimumAmount: '0.001 SOL'
    };
  }
}

// Export singleton instance
export const merlinBridge = new MerlinBridge();

