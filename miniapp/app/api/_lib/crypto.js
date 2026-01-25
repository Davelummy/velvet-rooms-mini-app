const DEFAULT_NETWORKS = ["TRC20", "ERC20", "BEP20", "BTC"];
const DEFAULT_CURRENCIES = ["USDT", "BTC", "ETH", "BNB"];

function parseList(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getCryptoNetworks() {
  const networks = parseList(process.env.CRYPTO_NETWORKS);
  return networks.length ? networks : DEFAULT_NETWORKS;
}

export function getCryptoCurrencies() {
  const currencies = parseList(process.env.CRYPTO_CURRENCIES);
  return currencies.length ? currencies : DEFAULT_CURRENCIES;
}

export function getCryptoWallets() {
  const raw = process.env.CRYPTO_WALLET_ADDRESSES || "";
  const entries = raw
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const wallets = {};
  for (const entry of entries) {
    const [network, address] = entry.split("=").map((value) => value.trim());
    if (!network || !address) continue;
    wallets[network] = address;
  }
  if (!Object.keys(wallets).length) {
    const fallback = process.env.CRYPTO_WALLET_ADDRESS;
    const network = process.env.CRYPTO_NETWORK;
    if (fallback && network) {
      wallets[network] = fallback;
    }
  }
  return wallets;
}
