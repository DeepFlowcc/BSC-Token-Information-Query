import Moralis from 'moralis';
import Web3 from 'web3';

// Elements
const tokenAddressInput = document.getElementById('tokenAddress');
const chainSelect = document.getElementById('chainSelect');
const searchBtn = document.getElementById('searchBtn');
const refreshBtn = document.getElementById('refreshBtn');
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const resultsEl = document.getElementById('results');
const transactionsBody = document.getElementById('transactionsBody');
const tokenInfoEl = document.getElementById('tokenInfo');

// Token info elements
const tokenLogoEl = document.getElementById('tokenLogo');
const tokenNameEl = document.getElementById('tokenName');
const tokenSymbolEl = document.getElementById('tokenSymbol');
const tokenPriceEl = document.getElementById('tokenPrice');
const priceChangeEl = document.getElementById('priceChange');
const holderCountEl = document.getElementById('holderCount');
const contractAddressEl = document.getElementById('contractAddress');
const contractLinkEl = document.getElementById('contractLink');

// Current token address and chain for refresh functionality
let currentTokenAddress = '';
let currentChain = '';

// Transaction limit
const TRANSACTION_LIMIT = 20;

// Chain mapping
const chainMapping = {
  eth: {
    name: 'Ethereum',
    apiChain: 'eth',
    explorer: 'https://etherscan.io',
    currencySymbol: 'ETH',
    scanApiUrl: 'https://api.etherscan.io/api',
    coingeckoId: 'ethereum'
  },
  bsc: {
    name: 'Binance Smart Chain',
    apiChain: '0x38', // BSC chain ID in hex format
    explorer: 'https://bscscan.com',
    currencySymbol: 'BNB',
    scanApiUrl: 'https://api.bscscan.com/api',
    coingeckoId: 'binance-smart-chain'
  },
  polygon: {
    name: 'Polygon',
    apiChain: 'polygon',
    explorer: 'https://polygonscan.com',
    currencySymbol: 'MATIC',
    scanApiUrl: 'https://api.polygonscan.com/api',
    coingeckoId: 'polygon-pos'
  }
};

// API Keys
const MORALIS_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjA1YWUzOWQ0LTlhM2EtNDUyZC04MDU3LTczNzY1ZDAyYjVjYiIsIm9yZ0lkIjoiNDM5MzExIiwidXNlcklkIjoiNDUxOTYxIiwidHlwZUlkIjoiN2U2ZDEwMjAtMmMwNi00YjAxLWExM2EtMmRmNDAzMjZjMDgyIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NDM2MDU2MTUsImV4cCI6NDg5OTM2NTYxNX0.5LywehWKoABQWOzJAkglrLvmh-4cn1rvEh6x0JCuP7I';
const BSC_API_KEY = '7UZAGYM3NQUPTYAAFI49IPDTKCJRR9PCYR';

// Initialize Moralis
async function initMoralis() {
  try {
    await Moralis.start({
      apiKey: MORALIS_API_KEY
    });
    console.log('Moralis initialized successfully');
  } catch (error) {
    showError('Failed to initialize Moralis: ' + error.message);
    console.error('Moralis initialization error:', error);
  }
}

// Fetch token transactions
async function fetchTokenTransactions(tokenAddress, chain) {
  showLoading(true);
  hideError();
  hideTokenInfo();
  
  try {
    // Validate address
    if (!Web3.utils.isAddress(tokenAddress)) {
      throw new Error('Invalid token address format');
    }
    
    // Store current token and chain for refresh
    currentTokenAddress = tokenAddress;
    currentChain = chain;
    
    const chainInfo = chainMapping[chain];
    console.log(`Fetching transactions for chain: ${chainInfo.apiChain}`);
    
    // Fetch token info first
    await fetchTokenInfo(tokenAddress, chain, chainInfo);
    
    let transactions;
    
    if (chain === 'bsc') {
      // Use BSCScan API for BSC chain
      transactions = await fetchBscScanTransactions(tokenAddress);
    } else {
      // Use Moralis API for other chains
      const response = await Moralis.EvmApi.token.getTokenTransfers({
        address: tokenAddress,
        chain: chainInfo.apiChain,
        limit: TRANSACTION_LIMIT
      });
      
      transactions = response.result;
    }
    
    if (!transactions || transactions.length === 0) {
      showError('No transactions found for this token address');
      return;
    }
    
    displayTransactions(transactions, chainInfo, chain);
    showResults();
  } catch (error) {
    showError('Error fetching transactions: ' + error.message);
    console.error('Transaction fetch error:', error);
  } finally {
    showLoading(false);
  }
}

