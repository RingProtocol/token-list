const fs = require('fs');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
const { getFewTokenFromOriginalToken } = require('few-v2-sdk-multiple-network-9');
const { Token } = require('few-sdk-core-multiple-network-6');
const { ethers } = require('ethers');
const dotenv = require('dotenv');

dotenv.config();

const ETHEREUM_CHAIN_ID = 1;
const BNB_CHAIN_ID = 56;
const ENSO_API_URL = 'https://api.enso.build/api/v1/tokens?protocolSlug=ondo-gm&includeMetadata=true';
const BINANCE_WEB3_API_URL = process.env.BINANCE_WEB3_API_URL || 'https://web3.binance.com/build';
const BINANCE_RWA_TOKENS_PATH = '/api/v1/dex/market/rwa/tokens';
const TOKENLIST_PATH = path.join(__dirname, 'stock.tokenlist.json');
const STOCK_ASSETS_PATH = path.join(__dirname, 'assets', 'stock');
const STOCK_ASSETS_RAW_URL = 'https://raw.githubusercontent.com/RingProtocol/token-list/master/assets/stock';
const ONDO_FINANCE_LOGO_URI = 'https://icons.llamao.fi/icons/protocols/ondo-finance';
const LOGO_DOWNLOAD_CONCURRENCY = 10;
const ENSO_API_KEY = process.env.ENSO_API_KEY;
const BINANCE_WEB3_API_KEY = process.env.BINANCE_WEB3_API_KEY;
const BINANCE_WEB3_API_SECRET = process.env.BINANCE_WEB3_API_SECRET;

function getEnsoRequestConfig() {
  if (!ENSO_API_KEY) {
    return {};
  }

  return {
    headers: {
      Authorization: `Bearer ${ENSO_API_KEY}`
    }
  };
}

function normalizeAddress(address) {
  return ethers.utils.getAddress(address);
}

function tokenKey(chainId, address) {
  return `${chainId}:${normalizeAddress(address).toLowerCase()}`;
}

function getLogoURI(token) {
  if (Array.isArray(token.logosUri) && token.logosUri.length > 0) {
    return token.logosUri[0] || '';
  }

  return token.metadata?.logoURI || token.logoURI || token.logoUrl || token.tokenLogoUrl || token.logo || '';
}

function getLogoFilename(logoURI) {
  try {
    const pathname = new URL(logoURI).pathname;
    return path.basename(decodeURIComponent(pathname));
  } catch {
    return '';
  }
}

async function downloadLogo(logoURI, destinationPath) {
  const response = await axios.get(logoURI, {
    responseType: 'arraybuffer',
    timeout: 30000
  });
  fs.writeFileSync(destinationPath, response.data);
}

