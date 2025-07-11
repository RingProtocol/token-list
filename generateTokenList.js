const fs = require('fs');
const axios = require('axios');
const path = require('path');
const { getFewTokenFromOriginalToken } = require("few-v2-sdk-multiple-network-9");
const { Token, ChainId } = require("few-sdk-core-multiple-network-6");
const { ethers } = require('ethers');
const dotenv = require("dotenv");
dotenv.config();

const SUPPORTED_CHAINS = [ChainId.MAINNET, ChainId.BASE, ChainId.BLAST];

const SUPPORTED_CHAINS_TOKENLIST_NAME = {
  [ChainId.MAINNET]: 'uniswap',
  // [ChainId.MAINNET]: 'ethereum',
  [ChainId.BASE]: 'base',
  [ChainId.BLAST]: 'blast',
}

const TOKENLIST_API_BASE = "https://tokens.coingecko.com";

function getTokenListUrl(tokenlistName) {
  return `${TOKENLIST_API_BASE}/${tokenlistName}/all.json`;
}

// set API URL and local path
function getTokenListPath(tokenlistName) {
  return path.join(__dirname, 'all', `${tokenlistName}.tokenlist.json`);
}

async function main() {
  try {
    // 1. get API data
    for (const CHAIN_ID of SUPPORTED_CHAINS) {
      const tokenlistName = SUPPORTED_CHAINS_TOKENLIST_NAME[CHAIN_ID];
      const API_URL = getTokenListUrl(tokenlistName);
      const TOKENLIST_PATH = getTokenListPath(tokenlistName);

      const response = await axios.get(API_URL);
      const allTokens = response.data || [];

      // 2.filter chainId
      const tokens = allTokens.tokens.filter(token => token.chainId === CHAIN_ID);

      // 3. generate newTokens：in swapnetTokens but not in ringxTokens
      const newTokens = tokens.map(t => {
        const checksummedAddress = ethers.utils.getAddress(t.address);
        const originalToken = new Token(
          t.chainId,
          checksummedAddress,
          t.decimals,
          t.symbol,
          t.name
        );
        const fewToken = getFewTokenFromOriginalToken(originalToken, t.chainId);

        return {
          chainId: t.chainId,
          address: checksummedAddress,
          name: t.name,
          symbol: t.symbol,
          decimals: t.decimals,
          logoURI: t.metadata?.logoURI || '',
          extensions: {
            fewWrappedAddress: fewToken.address,
            fewName: `Few Wrapped ${t.name}`,
            fewSymbol: `fw${t.symbol}`
          }
        };
      });

      // print result
      const result = {
        ...allTokens,
        tokens: newTokens,
      };

      console.log(`ChainId: ${CHAIN_ID}`);
      console.log(JSON.stringify(result, null, 2));

      // write file
      fs.writeFileSync(TOKENLIST_PATH, JSON.stringify(result, null, 2));
      console.log(`✅ Wrote ${result.tokens.length} new tokens to newTokens.${tokenlistName}.json`);
    }
    console.log('✅ All token lists processed successfully.');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

main();