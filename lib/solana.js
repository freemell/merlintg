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

// Swap tokens function (placeholder - can be extended with Jupiter or Raydium)
export async function swapTokens(keypair, fromToken, toToken, amount) {
  try {
    // For now, this is a placeholder
    // In production, you would integrate with Jupiter or Raydium swap protocol
    return {
      success: false,
      error: 'Swap functionality is coming soon. Please use a DEX directly for now.'
    };
  } catch (error) {
    console.error('Swap error:', error);
    return { success: false, error: error.message || 'Swap failed' };
  }
}