async function localizeBnbStockTokenLogos(tokens) {
  fs.mkdirSync(STOCK_ASSETS_PATH, { recursive: true });

  const bnbTokens = tokens.filter(token => token.chainId === BNB_CHAIN_ID && token.logoURI);
  let nextIndex = 0;
  let localizedCount = 0;
  let downloadedCount = 0;

  async function worker() {
    while (nextIndex < bnbTokens.length) {
      const token = bnbTokens[nextIndex++];
      const filename = getLogoFilename(token.logoURI);

      if (!filename) {
        throw new Error(`Cannot determine logo filename for ${token.symbol}: ${token.logoURI}`);
      }

      const rawLogoURI = `${STOCK_ASSETS_RAW_URL}/${encodeURIComponent(filename)}`;
      const destinationPath = path.join(STOCK_ASSETS_PATH, filename);

      if (!fs.existsSync(destinationPath)) {
        await downloadLogo(token.logoURI, destinationPath);
        downloadedCount += 1;
      }

      if (token.logoURI !== rawLogoURI) {
        token.logoURI = rawLogoURI;
        localizedCount += 1;
      }
    }
  }

  const workerCount = Math.min(LOGO_DOWNLOAD_CONCURRENCY, bnbTokens.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return { downloadedCount, localizedCount };
}

function syncEthereumStockTokenLogos(tokens) {
  const bnbLogoURIByName = new Map(
    tokens
      .filter(token => token.chainId === BNB_CHAIN_ID && token.name && token.logoURI)
      .map(token => [token.name, token.logoURI])
  );
  let syncedCount = 0;

  for (const token of tokens) {
    if (token.chainId !== ETHEREUM_CHAIN_ID || token.logoURI !== ONDO_FINANCE_LOGO_URI) {
      continue;
    }

    const bnbLogoURI = bnbLogoURIByName.get(token.name);
    if (bnbLogoURI) {
      token.logoURI = bnbLogoURI;
      syncedCount += 1;
    }
  }

  return syncedCount;
}

function buildStockToken(token) {
  const checksummedAddress = normalizeAddress(token.address);
  const originalToken = new Token(
    token.chainId,
    checksummedAddress,
    token.decimals,
    token.symbol,
    token.name
  );
  const fewToken = getFewTokenFromOriginalToken(originalToken, token.chainId);

  return {
    chainId: token.chainId,
    address: checksummedAddress,
    name: token.name,
    symbol: token.symbol,
    decimals: token.decimals,
    logoURI: getLogoURI(token),
    extensions: {
      fewWrappedAddress: fewToken.address,
      fewName: `Few Wrapped ${token.name}`,
      fewSymbol: `fw${token.symbol}`
    }
  };
}

function buildQueryString(params) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
}

function signBinanceRequest(method, pathWithQuery, timestamp, body) {
  const requestPath = `/build${pathWithQuery}`;
  const preHash = timestamp + method + requestPath + body;
  return crypto.createHmac('sha256', BINANCE_WEB3_API_SECRET).update(preHash, 'utf8').digest('base64');
}

async function fetchEnsoStockTokens() {
  const response = await axios.get(ENSO_API_URL, getEnsoRequestConfig());
  const ensoTokens = Array.isArray(response.data?.data) ? response.data.data : [];

  return ensoTokens
    .filter(token => token.chainId === ETHEREUM_CHAIN_ID && token.address)
    .map(token => ({ ...token, chainId: ETHEREUM_CHAIN_ID }));
}

function extractBinanceTokens(responseData) {
  const data = responseData?.data ?? responseData;
  if (Array.isArray(data)) {
    return data;
  }
  if (Array.isArray(data?.tokens)) {
    return data.tokens;
  }
  if (Array.isArray(data?.list)) {
    return data.list;
  }
  if (Array.isArray(data?.records)) {
    return data.records;
  }
  return [];
}

function normalizeBinanceToken(token) {
  const address = token.address || token.tokenContractAddress || token.contractAddress || token.tokenAddress;
  const symbol = token.symbol || token.tokenSymbol;
  const name = token.name || token.tokenName || symbol;

  if (!address || !symbol || !name) {
    return null;
  }

  return {
    chainId: Number(token.chainId || token.binanceChainId || BNB_CHAIN_ID),
    address,
    name,
    symbol,
    decimals: Number(token.decimals || 18),
    logoURI: getLogoURI(token)
  };
}

async function fetchBinanceBStockTokens() {
  if (!BINANCE_WEB3_API_KEY || !BINANCE_WEB3_API_SECRET) {
    console.warn('Skipping Binance bStock tokens: BINANCE_WEB3_API_KEY and BINANCE_WEB3_API_SECRET are required.');
    return [];
  }

  const method = 'GET';
  const queryString = buildQueryString({ binanceChainId: BNB_CHAIN_ID });
  const pathWithQuery = `${BINANCE_RWA_TOKENS_PATH}${queryString ? `?${queryString}` : ''}`;
  const timestamp = new Date().toISOString();
  const signature = signBinanceRequest(method, pathWithQuery, timestamp, '');
  const response = await axios.get(`${BINANCE_WEB3_API_URL}${pathWithQuery}`, {
    headers: {
      'X-OC-APIKEY': BINANCE_WEB3_API_KEY,
      'X-OC-TIMESTAMP': timestamp,
      'X-OC-SIGN': signature
    }
  });

  return extractBinanceTokens(response.data)
    .map(normalizeBinanceToken)
    .filter(Boolean)
    .filter(token => token.chainId === BNB_CHAIN_ID && token.address);
}

