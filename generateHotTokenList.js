const fs = require('fs');
const axios = require('axios');
const path = require('path');
const { getFewTokenFromOriginalToken } = require('few-v2-sdk-multiple-network-9');
const { Token, ChainId } = require('few-sdk-core-multiple-network-6');
const { ethers } = require('ethers');

const TOKENLIST_PATH = path.join(__dirname, 'hot.tokenlist.json');
const PAGE_SIZE = 20;

// KyberSwap KyberScore API — chainId mapping
const KYBER_CHAINS = [
  { chainId: 1,      fewChainId: ChainId.MAINNET      },
  { chainId: 8453,   fewChainId: ChainId.BASE          },
  { chainId: 56,     fewChainId: ChainId.BNB           },
  { chainId: 42161,  fewChainId: ChainId.ARBITRUM_ONE  },
  { chainId: 130,    fewChainId: ChainId.UNICHAIN       },
  { chainId: 999,    fewChainId: null }, // Hyper — few-sdk not supported
  { chainId: 4326,   fewChainId: null }, // MegaETH — few-sdk not supported
  { chainId: 4663,   fewChainId: null }, // Robinhood — few-sdk not supported
];

function buildKyberUrl(chainId) {
  return `https://token-api.kyberswap.com/api/v1/public/tokens?chainIds=${chainId}&tag=kyberscore&sort=kyberScore%3Adesc&page=1&pageSize=${PAGE_SIZE}`;
}

function tryGetFewToken(token, fewChainId) {
  if (!fewChainId) return null;
  try {
    const checksummed = ethers.utils.getAddress(token.address);
    const original = new Token(fewChainId, checksummed, token.decimals, token.symbol, token.name);
    return getFewTokenFromOriginalToken(original, fewChainId);
  } catch {
    return null;
  }
}

async function fetchKyberScoreTokens(chainId) {
  const url = buildKyberUrl(chainId);
  try {
    const response = await axios.get(url, { timeout: 10000 });
    return response.data?.data?.tokens ?? [];
  } catch (err) {
    console.warn(`⚠️  Failed to fetch KyberScore tokens for chainId ${chainId}: ${err.message}`);
    return [];
  }
}

function buildToken(raw, chainId, fewChainId) {
  let address;
  try {
    address = ethers.utils.getAddress(raw.address);
  } catch {
    address = raw.address;
  }

  const token = {
    chainId,
    address,
    name: raw.name,
    symbol: raw.symbol,
    decimals: raw.decimals ?? 18,
    logoURI: raw.logoURL ?? raw.logoURI ?? raw.logo ?? '',
  };

  const fewToken = tryGetFewToken(token, fewChainId);
  if (fewToken) {
    const fewName = `Few Wrapped ${token.name}`;
    token.extensions = {
      fewWrappedAddress: fewToken.address,
      fewName: fewName.length > 42 ? fewName.substring(0, 42) : fewName,
      fewSymbol: `fw${token.symbol}`,
    };
  }

  return token;
}

function nextVersion(current) {
  return { ...current, patch: current.patch + 1 };
}

async function main() {
  try {
    const fileContent = fs.readFileSync(TOKENLIST_PATH, 'utf-8');
    const existing = JSON.parse(fileContent);

    // WETH tokens are pinned — always kept as-is, logoURI never overwritten
    const pinnedTokens = (existing.tokens ?? []).filter(t => t.symbol === 'WETH');
    const pinnedKeys = new Set(
      pinnedTokens.map(t => {
        let addr;
        try { addr = ethers.utils.getAddress(t.address); } catch { addr = t.address; }
        return `${t.chainId}:${addr.toLowerCase()}`;
      })
    );

    const allTokens = [...pinnedTokens];
    const seen = new Set(pinnedKeys);

    for (const { chainId, fewChainId } of KYBER_CHAINS) {
      const rawTokens = await fetchKyberScoreTokens(chainId);
      console.log(`  chainId ${chainId}: ${rawTokens.length} tokens from KyberScore`);

      for (const raw of rawTokens) {
        if (!raw.address) continue;
        let addr;
        try { addr = ethers.utils.getAddress(raw.address); } catch { addr = raw.address; }
        const key = `${chainId}:${addr.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        allTokens.push(buildToken(raw, chainId, fewChainId));
      }
    }

    const result = {
      name: existing.name,
      logoURI: existing.logoURI,
      keywords: existing.keywords,
      timestamp: new Date().toISOString(),
      version: nextVersion(existing.version),
      tokens: allTokens,
    };

    fs.writeFileSync(TOKENLIST_PATH, JSON.stringify(result, null, 2));
    console.log(`✅ Wrote ${allTokens.length} hot tokens to hot.tokenlist.json`);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
