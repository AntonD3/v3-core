import 'hardhat-typechain'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'
import '@nomiclabs/hardhat-etherscan'
import '@matterlabs/hardhat-zksync-deploy'
import '@matterlabs/hardhat-zksync-solc'
import '@matterlabs/hardhat-zksync-verify'

export default {
  networks: {
    zkSyncLocalhost: {
      url: 'http://localhost:3050',
      ethNetwork: 'http://localhost:8545',
      zksync: true,
    },
    zkSyncTestnet: {
      url: 'https://testnet.era.zksync.dev',
      ethNetwork: `https://goerli.infura.io/v3/${process.env.INFURA_API_KEY}`,
      zksync: true,
      verifyURL: 'https://zksync2-testnet-explorer.zksync.dev/contract_verification'
    },
    zkSyncMainnet: {
      url: 'https://mainnet.era.zksync.io',
      ethNetwork: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      zksync: true,
      verifyURL: 'https://zksync2-mainnet-explorer.zksync.io/contract_verification'
    },
  },
  defaultNetwork: 'zkSyncLocalhost',
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  solidity: {
    version: '0.7.6',
    settings: {
      optimizer: {
        enabled: true,
        runs: 800,
      },
      metadata: {
        // do not include the metadata hash, since this is machine dependent
        // and we want all generated code to be deterministic
        // https://docs.soliditylang.org/en/v0.7.6/metadata.html
        bytecodeHash: 'none',
      },
    },
  },
  zksolc: {
    version: '1.3.13',
    compilerSource: 'binary',
    settings: {
      metadata: {
        // do not include the metadata hash, since this is machine dependent
        // and we want all generated code to be deterministic
        // https://docs.soliditylang.org/en/v0.7.6/metadata.html
        bytecodeHash: 'none',
      },
    },
  },
  mocha: {
    timeout: 100000000
  },
}
