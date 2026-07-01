const fs = require('fs');
const axios = require('axios');
const path = require('path');
const { getFewTokenFromOriginalToken } = require('few-v2-sdk-multiple-network-9');
const { Token } = require('few-sdk-core-multiple-network-6');
const { ethers } = require('ethers');
const dotenv = require('dotenv');

dotenv.config();

const CHAIN_ID = 1;
const API_URL = 'https://api.enso.build/api/v1/tokens?protocolSlug=ondo-gm&includeMetadata=true';
const TOKENLIST_PATH = path.join(__dirname, 'stock.tokenlist.json');
const ENSO_API_KEY = process.env.ENSO_API_KEY;

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

  return token.metadata?.logoURI || token.logoURI || '';
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

async function main() {
  try {
    const fileContent = fs.readFileSync(TOKENLIST_PATH, 'utf-8');
    const stockJson = JSON.parse(fileContent);
    const existingTokens = Array.isArray(stockJson.tokens) ? stockJson.tokens : [];
    const existingTokenKeys = new Set(
      existingTokens
        .filter(token => token.chainId === CHAIN_ID && token.address)
        .map(token => tokenKey(token.chainId, token.address))
    );

    const response = await axios.get(API_URL, getEnsoRequestConfig());
    const ensoTokens = Array.isArray(response.data?.data) ? response.data.data : [];
    const newTokens = ensoTokens
      .filter(token => token.chainId === CHAIN_ID && token.address)
      .filter(token => !existingTokenKeys.has(tokenKey(token.chainId, token.address)))
      .map(buildStockToken);

    if (newTokens.length === 0) {
      console.log('No new stock tokens found. stock.tokenlist.json was not changed.');
      return;
    }

    const nextVersion = {
      ...(stockJson.version || {}),
      patch: Number(stockJson.version?.patch || 0) + 1
    };

    const result = {
      ...stockJson,
      timestamp: new Date().toISOString(),
      tokens: [...existingTokens, ...newTokens],
      version: nextVersion
    };

    fs.writeFileSync(TOKENLIST_PATH, JSON.stringify(result, null, 2));
    console.log(`Wrote ${newTokens.length} new stock tokens to stock.tokenlist.json`);
  } catch (error) {
    if (error.response?.status === 403) {
      console.error('Error: Enso API returned 403. Set ENSO_API_KEY in .env or GitHub Actions secrets.');
      process.exitCode = 1;
      return;
    }

    console.error('Error:', error.message);
    process.exitCode = 1;
  }
}

main();
