const ALLOWED_NETWORKS = ["TRC20", "BSCCHAIN", "BTC"];
const ALLOWED_CURRENCIES = ["USDT", "BTC"];
const DEFAULT_NETWORKS = ALLOWED_NETWORKS;
const DEFAULT_CURRENCIES = ALLOWED_CURRENCIES;

function parseList(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .map((item) => item.toUpperCase())
    .filter(Boolean);
}

export function getCryptoNetworks() {
  const networks = parseList(process.env.CRYPTO_NETWORKS);
  const filtered = (networks.length ? networks : DEFAULT_NETWORKS).filter((item) =>
    ALLOWED_NETWORKS.includes(item)
  );
  return filtered.length ? filtered : DEFAULT_NETWORKS;
}

export function getCryptoCurrencies() {
  const currencies = parseList(process.env.CRYPTO_CURRENCIES);
  const filtered = (currencies.length ? currencies : DEFAULT_CURRENCIES).filter((item) =>
    ALLOWED_CURRENCIES.includes(item)
  );
  return filtered.length ? filtered : DEFAULT_CURRENCIES;
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
    wallets[network.toUpperCase()] = address;
  }
  if (!Object.keys(wallets).length) {
    const fallback = process.env.CRYPTO_WALLET_ADDRESS;
    const network = process.env.CRYPTO_NETWORK;
    if (fallback && network) {
      wallets[network.toUpperCase()] = fallback;
    }
  }
  if (!wallets.BSCCHAIN) {
    if (wallets.BEP20) {
      wallets.BSCCHAIN = wallets.BEP20;
    } else if (wallets.BSC) {
      wallets.BSCCHAIN = wallets.BSC;
    }
  }
  return wallets;
}
