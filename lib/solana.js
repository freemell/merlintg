import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, VersionedTransaction } from '@solana/web3.js';

// Get RPC URL from environment (default to mainnet)
const getRpcUrl = () => {
  // Check for SOLANA_RPC_URL first
  if (process.env.SOLANA_RPC_URL) {
    return process.env.SOLANA_RPC_URL;
  }
  // Then check NEXT_PUBLIC_SOLANA_RPC_URL
  if (process.env.NEXT_PUBLIC_SOLANA_RPC_URL) {
    return process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  }
  // Default to mainnet
  return 'https://api.mainnet-beta.solana.com';
};

// Create connection with proper configuration
const createConnection = () => {
  const rpcUrl = getRpcUrl();
  console.log(`🔗 Using RPC: ${rpcUrl}`);
  return new Connection(rpcUrl, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000,
  });
};

// Get connection (lazy initialization)
const getConnection = () => {
  // Always recreate connection to ensure it uses the latest RPC URL
  connection = createConnection();
  return connection;
};

let connection = createConnection();

// Fallback RPCs for reliability (mainnet only)
const fallbackRpcs = [
  'https://api.mainnet-beta.solana.com',
  'https://rpc.ankr.com/solana',
  'https://solana-api.projectserum.com',
];

// Retry helper function
async function retryOperation(operation, maxRetries = 3, delay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      console.warn(`⚠️ Attempt ${i + 1} failed, retrying...`, error.message);
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
}

// Get balance with retry and fallback RPCs - checks both devnet and mainnet
export async function getBalance(address) {
  try {
    const publicKey = new PublicKey(address);
    const primaryRpcUrl = getRpcUrl();
    
    console.log(`🔍 Fetching balance for ${address.substring(0, 8)}...`);
    console.log(`🔗 Primary RPC: ${primaryRpcUrl}`);
    
    // Try primary RPC first
    try {
      const balance = await retryOperation(async () => {
        const conn = getConnection();
        const balanceLamports = await conn.getBalance(publicKey, 'confirmed');
        console.log(`✅ Balance from primary RPC: ${balanceLamports} lamports (${balanceLamports / LAMPORTS_PER_SOL} SOL)`);
        return balanceLamports;
      });
      return balance / LAMPORTS_PER_SOL;
    } catch (error) {
      console.warn(`⚠️ Primary RPC (${primaryRpcUrl}) failed:`, error.message);
    }
    
    // If primary fails or returns 0, check mainnet fallbacks
    console.log('🔄 Checking mainnet fallbacks...');
    const networks = [
      { name: 'mainnet', rpc: 'https://api.mainnet-beta.solana.com' },
      { name: 'ankr-mainnet', rpc: 'https://rpc.ankr.com/solana' },
      { name: 'helius-mainnet', rpc: 'https://rpc.helius.xyz/?api-key=default' },
      { name: 'quicknode-mainnet', rpc: 'https://api.mainnet-beta.solana.com' },
    ];
    
    let lastError = null;
    let foundBalance = null;
    let foundNetwork = null;
    
    for (const network of networks) {
      // Skip if already tried
      if (network.rpc === primaryRpcUrl) {
        console.log(`⏭️ Skipping ${network.name} (already tried)`);
        continue;
      }
      
      try {
        console.log(`🔄 Checking ${network.name} (${network.rpc})...`);
        const networkConnection = new Connection(network.rpc, {
          commitment: 'confirmed',
          confirmTransactionInitialTimeout: 30000,
        });
        
        const balanceLamports = await networkConnection.getBalance(publicKey, 'confirmed');
        const balanceSol = balanceLamports / LAMPORTS_PER_SOL;
        
        console.log(`💰 ${network.name} balance: ${balanceLamports} lamports (${balanceSol} SOL)`);
        
        // If we find a non-zero balance, use it
        if (balanceLamports > 0) {
          foundBalance = balanceSol;
          foundNetwork = network.name;
          console.log(`✅ Found balance on ${network.name}: ${balanceSol} SOL`);
          break;
        }
        
        // Keep track of the last result (even if 0)
        foundBalance = balanceSol;
        foundNetwork = network.name;
      } catch (networkError) {
        console.warn(`❌ ${network.name} failed:`, networkError.message);
        lastError = networkError;
        continue;
      }
    }
    
    if (foundBalance !== null) {
      if (foundBalance > 0) {
        console.log(`✅ Returning balance: ${foundBalance} SOL from ${foundNetwork}`);
      } else {
        console.log(`⚠️ Balance is 0 on ${foundNetwork} - wallet may be on a different network`);
      }
      return foundBalance;
    }
    
    // If all failed, throw error
    throw lastError || new Error(`Failed to fetch balance from all networks`);
  } catch (error) {
    console.error('❌ Error getting balance:', error);
    console.error('Address:', address);
    console.error('Primary RPC URL:', getRpcUrl());
    
    // Provide user-friendly error messages
    if (error.message.includes('Invalid public key')) {
      throw new Error('Invalid wallet address');
    } else if (error.message.includes('Network')) {
      throw new Error('Network error. Please try again in a moment.');
    } else {
      throw new Error(`Failed to fetch balance: ${error.message}`);
    }
  }
}

