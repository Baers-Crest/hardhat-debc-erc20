import { HardhatUserConfig } from "hardhat/config";

import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: "0.8.0",
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    sepolia: {
      url: `https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    hardhat: {
      forking: {
        url: `https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`,
        enabled: true,
      },
    },
  },
  mocha: {
    timeout: 60000,
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
    enabled: true,
  },
  sourcify: {
    enabled: true,
  },
};

export default config;
