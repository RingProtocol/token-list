# Ring Token List

See https://github.com/Uniswap/token-lists or https://tokenlists.org/.

## 基础使用

### 运行脚本
使用以下命令运行脚本以生成 `[chainName].tokenlist.json`：
```bash
yarn generate:tokenlist
```
运行命令后会在 `all` 目录下生成对应的 `tokenlist` 文件，如果需要特殊配置的话直接修改 `generateTokenList.js` 这个文件

## RingX 使用

### 配置 SWAPNET_KEY（必需）
在项目根目录下创建 `.env` 文件，内容如下：
```
SWAPNET_KEY=your_swapnet_api_key
```
将 `your_swapnet_api_key` 替换为您的实际 SwapNet API 密钥。此密钥为访问 SwapNet API 所必需，否则脚本将无法运行。


### 运行脚本
使用以下命令运行脚本以生成 `[chainName].tokenlist.json`：
```bash
yarn generate:tokenlist
```

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

## Stock token list 自动更新

`generateStockTokenList.js` 使用 Enso API 获取 Ethereum Ondo GM token 数据，并使用 Binance Web3 API 获取 BNB Chain bStock token 数据。运行一次 `yarn generate:stock-tokenlist` 会将两个来源的新 token 合并写入 `stock.tokenlist.json`。

GitHub Actions 的 runner 可能会被 Enso API 拒绝裸请求，因此自动更新需要配置 API key，否则会在 `Generate stock token list` 步骤返回 403。若 Enso 返回 401 且错误为 `legacy_key_retired`，需要在 https://developers.enso.build 重新生成 key。

### 本地运行

本地可以直接运行。如果本地也遇到 403，在项目根目录的 `.env` 中配置：

```
ENSO_API_KEY=your_enso_api_key
BINANCE_WEB3_API_KEY=your_binance_web3_api_key
BINANCE_WEB3_API_SECRET=your_binance_web3_api_secret
```

`BINANCE_WEB3_API_URL` 可选，默认是 `https://web3.binance.com/build`。

然后运行：

```bash
yarn generate:stock-tokenlist
```

### GitHub Actions

在仓库 `Settings -> Secrets and variables -> Actions -> New repository secret` 中添加：

```
ENSO_API_KEY=your_enso_api_key
```