export async function sendSOLTransaction(keypair, to, amount) {
  try {
    let recipientAddress = to;
    
    // Validate and create public keys
    const fromPubkey = keypair.publicKey;
    let toPubkey;
    
    try {
      toPubkey = new PublicKey(recipientAddress);
    } catch (error) {
      return { success: false, error: `Invalid recipient address: ${recipientAddress}` };
    }

    if (fromPubkey.equals(toPubkey)) {
      return { success: false, error: 'Cannot send to yourself' };
    }

    // Get balance with retry
    const balance = await getBalance(fromPubkey.toString());
    const solBalance = balance;
    const balanceLamports = Math.floor(balance * LAMPORTS_PER_SOL);

    // Calculate amount in lamports
    let lamports;
    if (amount === 'all' || amount === 'ALL') {
      lamports = balanceLamports - 5000; // Leave some for fees
      if (lamports < 0) {
        return { success: false, error: 'Insufficient balance to cover transaction fees' };
      }
    } else {
      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        return { success: false, error: 'Invalid amount. Please provide a positive number.' };
      }
      lamports = Math.floor(amountNum * LAMPORTS_PER_SOL);
    }

    if (lamports > balanceLamports) {
      return { success: false, error: `Insufficient balance. You have ${solBalance.toFixed(4)} SOL` };
    }

    // Create and send transaction with retry
    const sendTransaction = async (conn) => {
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey,
          toPubkey,
          lamports,
        })
      );

      // Get latest blockhash with retry
      const { blockhash, lastValidBlockHeight } = await retryOperation(async () => {
        return await conn.getLatestBlockhash('confirmed');
      });

      transaction.recentBlockhash = blockhash;
      transaction.feePayer = fromPubkey;

      // Sign transaction
      transaction.sign(keypair);

      // Send transaction
      const signature = await retryOperation(async () => {
        return await conn.sendRawTransaction(transaction.serialize(), {
          skipPreflight: false,
          maxRetries: 3,
        });
      });

      // Wait for confirmation
      const confirmation = await conn.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      return signature;
    };

    // Try with current connection
    let signature;
    try {
      signature = await sendTransaction(getConnection());
    } catch (error) {
      console.warn('Primary RPC failed, trying fallbacks...', error.message);
      
      // Try fallback RPCs
      for (const rpcUrl of fallbackRpcs) {
        if (rpcUrl === getRpcUrl()) continue;
        try {
          const fallbackConnection = new Connection(rpcUrl, 'confirmed');
          signature = await sendTransaction(fallbackConnection);
          console.log(`✅ Transaction sent via fallback RPC: ${rpcUrl}`);
          break;
        } catch (fallbackError) {
          console.warn(`Fallback RPC ${rpcUrl} failed:`, fallbackError.message);
          if (rpcUrl === fallbackRpcs[fallbackRpcs.length - 1]) {
            throw fallbackError;
          }
          continue;
        }
      }
    }

    return { success: true, signature };
  } catch (error) {
    console.error('Send SOL error:', error);
    
    // Provide user-friendly error messages
    let errorMessage = 'Unknown error';
    if (error.message.includes('insufficient funds')) {
      errorMessage = 'Insufficient balance for this transaction';
    } else if (error.message.includes('Invalid public key')) {
      errorMessage = 'Invalid recipient address';
    } else if (error.message.includes('Network')) {
      errorMessage = 'Network error. Please try again in a moment.';
    } else if (error.message.includes('Transaction failed')) {
      errorMessage = error.message;
    } else {
      errorMessage = error.message || 'Transaction failed';
    }
    
    return { success: false, error: errorMessage };
  }
}

// Token mint addresses (common tokens)
const tokenMints = {
  'SOL': 'So11111111111111111111111111111111111111112',
  'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'USDT': 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  'BONK': 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  'WIF': 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
};

