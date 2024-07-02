import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { DigitalEraBank, USDC, USDT } from "../typechain-types";

describe("DEBC", function () {
  let owner: HardhatEthersSigner, otherAccount: HardhatEthersSigner;

  let debc: DigitalEraBank;
  let usdt: USDT;
  let usdc: USDC;

  const priceFeedABI = [
    {
      inputs: [],
      name: "latestRoundData",
      outputs: [
        { internalType: "uint80", name: "roundId", type: "uint80" },
        { internalType: "int256", name: "answer", type: "int256" },
        { internalType: "uint256", name: "startedAt", type: "uint256" },
        { internalType: "uint256", name: "updatedAt", type: "uint256" },
        { internalType: "uint80", name: "answeredInRound", type: "uint80" },
      ],
      stateMutability: "view",
      type: "function",
    },
  ];

  async function deploy() {
    [owner, otherAccount] = await ethers.getSigners();

    const DEBC = await ethers.getContractFactory("DigitalEraBank");
    debc = await DEBC.deploy();

    const USDT = await ethers.getContractFactory("USDT");
    usdt = await USDT.deploy(1e15);
    await debc.setUSDTContractAddress(await usdt.getAddress());

    const USDC = await ethers.getContractFactory("USDC");
    usdc = await USDC.deploy(1e15);
    await debc.setUSDCContractAddress(await usdc.getAddress());
  }

  async function getLatestPrice(priceFeedAddress: string) {
    const priceFeed = new ethers.Contract(
      priceFeedAddress,
      priceFeedABI,
      ethers.provider
    );
    const { answer } = await priceFeed.latestRoundData();
    return answer;
  }

  async function buyTokensByETH(amount2Buy: number) {
    const value = await debc.calculateETHPrice(amount2Buy);
    return await debc.buyTokensByETH(amount2Buy, { value });
  }

  async function buyTokensByUSDT(amount2Buy: number) {
    const approvedAmount = await debc.calculateUSDTPrice(amount2Buy);
    await usdt.approve(await debc.getAddress(), approvedAmount);
    const tx = await debc.buyTokensByUSDT(amount2Buy);
    return { tx, approvedAmount };
  }

  async function buyTokensByUSDC(amount2Buy: number) {
    const approvedAmount = await debc.calculateUSDCPrice(amount2Buy);
    await usdc.approve(await debc.getAddress(), approvedAmount);
    const tx = await debc.buyTokensByUSDC(amount2Buy);
    return { tx, approvedAmount };
  }

  this.beforeEach(deploy);

  describe("Deployment", function () {
    it("should set the right token name", async function () {
      expect(await debc.name()).to.equal("Digital Era Bank");
    });

    it("should set the right token symbol", async function () {
      expect(await debc.symbol()).to.equal("DEBC");
    });

    it("should set the right decimals", async function () {
      expect(await debc.decimals()).to.equal(8);
    });

    it("should set the right initial supply", async function () {
      expect(await debc.totalSupply()).to.equal(2e15);
    });
  });

  describe("Token allocation", function () {
    describe("mint()", async function () {
      it("should fail to mint tokens as a non-owner", async function () {
        await expect(
          debc.connect(otherAccount).mint(otherAccount, 1e3)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("shold mint the right amount of tokens to the right account", async function () {
        const amount2Mint = 10n;
        await debc.mint(otherAccount, amount2Mint);
        expect(await debc.balanceOf(otherAccount)).to.equal(amount2Mint);
      });
    });

    describe("bulkMint()", function () {
      it("should fail to mint tokens as a non-owner", async function () {
        await expect(
          debc.connect(otherAccount).bulkMint([owner], [1e3])
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should fail to mint tokens to no accounts", async function () {
        await expect(debc.bulkMint([], [])).to.be.revertedWith(
          "Bulk mint: No recipients"
        );
      });

      it("should fail to mint tokens when the input arrays mismatch", async function () {
        await expect(debc.bulkMint([owner], [1e3, 1e3])).to.be.revertedWith(
          "Bulk mint: Mismatched arrays"
        );
      });

      it("shold mint the right amounts of tokens to the right accounts", async function () {
        const accounts = [owner, otherAccount];
        const amounts = [10n, 20n];
        await debc.bulkMint(accounts, amounts);
        expect(
          await Promise.all(accounts.map((account) => debc.balanceOf(account)))
        ).to.deep.equal(amounts);
      });
    });

    describe("burn()", function () {
      it("should fail to burn tokens as a non-owner", async function () {
        await expect(
          debc.connect(otherAccount).burn(otherAccount, 1e3)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should burn the right amount of tokens from the token contract itself", async function () {
        const thisAddress = await debc.getAddress();
        const prevAmount = await debc.balanceOf(thisAddress);
        const amount2Burn = 10n;
        await debc.burn(thisAddress, amount2Burn);
        expect(await debc.balanceOf(thisAddress)).to.equal(
          prevAmount - amount2Burn
        );
      });

      it("should fail to burn tokens from a non-contract account until the presale starts", async function () {
        await expect(debc.burn(otherAccount, 10)).to.be.revertedWith(
          "Token transfer: Transfers are currently not allowed"
        );
      });

      it("should fail to burn tokens from a non-contract account until the presale ends", async function () {
        await debc.startPresale();
        await expect(debc.burn(otherAccount, 10)).to.be.revertedWith(
          "Token transfer: Transfers are currently not allowed"
        );
      });

      it("should burn the right amount of tokens from the right account after the presale ends", async function () {
        await debc.setPresaleStageCount(1);
        await debc.setPresaleStageDuration(1);
        await debc.mint(otherAccount, 100n);
        await debc.startPresale();
        const prevAmount = await debc.balanceOf(otherAccount);
        const amount2Burn = 10n;
        await debc.burn(otherAccount, amount2Burn);
        expect(await debc.balanceOf(otherAccount)).to.equal(
          prevAmount - amount2Burn
        );
      });
    });
  });

  describe("Presale timestamps", function () {
    describe("startPresale()", function () {
      it("should fail to start presale as a non-owner", async function () {
        await expect(
          debc.connect(otherAccount).startPresale()
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should set the right timestamp when the presale starts", async function () {
        const tx = await debc.startPresale();
        const block = await tx.getBlock();
        expect(await debc.presaleStartTime()).to.equal(block?.timestamp);
      });
    });

    describe("setPresaleStageCount()", function () {
      it("should fail to set the number of stages as a non-owner", async function () {
        await expect(
          debc.connect(otherAccount).setPresaleStageCount(1)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should set the right number of stages", async function () {
        const presaleStageCount = Math.floor(Math.random() * 12) + 1;
        await debc.setPresaleStageCount(presaleStageCount);
        expect(await debc.presaleStageCount()).to.equal(presaleStageCount);
      });
    });

    describe("setPresaleStageDuration()", function () {
      it("should fail to set the duration of a stage as a non-owner", async function () {
        await expect(
          debc.connect(otherAccount).setPresaleStageDuration(3600)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should set the right duration of a stage", async function () {
        const presaleStageDuration = 3600;
        await debc.setPresaleStageDuration(presaleStageDuration);
        expect(await debc.presaleStageDuration()).to.equal(
          presaleStageDuration
        );
      });
    });

    describe("currentPresaleStage()", function () {
      it("should fail to calculate the current presale stage while the presale is not active", async function () {
        const presaleStageDuration = await debc.presaleStageDuration();
        const presaleStageCount = await debc.presaleStageCount();
        await expect(debc.currentPresaleStage()).to.be.revertedWith(
          "Presale timestamp: Presale not started"
        );
        await debc.startPresale();
        await time.increase(presaleStageDuration * presaleStageCount + 1n);
        await expect(debc.currentPresaleStage()).to.be.revertedWith(
          "Presale timestamp: Presale ended"
        );
      });

      it("should return the right presale stage while the presale is active", async function () {
        const presaleStageDuration = await debc.presaleStageDuration();
        const presaleStageCount = await debc.presaleStageCount();
        await debc.startPresale();
        for (let i = 0n; i < presaleStageCount; i++) {
          expect(await debc.currentPresaleStage()).to.equal(i);
          await time.increase(presaleStageDuration);
        }
      });
    });

    describe("presaleEndTime()", function () {
      it("should return 0 when the presale is not started", async function () {
        expect(await debc.presaleEndTime()).to.equal(0);
      });

      it("should return the right presale end time when the presale is started", async function () {
        await debc.startPresale();
        const presaleStartTime = await debc.presaleStartTime();
        const presaleStageCount = await debc.presaleStageCount();
        const presaleStageDuration = await debc.presaleStageDuration();
        expect(await debc.presaleEndTime()).to.equal(
          presaleStartTime + presaleStageDuration * presaleStageCount
        );
      });
    });
  });

  describe("Presale pricing", function () {
    describe("setETHPriceFeedContract()", function () {
      it("should fail to update ethPriceFeedContract as a non-owner", async function () {
        await expect(
          debc
            .connect(otherAccount)
            .setETHPriceFeedContract(
              "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419"
            )
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should set the right contract address to ethPriceFeedContract", async function () {
        const newContract = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
        await debc.setETHPriceFeedContract(newContract);
        expect(await debc.ethPriceFeedContract()).to.equal(newContract);
      });
    });

    describe("setEURPriceFeedContract()", function () {
      it("should fail to update eurPriceFeedContract as a non-owner", async function () {
        await expect(
          debc
            .connect(otherAccount)
            .setEURPriceFeedContract(
              "0xb49f677943BC038e9857d61E7d053CaA2C1734C1"
            )
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should set the right contract address to eurPriceFeedContract", async function () {
        const newContract = "0xb49f677943BC038e9857d61E7d053CaA2C1734C1";
        await debc.setEURPriceFeedContract(newContract);
        expect(await debc.eurPriceFeedContract()).to.equal(newContract);
      });
    });

    describe("setInitialPresalePrice()", function () {
      it("should fail to update initialPresalePrice as a non-owner", async function () {
        const newPrice = 40n;
        await expect(
          debc.connect(otherAccount).setInitialPresalePrice(newPrice)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should set the right price to initialPresalePrice", async function () {
        const newPrice = 40n;
        await debc.setInitialPresalePrice(newPrice);
        expect(await debc.initialPresalePrice()).to.equal(newPrice);
      });
    });

    describe("setPresalePriceIncrementPerStage()", function () {
      it("should fail to update presalePriceIncrementPerStage as a non-owner", async function () {
        const newIncrementPrice = 3n;
        await expect(
          debc
            .connect(otherAccount)
            .setPresalePriceIncrementPerStage(newIncrementPrice)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should set the right price to presalePriceIncrementPerStage", async function () {
        const newIncrementPrice = 3n;
        await debc.setPresalePriceIncrementPerStage(newIncrementPrice);
        expect(await debc.presalePriceIncrementPerStage()).to.equal(
          newIncrementPrice
        );
      });
    });

    describe("setLaunchPrice()", function () {
      it("should fail to update launchPrice as a non-owner", async function () {
        await expect(
          debc.connect(otherAccount).setLaunchPrice(99n)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should set the right price to launchPrice", async function () {
        const newPrice = 99n;
        await debc.setLaunchPrice(newPrice);
        expect(await debc.launchPrice()).to.equal(newPrice);
      });
    });

    describe("setPriceVariationPercentageThreshold()", function () {
      it("should fail to update priceVariationPercentageThreshold as a non-owner", async function () {
        const newPercentage = 3n;
        await expect(
          debc
            .connect(otherAccount)
            .setPriceVariationPercentageThreshold(newPercentage)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should fail to update priceVariationPercentageThreshold greater than 5%", async function () {
        const newPercentage = 6n;
        await expect(
          debc.setPriceVariationPercentageThreshold(newPercentage)
        ).to.be.revertedWith("Price variation control: Too high percentage");
      });

      it("should set the right percentage to priceVariationPercentageThreshold", async function () {
        const newPercentage = 3n;
        await debc.setPriceVariationPercentageThreshold(newPercentage);
        expect(await debc.priceVariationPercentageThreshold()).to.equal(
          newPercentage
        );
      });
    });

    describe("latestETHPrice()", function () {
      it("should return the right latest ETH price", async function () {
        const ethPriceFeed = "0x694AA1769357215DE4FAC081bf1f309aDC325306";
        const latestETHPrice = await getLatestPrice(ethPriceFeed);
        expect(await debc.latestETHPrice()).to.equal(latestETHPrice);
      });
    });

    describe("latestEURPrice()", function () {
      it("should return the right latest EUR price", async function () {
        const eurPriceFeed = "0x1a81afB8146aeFfCFc5E50e8479e826E7D55b910";
        const latestEURPrice = await getLatestPrice(eurPriceFeed);
        expect(await debc.latestEURPrice()).to.equal(latestEURPrice);
      });
    });

    describe("currentPresalePrice()", function () {
      it("should fail to calculate the token price while the presale is not active", async function () {
        const presaleStageDuration = await debc.presaleStageDuration();
        const presaleStageCount = await debc.presaleStageCount();
        await expect(debc.currentPresalePrice()).to.be.revertedWith(
          "Presale timestamp: Presale not started"
        );
        await debc.startPresale();
        await time.increase(presaleStageDuration * presaleStageCount + 1n);
        await expect(debc.currentPresalePrice()).to.be.revertedWith(
          "Presale timestamp: Presale ended"
        );
      });

      it("should return the right token price in EUR while the presale is active", async function () {
        const initialPresalePrice = await debc.initialPresalePrice();
        const priceIncrementPerStage =
          await debc.presalePriceIncrementPerStage();
        const presaleStageDuration = await debc.presaleStageDuration();
        const presaleStageCount = await debc.presaleStageCount();
        await debc.startPresale();
        for (let i = 0n; i < presaleStageCount; i++) {
          const expectedPrice =
            initialPresalePrice + priceIncrementPerStage * i;
          expect(await debc.currentPresalePrice()).to.equal(expectedPrice);
          await time.increase(presaleStageDuration);
        }
      });

      it("should return the launch price in maximum", async function () {
        const launchPrice = await debc.launchPrice();
        const presaleStageDuration = await debc.presaleStageDuration();
        await debc.setPresalePriceIncrementPerStage(launchPrice);
        await debc.startPresale();
        await time.increase(presaleStageDuration);
        expect(await debc.currentPresalePrice()).to.equal(launchPrice);
      });
    });

    describe("calculateETHPrice()", function () {
      it("should fail to calculate the ETH price for the amount of tokens while the presale is not active", async function () {
        const presaleStageDuration = await debc.presaleStageDuration();
        const presaleStageCount = await debc.presaleStageCount();
        await expect(debc.calculateETHPrice(1e3)).to.be.revertedWith(
          "Presale timestamp: Presale not started"
        );
        await debc.startPresale();
        await time.increase(presaleStageDuration * presaleStageCount + 1n);
        await expect(debc.calculateETHPrice(1e3)).to.be.revertedWith(
          "Presale timestamp: Presale ended"
        );
      });

      it("should calculate the right ETH price for the amount of tokens while the presale is active", async function () {
        await debc.startPresale();
        const currentPrice = await debc.currentPresalePrice();
        const latestETHPrice = await debc.latestETHPrice();
        const latestEURPrice = await debc.latestEURPrice();
        const expectedPrice =
          (latestEURPrice * currentPrice * 10000000000n) / latestETHPrice;
        expect(await debc.calculateETHPrice(1e2)).to.equal(expectedPrice);
      });
    });

    describe("calculateUSDTPrice()", function () {
      it("should fail to calculate the USDT price for the amount of tokens while the presale is not active", async function () {
        const presaleStageDuration = await debc.presaleStageDuration();
        const presaleStageCount = await debc.presaleStageCount();
        await expect(debc.calculateUSDTPrice(1e3)).to.be.revertedWith(
          "Presale timestamp: Presale not started"
        );
        await debc.startPresale();
        await time.increase(presaleStageDuration * presaleStageCount + 1n);
        await expect(debc.calculateUSDTPrice(1e3)).to.be.revertedWith(
          "Presale timestamp: Presale ended"
        );
      });

      it("should calculate the right USDT price for the amount of tokens while the presale is active", async function () {
        await debc.startPresale();
        const currentPrice = await debc.currentPresalePrice();
        const latestEURPrice = await debc.latestEURPrice();
        const decimals = await debc.decimals();
        const tokenDecimals = await usdt.decimals();
        const expectedPrice =
          (latestEURPrice * currentPrice) /
          10n ** (decimals - tokenDecimals + 8n);
        expect(await debc.calculateUSDTPrice(1e2)).to.equal(expectedPrice);
      });
    });

    describe("calculateUSDCPrice()", function () {
      it("should fail to calculate the USDT price for the amount of tokens while the presale is not active", async function () {
        const presaleStageDuration = await debc.presaleStageDuration();
        const presaleStageCount = await debc.presaleStageCount();
        await expect(debc.calculateUSDCPrice(1e3)).to.be.revertedWith(
          "Presale timestamp: Presale not started"
        );
        await debc.startPresale();
        await time.increase(presaleStageDuration * presaleStageCount + 1n);
        await expect(debc.calculateUSDCPrice(1e3)).to.be.revertedWith(
          "Presale timestamp: Presale ended"
        );
      });

      it("should calculate the right USDT price for the amount of tokens while the presale is active", async function () {
        await debc.startPresale();
        const currentPrice = await debc.currentPresalePrice();
        const latestEURPrice = await debc.latestEURPrice();
        const decimals = await debc.decimals();
        const tokenDecimals = await usdc.decimals();
        const expectedPrice =
          (latestEURPrice * currentPrice) /
          10n ** (decimals - tokenDecimals + 8n);
        expect(await debc.calculateUSDCPrice(1e2)).to.equal(expectedPrice);
      });
    });
  });

  describe("Token purchase", function () {
    describe("setUSDTContractAddress()", function () {
      it("should fail to update usdtContract as a non-owner", async function () {
        await expect(
          debc
            .connect(otherAccount)
            .setUSDTContractAddress(
              "0xdAC17F958D2ee523a2206206994597C13D831ec7"
            )
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should set the right contract address to usdtContract", async function () {
        const newContract = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
        await debc.setUSDTContractAddress(newContract);
        expect(await debc.usdtContract()).to.equal(newContract);
      });
    });

    describe("setUSDCContractAddress()", function () {
      it("should fail to update usdcContract as a non-owner", async function () {
        await expect(
          debc
            .connect(otherAccount)
            .setUSDCContractAddress(
              "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
            )
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should set the right contract address to usdcContract", async function () {
        const newContract = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
        await debc.setUSDCContractAddress(newContract);
        expect(await debc.usdcContract()).to.equal(newContract);
      });
    });

    describe("buyTokensByETH()", function () {
      it("should fail to buy tokens while presale is not active", async function () {
        await expect(debc.buyTokensByETH(1e2)).to.be.revertedWith(
          "Presale timestamp: Presale not started"
        );
      });

      it("should fail to buy tokens for free", async function () {
        await debc.startPresale();
        await expect(debc.buyTokensByETH(1e2)).to.be.revertedWith(
          "Token purchase: Need to send ETH to buy tokens"
        );
      });

      it("should fail to buy no tokens", async function () {
        await debc.startPresale();
        await expect(debc.buyTokensByETH(0, { value: 1 })).to.be.revertedWith(
          "Token purchase: Need to buy tokens"
        );
      });

      it("should fail to buy tokens out of stock", async function () {
        const thisAddress = await debc.getAddress();
        const stock = await debc.balanceOf(thisAddress);
        await debc.startPresale();
        await expect(
          debc.buyTokensByETH(stock + 1n, { value: 1 })
        ).to.be.revertedWith("Token purchase: Not enough tokens available");
      });

      it("should fail to buy tokens for insufficient ETH", async function () {
        await debc.startPresale();
        await expect(debc.buyTokensByETH(1e9, { value: 1 })).to.be.revertedWith(
          "Token purchase: Need to send enough ETH to buy tokens"
        );
      });

      it("should buy the right amount of tokens for the right amount of ETH", async function () {
        await debc.startPresale();
        const amount = 1e9;
        const tx = await buyTokensByETH(amount);
        expect(await debc.balanceOf(owner)).to.equal(amount);
        expect(
          await ethers.provider.getBalance(await debc.getAddress())
        ).to.equal(tx.value);
        await tx.wait();
        await expect(tx).to.emit(debc, "Sold").withArgs(amount, owner);
      });
    });

    describe("buyTokensByUSDT()", function () {
      it("should fail to buy tokens while presale is not active", async function () {
        await expect(debc.buyTokensByUSDT(1e2)).to.be.revertedWith(
          "Presale timestamp: Presale not started"
        );
      });

      it("should fail to buy no tokens", async function () {
        await debc.startPresale();
        await expect(debc.buyTokensByUSDT(0)).to.be.revertedWith(
          "Token purchase: Need to buy tokens"
        );
      });

      it("should fail to buy tokens out of stock", async function () {
        const thisAddress = await debc.getAddress();
        const stock = await debc.balanceOf(thisAddress);
        await debc.startPresale();
        await expect(debc.buyTokensByUSDT(stock + 1n)).to.be.revertedWith(
          "Token purchase: Not enough tokens available"
        );
      });

      it("should fail to buy tokens for insufficient USDT approved", async function () {
        await usdt.approve(await debc.getAddress(), 1);
        await debc.startPresale();
        await expect(debc.buyTokensByUSDT(1e9)).to.be.revertedWith(
          "Token purchase: Not enough coin balance approved"
        );
      });

      it("should buy the right amount of tokens for the right amount of USDT approved", async function () {
        await debc.startPresale();
        const amount2Buy = 1e9;
        const thisAddr = await debc.getAddress();
        const prevAmount = await usdt.balanceOf(owner);
        const { tx, approvedAmount } = await buyTokensByUSDT(amount2Buy);
        expect(await usdt.balanceOf(thisAddr)).to.equal(approvedAmount);
        expect(await debc.balanceOf(owner)).to.equal(amount2Buy);
        expect(await usdt.balanceOf(owner)).to.equal(
          prevAmount - approvedAmount
        );
        await tx.wait();
        await expect(tx).to.emit(debc, "Sold").withArgs(amount2Buy, owner);
      });
    });

    describe("buyTokensByUSDC()", function () {
      it("should fail to buy tokens while presale is not active", async function () {
        await expect(debc.buyTokensByUSDC(1e2)).to.be.revertedWith(
          "Presale timestamp: Presale not started"
        );
      });

      it("should fail to buy no tokens", async function () {
        await debc.startPresale();
        await expect(debc.buyTokensByUSDC(0)).to.be.revertedWith(
          "Token purchase: Need to buy tokens"
        );
      });

      it("should fail to buy tokens out of stock", async function () {
        const thisAddress = await debc.getAddress();
        const stock = await debc.balanceOf(thisAddress);
        await debc.startPresale();
        await expect(debc.buyTokensByUSDC(stock + 1n)).to.be.revertedWith(
          "Token purchase: Not enough tokens available"
        );
      });

      it("should fail to buy tokens for insufficient USDC approved", async function () {
        await usdc.approve(await debc.getAddress(), 1);
        await debc.startPresale();
        await expect(debc.buyTokensByUSDC(1e9)).to.be.revertedWith(
          "Token purchase: Not enough coin balance approved"
        );
      });

      it("should buy the right amount of tokens for the right amount of USDC approved", async function () {
        await debc.startPresale();
        const amount2Buy = 1e9;
        const thisAddr = await debc.getAddress();
        const prevAmount = await usdc.balanceOf(owner);
        const { tx, approvedAmount } = await buyTokensByUSDC(amount2Buy);
        expect(await usdc.balanceOf(thisAddr)).to.equal(approvedAmount);
        expect(await debc.balanceOf(owner)).to.equal(amount2Buy);
        expect(await usdc.balanceOf(owner)).to.equal(
          prevAmount - approvedAmount
        );
        await tx.wait();
        await expect(tx).to.emit(debc, "Sold").withArgs(amount2Buy, owner);
      });
    });
  });

  describe("Withdrawal", function () {
    describe("withdrawETH()", function () {
      it("should fail to withdraw ETH as a non-owner", async function () {
        await expect(
          debc.connect(otherAccount).withdrawETH(otherAccount, 1)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should fail to withdraw no ETH", async function () {
        await expect(debc.withdrawETH(otherAccount, 0)).to.be.revertedWith(
          "Withdrawal: Withdrawal amount must be greater than zero"
        );
      });

      it("should fail to withdraw more ETH than the contract balance", async function () {
        await expect(debc.withdrawETH(otherAccount, 1)).to.be.revertedWith(
          "Withdrawal: Withdrawal amount exceeds ETH balance"
        );
      });

      it("should withdraw the right amount of ETH to the right account", async function () {
        const thisAddr = await debc.getAddress();
        await debc.startPresale();
        await buyTokensByETH(1e9);
        const ethBalance = await ethers.provider.getBalance(thisAddr);
        const withdrawalBalance = ethBalance / 2n;
        const prevBalance = await ethers.provider.getBalance(otherAccount);
        await debc.withdrawETH(otherAccount, withdrawalBalance);
        expect(await ethers.provider.getBalance(thisAddr)).to.equal(
          ethBalance - withdrawalBalance
        );
        expect(await ethers.provider.getBalance(otherAccount)).to.equal(
          prevBalance + withdrawalBalance
        );
      });
    });

    describe("withdrawAllETH()", function () {
      it("should fail to withdraw all ETH as a non-owner", async function () {
        await expect(
          debc.connect(otherAccount).withdrawAllETH(otherAccount)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should fail to withdraw all ETH when the contract balance is zero", async function () {
        await expect(debc.withdrawAllETH(otherAccount)).to.be.revertedWith(
          "Withdrawal: No ETH to withdraw"
        );
      });

      it("should withdraw the right amount of ETH to the right account", async function () {
        const thisAddr = await debc.getAddress();
        await debc.startPresale();
        await buyTokensByETH(1e9);
        const ethBalance = await ethers.provider.getBalance(thisAddr);
        const prevBalance = await ethers.provider.getBalance(otherAccount);
        await debc.withdrawETH(otherAccount, ethBalance);
        expect(await ethers.provider.getBalance(thisAddr)).to.equal(0);
        expect(await ethers.provider.getBalance(otherAccount)).to.equal(
          prevBalance + ethBalance
        );
      });
    });

    describe("withdrawUSDT()", function () {
      it("should fail to withdraw USDT as a non-owner", async function () {
        await expect(
          debc.connect(otherAccount).withdrawUSDT(otherAccount, 1)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should fail to withdraw no USDT", async function () {
        await expect(debc.withdrawUSDT(otherAccount, 0)).to.be.revertedWith(
          "Withdrawal: Withdrawal amount must be greater than zero"
        );
      });

      it("should fail to withdraw more USDT than the contract balance", async function () {
        await expect(debc.withdrawUSDT(otherAccount, 1)).to.be.revertedWith(
          "Withdrawal: Withdrawal amount exceeds the balance"
        );
      });

      it("should withdraw the right amount of USDT to the right account", async function () {
        const thisAddr = await debc.getAddress();
        await debc.startPresale();
        await buyTokensByUSDT(1e9);
        const usdtBalance = await usdt.balanceOf(thisAddr);
        const withdrawalBalance = usdtBalance / 2n;
        const prevBalance = await usdt.balanceOf(otherAccount);
        await debc.withdrawUSDT(otherAccount, withdrawalBalance);
        expect(await usdt.balanceOf(thisAddr)).to.equal(
          usdtBalance - withdrawalBalance
        );
        expect(await usdt.balanceOf(otherAccount)).to.equal(
          prevBalance + withdrawalBalance
        );
      });
    });

    describe("withdrawAllUSDT()", function () {
      it("should fail to withdraw all USDT as a non-owner", async function () {
        await expect(
          debc.connect(otherAccount).withdrawAllUSDT(otherAccount)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should fail to withdraw all USDT when the contract has no USDT balance", async function () {
        await expect(debc.withdrawAllUSDT(otherAccount)).to.be.revertedWith(
          "Withdrawal: No balance to withdraw"
        );
      });

      it("should withdraw the right amount of USDT to the right account", async function () {
        const thisAddr = await debc.getAddress();
        await debc.startPresale();
        await buyTokensByUSDT(1e9);
        const usdtBalance = await usdt.balanceOf(thisAddr);
        const prevBalance = await usdt.balanceOf(otherAccount);
        await debc.withdrawAllUSDT(otherAccount);
        expect(await usdt.balanceOf(thisAddr)).to.equal(0);
        expect(await usdt.balanceOf(otherAccount)).to.equal(
          prevBalance + usdtBalance
        );
      });
    });

    describe("withdrawUSDC()", function () {
      it("should fail to withdraw USDC as a non-owner", async function () {
        await expect(
          debc.connect(otherAccount).withdrawUSDC(otherAccount, 1)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should fail to withdraw no USDC", async function () {
        await expect(debc.withdrawUSDC(otherAccount, 0)).to.be.revertedWith(
          "Withdrawal: Withdrawal amount must be greater than zero"
        );
      });

      it("should fail to withdraw more USDC than the contract balance", async function () {
        await expect(debc.withdrawUSDC(otherAccount, 1)).to.be.revertedWith(
          "Withdrawal: Withdrawal amount exceeds the balance"
        );
      });

      it("should withdraw the right amount of USDC to the right account", async function () {
        const thisAddr = await debc.getAddress();
        await debc.startPresale();
        await buyTokensByUSDC(1e9);
        const usdcBalance = await usdc.balanceOf(thisAddr);
        const withdrawalBalance = usdcBalance / 2n;
        const prevBalance = await usdc.balanceOf(otherAccount);
        await debc.withdrawUSDC(otherAccount, withdrawalBalance);
        expect(await usdc.balanceOf(thisAddr)).to.equal(
          usdcBalance - withdrawalBalance
        );
        expect(await usdc.balanceOf(otherAccount)).to.equal(
          prevBalance + withdrawalBalance
        );
      });
    });

    describe("withdrawAllUSDC()", function () {
      it("should fail to withdraw all USDC as a non-owner", async function () {
        await expect(
          debc.connect(otherAccount).withdrawAllUSDC(otherAccount)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should fail to withdraw all USDC when the contract has no USDC balance", async function () {
        await expect(debc.withdrawAllUSDC(otherAccount)).to.be.revertedWith(
          "Withdrawal: No balance to withdraw"
        );
      });

      it("should withdraw the right amount of USDC to the right account", async function () {
        const thisAddr = await debc.getAddress();
        await debc.startPresale();
        await buyTokensByUSDC(1e9);
        const usdcBalance = await usdc.balanceOf(thisAddr);
        const prevBalance = await usdc.balanceOf(otherAccount);
        await debc.withdrawAllUSDC(otherAccount);
        expect(await usdc.balanceOf(thisAddr)).to.equal(0);
        expect(await usdc.balanceOf(otherAccount)).to.equal(
          prevBalance + usdcBalance
        );
      });
    });
  });
});
