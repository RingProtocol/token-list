const fs = require('fs');
const axios = require('axios');
const path = require('path');
const { getFewTokenFromOriginalToken } = require("few-v2-sdk-multiple-network-9");
const { Token } = require("few-sdk-core-multiple-network-6");
const { ethers } = require('ethers');
const dotenv = require("dotenv");
dotenv.config();

// set API URL and local path
const CHAIN_ID = 1;
const SWAPNET_KEY = process.env.SWAPNET_KEY;
const API_URL = `https://app.swap-net.xyz/api/v1.0/tokens?apiKey=${SWAPNET_KEY}&chainId=${CHAIN_ID}`;
const TOKENLIST_PATH = path.join(__dirname, 'ringx.tokenlist.json');

async function main() {
  try {
    // 1. get API data swapnetTokens
    const response = await axios.get(API_URL);
    const allSwapnetTokens = response.data || [];

    // filter chainId
    const swapnetTokens = allSwapnetTokens.filter(token => token.chainId === CHAIN_ID);

    // 2. read file ringx.tokenlist.json
    const fileContent = fs.readFileSync(TOKENLIST_PATH, 'utf-8');
    const ringxJson = JSON.parse(fileContent);
    const ringxTokens = ringxJson.tokens.filter(token => token.chainId === CHAIN_ID);

    // 3. create address set (with checksum format)
    const ringxAddresses = new Set(ringxTokens.map(t => ethers.utils.getAddress(t.address)));

    // 4. generate newTokens：in swapnetTokens but not in ringxTokens
    const newTokens = swapnetTokens
      .filter(t => !ringxAddresses.has(ethers.utils.getAddress(t.address)))
      .map(t => {
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
      tokens: newTokens,
    };

    console.log(JSON.stringify(result, null, 2));

    // write file
    fs.writeFileSync(path.join(__dirname, 'newTokens.json'), JSON.stringify(result, null, 2));
    console.log(`✅ Wrote ${result.tokens.length} new tokens to newTokens.json`);
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

main();