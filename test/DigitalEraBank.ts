import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, network } from "hardhat";
import { DigitalEraBank, USDC, USDT } from "../typechain-types";

const DEBCTokenAddress = {
  sepolia: "0xd43BFB50712CDaa567f9Ea1763E7276EeF5079AB",
};

const USDCTokenAddress = {
  sepolia: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
};

describe.only("DEBC", function () {
  let owner: HardhatEthersSigner,
    otherAccount: HardhatEthersSigner,
    signer1: HardhatEthersSigner,
    signer2: HardhatEthersSigner;

  let debc: DigitalEraBank;
  let usdt: USDT;
  let usdc: USDC;

  let debcAddress: string;
  let signer1Address: string;
  let signer2Address: string;

  const INITIAL_SUPPLY = 5000000000000000n;
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
    {
      inputs: [],
      name: "decimals",
      outputs: [
        {
          internalType: "uint8",
          name: "",
          type: "uint8",
        },
      ],
      stateMutability: "view",
      type: "function",
    },
  ];

  async function deploy() {
    [owner, signer1, signer2, otherAccount] = await ethers.getSigners();

    signer1Address = await signer1.getAddress();
    signer2Address = await signer2.getAddress();

    if (network.name === "hardhat") {
      // On a forked Hardhat network, attach to the live Sepolia deployment
      debcAddress = DEBCTokenAddress.sepolia;
      debc = await ethers.getContractAt("DigitalEraBank", debcAddress);
      usdc = await ethers.getContractAt("USDC", USDCTokenAddress.sepolia);

      const USDC = await ethers.getContractFactory("USDC");
      usdc = await USDC.deploy(1e15);
      await usdc.waitForDeployment();
    } else {
      const DEBC = await ethers.getContractFactory("DigitalEraBank");
      debc = await DEBC.deploy();
      await debc.waitForDeployment();
      debcAddress = await debc.getAddress();

      const USDC = await ethers.getContractFactory("USDC");
      usdc = await USDC.deploy(1e15);
      await usdc.waitForDeployment();

      await usdc.transfer(signer1Address, 1e10);
      await usdc.transfer(signer2Address, 1e10);

      const USDT = await ethers.getContractFactory("USDT");
      usdt = await USDT.deploy(1e15);
      await usdt.waitForDeployment();

      await usdt.transfer(signer1Address, 1e10);
      await usdt.transfer(signer2Address, 1e10);
    }
  }

  async function getLatestPrice(priceFeedAddress: string) {
    const priceFeed = new ethers.Contract(
      priceFeedAddress,
      priceFeedABI,
      ethers.provider
    );
    const res = await priceFeed.latestRoundData();
    const answer = res[1];

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

  this.beforeEach(async function () {
    if (network.name === "hardhat") {
      await network.provider.request({
        method: "hardhat_reset",
        params: [
          {
            forking: {
              jsonRpcUrl: `https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`,
              blockNumber: process.env.FORK_BLOCK_NUMBER
                ? Number(process.env.FORK_BLOCK_NUMBER)
                : undefined,
            },
          },
        ],
      });
    }
    await deploy();
  });

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
      expect(await debc.totalSupply()).to.equal(INITIAL_SUPPLY);
    });
  });

  describe("Contract configuration", function () {
    describe("setETHPriceFeedContract()", function () {
      it("should fail to set ETH price feed contract as a non-owner", async function () {
        const newContract = await otherAccount.getAddress();
        await expect(
          debc.connect(otherAccount).setETHPriceFeedContract(newContract)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should fail to set ETH price feed contract to zero address", async function () {
        await expect(
          debc.setETHPriceFeedContract(ethers.ZeroAddress)
        ).to.be.revertedWith("Address 0");
      });

      it("should fail to set ETH price feed contract to the same address", async function () {
        const currentContract = await debc.ethPriceFeedContract();
        await expect(debc.setETHPriceFeedContract(currentContract)).to.be
          .reverted;
      });

      it("should set the right ETH price feed contract", async function () {
        const newContract = await otherAccount.getAddress();
        await debc.setETHPriceFeedContract(newContract);
        expect(await debc.ethPriceFeedContract()).to.equal(newContract);
      });
    });

    describe("setEURPriceFeedContract()", function () {
      it("should fail to set EUR price feed contract as a non-owner", async function () {
        const newContract = await otherAccount.getAddress();
        await expect(
          debc.connect(otherAccount).setEURPriceFeedContract(newContract)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should fail to set EUR price feed contract to zero address", async function () {
        await expect(
          debc.setEURPriceFeedContract(ethers.ZeroAddress)
        ).to.be.revertedWith("Address 0");
      });

      it("should fail to set EUR price feed contract to the same address", async function () {
        const currentContract = await debc.eurPriceFeedContract();
        await expect(debc.setEURPriceFeedContract(currentContract)).to.be
          .reverted;
      });

      it("should set the right EUR price feed contract", async function () {
        const newContract = await otherAccount.getAddress();
        await debc.setEURPriceFeedContract(newContract);
        expect(await debc.eurPriceFeedContract()).to.equal(newContract);
      });
    });

    describe("setUSDTContract()", function () {
      it("should fail to set USDT contract as a non-owner", async function () {
        const newContract = await otherAccount.getAddress();
        await expect(
          debc.connect(otherAccount).setUSDTContract(newContract)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should fail to set USDT contract to zero address", async function () {
        await expect(
          debc.setUSDTContract(ethers.ZeroAddress)
        ).to.be.revertedWith("Address 0");
      });

      it("should fail to set USDT contract to the same address", async function () {
        const currentContract = await debc.usdtContract();
        await expect(debc.setUSDTContract(currentContract)).to.be.reverted;
      });

      it("should set the right USDT contract", async function () {
        const newContract = await otherAccount.getAddress();
        await debc.setUSDTContract(newContract);
        expect(await debc.usdtContract()).to.equal(newContract);
      });
    });

    describe("setUSDCContract()", function () {
      it("should fail to set USDC contract as a non-owner", async function () {
        const newContract = await otherAccount.getAddress();
        await expect(
          debc.connect(otherAccount).setUSDCContract(newContract)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should fail to set USDC contract to zero address", async function () {
        await expect(
          debc.setUSDCContract(ethers.ZeroAddress)
        ).to.be.revertedWith("Address 0");
      });

      it("should fail to set USDC contract to the same address", async function () {
        const currentContract = await debc.usdcContract();
        await expect(debc.setUSDCContract(currentContract)).to.be.reverted;
      });

      it("should set the right USDC contract", async function () {
        const newContract = await otherAccount.getAddress();
        await debc.setUSDCContract(newContract);
        expect(await debc.usdcContract()).to.equal(newContract);
      });
    });
  });

  describe("Signer management", () => {
    it("should add the signer correctly", async () => {
      await debc.connect(owner).addSigner(await signer1.getAddress());
      expect(await debc.requiredSignatures()).to.equal(1);
    });

    it("should revert when non-signer tries to submitTransaction", async function () {
      const destination = await otherAccount.getAddress();
      await expect(
        debc.connect(signer1).submitTransaction(destination, 0, "0x")
      ).to.be.revertedWith("Not a signer");
    });

    it("should allow owner to add a signer and signer can submit/confirm", async function () {
      await debc.addSigner(await signer1.getAddress());

      const destination = await otherAccount.getAddress();
      const tx = await debc
        .connect(signer1)
        .submitTransaction(destination, 0, "0x");

      await expect(tx).to.emit(debc, "TransactionSubmitted");
      await expect(tx).to.emit(debc, "TransactionConfirmed");
    });

    it("should not allow the same signer to confirm a transaction twice", async function () {
      await debc.addSigner(await signer1.getAddress());
      const destination = await otherAccount.getAddress();

      // submit tx and read the TransactionSubmitted event to obtain txHash
      const tx = await debc
        .connect(signer1)
        .submitTransaction(destination, 0, "0x");
      const receipt = await tx.wait();
      // txHash is indexed in the event topics (topics[1]) — TransactionSubmitted is emitted first, so use the first log
      const submittedLog = receipt?.logs[0];
      const txHash = submittedLog?.topics[1];

      await expect(
        debc.connect(signer1).confirmTransaction(txHash!, destination, 0, "0x")
      ).to.be.revertedWith("Transaction already confirmed");
    });

    it("should execute the transaction after required signatures are collected", async function () {
      await debc.addSigner(await signer1.getAddress());
      await debc.addSigner(await signer2.getAddress());

      // require 2 signatures
      await debc.setRequiredSignatures(2);

      const destination = await otherAccount.getAddress();
      const submitTx = await debc
        .connect(signer1)
        .submitTransaction(destination, 0, "0x");
      const receipt = await submitTx.wait();
      const submittedLog = receipt?.logs[0];
      const txHash = submittedLog?.topics[1];

      await expect(submitTx).to.emit(debc, "TransactionSubmitted");

      const confirmTx = await debc
        .connect(signer2)
        .confirmTransaction(txHash!, destination, 0, "0x");

      await expect(confirmTx).to.emit(debc, "TransactionConfirmed");
      await expect(confirmTx).to.emit(debc, "TransactionExecuted");
    });

    it("should allow owner to remove a signer and removed signer cannot submit", async function () {
      await debc.addSigner(await signer1.getAddress());
      await debc.removeSigner(await signer1.getAddress());

      const destination = await otherAccount.getAddress();
      await expect(
        debc.connect(signer1).submitTransaction(destination, 0, "0x")
      ).to.be.revertedWith("Not a signer");
    });

    it("should revert when setting requiredSignatures greater than signers length", async function () {
      // no signers added yet
      await expect(debc.setRequiredSignatures(1)).to.be.revertedWith(
        "Not enough signers"
      );

      await debc.addSigner(await signer1.getAddress());
      await expect(debc.setRequiredSignatures(2)).to.be.revertedWith(
        "Not enough signers"
      );
    });
  });

  describe("Token allocation", function () {
    describe("mint()", async function () {
      it("should fail to mint tokens as a non-owner", async function () {
        await expect(debc.connect(otherAccount).mint(1e3)).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("shold mint the right amount of tokens to the right account before presale", async function () {
        const amount2Mint = 10n;
        await debc.mint(amount2Mint);
        expect(await debc.balanceOf(debcAddress)).to.equal(
          INITIAL_SUPPLY + amount2Mint
        );
      });

      it("should mint the right amount of tokens during presale", async function () {
        await debc.startPresale();
        await time.increase(60 * 60);

        const prevAmount = await debc.balanceOf(debcAddress);
        const amount2Mint = 10n;

        await debc.mint(amount2Mint);

        expect(await debc.balanceOf(debcAddress)).to.equal(
          prevAmount + amount2Mint
        );
      });

      it("should not mint the right amount of tokens after presale ends", async function () {
        await debc.startPresale();

        const presaleStageDuration = await debc.presaleStageDuration();
        const presaleStageCount = await debc.presaleStageCount();

        await time.increase(presaleStageDuration * presaleStageCount + 1n);

        const prevAmount = await debc.balanceOf(debcAddress);
        const amount2Mint = 10n;

        await debc.mint(amount2Mint);

        expect(await debc.balanceOf(debcAddress)).to.equal(
          prevAmount + amount2Mint
        );
      });
    });

    describe("burn()", function () {
      it("should fail to burn tokens as a non-owner", async function () {
        await expect(debc.connect(otherAccount).burn(1e3)).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should burn the right amount of tokens from the token contract itself before presale start", async function () {
        const thisAddress = await debc.getAddress();
        const prevAmount = await debc.balanceOf(thisAddress);
        const amount2Burn = 10n;
        await debc.burn(amount2Burn);
        expect(await debc.balanceOf(thisAddress)).to.equal(
          prevAmount - amount2Burn
        );
      });

      it("should burn the right amount of tokens during presale", async function () {
        await debc.mint(100n);
        await debc.startPresale();
        await time.increase(60 * 60);

        const prevAmount = await debc.balanceOf(debcAddress);

        const amount2Burn = 10n;
        await debc.burn(amount2Burn);

        expect(await debc.balanceOf(debcAddress)).to.equal(
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
        ).to.be.revertedWith("Not the contract");
      });

      it("should set the right number of stages", async function () {
        const presaleStageCount = Math.floor(Math.random() * 12) + 1;

        await debc.addSigner(await signer1.getAddress());

        // Encode the function call
        const data = debc.interface.encodeFunctionData("setPresaleStageCount", [
          presaleStageCount,
        ]);

        await debc.connect(signer1).submitTransaction(debcAddress, 0, data);

        expect(await debc.presaleStageCount()).to.equal(presaleStageCount);
      });
    });

    describe("currentPresaleStage()", function () {
      it("should fail to calculate the current presale stage while the presale is not active", async function () {
        const presaleStageDuration = await debc.presaleStageDuration();
        const presaleStageCount = await debc.presaleStageCount();
        await expect(debc.currentPresaleStage()).to.be.revertedWith(
          "Presale not started"
        );
        await debc.startPresale();
        await time.increase(presaleStageDuration * presaleStageCount + 1n);
        await expect(debc.currentPresaleStage()).to.be.revertedWith(
          "Presale ended"
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
    beforeEach(async function () {
      await debc.setHeartbeat(24 * 60 * 60);
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
          "Presale not started"
        );
        await debc.startPresale();
        await time.increase(presaleStageDuration * presaleStageCount + 1n);
        await expect(debc.currentPresalePrice()).to.be.revertedWith(
          "Presale ended"
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

      it("should return the current presale price correctly", async function () {
        const initialPresalePrice = await debc.initialPresalePrice();
        const presaleStageDuration = await debc.presaleStageDuration();

        await debc.startPresale();
        const currentPresalePrice = await debc.currentPresalePrice();
        expect(currentPresalePrice).to.equal(initialPresalePrice);

        const currentPresaleStage = await debc.currentPresaleStage();
        expect(currentPresaleStage).to.equal(0n);

        await time.increase(presaleStageDuration + 1n);

        const currentPresaleStage1 = await debc.currentPresaleStage();
        expect(currentPresaleStage1).to.equal(1n);

        const currentPresalePriceAfter = await debc.currentPresalePrice();

        const presalePriceIncrementPerStage =
          await debc.presalePriceIncrementPerStage();

        expect(currentPresalePriceAfter).to.equal(
          initialPresalePrice + presalePriceIncrementPerStage
        );
      });

      it("should return the launch price as maximum", async function () {
        const initialPresalePrice = await debc.initialPresalePrice();
        const presaleStageDuration = await debc.presaleStageDuration();

        await debc.startPresale();
        const currentPresalePrice = await debc.currentPresalePrice();
        expect(currentPresalePrice).to.equal(initialPresalePrice);

        const newPresaleStageCount = 14n;

        await debc.addSigner(await signer1.getAddress());

        // Encode the function call
        const data = debc.interface.encodeFunctionData("setPresaleStageCount", [
          newPresaleStageCount,
        ]);

        await debc.connect(signer1).submitTransaction(debcAddress, 0, data);

        const presaleStageCount = await debc.presaleStageCount();
        expect(presaleStageCount).to.equal(newPresaleStageCount);

        await time.increase(presaleStageDuration * presaleStageCount - 5n);

        const currentPresaleStage1 = await debc.currentPresaleStage();
        expect(currentPresaleStage1).to.equal(newPresaleStageCount - 1n);

        const currentPresalePriceAfter = await debc.currentPresalePrice();

        const launchPrice = await debc.launchPrice();

        expect(currentPresalePriceAfter).to.equal(launchPrice);
      });
    });

    describe("calculateETHPrice()", function () {
      it("should fail to calculate the ETH price for the amount of tokens while the presale is not active", async function () {
        const presaleStageDuration = await debc.presaleStageDuration();
        const presaleStageCount = await debc.presaleStageCount();
        await expect(debc.calculateETHPrice(1e3)).to.be.revertedWith(
          "Presale not started"
        );
        await debc.startPresale();
        await time.increase(presaleStageDuration * presaleStageCount + 1n);
        await expect(debc.calculateETHPrice(1e3)).to.be.revertedWith(
          "Presale ended"
        );
      });

      it("should calculate the right ETH price for the amount of tokens while the presale is active", async function () {
        await debc.startPresale();
        const currentPrice = await debc.currentPresalePrice();
        const latestETHPrice = await debc.latestETHPrice();
        const latestEURPrice = await debc.latestEURPrice();
        const buyAmount = ethers.parseUnits("0.5", 8);
        const expectedPrice =
          (buyAmount * latestEURPrice * currentPrice * 100000000n) /
          latestETHPrice;
        expect(await debc.calculateETHPrice(buyAmount)).to.equal(expectedPrice);
      });
    });

    describe("calculateUSDTPrice()", function () {
      it("should fail to calculate the USDT price for the amount of tokens while the presale is not active", async function () {
        const presaleStageDuration = await debc.presaleStageDuration();
        const presaleStageCount = await debc.presaleStageCount();
        await expect(debc.calculateUSDTPrice(1e3)).to.be.revertedWith(
          "Presale not started"
        );
        await debc.startPresale();
        await time.increase(presaleStageDuration * presaleStageCount + 1n);
        await expect(debc.calculateUSDTPrice(1e3)).to.be.revertedWith(
          "Presale ended"
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
          "Presale not started"
        );
        await debc.startPresale();
        await time.increase(presaleStageDuration * presaleStageCount + 1n);
        await expect(debc.calculateUSDCPrice(1e3)).to.be.revertedWith(
          "Presale ended"
        );
      });

      it("should calculate the right USDC price for the amount of tokens while the presale is active", async function () {
        await debc.startPresale();
        const currentPrice = await debc.currentPresalePrice();
        const latestEURPrice = await debc.latestEURPrice();
        const decimals = await debc.decimals();
        const tokenDecimals = await usdc.decimals();
        const buyAmount = ethers.parseUnits("1", 8);
        const usdcPriceFeed = "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E";
        const latestUSDCPrice = await getLatestPrice(usdcPriceFeed);

        const expectedPrice =
          (buyAmount * latestEURPrice * currentPrice * 10n ** tokenDecimals) /
          latestUSDCPrice /
          10n ** (decimals - tokenDecimals + 8n);

        expect(await debc.calculateUSDCPrice(buyAmount)).to.equal(
          expectedPrice
        );
      });
    });
  });

  describe("Token purchase", function () {
    beforeEach(async function () {
      await debc.setHeartbeat(24 * 60 * 60);
    });
    describe("buyTokensByETH()", function () {
      it("should fail to buy tokens while presale is not active", async function () {
        await expect(debc.buyTokensByETH(1e2)).to.be.revertedWith(
          "Presale not started"
        );
      });

      it("should fail to buy tokens for free", async function () {
        await debc.startPresale();
        await expect(debc.buyTokensByETH(1e2)).to.be.revertedWith(
          "No ETH sending"
        );
      });

      it("should fail to buy no tokens", async function () {
        await debc.startPresale();
        await expect(debc.buyTokensByETH(0, { value: 1 })).to.be.revertedWith(
          "Invalid amount"
        );
      });

      it("should fail to buy tokens out of stock", async function () {
        const thisAddress = await debc.getAddress();
        const stock = await debc.balanceOf(thisAddress);
        await debc.startPresale();
        await expect(
          debc.buyTokensByETH(stock + 1n, { value: 1 })
        ).to.be.revertedWith("Not enough tokens available");
      });

      it("should fail to buy tokens for insufficient ETH", async function () {
        await debc.startPresale();
        await expect(debc.buyTokensByETH(1e9, { value: 1 })).to.be.revertedWith(
          "Not enough ETH sending"
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
          "Presale not started"
        );
      });

      it("should fail to buy no tokens", async function () {
        await debc.startPresale();
        await expect(debc.buyTokensByUSDT(0)).to.be.revertedWith(
          "Invalid amount"
        );
      });

      it("should fail to buy tokens out of stock", async function () {
        const thisAddress = await debc.getAddress();
        const stock = await debc.balanceOf(thisAddress);
        await debc.startPresale();
        await expect(debc.buyTokensByUSDT(stock + 1n)).to.be.revertedWith(
          "Not enough tokens available"
        );
      });

      it("should fail to buy tokens for insufficient USDT approved", async function () {
        await usdt.approve(await debc.getAddress(), 1);
        await debc.startPresale();
        await expect(debc.buyTokensByUSDT(1e9)).to.be.revertedWith(
          "Not enough tokens available"
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
          "Presale not started"
        );
      });

      it("should fail to buy no tokens", async function () {
        await debc.startPresale();
        await expect(debc.buyTokensByUSDC(0)).to.be.revertedWith(
          "Invalid amount"
        );
      });

      it("should fail to buy tokens out of stock", async function () {
        const thisAddress = await debc.getAddress();
        const stock = await debc.balanceOf(thisAddress);
        await debc.startPresale();
        await expect(debc.buyTokensByUSDC(stock + 1n)).to.be.revertedWith(
          "Not enough tokens available"
        );
      });

      it("should fail to buy tokens for insufficient USDC approved", async function () {
        await usdc.approve(await debc.getAddress(), 1);
        await debc.startPresale();
        await expect(debc.buyTokensByUSDC(1e9)).to.be.revertedWith(
          "Not enough coins approved"
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
      beforeEach(async () => {
        await debc.setHeartbeat(24 * 60 * 60);

        await debc.startPresale();
        const amount = 1e9;
        const tx = await buyTokensByETH(amount);
        expect(await debc.balanceOf(owner)).to.equal(amount);
        expect(
          await ethers.provider.getBalance(await debc.getAddress())
        ).to.equal(tx.value);
        await tx.wait();

        await debc.addSigner(signer1Address);
      });

      it("should fail to withdraw ETH as a non-owner", async function () {
        await expect(
          debc
            .connect(signer2)
            .submitTransaction(await otherAccount.getAddress(), 1n, "0x")
        ).to.be.rejectedWith("Not a signer");
      });

      it("should withdraw all eth", async function () {
        const debcEthBalance = await ethers.provider.getBalance(debcAddress);
        const signer2EthBalanceBefore = await ethers.provider.getBalance(
          signer2Address
        );
        await debc
          .connect(signer1)
          .submitTransaction(signer2Address, debcEthBalance, "0x");

        const signer2EthBalanceAfter = await ethers.provider.getBalance(
          signer2Address
        );

        expect(signer2EthBalanceAfter).to.equal(
          signer2EthBalanceBefore + debcEthBalance
        );
      });

      it("should fail to withdraw no ETH", async function () {
        const debcEthBalance = await ethers.provider.getBalance(debcAddress);
        await debc
          .connect(signer1)
          .submitTransaction(signer2Address, debcEthBalance, "0x");

        await expect(
          debc
            .connect(signer1)
            .submitTransaction(
              await otherAccount.getAddress(),
              debcEthBalance,
              "0x"
            )
        ).to.be.rejectedWith("Transaction execution failed");
      });

      it("should fail to withdraw more ETH than the contract balance", async function () {
        const debcEthBalance = await ethers.provider.getBalance(debcAddress);

        await expect(
          debc
            .connect(signer1)
            .submitTransaction(
              await otherAccount.getAddress(),
              debcEthBalance + 1n,
              "0x"
            )
        ).to.be.rejectedWith("Transaction execution failed");
      });

      it("should withdraw the right amount of ETH to the right account", async function () {
        const debcEthBalance = await ethers.provider.getBalance(debcAddress);
        const amount2Withdraw = debcEthBalance / 2n;

        const signer2EthBalanceBefore = await ethers.provider.getBalance(
          signer2Address
        );
        await debc
          .connect(signer1)
          .submitTransaction(signer2Address, amount2Withdraw, "0x");

        const signer2EthBalanceAfter = await ethers.provider.getBalance(
          signer2Address
        );

        expect(signer2EthBalanceAfter).to.equal(
          signer2EthBalanceBefore + amount2Withdraw
        );

        const debcEthBalanceAfter = await ethers.provider.getBalance(
          debcAddress
        );
        expect(debcEthBalanceAfter).to.equal(debcEthBalance - amount2Withdraw);
      });
    });

    describe("withdrawUSDC()", function () {
      beforeEach(async () => {
        await debc.setHeartbeat(24 * 60 * 60);
        await debc.startPresale();
        const amount2Buy = ethers.parseUnits("0.1", 8);

        const { tx, approvedAmount } = await buyTokensByUSDC(
          Number(amount2Buy)
        );
        await tx.wait();

        await debc.addSigner(signer1Address);
      });

      it("should fail to withdraw USDT as a non-owner", async function () {
        const data = usdc.interface.encodeFunctionData("transfer", [
          signer2Address,
          1n,
        ]);

        await expect(
          debc
            .connect(signer2)
            .submitTransaction(await usdc.getAddress(), 0, data)
        ).to.be.rejectedWith("Not a signer");
      });

      it("should fail to withdraw more USDT than the contract balance", async function () {
        const debcUsdcBalance = await usdc.balanceOf(debcAddress);

        const data = usdc.interface.encodeFunctionData("transfer", [
          signer2Address,
          debcUsdcBalance + 1n,
        ]);

        await expect(
          debc
            .connect(signer1)
            .submitTransaction(await usdc.getAddress(), 0, data)
        ).to.be.rejectedWith("Transaction execution failed");
      });

      it("should withdraw the right amount of USDT to the right account", async function () {
        const debcUsdcBalanceBefore = await usdc.balanceOf(debcAddress);
        const signer2UsdcBalanceBefore = await usdc.balanceOf(signer2Address);

        const data = usdc.interface.encodeFunctionData("transfer", [
          signer2Address,
          debcUsdcBalanceBefore,
        ]);

        await debc
          .connect(signer1)
          .submitTransaction(await usdc.getAddress(), 0, data);

        const debcUsdcBalanceAfter = await usdc.balanceOf(debcAddress);
        const signer2UsdcBalanceAfter = await usdc.balanceOf(signer2Address);

        expect(debcUsdcBalanceAfter).to.equal(
          debcUsdcBalanceBefore - debcUsdcBalanceBefore
        );

        expect(signer2UsdcBalanceAfter).to.equal(
          signer2UsdcBalanceBefore + debcUsdcBalanceBefore
        );
      });
    });

    describe("withdrawUSDT()", function () {
      it("should fail to withdraw USDC as a non-owner", async function () {});

      it("should fail to withdraw no USDC", async function () {});

      it("should fail to withdraw more USDC than the contract balance", async function () {});

      it("should withdraw the right amount of USDC to the right account", async function () {});
    });
  });

  describe("DEBC token transfers", function () {
    it("should fail to transfer DEBC tokens during presale", async function () {
      await debc.startPresale();
      await debc.mint(1000n);
      await expect(
        debc.transfer(otherAccount.getAddress(), 100n)
      ).to.be.revertedWith("Transfers not allowed");
    });

    it("should allow DEBC token transfers after presale ends", async function () {
      await debc.mint(1000n);
      await debc.startPresale();
      const presaleStageCount = await debc.presaleStageCount();
      const presaleStageDuration = await debc.presaleStageDuration();

      await debc.setHeartbeat(24 * 60 * 60);
      const amount2Buy = ethers.parseUnits("0.1", 8);

      const { tx, approvedAmount } = await buyTokensByUSDC(Number(amount2Buy));
      await tx.wait();

      const debcBalance = await debc.balanceOf(await owner.getAddress());
      expect(debcBalance).to.equal(amount2Buy);

      await time.increase(presaleStageDuration * presaleStageCount + 1n);

      await debc.transfer(await otherAccount.getAddress(), amount2Buy);

      expect(await debc.balanceOf(await otherAccount.getAddress())).to.equal(
        amount2Buy
      );
    });
  });
});
