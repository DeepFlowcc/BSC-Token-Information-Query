// BSC Scan API integration (optional, can be used as a fallback)
export async function fetchBscTransactions(tokenAddress) {
  const BSC_API_KEY = '7UZAGYM3NQUPTYAAFI49IPDTKCJRR9PCYR';
  const apiUrl = `https://api.bscscan.com/api?module=account&action=tokentx&contractaddress=${tokenAddress}&page=1&offset=10&sort=desc&apikey=${BSC_API_KEY}`;
  
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