// Fetch token information
async function fetchTokenInfo(tokenAddress, chain, chainInfo) {
  try {
    // Set contract link
    contractLinkEl.href = `${chainInfo.explorer}/token/${tokenAddress}`;
    contractAddressEl.textContent = truncateMiddle(tokenAddress);
    
    // Try CoinGecko first for the most complete data
    const coinGeckoData = await fetchCoinGeckoTokenData(tokenAddress, chainInfo.coingeckoId);
    
    if (coinGeckoData) {
      // We have CoinGecko data, use it
      displayCoinGeckoTokenInfo(coinGeckoData);
    } else {
      // Fallback to blockchain scanner API
      const tokenData = await fetchTokenMetadataFromScan(tokenAddress, chain, chainInfo);
      
      if (tokenData && tokenData.status === '1' && tokenData.result && tokenData.result.length > 0) {
        // Use data from blockchain scanner
        const token = tokenData.result[0];
        
        tokenNameEl.textContent = token.tokenName || 'Unknown Token';
        tokenSymbolEl.textContent = token.symbol || '';
        
        // Default logo (first letter of token symbol)
        const symbol = token.symbol || '?';
        tokenLogoEl.innerHTML = `<div style="font-size: 20px; font-weight: bold;">${symbol.charAt(0)}</div>`;
        
        // Try to get price data
        if (chain === 'bsc') {
          await fetchPancakeSwapPrice(tokenAddress);
        } else {
          await fetchMoralisPrice(tokenAddress, chainInfo.apiChain);
        }
        
        // Try to get holder count
        await fetchHolderCount(tokenAddress, chain, chainInfo);
      } else {
        // Final fallback to Moralis
        await fetchTokenMetadataFromMoralis(tokenAddress, chainInfo);
        
        // Try to get price data
        if (chain === 'bsc') {
          await fetchPancakeSwapPrice(tokenAddress);
        } else {
          await fetchMoralisPrice(tokenAddress, chainInfo.apiChain);
        }
        
        // Try to get holder count
        await fetchHolderCount(tokenAddress, chain, chainInfo);
      }
    }
    
    // Show token info section
    showTokenInfo();
    
  } catch (error) {
    console.error('Error fetching token info:', error);
    // Still show the token info section with partial data
    showTokenInfo();
  }
}