async function fetchSourceTokens() {
  const results = await Promise.allSettled([
    fetchEnsoStockTokens(),
    fetchBinanceBStockTokens()
  ]);
  const [ensoResult, binanceResult] = results;
  const ensoTokens = ensoResult.status === 'fulfilled' ? ensoResult.value : [];
  const binanceTokens = binanceResult.status === 'fulfilled' ? binanceResult.value : [];

  if (ensoResult.status === 'rejected') {
    console.error(`Failed to fetch Enso stock tokens: ${ensoResult.reason.message}`);
  }
  if (binanceResult.status === 'rejected') {
    console.error(`Failed to fetch Binance bStock tokens: ${binanceResult.reason.message}`);
  }

  if (ensoResult.status === 'rejected') {
    throw ensoResult.reason;
  }

  return { ensoTokens, binanceTokens };
}

async function main() {
  try {
    const fileContent = fs.readFileSync(TOKENLIST_PATH, 'utf-8');
    const stockJson = JSON.parse(fileContent);
    const existingTokens = Array.isArray(stockJson.tokens) ? stockJson.tokens : [];
    const existingTokenKeys = new Set(existingTokens.filter(token => token.address).map(token => tokenKey(token.chainId, token.address)));

    const { ensoTokens, binanceTokens } = await fetchSourceTokens();
    const sourceTokens = [...ensoTokens, ...binanceTokens];
    const newTokens = sourceTokens
      .filter(token => !existingTokenKeys.has(tokenKey(token.chainId, token.address)))
      .map(buildStockToken);
    const tokens = [...existingTokens, ...newTokens].map(token => ({ ...token }));
    const { downloadedCount, localizedCount } = await localizeBnbStockTokenLogos(tokens);
    const syncedEthereumLogoCount = syncEthereumStockTokenLogos(tokens);

    const nextVersion = {
      ...(stockJson.version || {}),
      patch: Number(stockJson.version?.patch || 0) + 1
    };

    if (newTokens.length === 0 && localizedCount === 0 && syncedEthereumLogoCount === 0) {
      console.log('No new stock tokens or stock logo changes found. stock.tokenlist.json was not changed.');
      return;
    }

    const result = {
      ...stockJson,
      timestamp: new Date().toISOString(),
      tokens,
      version: nextVersion
    };

    fs.writeFileSync(TOKENLIST_PATH, JSON.stringify(result, null, 2));
    console.log(`Wrote ${newTokens.length} new stock tokens to stock.tokenlist.json`);
    console.log(`Downloaded ${downloadedCount} BNB stock token logos and localized ${localizedCount} logo URIs.`);
    console.log(`Synced ${syncedEthereumLogoCount} Ethereum stock token logo URIs from same-name BNB tokens.`);
    console.log(`Fetched ${ensoTokens.length} Ethereum stock tokens and ${binanceTokens.length} Binance bStock tokens.`);
  } catch (error) {
    if (error.response?.status === 401 || error.response?.status === 403) {
      const responseMessage = error.response?.data?.message;
      const responseError = error.response?.data?.error;
      const details = [responseError, responseMessage].filter(Boolean).join(': ');
      console.error(`Error: Enso API returned ${error.response.status}${details ? ` (${details})` : ''}.`);
      console.error('Set a valid ENSO_API_KEY in .env or GitHub Actions secrets. You can create one at https://developers.enso.build.');
      process.exitCode = 1;
      return;
    }

    console.error('Error:', error.message);
    process.exitCode = 1;
  }
}

main();
