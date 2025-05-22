# Ring Token List

See https://github.com/Uniswap/token-lists or https://tokenlists.org/.

## 配置

### 配置 SWAPNET_KEY（必需）
在项目根目录下创建 `.env` 文件，内容如下：
```
SWAPNET_KEY=your_swapnet_api_key
```
将 `your_swapnet_api_key` 替换为您的实际 SwapNet API 密钥。此密钥为访问 SwapNet API 所必需，否则脚本将无法运行。

## 使用

### 运行脚本
使用以下命令运行脚本以生成 `newTokens.json`：
```bash
node generateRingXTokenList.js
```

### 手动更新 ringx.tokenlist.json（必需）
脚本生成的 `newTokens.json` 文件包含新代币，格式如下：
```json
{
  "tokens": [
    {
      "chainId": 1,
      "address": "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      "name": "Wrapped BTC",
      "symbol": "WBTC",
      "decimals": 8,
      "logoURI": "https://raw.githubusercontent.com/RingProtocol/token-list/master/assets/asset_WBTC.png",
      "extensions": {
        "fewWrappedAddress": "0x2078f336Fdd260f708BEc4a20c82b063274E1b23",
        "fewName": "Few Wrapped Wrapped BTC",
        "fewSymbol": "fwWBTC"
      }
    }
  ]
}
```
请手动将 `newTokens.json` 中的 `tokens` 数组复制并添加到 `ringx.tokenlist.json` 的 `tokens` 数组中，确保 JSON 结构保持有效。

## 错误处理
如果 `SWAPNET_KEY` 缺失或无效，或者无法读取 `ringx.tokenlist.json` 文件，脚本将在控制台输出错误信息。

