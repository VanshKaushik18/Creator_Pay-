const { ethers } = require('ethers');
const logger = require('../utils/logger');

// ─── Ethereum Provider ─────────────────────────────────────
let ethProvider;
let platformWallet;

const getEthProvider = () => {
  if (!ethProvider) {
    const rpcUrl = process.env.NODE_ENV === 'production'
      ? process.env.ETH_RPC_URL
      : process.env.ETH_RPC_URL_TESTNET;

    ethProvider = new ethers.JsonRpcProvider(rpcUrl);
    logger.info('Ethereum provider initialized');
  }
  return ethProvider;
};

const getPlatformWallet = () => {
  if (!platformWallet) {
    const provider = getEthProvider();
    platformWallet = new ethers.Wallet(process.env.PLATFORM_WALLET_PRIVATE_KEY, provider);
  }
  return platformWallet;
};

// ─── Polygon Provider ──────────────────────────────────────
let polygonProvider;

const getPolygonProvider = () => {
  if (!polygonProvider) {
    polygonProvider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL);
  }
  return polygonProvider;
};

// ─── ERC-20 Token ABIs (minimal — just transfer + balanceOf) ──
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

// ─── Supported tokens ──────────────────────────────────────
const TOKENS = {
  mainnet: {
    USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
    USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
    DAI:  { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18 },
  },
  sepolia: {
    USDT: { address: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06', decimals: 6 },
  },
};

const getTokenConfig = (symbol) => {
  const network = process.env.NODE_ENV === 'production' ? 'mainnet' : 'sepolia';
  return TOKENS[network]?.[symbol] || null;
};

// ─── Utility: format units ─────────────────────────────────
const formatEth = (wei) => ethers.formatEther(wei);
const parseEth = (eth) => ethers.parseEther(eth.toString());
const formatToken = (amount, decimals) => ethers.formatUnits(amount, decimals);

// ─── Generate a unique deposit address per payment ─────────
// In production you'd use HD wallet derivation (BIP32) for unique addresses per tx
const generateDepositAddress = (index = 0) => {
  const hdNode = ethers.HDNodeWallet.fromMnemonic(
    ethers.Mnemonic.fromEntropy(
      ethers.keccak256(ethers.toUtf8Bytes(process.env.PLATFORM_WALLET_PRIVATE_KEY))
    )
  );
  const child = hdNode.derivePath(`m/44'/60'/0'/0/${index}`);
  return { address: child.address, privateKey: child.privateKey };
};

module.exports = {
  getEthProvider,
  getPlatformWallet,
  getPolygonProvider,
  ERC20_ABI,
  getTokenConfig,
  formatEth,
  parseEth,
  formatToken,
  generateDepositAddress,
  ethers,
};