/**
 * Swap tokens using Jupiter Lite API
 * @param {Keypair} keypair - User's keypair
 * @param {string} fromToken - Token to swap from (e.g., "SOL", "USDC", or mint address)
 * @param {string} toToken - Token to swap to (e.g., "SOL", "USDC", or mint address)
 * @param {string|number} amount - Amount to swap
 * @returns {Promise<{success: boolean, signature?: string, error?: string, quote?: object}>}
 */
export async function swapTokens(keypair, fromToken, toToken, amount) {
  try {
    const userPublicKey = keypair.publicKey.toString();
    
    console.log('🔄 Swap request:', { fromToken, toToken, amount, userPublicKey });

    // Resolve token symbols to mint addresses
    const fromMint = tokenMints[fromToken.toUpperCase()] || fromToken;
    const toMint = tokenMints[toToken.toUpperCase()] || toToken;

    // Convert amount to smallest unit (lamports for SOL, 1e6 for USDC/USDT, etc.)
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new Error('Invalid amount. Please provide a positive number.');
    }
    
    let amountInSmallestUnit;
    if (fromToken.toUpperCase() === 'SOL') {
      amountInSmallestUnit = Math.floor(amountNum * 1e9); // SOL to lamports
    } else {
      // Assume 6 decimals for most tokens (USDC, USDT, etc.)
      // For custom tokens, we might need to fetch decimals, but for now assume 6
      amountInSmallestUnit = Math.floor(amountNum * 1e6);
    }
    
    if (amountInSmallestUnit <= 0) {
      throw new Error('Amount too small to swap.');
    }

    console.log('📊 Fetching quote from Jupiter:', {
      inputMint: fromMint,
      outputMint: toMint,
      amount: amountInSmallestUnit
    });

    // Get quote from Jupiter Lite API (free, no API key required)
    const quoteUrl = `https://lite-api.jup.ag/swap/v1/quote?` + new URLSearchParams({
      inputMint: fromMint,
      outputMint: toMint,
      amount: amountInSmallestUnit.toString(),
      slippageBps: '50', // 0.5% slippage
    });

    const quoteResponse = await fetch(quoteUrl);
    if (!quoteResponse.ok) {
      const errorText = await quoteResponse.text();
      throw new Error(`Failed to get quote: ${errorText}`);
    }
    const quote = await quoteResponse.json();

    console.log('✅ Got quote:', quote);

    if (!quote || !quote.outAmount) {
      throw new Error('Invalid quote response from Jupiter');
    }

    // Get swap transaction from Jupiter Lite API
    console.log('🔄 Creating swap transaction...');
    
    const swapUrl = 'https://lite-api.jup.ag/swap/v1/swap';
    const swapResponse = await fetch(swapUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        priorityLevelWithMaxLamports: 'fast',
      }),
    });

    if (!swapResponse.ok) {
      const errorText = await swapResponse.text();
      throw new Error(`Failed to create swap transaction: ${errorText}`);
    }
    
    const swapResponseData = await swapResponse.json();

    console.log('✅ Swap transaction created');

    if (!swapResponseData || !swapResponseData.swapTransaction) {
      throw new Error('Invalid swap transaction response from Jupiter');
    }

    // Deserialize the transaction
    const swapTransactionBuf = Buffer.from(swapResponseData.swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

    // Sign the transaction
    transaction.sign([keypair]);

    // Send and confirm the transaction
    const connection = getConnection();
    
    // Get latest blockhash for confirmation
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    
    // Send transaction
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    console.log('📤 Swap transaction sent:', signature);

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed');

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    // Calculate output amount
    const outputAmount = quote.outAmount / (toToken.toUpperCase() === 'SOL' ? 1e9 : 1e6);
    const inputAmount = quote.inAmount / (fromToken.toUpperCase() === 'SOL' ? 1e9 : 1e6);

    return {
      success: true,
      signature,
      quote: {
        inputAmount,
        outputAmount,
        priceImpact: quote.priceImpactPct,
        fromToken,
        toToken,
      }
    };

  } catch (error) {
    console.error('❌ Swap error:', error);
    
    // Provide user-friendly error messages
    let errorMessage = 'Swap failed';
    if (error.message.includes('quote')) {
      errorMessage = 'Failed to get swap quote. Please check token addresses and try again.';
    } else if (error.message.includes('insufficient')) {
      errorMessage = 'Insufficient balance for this swap.';
    } else if (error.message.includes('Transaction failed')) {
      errorMessage = error.message;
    } else {
      errorMessage = error.message || 'Swap failed';
    }
    
    return { success: false, error: errorMessage };
  }
}


