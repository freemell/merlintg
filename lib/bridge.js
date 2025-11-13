// Bridge implementation for Telegram bot using Bungee Exchange API
// Real cross-chain bridge implementation using public sandbox endpoint

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
    // Hardcoded to Bungee Exchange public backend (free, keyless access for testing)
    // WARNING: Very limited shared RPS - not suitable for production
    // This is hardcoded to ensure no API key is required
    const baseUrl = 'https://public-backend.bungee.exchange';
    
    // Remove trailing slash if present
    this.socketApiUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    this.isBungeePublic = true; // Always true since we're hardcoding Bungee
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

  // Chain ID mappings for Socket/Bungee API
  getChainId(chain) {
    const normalizedChain = this.normalizeChainName(chain);
    
    // Use Bungee's chain IDs when using Bungee public backend
    if (this.isBungeePublic) {
      const bungeeChainMapping = {
        'solana': 89999, // Bungee's chain ID for Solana mainnet
        'ethereum': 1,
        'base': 8453,
        'polygon': 137,
        'arbitrum': 42161,
        'optimism': 10,
        'avalanche': 43114,
        'bsc': 56, // BNB Smart Chain
      };
      return bungeeChainMapping[normalizedChain] || null;
    }
    
    // Socket.tech chain IDs
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
    // Handle case-insensitive inputs
    const chainLower = chain ? chain.toLowerCase() : '';
    const tokenUpper = token ? token.toUpperCase() : '';
    
    // Bungee/Socket native token address (lowercase) - used for native tokens across all chains
    const nativeAddress = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    
    // Native SOL on Solana - use native address for bridging (not WSOL)
    if (chainLower === 'solana' && (tokenUpper === 'SOL' || !tokenUpper)) {
      return nativeAddress; // Bungee expects native address for SOL on Solana
    }
    
    // Solana token addresses (for non-native tokens)
    if (chainLower === 'solana') {
      const solanaTokens = {
        'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        'USDT': 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
        'WSOL': 'So11111111111111111111111111111111111111112', // WSOL fallback if explicitly requested
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
    
    // Native tokens on EVM chains (ETH, BNB, MATIC, AVAX, etc.)
    const evmNatives = ['ETH', 'BNB', 'MATIC', 'AVAX'];
    if (evmNatives.includes(tokenUpper)) {
      return nativeAddress;
    }
    
    // Return mapped token address or default to native token address
    return evmTokens[tokenUpper] || nativeAddress;
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

  async buildSolanaTransaction(txData, keypair, toAddress) {
    try {
      const connection = createConnection();
      
      // Check if txData is a base64-encoded string (legacy format)
      if (typeof txData === 'string') {
        // Legacy: base64 encoded transaction
        const transactionBuf = Buffer.from(txData, 'base64');
        const transaction = VersionedTransaction.deserialize(transactionBuf);
        transaction.sign([keypair]);
        
        const signature = await connection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: false,
          maxRetries: 3,
        });
        
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
        const confirmation = await connection.confirmTransaction({
          signature,
          blockhash,
          lastValidBlockHeight,
        }, 'confirmed');
        
        if (confirmation.value.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }
        
        return signature;
      }
      
      // New format: txData contains instructions, lookupTables, signers
      if (txData.instructions && Array.isArray(txData.instructions)) {
        // Use existing imports from top of file
        const { TransactionInstruction, PublicKey, TransactionMessage, Keypair } = await import('@solana/web3.js');
        
        // Convert instructions
        const instructions = txData.instructions.map(instr => {
          return new TransactionInstruction({
            programId: new PublicKey(instr.programId),
            keys: instr.keys.map(key => ({
              pubkey: new PublicKey(key.pubkey),
              isSigner: key.isSigner,
              isWritable: key.isWritable,
            })),
            data: Buffer.from(instr.data, 'base64'), // Assuming data is base64-encoded
          });
        });
        
        // Fetch lookup tables if present
        let lookupTableAccounts = [];
        if (txData.lookupTables && Array.isArray(txData.lookupTables) && txData.lookupTables.length > 0) {
          lookupTableAccounts = await Promise.all(
            txData.lookupTables.map(addr => connection.getAddressLookupTable(new PublicKey(addr)))
          ).then(tables => tables.filter(Boolean));
        }
        
        // Get recent blockhash
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
        
        // Compile message
        const messageV0 = new TransactionMessage({
          payerKey: keypair.publicKey,
          recentBlockhash: blockhash,
          instructions,
        }).compileToV0Message(lookupTableAccounts);
        
        // Create transaction
        const transaction = new VersionedTransaction(messageV0);
        
        // Sign with user keypair and additional signers if any
        const signers = [keypair];
        if (txData.signers && Array.isArray(txData.signers)) {
          const additionalSigners = txData.signers.map(secret => 
            Keypair.fromSecretKey(Uint8Array.from(secret))
          );
          signers.push(...additionalSigners);
        }
        
        transaction.sign(signers);
        
        // Send transaction
        const signature = await connection.sendTransaction(transaction);
        console.log('📤 Bridge transaction sent:', signature);
        
        // Wait for confirmation
        await connection.confirmTransaction({
          signature,
          blockhash,
          lastValidBlockHeight,
        }, 'confirmed');
        
        return signature;
      }
      
      throw new Error('Unknown transaction data format');
    } catch (error) {
      console.error('❌ Error building Solana transaction:', error);
      throw error;
    }
  }

  async bridgeSolanaToEvm(params, keypair, fromChainId, toChainId, normalizedToChain) {
    const { amount, toAddress, token } = params;
    
    try {
      const userPublicKey = keypair.publicKey.toString();
      const tokenAddress = this.getTokenAddress('solana', token || 'SOL');
      
      // Convert amount to smallest unit
      let amountInSmallestUnit;
      let amountNum;
      if (token === 'SOL' || !token) {
        amountNum = parseFloat(amount);
        
        // Minimum amount check for bridging (0.05 SOL to cover fees and ensure route availability)
        const MIN_SOL_AMOUNT = 0.05; // ~$7-8 USD - test and adjust based on real routes
        if (amountNum < MIN_SOL_AMOUNT) {
          return {
            success: false,
            message: `Amount too small for bridging`,
            error: `Minimum amount for bridging is ${MIN_SOL_AMOUNT} SOL (~$${(MIN_SOL_AMOUNT * 150).toFixed(2)} USD) to cover cross-chain fees and ensure route availability. You requested ${amountNum} SOL. Try increasing to at least ${MIN_SOL_AMOUNT} SOL.`
          };
        }
        
        amountInSmallestUnit = Math.floor(amountNum * LAMPORTS_PER_SOL);
      } else {
        // For SPL tokens, we'd need to get decimals - for now assume 6 decimals for USDC/USDT
        amountNum = parseFloat(amount);
        amountInSmallestUnit = Math.floor(amountNum * 1e6);
      }

      console.log('🌉 Getting bridge quote from Socket/Bungee API...');
      console.log('🔗 Base URL:', this.socketApiUrl);

      // Step 1: Get bridge quote from Socket/Bungee API
      // Bungee Exchange public backend uses: /api/v1/bungee/quote
      // Socket.tech uses: /quote (v2 is in base URL)
      const quoteEndpoint = this.isBungeePublic ? '/api/v1/bungee/quote' : '/quote';
      
      // Bungee API uses different parameter names than Socket API
      let queryParams;
      if (this.isBungeePublic) {
        // Bungee API parameter names - include enableManual=true and optimization params
        queryParams = new URLSearchParams({
          originChainId: fromChainId.toString(),
          destinationChainId: toChainId.toString(),
          inputToken: tokenAddress,
          outputToken: this.getTokenAddress(normalizedToChain, token || 'SOL'),
          inputAmount: amountInSmallestUnit.toString(),
          userAddress: userPublicKey,
          receiverAddress: toAddress,
          enableManual: 'true', // Required for Solana bridges to populate manualRoutes
          sort: 'output', // Maximize received amount
          singleTxOnly: 'false', // Allow multi-hop routes if needed
          refuel: 'false', // No auto-refuel on destination chain
        });
      } else {
        // Socket API parameter names (legacy)
        queryParams = new URLSearchParams({
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
      }
      const quoteUrl = `${this.socketApiUrl}${quoteEndpoint}?${queryParams.toString()}`;

      // Bungee public backend: NO API key required, NO authentication headers
      // Unconditionally bypass all API key checks for Bungee public backend
      const headers = {}; // Empty headers - no authentication needed

      console.log('📡 Request URL:', quoteUrl);
      console.log('📡 Request headers:', headers);

      const quoteResponse = await fetch(quoteUrl, {
        headers: headers
      });

      if (!quoteResponse.ok) {
        const errorText = await quoteResponse.text();
        console.error('❌ Bridge API quote error:', errorText);
        console.error('❌ Response status:', quoteResponse.status);
        console.error('❌ Response URL:', quoteResponse.url);
        
        if (quoteResponse.status === 401) {
          throw new Error('Bridge API authentication failed. Please set SOCKET_API_KEY in your .env file. Get your free API key at https://docs.socket.tech/socket-api');
        }
        
        throw new Error(`Failed to get bridge quote: ${errorText}`);
      }

      const quote = await quoteResponse.json();
      console.log('✅ Got bridge quote response:', JSON.stringify(quote, null, 2));

      // Check for error messages in response
      if (quote.error || quote.message || (quote.result && quote.result.error)) {
        const errorMsg = quote.error || quote.message || (quote.result && quote.result.error);
        console.error('❌ API returned error:', errorMsg);
        throw new Error(`Bridge API error: ${errorMsg}`);
      }

      // Handle different response formats (Bungee Exchange vs Socket)
      let selectedRoute = null;
      
      // Bungee API response structure: result.autoRoute or result.manualRoutes
      if (quote.result) {
        const result = quote.result;
        
        // First check autoRoute
        if (result.autoRoute) {
          selectedRoute = result.autoRoute;
          console.log('✅ Found autoRoute');
        }
        // If no autoRoute, check manualRoutes (populated when enableManual=true)
        else if (result.manualRoutes && Array.isArray(result.manualRoutes) && result.manualRoutes.length > 0) {
          // Sort routes by effectiveReceivedInUsd (highest first) or estimatedOutput
          const sortedRoutes = result.manualRoutes.sort((a, b) => {
            // Prefer effectiveReceivedInUsd if available
            const receivedA = parseFloat(a.effectiveReceivedInUsd || a.estimatedOutput || a.outputAmount || 0);
            const receivedB = parseFloat(b.effectiveReceivedInUsd || b.estimatedOutput || b.outputAmount || 0);
            return receivedB - receivedA; // Highest received amount first
          });
          selectedRoute = sortedRoutes[0];
          const routeName = selectedRoute.name || selectedRoute.integrator || 'Unknown';
          const receivedUsd = selectedRoute.effectiveReceivedInUsd ? `$${selectedRoute.effectiveReceivedInUsd}` : 'unknown';
          console.log(`✅ Found ${result.manualRoutes.length} manual route(s), using best: ${routeName} (Received: ${receivedUsd})`);
        }
        // Check for depositRoute (alternative route format)
        else if (result.depositRoute) {
          selectedRoute = result.depositRoute;
          console.log('✅ Found depositRoute');
        }
        // Legacy: check for routes array
        else if (result.routes && Array.isArray(result.routes) && result.routes.length > 0) {
          selectedRoute = result.routes[0];
          console.log('✅ Found routes array');
        }
        // Legacy: result might be an array
        else if (Array.isArray(result) && result.length > 0) {
          selectedRoute = result[0];
          console.log('✅ Found result array');
        }
      }
      // Fallback: check top-level routes
      else if (quote.routes && Array.isArray(quote.routes) && quote.routes.length > 0) {
        selectedRoute = quote.routes[0];
        console.log('✅ Found top-level routes');
      }
      // Fallback: quote might be an array
      else if (Array.isArray(quote) && quote.length > 0) {
        selectedRoute = quote[0];
        console.log('✅ Found quote array');
      }

      console.log('🔍 Selected route:', selectedRoute ? JSON.stringify(selectedRoute, null, 2) : 'null');
      console.log('🔍 Full response structure:', {
        hasResult: !!quote.result,
        hasAutoRoute: !!(quote.result && quote.result.autoRoute),
        manualRoutesCount: (quote.result && quote.result.manualRoutes) ? quote.result.manualRoutes.length : 0,
        hasRoutes: !!(quote.result && quote.result.routes),
      });

      if (!selectedRoute) {
        const result = quote.result || {};
        const hasAutoRoute = !!result.autoRoute;
        const manualRoutesCount = (result.manualRoutes && Array.isArray(result.manualRoutes)) ? result.manualRoutes.length : 0;
        const hasDepositRoute = !!result.depositRoute;
        
        console.error('❌ No routes in response. Full response:', JSON.stringify(quote, null, 2));
        console.error('❌ Request URL was:', quoteUrl);
        console.error('❌ Request parameters:', {
          originChainId: fromChainId,
          destinationChainId: toChainId,
          inputToken: tokenAddress,
          outputToken: this.getTokenAddress(normalizedToChain, token || 'SOL'),
          inputAmount: amountInSmallestUnit,
          amountSOL: amountNum ? `${amountNum} SOL` : 'unknown',
          enableManual: 'true',
          sort: 'output',
          singleTxOnly: 'false',
          refuel: 'false',
        });
        
        // Provide helpful error message based on what we found
        let errorMessage = 'No bridge routes available for this transaction. ';
        if (hasAutoRoute === false && manualRoutesCount === 0 && !hasDepositRoute) {
          errorMessage += 'Possible reasons:\n';
          errorMessage += `- Amount too small (minimum ~0.05 SOL / ~$7-8 USD to cover fees)\n`;
          errorMessage += '- Route not supported for this token pair\n';
          errorMessage += '- Low liquidity for this specific combination\n';
          errorMessage += `\nYou requested: ${amountNum || 'unknown'} SOL. Try:\n`;
          errorMessage += `1. Increasing amount to at least 0.05 SOL\n`;
          
          // Suggest bridging to USDC if trying native-to-native
          const outputToken = this.getTokenAddress(normalizedToChain, token || 'SOL');
          if (outputToken === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
            errorMessage += `2. Bridging to USDC on ${normalizedToChain} instead (better liquidity for small amounts)\n`;
            if (normalizedToChain === 'bsc') {
              errorMessage += `   Use outputToken: 0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d (USDC on BSC)`;
            }
          }
        }
        
        throw new Error(errorMessage);
      }

      // Step 2: Build bridge transaction
      // Use the selected route (from autoRoute or manualRoutes)
      const route = selectedRoute;
      
      // Bungee API requires GET request with quoteId as query parameter
      if (this.isBungeePublic) {
        // Extract quoteId from the route
        const quoteId = route.quoteId || route.id;
        if (!quoteId) {
          throw new Error('No quoteId found in route. Cannot build transaction.');
        }
        
        const buildTxUrl = `${this.socketApiUrl}/api/v1/bungee/build-tx?quoteId=${quoteId}`;
        console.log('🔨 Building transaction with quoteId:', quoteId);
        console.log('🔨 Build TX URL:', buildTxUrl);

        // Bungee public backend: NO API key required, GET request
        const buildTxResponse = await fetch(buildTxUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!buildTxResponse.ok) {
          const errorText = await buildTxResponse.text();
          console.error('❌ Build TX error:', errorText);
          throw new Error(`Failed to build bridge transaction: ${errorText}`);
        }

        const buildTxData = await buildTxResponse.json();
        console.log('✅ Bridge transaction built:', JSON.stringify(buildTxData, null, 2));
        
        // For Socket API (legacy)
        if (!buildTxData.result || !buildTxData.result.txData) {
          throw new Error('Invalid transaction data from Bungee Exchange');
        }
        
        // Handle Solana transaction building
        const signature = await this.buildSolanaTransaction(buildTxData.result.txData, keypair, toAddress);
        
        // Step 3: Get bridge status
        const bridgeStatus = await this.getBridgeStatus(signature);

        return {
          success: true,
          transactionHash: signature,
          bridgeTxId: bridgeStatus?.bridgeTxId || signature,
          message: `✅ Bridge transaction initiated! ${amount} ${token || 'SOL'} bridging from Solana to ${normalizedToChain}. Transaction: ${signature}`,
          estimatedTime: route.estimatedTime || '3-5 minutes',
        };
      } else {
        // Socket API uses POST (legacy)
        const buildTxEndpoint = '/build-tx';
        const buildTxUrl = `${this.socketApiUrl}${buildTxEndpoint}`;

        const buildTxHeaders = {
          'Content-Type': 'application/json',
        };
        const apiKey = process.env.SOCKET_API_KEY;
        if (apiKey) {
          buildTxHeaders['X-API-Key'] = apiKey;
        }

        const buildTxResponse = await fetch(buildTxUrl, {
          method: 'POST',
          headers: buildTxHeaders,
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
        
        if (!buildTxData.result || !buildTxData.result.txData) {
          throw new Error('Invalid transaction data from Socket');
        }
        
        // Handle Solana transaction building
        const signature = await this.buildSolanaTransaction(buildTxData.result.txData, keypair, toAddress);
        
        // Step 4: Get bridge status
        const bridgeStatus = await this.getBridgeStatus(signature);

        return {
          success: true,
          transactionHash: signature,
          bridgeTxId: bridgeStatus?.bridgeTxId || signature,
          message: `✅ Bridge transaction initiated! ${amount} ${token || 'SOL'} bridging from Solana to ${normalizedToChain}. Transaction: ${signature}`,
          estimatedTime: route.estimatedTime || '3-5 minutes',
        };
      }

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
      // Check bridge status via Socket/Bungee API
      const statusEndpoint = this.isBungeePublic ? '/api/v1/bungee/bridge-status' : '/bridge-status';
      const statusUrl = `${this.socketApiUrl}${statusEndpoint}?txHash=${txHash}`;
      
      // Bungee public backend: NO API key required
      const headers = {}; // Empty headers - no authentication needed
      
      const response = await fetch(statusUrl, {
        headers: headers
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