// Fetch token data from CoinGecko
async function fetchCoinGeckoTokenData(tokenAddress, platformId) {
  try {
    // Normalize address to lowercase for comparison
    const normalizedAddress = tokenAddress.toLowerCase();
    
    // First, try to get token info by contract address
    const contractUrl = `https://api.coingecko.com/api/v3/coins/${platformId}/contract/${normalizedAddress}`;
    const contractResponse = await fetch(contractUrl);
    
    if (contractResponse.ok) {
      return await contractResponse.json();
    }
    
    // If that fails, try to search for the token
    const searchUrl = `https://api.coingecko.com/api/v3/coins/list?include_platform=true`;
    const searchResponse = await fetch(searchUrl);
    
    if (searchResponse.ok) {
      const allCoins = await searchResponse.json();
      
      // Find the coin with matching contract address on the specified platform
      const matchingCoin = allCoins.find(coin => {
        if (coin.platforms && coin.platforms[platformId]) {
          return coin.platforms[platformId].toLowerCase() === normalizedAddress;
        }
        return false;
      });
      
      if (matchingCoin) {
        // Get detailed info for the matching coin
        const detailUrl = `https://api.coingecko.com/api/v3/coins/${matchingCoin.id}?localization=false&tickers=false&market_data=true&community_data=true&developer_data=false`;
        const detailResponse = await fetch(detailUrl);
        
        if (detailResponse.ok) {
          return await detailResponse.json();
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching data from CoinGecko:', error);
    return null;
  }
}

// Display token info from CoinGecko data
function displayCoinGeckoTokenInfo(data) {
  // Set token name and symbol
  tokenNameEl.textContent = data.name || 'Unknown Token';
  tokenSymbolEl.textContent = data.symbol ? data.symbol.toUpperCase() : '';
  
  // Set token logo
  if (data.image && data.image.small) {
    tokenLogoEl.innerHTML = `<img src="${data.image.small}" alt="${data.symbol}" />`;
  } else {
    // Default logo (first letter of token symbol)
    const symbol = data.symbol || '?';
    tokenLogoEl.innerHTML = `<div style="font-size: 20px; font-weight: bold;">${symbol.charAt(0)}</div>`;
  }
  
  // Set price
  if (data.market_data && data.market_data.current_price && data.market_data.current_price.usd) {
    tokenPriceEl.textContent = `$${formatPrice(data.market_data.current_price.usd)}`;
  } else {
    tokenPriceEl.textContent = 'N/A';
  }
  
  // Set 24h price change
  if (data.market_data && data.market_data.price_change_percentage_24h) {
    displayPriceChange(data.market_data.price_change_percentage_24h);
  } else {
    priceChangeEl.textContent = 'N/A';
  }
  
  // Set holder count if available
  if (data.market_data && data.market_data.total_value_locked && data.market_data.total_value_locked.usd) {
    // Not exactly holder count, but TVL can be a proxy for popularity
    holderCountEl.textContent = `TVL: $${formatNumber(data.market_data.total_value_locked.usd)}`;
  } else if (data.community_data && data.community_data.twitter_followers) {
    // Twitter followers as a proxy for community size
    holderCountEl.textContent = `${formatNumber(data.community_data.twitter_followers)} followers`;
  } else if (data.market_cap_rank) {
    holderCountEl.textContent = `Rank #${data.market_cap_rank}`;
  } else {
    holderCountEl.textContent = 'N/A';
  }
}

// Fetch token metadata from blockchain scanner API
async function fetchTokenMetadataFromScan(tokenAddress, chain, chainInfo) {
  try {
    const apiKey = chain === 'bsc' ? BSC_API_KEY : '';
    const apiUrl = `${chainInfo.scanApiUrl}?module=token&action=tokeninfo&contractaddress=${tokenAddress}&apikey=${apiKey}`;
    
    const response = await fetch(apiUrl);
    return await response.json();
  } catch (error) {
    console.error('Error fetching token metadata from blockchain scanner:', error);
    return null;
  }
}

// Fetch token metadata from Moralis
async function fetchTokenMetadataFromMoralis(tokenAddress, chainInfo) {
  try {
    const tokenData = await Moralis.EvmApi.token.getTokenMetadata({
      addresses: [tokenAddress],
      chain: chainInfo.apiChain
    });
    
    if (tokenData && tokenData.result && tokenData.result.length > 0) {
      const token = tokenData.result[0];
      
      // Set token name and symbol
      tokenNameEl.textContent = token.name || 'Unknown Token';
      tokenSymbolEl.textContent = token.symbol || '';
      
      // Try to set token logo
      if (token.logo) {
        tokenLogoEl.innerHTML = `<img src="${token.logo}" alt="${token.symbol}" />`;
      } else {
        // Default logo (first letter of token symbol)
        const symbol = token.symbol || '?';
        tokenLogoEl.innerHTML = `<div style="font-size: 20px; font-weight: bold;">${symbol.charAt(0)}</div>`;
      }
    } else {
      tokenNameEl.textContent = 'Unknown Token';
      tokenSymbolEl.textContent = '';
      tokenLogoEl.innerHTML = `<div style="font-size: 20px; font-weight: bold;">?</div>`;
    }
  } catch (error) {
    console.error('Error fetching token metadata from Moralis:', error);
    tokenNameEl.textContent = 'Unknown Token';
    tokenSymbolEl.textContent = '';
    tokenLogoEl.innerHTML = `<div style="font-size: 20px; font-weight: bold;">?</div>`;
  }
}

// Fetch token price from Moralis
async function fetchMoralisPrice(tokenAddress, chain) {
  try {
    const priceData = await Moralis.EvmApi.token.getTokenPrice({
      address: tokenAddress,
      chain: chain
    });
    
    if (priceData && priceData.result) {
      const price = priceData.result.usdPrice;
      const priceChange = priceData.result.usd24hChange || 0;
      
      // Format and display price
      tokenPriceEl.textContent = `$${formatPrice(price)}`;
      
      // Format and display price change
      displayPriceChange(priceChange);
    } else {
      tokenPriceEl.textContent = 'N/A';
      priceChangeEl.textContent = 'N/A';
    }
  } catch (error) {
    console.error('Error fetching token price from Moralis:', error);
    tokenPriceEl.textContent = 'N/A';
    priceChangeEl.textContent = 'N/A';
  }
}

// Fetch token price from PancakeSwap V3
async function fetchPancakeSwapPrice(tokenAddress) {
  try {
    // PancakeSwap API endpoint for token info
    const response = await fetch(`https://api.pancakeswap.info/api/v2/tokens/${tokenAddress}`);
    const data = await response.json();
    
    if (data && data.data) {
      const price = parseFloat(data.data.price);
      const priceChange = parseFloat(data.data.price_change_percentage_24h);
      
      // Format and display price
      tokenPriceEl.textContent = `$${formatPrice(price)}`;
      
      // Format and display price change
      displayPriceChange(priceChange);
    } else {
      // Fallback to Moralis price API
      await fetchMoralisPrice(tokenAddress, '0x38');
    }
  } catch (error) {
    console.error('Error fetching token price from PancakeSwap:', error);
    // Fallback to Moralis price API
    await fetchMoralisPrice(tokenAddress, '0x38');
  }
}

// Fetch holder count
async function fetchHolderCount(tokenAddress, chain, chainInfo) {
  try {
    // First try to get holder count from token info
    const apiKey = chain === 'bsc' ? BSC_API_KEY : '';
    const apiUrl = `${chainInfo.scanApiUrl}?module=token&action=tokeninfo&contractaddress=${tokenAddress}&apikey=${apiKey}`;
    
    const response = await fetch(apiUrl);
    const data = await response.json();
    
    if (data.status === '1' && data.result && data.result.length > 0) {
      const tokenInfo = data.result[0];
      if (tokenInfo.holders) {
        holderCountEl.textContent = formatNumber(tokenInfo.holders);
        return;
      }
    }
    
    // If not available in token info, try alternative methods
    if (chain === 'bsc') {
      // For BSC, try to use BSCScan token holder list
      await fetchBscHolderCount(tokenAddress);
    } else {
      // For other chains, we might not have a reliable source
      holderCountEl.textContent = 'N/A';
    }
  } catch (error) {
    console.error('Error fetching holder count:', error);
    holderCountEl.textContent = 'N/A';
  }
}

// Fetch BSC holder count
async function fetchBscHolderCount(tokenAddress) {
  try {
    // Try to get the total supply first
    const supplyUrl = `https://api.bscscan.com/api?module=stats&action=tokensupply&contractaddress=${tokenAddress}&apikey=${BSC_API_KEY}`;
    const supplyResponse = await fetch(supplyUrl);
    const supplyData = await supplyResponse.json();
    
    if (supplyData.status === '1') {
      // Now try to get holder count from BSCScan
      const holderUrl = `https://api.bscscan.com/api?module=token&action=tokenholderlist&contractaddress=${tokenAddress}&page=1&offset=1&apikey=${BSC_API_KEY}`;
      const holderResponse = await fetch(holderUrl);
      const holderData = await holderResponse.json();
      
      if (holderData.status === '1') {
        // Some BSCScan responses include a count in the result
        if (holderData.result && typeof holderData.result === 'object' && holderData.result.count) {
          holderCountEl.textContent = formatNumber(holderData.result.count);
        } else {
          // If we can't get the count directly, we'll use a fallback message
          holderCountEl.textContent = 'Available on BSCScan';
        }
      } else {
        holderCountEl.textContent = 'N/A';
      }
    } else {
      holderCountEl.textContent = 'N/A';
    }
  } catch (error) {
    console.error('Error fetching BSC holder count:', error);
    holderCountEl.textContent = 'N/A';
  }
}

// Display price change with arrow
function displayPriceChange(priceChange) {
  if (priceChange === 'N/A') {
    priceChangeEl.textContent = 'N/A';
    return;
  }
  
  const formattedChange = parseFloat(priceChange).toFixed(2);
  let html = '';
  
  if (priceChange > 0) {
    html = `
      <span class="price-up">
        <svg class="price-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 5L19 12L12 19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" transform="rotate(90 12 12)"/>
        </svg>
        +${formattedChange}%
      </span>
    `;
  } else if (priceChange < 0) {
    html = `
      <span class="price-down">
        <svg class="price-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 5L19 12L12 19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" transform="rotate(-90 12 12)"/>
        </svg>
        ${formattedChange}%
      </span>
    `;
  } else {
    html = `<span>0.00%</span>`;
  }
  
  priceChangeEl.innerHTML = html;
}

// Fetch transactions using BSCScan API
async function fetchBscScanTransactions(tokenAddress) {
  const apiUrl = `https://api.bscscan.com/api?module=account&action=tokentx&contractaddress=${tokenAddress}&page=1&offset=${TRANSACTION_LIMIT}&sort=desc&apikey=${BSC_API_KEY}`;
  
  try {
    const response = await fetch(apiUrl);
    const data = await response.json();
    
    if (data.status === '1') {
      return data.result;
    } else {
      throw new Error(data.message || 'Failed to fetch transactions from BSCScan');
    }
  } catch (error) {
    console.error('BSCScan API error:', error);
    throw error;
  }
}

// Display transactions in the table
function displayTransactions(transactions, chainInfo, chain) {
  transactionsBody.innerHTML = '';
  
  transactions.forEach(tx => {
    const row = document.createElement('tr');
    
    // Format data based on the API source
    let hash, blockNumber, from, to, value, timestamp;
    
    if (chain === 'bsc') {
      // BSCScan API format
      hash = tx.hash;
      blockNumber = tx.blockNumber;
      from = tx.from;
      to = tx.to;
      value = tx.value;
      timestamp = new Date(parseInt(tx.timeStamp) * 1000).toLocaleString();
    } else {
      // Moralis API format
      hash = tx.transactionHash;
      blockNumber = tx.blockNumber;
      from = tx.fromAddress;
      to = tx.toAddress;
      value = tx.value;
      timestamp = new Date(tx.blockTimestamp).toLocaleString();
    }
    
    // Format value with Web3
    const valueInEth = Web3.utils.fromWei(value, 'ether');
    
    row.innerHTML = `
      <td><a href="${chainInfo.explorer}/tx/${hash}" target="_blank">${truncateMiddle(hash)}</a></td>
      <td>${blockNumber}</td>
      <td class="full-address"><a href="${chainInfo.explorer}/address/${from}" target="_blank">${from}</a></td>
      <td><a href="${chainInfo.explorer}/address/${to}" target="_blank">${truncateMiddle(to)}</a></td>
      <td>${valueInEth}</td>
      <td>${timestamp}</td>
    `;
    
    transactionsBody.appendChild(row);
  });
}

// Helper function to truncate long strings (like addresses)
function truncateMiddle(str, startChars = 6, endChars = 4) {
  if (str.length <= startChars + endChars) {
    return str;
  }
  return `${str.substring(0, startChars)}...${str.substring(str.length - endChars)}`;
}

// Format price with appropriate decimal places
function formatPrice(price) {
  if (price === undefined || price === null) return 'N/A';
  
  // For very small prices, show more decimal places
  if (price < 0.0001) {
    return price.toExponential(4);
  } else if (price < 0.01) {
    return price.toFixed(6);
  } else if (price < 1) {
    return price.toFixed(4);
  } else if (price < 1000) {
    return price.toFixed(2);
  } else {
    return price.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
}

// Format number with commas
function formatNumber(num) {
  if (num === undefined || num === null || num === 'N/A') return 'N/A';
  return parseInt(num).toLocaleString();
}

// UI Helper functions
function showLoading(show) {
  loadingEl.classList.toggle('hidden', !show);
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
}

function hideError() {
  errorEl.classList.add('hidden');
}

function showResults() {
  resultsEl.classList.remove('hidden');
}

function hideResults() {
  resultsEl.classList.add('hidden');
}

function showTokenInfo() {
  tokenInfoEl.classList.remove('hidden');
}

function hideTokenInfo() {
  tokenInfoEl.classList.add('hidden');
}

// Event listeners
searchBtn.addEventListener('click', () => {
  const tokenAddress = tokenAddressInput.value.trim();
  const chain = chainSelect.value;
  
  if (!tokenAddress) {
    showError('Please enter a token address');
    return;
  }
  
  fetchTokenTransactions(tokenAddress, chain);
});

refreshBtn.addEventListener('click', () => {
  if (currentTokenAddress && currentChain) {
    fetchTokenTransactions(currentTokenAddress, currentChain);
  } else {
    showError('No token address to refresh. Please search for a token first.');
  }
});

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
  await initMoralis();
});
