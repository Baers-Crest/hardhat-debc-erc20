/*
 *
 *   $$$$$$$\  $$$$$$$$\ $$$$$$$\   $$$$$$\
 *   $$  __$$\ $$  _____|$$  __$$\ $$  __$$\
 *   $$ |  $$ |$$ |      $$ |  $$ |$$ /  \__|
 *   $$ |  $$ |$$$$$\    $$$$$$$\ |$$ |
 *   $$ |  $$ |$$  __|   $$  __$$\ $$ |
 *   $$ |  $$ |$$ |      $$ |  $$ |$$ |  $$\
 *   $$$$$$$  |$$$$$$$$\ $$$$$$$  |\$$$$$$  |
 *   \_______/ \________|\_______/  \______/
 *
 */

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract DigitalEraBank is ERC20, Ownable2Step, ReentrancyGuard {
    using EnumerableSet for EnumerableSet.AddressSet;

    /** Events */
    event Sold(uint256 amount, address indexed by);
    event TransactionSubmitted(bytes32 indexed txHash);
    event TransactionConfirmed(bytes32 indexed txHash, address indexed signer);
    event TransactionExecuted(bytes32 indexed txHash);

    // List of signers
    EnumerableSet.AddressSet private signers;

    // Confirmation status of signer transactions
    mapping(bytes32 => mapping(address => bool)) private confirmations;

    // Number of signers confirmed the signer transactions
    mapping(bytes32 => uint) private confirmationCounts;

    // Execution status of signer transactions
    mapping(bytes32 => bool) private executedTransactions;

    // Number of required signers to execute the signer transactions
    uint public requiredSignatures = 0;

    // Address of the ETH price feed contract
    address public constant ethPriceFeedContract =
        0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419;

    // Address of the EUR price feed contract
    address public constant eurPriceFeedContract =
        0xb49f677943BC038e9857d61E7d053CaA2C1734C1;

    // Address of the USDT price feed contract
    address public usdtPriceFeedContract =
        0x3E7d1eAB13ad0104d2750B8863b489D65364e32D;

    // Address of the USDC price feed contract
    address public usdcPriceFeedContract =
        0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6;

    // Heartbeat interval price feed is updated (default: 5 minutes)
    uint256 public heartbeat = 5 minutes;

    // Address of the USDT contract
    address public constant usdtContract =
        0xdAC17F958D2ee523a2206206994597C13D831ec7;

    // Address of the USDC contract
    address public constant usdcContract =
        0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;

    // Start time of the presale
    uint256 public presaleStartTime = 0;

    // Duration of each presale stage in seconds (default: 1 week)
    uint256 public constant presaleStageDuration = 1 weeks;

    // Number of presale stages (default: 12 stages)
    uint256 public presaleStageCount = 12;

    // Initial price of tokens during the presale in cents (EUR) (default: 0.35 EUR)
    uint256 public constant initialPresalePrice = 35;

    // Increment of token price per stage during the presale in cents (EUR) (default: 0.05 EUR)
    uint256 public constant presalePriceIncrementPerStage = 5;

    // Token price at launch in cents (EUR) (default: 1 EUR)
    uint256 public constant launchPrice = 100;

    // Total number of tokens sold during the presale
    uint256 public totalTokensSoldOnPresale = 0;

    // Price variation percentage threshold (default: 1%)
    uint256 public priceVariationPercentageThreshold = 1;

    // Modifer to check if the msg sender is a signer
    modifier onlySigner() {
        require(signers.contains(msg.sender), "Not a signer");
        _;
    }

    // Modifer to check if the msg sender is the contract itself
    modifier onlyWallet() {
        require(msg.sender == address(this), "Not the contract");
        _;
    }

    // Modifier to check if the address is not zero
    modifier notZero(address _address) {
        require(_address != address(0), "Address 0");
        _;
    }

    // Modifier to check if the address is not zero
    modifier withinRange(
        uint256 value,
        uint256 min,
        uint256 max
    ) {
        require(value >= min && value <= max, "Out of range");
        _;
    }

    // Modifier to check if the presale is active
    modifier presaleActive() {
        uint256 startTime = presaleStartTime;
        require(
            startTime != 0 && startTime <= block.timestamp,
            "Presale not started"
        );
        require(
            block.timestamp <
                startTime + presaleStageDuration * presaleStageCount,
            "Presale ended"
        );
        _;
    }

    /**
     * @dev Constructor that mints the initial supply of tokens to the contract itself.
     */
    constructor() ERC20("Digital Era Bank", "DEBC") Ownable() {
        uint256 initialSupply = 5000000000000000;
        _mint(address(this), initialSupply);
    }

    /**
     * @dev Overrides the decimals function to return 8 instead of the default 18
     * @return uint8 The number of decimals for the token
     */
    function decimals() public view virtual override returns (uint8) {
        return 8;
    }

    /**
     * @dev Submit a signer transaction
     * @param destination Transaction destination address
     * @param value Transaction value
     * @param data Transaction data
     */
    function submitTransaction(
        address destination,
        uint value,
        bytes memory data
    ) public onlySigner notZero(destination) returns (bytes32) {
        bytes32 txHash = keccak256(abi.encode(destination, value, data));
        emit TransactionSubmitted(txHash);
        confirmTransaction(txHash, destination, value, data);
        return txHash;
    }

    /**
     * @dev Confirm a signer transaction
     * @param txHash Transaction Hash
     * @param destination Transaction destination address
     * @param value Transaction value
     * @param data Transaction data
     */
    function confirmTransaction(
        bytes32 txHash,
        address destination,
        uint value,
        bytes memory data
    ) public onlySigner notZero(destination) {
        require(
            !confirmations[txHash][msg.sender],
            "Transaction already confirmed"
        );
        confirmations[txHash][msg.sender] = true;
        confirmationCounts[txHash] += 1;
        emit TransactionConfirmed(txHash, msg.sender);

        if (
            confirmationCounts[txHash] >= requiredSignatures &&
            !executedTransactions[txHash]
        ) {
            executeTransaction(txHash, destination, value, data);
        }
    }

    /**
     * @dev Execute a signer transaction
     * @param txHash Transaction Hash
     * @param destination Transaction destination address
     * @param value Transaction value
     * @param data Transaction data
     */
    function executeTransaction(
        bytes32 txHash,
        address destination,
        uint value,
        bytes memory data
    ) internal {
        require(
            confirmationCounts[txHash] >= requiredSignatures,
            "Not enough confirmations"
        );
        require(!executedTransactions[txHash], "Transaction already executed");

        executedTransactions[txHash] = true;

        (bool success, ) = destination.call{value: value}(data);
        require(success, "Transaction execution failed");
        emit TransactionExecuted(txHash);
    }

    /**
     * @dev Add a signer
     * @param newSigner A new signer address
     */
    function addSigner(address newSigner) public onlyOwner notZero(newSigner) {
        if (signers.length() == 0 && requiredSignatures == 0) {
            requiredSignatures = 1;
        }
        signers.add(newSigner);
    }

    /**
     * @dev Remove a signer from signers list
     * @param signer A new signer address
     */
    function removeSigner(address signer) public onlyOwner {
        signers.remove(signer);
    }

    /**
     * @dev Set the required number of signers to execute signer transactions
     * @param newRequiredSignatures A new signer address
     */
    function setRequiredSignatures(
        uint newRequiredSignatures
    ) public onlyOwner {
        require(
            newRequiredSignatures <= signers.length(),
            "Not enough signers"
        );
        require(requiredSignatures != newRequiredSignatures);
        requiredSignatures = newRequiredSignatures;
    }

    /**
     * @dev Increase total supply
     * @param amount The amount of tokens to mint
     */
    function mint(uint256 amount) public onlyOwner {
        require(amount > 0, "Invalid amount");
        _mint(address(this), amount);
    }

    /**
     * @dev Decrease total supply
     * @param amount The amount of tokens to burn
     */
    function burn(uint256 amount) public onlyOwner {
        require(amount > 0, "Invalid amount");
        _burn(address(this), amount);
    }

    /**
     * @dev Hook that is called before any transfer of tokens. This includes minting and burning, and blocks the transfer while the presale is active
     * @param from The address tokens are transferred from
     * @param to The address tokens are transferred to
     * @param amount The amount of tokens being transferred
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override {
        super._beforeTokenTransfer(from, to, amount);
        uint256 startTime = presaleStartTime;
        bool isPresaledEnded = startTime != 0 &&
            block.timestamp >=
            startTime + presaleStageDuration * presaleStageCount;
        require(
            from == address(0) || from == address(this) || isPresaledEnded,
            "Transfers not allowed"
        );
    }

    /**
     * @dev Sets the USDT/USD price feed contract
     * @param newContract The new heartbeat interval
     */
    function setUSDTPriceFeedContract(
        address newContract
    ) public onlyOwner notZero(newContract) {
        require(usdtPriceFeedContract != newContract);
        usdtPriceFeedContract = newContract;
    }

    /**
     * @dev Sets the USDC/USD price feed contract
     * @param newContract The new heartbeat interval
     */
    function setUSDCPriceFeedContract(
        address newContract
    ) public onlyOwner notZero(newContract) {
        require(usdcPriceFeedContract != newContract);
        usdcPriceFeedContract = newContract;
    }

    /**
     * @dev Sets the heartbeat interval
     * @param newInterval The new heartbeat interval
     */
    function setHeartbeat(
        uint256 newInterval
    ) public onlyOwner withinRange(newInterval, 1 minutes, 2 hours) {
        require(heartbeat != newInterval);
        heartbeat = newInterval;
    }

    /**
     * @dev Sets the number of presale stages
     * @param count The new presale stage count
     */
    function setPresaleStageCount(
        uint256 count
    ) public onlyWallet withinRange(count, 1, 48) {
        require(presaleStageCount != count);
        presaleStageCount = count;
    }

    /**
     * @dev Sets the price variation percentage threshold
     * @param percentage The new price variation percentage threshold
     */
    function setPriceVariationPercentageThreshold(
        uint256 percentage
    ) public onlyWallet withinRange(percentage, 0, 5) {
        require(priceVariationPercentageThreshold != percentage);
        priceVariationPercentageThreshold = percentage;
    }

    /**
     * @dev Returns the latest price from a price feed contract
     * @param priceFeedContract The address of the price feed contract
     * @return int256 The latest price
     */
    function _getLatestPrice(
        address priceFeedContract
    ) private view returns (uint256) {
        AggregatorV3Interface aggregator = AggregatorV3Interface(
            priceFeedContract
        );

        (, int256 price, , uint256 updatedAt, ) = aggregator.latestRoundData();
        require(block.timestamp - updatedAt <= heartbeat, "Stale data");

        uint8 tokenDecimals = aggregator.decimals();
        if (tokenDecimals <= 8) {
            return uint256(price) * (10 ** (8 - tokenDecimals));
        } else {
            return uint256(price) / (10 ** (tokenDecimals - 8));
        }
    }

    /**
     * @dev Returns the latest ETH price from the price feed
     * @return int256 The latest ETH price
     */
    function latestETHPrice() public view returns (uint256) {
        return _getLatestPrice(ethPriceFeedContract);
    }

    /**
     * @dev Returns the latest EUR price from the price feed
     * @return int256 The latest EUR price
     */
    function latestEURPrice() public view returns (uint256) {
        return _getLatestPrice(eurPriceFeedContract);
    }

    /**
     * @dev Returns the latest USDT price from the price feed
     * @return int256 The latest USDT price
     */
    function latestUSDTPrice() public view returns (uint256) {
        return _getLatestPrice(usdtPriceFeedContract);
    }

    /**
     * @dev Returns the latest USDC price from the price feed
     * @return int256 The latest USDC price
     */
    function latestUSDCPrice() public view returns (uint256) {
        return _getLatestPrice(usdcPriceFeedContract);
    }

    /**
     * @dev Starts the presale
     */
    function startPresale() public onlyOwner {
        require(
            presaleStartTime == 0 || presaleStartTime > block.timestamp,
            "Presale started"
        );
        presaleStartTime = block.timestamp;
    }

    /**
     * @dev Returns the end time of the presale
     * @return uint256 The end time of the presale
     */
    function presaleEndTime() public view returns (uint256) {
        uint256 startTime = presaleStartTime;
        return
            startTime == 0
                ? 0
                : startTime + presaleStageDuration * presaleStageCount;
    }

    /**
     * @dev Returns the current presale stage
     * @return uint256 The current presale stage
     */
    function currentPresaleStage() public view presaleActive returns (uint256) {
        return (block.timestamp - presaleStartTime) / presaleStageDuration;
    }

    /**
     * @dev Returns the current presale price
     * @return uint256 The current presale price
     */
    function currentPresalePrice() public view presaleActive returns (uint256) {
        uint256 stageIndex = currentPresaleStage();
        uint256 currentPrice = initialPresalePrice +
            presalePriceIncrementPerStage *
            stageIndex;
        uint256 listingPrice = launchPrice;
        return currentPrice < listingPrice ? currentPrice : listingPrice;
    }

    /**
     * @dev Calculates the price in ETH for a given amount of tokens
     * @param amountToBuy The amount of tokens to buy
     * @return uint256 The price in ETH for the given amount of tokens
     */
    function calculateETHPrice(
        uint256 amountToBuy
    ) public view returns (uint256) {
        uint256 currentPrice = currentPresalePrice();
        uint256 ethPrice = uint256(latestETHPrice());
        uint256 eurPrice = uint256(latestEURPrice());
        return (amountToBuy * eurPrice * currentPrice * 100000000) / ethPrice;
    }

    /**
     * @dev Buys tokens using ETH during the presale
     * @param amountToBuy The amount of tokens to buy
     */
    function buyTokensByETH(
        uint256 amountToBuy
    ) public payable presaleActive nonReentrant {
        require(msg.value > 0, "No ETH sending");
        require(amountToBuy > 0, "Invalid amount");
        require(
            amountToBuy <= balanceOf(address(this)),
            "Not enough tokens available"
        );

        uint256 calculatedPrice = calculateETHPrice(amountToBuy);
        uint256 lowerBoundPrice = (calculatedPrice *
            (100 - priceVariationPercentageThreshold)) / 100;
        require(msg.value >= lowerBoundPrice, "Not enough ETH sending");

        if (msg.value > calculatedPrice) {
            uint256 excessAmount = msg.value - calculatedPrice;
            (bool success, ) = msg.sender.call{value: excessAmount}("");
            require(success, "ETH refund failed");
        }

        _transfer(address(this), msg.sender, amountToBuy);
        totalTokensSoldOnPresale += amountToBuy;

        emit Sold(amountToBuy, msg.sender);
    }

    /**
     * @dev Calculates the price in USDT for a given amount of tokens
     * @param amountToBuy The amount of tokens to buy
     * @return uint256 The price in USDT for the given amount of tokens
     */
    function calculateUSDTPrice(
        uint256 amountToBuy
    ) public view returns (uint256) {
        uint256 currentPrice = currentPresalePrice();
        uint256 usdtPrice = uint256(latestUSDTPrice());
        uint256 eurPrice = uint256(latestEURPrice());
        ERC20 tokenContract = ERC20(usdtContract);
        return
            (amountToBuy *
                eurPrice *
                currentPrice *
                10 ** tokenContract.decimals()) /
            usdtPrice /
            10 ** 10;
    }

    /**
     * @dev Internal function to buy tokens using a USDC-compatible token
     * @param amountToBuy The amount of tokens to buy
     */
    function buyTokensByUSDT(
        uint256 amountToBuy
    ) public presaleActive nonReentrant {
        require(amountToBuy > 0, "Invalid amount");
        require(
            amountToBuy <= balanceOf(address(this)),
            "Not enough tokens available"
        );

        ERC20 tokenContract = ERC20(usdtContract);

        uint256 calculatedAmount = calculateUSDTPrice(amountToBuy);
        uint256 lowerBoundAmount = (calculatedAmount *
            (100 - priceVariationPercentageThreshold)) / 100;
        uint256 approvedAmount = tokenContract.allowance(
            msg.sender,
            address(this)
        );
        require(
            approvedAmount >= lowerBoundAmount,
            "Not enough coins approved"
        );

        bool coinSent = tokenContract.transferFrom(
            msg.sender,
            address(this),
            approvedAmount >= calculatedAmount
                ? calculatedAmount
                : approvedAmount
        );
        require(coinSent, "Coin transfer failed");

        _transfer(address(this), msg.sender, amountToBuy);
        totalTokensSoldOnPresale += amountToBuy;

        emit Sold(amountToBuy, msg.sender);
    }

    /**
     * @dev Calculates the price in USDC for a given amount of tokens
     * @param amountToBuy The amount of tokens to buy
     * @return uint256 The price in USDC for the given amount of tokens
     */
    function calculateUSDCPrice(
        uint256 amountToBuy
    ) public view returns (uint256) {
        uint256 currentPrice = currentPresalePrice();
        uint256 usdcPrice = uint256(latestUSDCPrice());
        uint256 eurPrice = uint256(latestEURPrice());
        ERC20 tokenContract = ERC20(usdcContract);
        return
            (amountToBuy *
                eurPrice *
                currentPrice *
                10 ** tokenContract.decimals()) /
            usdcPrice /
            10 ** 10;
    }

    /**
     * @dev Internal function to buy tokens using a USDC-compatible token
     * @param amountToBuy The amount of tokens to buy
     */
    function buyTokensByUSDC(
        uint256 amountToBuy
    ) public presaleActive nonReentrant {
        require(amountToBuy > 0, "Invalid amount");
        require(
            amountToBuy <= balanceOf(address(this)),
            "Not enough tokens available"
        );

        ERC20 tokenContract = ERC20(usdcContract);

        uint256 calculatedAmount = calculateUSDCPrice(amountToBuy);
        uint256 lowerBoundAmount = (calculatedAmount *
            (100 - priceVariationPercentageThreshold)) / 100;
        uint256 approvedAmount = tokenContract.allowance(
            msg.sender,
            address(this)
        );
        require(
            approvedAmount >= lowerBoundAmount,
            "Not enough coins approved"
        );

        bool coinSent = tokenContract.transferFrom(
            msg.sender,
            address(this),
            approvedAmount >= calculatedAmount
                ? calculatedAmount
                : approvedAmount
        );
        require(coinSent, "Coin transfer failed");

        _transfer(address(this), msg.sender, amountToBuy);
        totalTokensSoldOnPresale += amountToBuy;

        emit Sold(amountToBuy, msg.sender);
    }
}
