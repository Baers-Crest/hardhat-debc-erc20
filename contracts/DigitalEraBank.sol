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
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract DigitalEraBank is ERC20, Ownable, ReentrancyGuard {
    // Events
    event Sold(uint256 amount, address indexed by);

    // Address of the ETH price feed contract
    address public ethPriceFeedContract =
        0x694AA1769357215DE4FAC081bf1f309aDC325306; // 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419;

    // Address of the EUR price feed contract
    address public eurPriceFeedContract =
        0x1a81afB8146aeFfCFc5E50e8479e826E7D55b910; // 0xb49f677943BC038e9857d61E7d053CaA2C1734C1;

    // Address of the USDT contract
    address public usdtContract = 0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0; // 0xdAC17F958D2ee523a2206206994597C13D831ec7;

    // Address of the USDC contract
    address public usdcContract = 0xf08A50178dfcDe18524640EA6618a1f965821715; // 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;

    // Start time of the presale
    uint256 public presaleStartTime = 0;

    // Duration of each presale stage in seconds (default: 1 week)
    uint256 public presaleStageDuration = 604800;

    // Number of presale stages (default: 12 stages)
    uint256 public presaleStageCount = 12;

    // Initial price of tokens during the presale in cents (EUR) (default: 0.35 EUR)
    uint256 public initialPresalePrice = 35;

    // Increment of token price per stage during the presale in cents (EUR) (default: 0.05 EUR)
    uint256 public presalePriceIncrementPerStage = 5;

    // Token price at launch in cents (EUR) (default: 1 EUR)
    uint256 public launchPrice = 100; // 1 EUR

    // Total number of tokens sold during the presale
    uint256 public totalTokensSoldOnPresale = 0;

    // Price variation percentage threshold (default: 1%)
    uint256 public priceVariationPercentageThreshold = 1;

    // Modifier to check if the presale is active
    modifier presaleActive() {
        require(
            presaleStartTime != 0 && presaleStartTime <= block.timestamp,
            "Presale timestamp: Presale not started"
        );
        require(
            block.timestamp <
                presaleStartTime + presaleStageDuration * presaleStageCount,
            "Presale timestamp: Presale ended"
        );
        _;
    }

    // Modifier to check if the presale has started
    modifier presaleStarted() {
        require(
            presaleStartTime != 0 && presaleStartTime <= block.timestamp,
            "Presale timestamp: Presale not started"
        );
        _;
    }

    // Modifier to check if the presale has not started
    modifier presaleNotStarted() {
        require(
            presaleStartTime == 0 || presaleStartTime > block.timestamp,
            "Presale timestamp: Presale started"
        );
        _;
    }

    /**
     * @dev Constructor that mints the initial supply of tokens to the contract itself.
     */
    constructor() ERC20("Digital Era Bank", "DEBC") Ownable() {
        _mint(address(this), 2e15);
    }

    /**
     * @dev Overrides the decimals function to return 8 instead of the default 18
     * @return uint8 The number of decimals for the token
     */
    function decimals() public view virtual override returns (uint8) {
        return 8;
    }

    /**
     * @dev Mints new tokens
     * @param to The address to mint the tokens to
     * @param amount The amount of tokens to mint
     */
    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }

    /**
     * @dev Mints new tokens to multiple recipients
     * @param recipients The addresses to mint the tokens to
     * @param amounts The amounts of tokens to mint to each address
     */
    function bulkMint(
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external onlyOwner {
        require(recipients.length > 0, "Bulk mint: No recipients");
        require(
            recipients.length == amounts.length,
            "Bulk mint: Mismatched arrays"
        );
        for (uint256 i = 0; i < recipients.length; i++) {
            unchecked {
                _mint(recipients[i], amounts[i]);
            }
        }
    }

    /**
     * @dev Burns tokens from an address
     * @param from The address to burn the tokens from
     * @param amount The amount of tokens to burn
     */
    function burn(address from, uint256 amount) public onlyOwner {
        _burn(from, amount);
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
        bool isPresaledEnded = presaleStartTime != 0 &&
            block.timestamp >=
            presaleStartTime + presaleStageDuration * presaleStageCount;
        require(
            from == address(0) || from == address(this) || isPresaledEnded,
            "Token transfer: Transfers are currently not allowed"
        );
    }

    /**
     * @dev Sets the ETH price feed contract address
     * @param newAddress The new ETH price feed contract address
     */
    function setETHPriceFeedContract(address newAddress) public onlyOwner {
        ethPriceFeedContract = newAddress;
    }

    /**
     * @dev Sets the EUR price feed contract address
     * @param newAddress The new EUR price feed contract address
     */
    function setEURPriceFeedContract(address newAddress) public onlyOwner {
        eurPriceFeedContract = newAddress;
    }

    /**
     * @dev Returns the latest price from a price feed contract
     * @param priceFeedContract The address of the price feed contract
     * @return int256 The latest price
     */
    function _getLatestPrice(
        address priceFeedContract
    ) private view returns (int256) {
        AggregatorV3Interface aggregator = AggregatorV3Interface(
            priceFeedContract
        );

        (, int256 price, , , ) = aggregator.latestRoundData();

        return price;
    }

    /**
     * @dev Returns the latest ETH price from the price feed
     * @return int256 The latest ETH price
     */
    function latestETHPrice() public view returns (int256) {
        return _getLatestPrice(ethPriceFeedContract);
    }

    /**
     * @dev Returns the latest EUR price from the price feed
     * @return int256 The latest EUR price
     */
    function latestEURPrice() public view returns (int256) {
        return _getLatestPrice(eurPriceFeedContract);
    }

    /**
     * @dev Sets the number of presale stages
     * @param count The new number of presale stages
     */
    function setPresaleStageCount(uint256 count) public onlyOwner {
        presaleStageCount = count;
    }

    /**
     * @dev Sets the duration of each presale stage
     * @param duration The new duration of each presale stage
     */
    function setPresaleStageDuration(uint256 duration) public onlyOwner {
        presaleStageDuration = duration;
    }

    /**
     * @dev Sets the initial price of the presale
     * @param price The new initial presale price
     */
    function setInitialPresalePrice(uint256 price) public onlyOwner {
        initialPresalePrice = price;
    }

    /**
     * @dev Sets the price increment per presale stage
     * @param increment The new presale price increment per stage
     */
    function setPresalePriceIncrementPerStage(
        uint256 increment
    ) public onlyOwner {
        presalePriceIncrementPerStage = increment;
    }

    /**
     * @dev Sets the launch price of the token
     * @param price The new launch price
     */
    function setLaunchPrice(uint256 price) public onlyOwner {
        launchPrice = price;
    }

    /**
     * @dev Sets the price variation percentage threshold
     * @param percentage The new price variation percentage threshold
     */
    function setPriceVariationPercentageThreshold(
        uint256 percentage
    ) public onlyOwner {
        require(
            percentage <= 5,
            "Price variation control: Too high percentage"
        );
        priceVariationPercentageThreshold = percentage;
    }

    /**
     * @dev Starts the presale
     */
    function startPresale() public onlyOwner presaleNotStarted {
        presaleStartTime = block.timestamp;
    }

    /**
     * @dev Returns the end time of the presale
     * @return uint256 The end time of the presale
     */
    function presaleEndTime() public view returns (uint256) {
        return
            presaleStartTime == 0
                ? 0
                : presaleStartTime + presaleStageDuration * presaleStageCount;
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
        return currentPrice < launchPrice ? currentPrice : launchPrice;
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
        require(
            msg.value > 0,
            "Token purchase: Need to send ETH to buy tokens"
        );
        require(amountToBuy > 0, "Token purchase: Need to buy tokens");
        require(
            amountToBuy <= balanceOf(address(this)),
            "Token purchase: Not enough tokens available"
        );

        uint256 calculatedPrice = calculateETHPrice(amountToBuy);
        uint256 lowerBoundPrice = (calculatedPrice *
            (100 - priceVariationPercentageThreshold)) / 100;
        require(
            msg.value >= lowerBoundPrice,
            "Token purchase: Need to send enough ETH to buy tokens"
        );

        _transfer(address(this), msg.sender, amountToBuy);
        totalTokensSoldOnPresale += amountToBuy;

        emit Sold(amountToBuy, msg.sender);
    }

    /**
     * @dev Sets the USDT contract address
     * @param newAddress The new USDT contract address
     */
    function setUSDTContractAddress(address newAddress) public onlyOwner {
        usdtContract = newAddress;
    }

    /**
     * @dev Sets the USDC contract address
     * @param newAddress The new USDC contract address
     */
    function setUSDCContractAddress(address newAddress) public onlyOwner {
        usdcContract = newAddress;
    }

    /**
     * @dev Internal function to calculate the price in a USDC-compatible token
     * @param tokenContractAddress The address of the token contract
     * @param amountToBuy The amount of tokens to buy
     * @return uint256 The price in the specified token for the given amount of tokens
     */
    function _calculateUSDCoinPrice(
        address tokenContractAddress,
        uint256 amountToBuy
    ) private view returns (uint256) {
        uint256 currentPrice = currentPresalePrice();
        uint256 eurPrice = uint256(latestEURPrice());

        ERC20 token = ERC20(tokenContractAddress);

        return
            (amountToBuy * eurPrice * currentPrice) /
            100 /
            10 ** (decimals() - token.decimals() + 8);
    }

    /**
     * @dev Calculates the price in USDT for a given amount of tokens
     * @param amountToBuy The amount of tokens to buy
     * @return uint256 The price in USDT for the given amount of tokens
     */
    function calculateUSDTPrice(
        uint256 amountToBuy
    ) public view returns (uint256) {
        return _calculateUSDCoinPrice(usdtContract, amountToBuy);
    }

    /**
     * @dev Calculates the price in USDC for a given amount of tokens
     * @param amountToBuy The amount of tokens to buy
     * @return uint256 The price in USDC for the given amount of tokens
     */
    function calculateUSDCPrice(
        uint256 amountToBuy
    ) public view returns (uint256) {
        return _calculateUSDCoinPrice(usdcContract, amountToBuy);
    }

    /**
     * @dev Internal function to buy tokens using a USDC-compatible token
     * @param tokenContractAddress The address of the token contract
     * @param amountToBuy The amount of tokens to buy
     */
    function _buyTokensByUSDCoin(
        address tokenContractAddress,
        uint256 amountToBuy
    ) private presaleActive nonReentrant {
        require(amountToBuy > 0, "Token purchase: Need to buy tokens");
        require(
            amountToBuy <= balanceOf(address(this)),
            "Token purchase: Not enough tokens available"
        );

        ERC20 tokenContract = ERC20(tokenContractAddress);

        uint256 calculatedAmount = _calculateUSDCoinPrice(
            tokenContractAddress,
            amountToBuy
        );
        uint256 lowerBoundAmount = (calculatedAmount *
            (100 - priceVariationPercentageThreshold)) / 100;
        uint256 approvedAmount = tokenContract.allowance(
            msg.sender,
            address(this)
        );
        require(
            approvedAmount >= lowerBoundAmount,
            "Token purchase: Not enough coin balance approved"
        );

        bool coinSent = tokenContract.transferFrom(
            msg.sender,
            address(this),
            approvedAmount >= calculatedAmount
                ? calculatedAmount
                : approvedAmount
        );
        require(coinSent, "Token purchase: Coin transfer failed");

        _transfer(address(this), msg.sender, amountToBuy);
        totalTokensSoldOnPresale += amountToBuy;

        emit Sold(amountToBuy, msg.sender);
    }

    /**
     * @dev Buys tokens using USDT during the presale
     * @param amountToBuy The amount of tokens to buy
     */
    function buyTokensByUSDT(uint256 amountToBuy) public presaleActive {
        _buyTokensByUSDCoin(usdtContract, amountToBuy);
    }

    /**
     * @dev Buys tokens using USDC during the presale
     * @param amountToBuy The amount of tokens to buy
     */
    function buyTokensByUSDC(uint256 amountToBuy) public presaleActive {
        _buyTokensByUSDCoin(usdcContract, amountToBuy);
    }

    /**
     * @dev Withdraws a specified amount of ETH to a specified address
     * @param to The address to send the ETH to
     * @param amount The amount of ETH to withdraw
     */
    function withdrawETH(
        address to,
        uint256 amount
    ) public onlyOwner nonReentrant {
        require(
            amount > 0,
            "Withdrawal: Withdrawal amount must be greater than zero"
        );

        require(
            amount <= address(this).balance,
            "Withdrawal: Withdrawal amount exceeds ETH balance"
        );

        (bool success, ) = to.call{value: amount}("");
        require(success, "Withdrawal: Withdrawal failed");
    }

    /**
     * @dev Withdraws all ETH to a specified address
     * @param to The address to send the ETH to
     */
    function withdrawAllETH(address to) public onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "Withdrawal: No ETH to withdraw");

        (bool success, ) = to.call{value: balance}("");
        require(success, "Withdrawal: Withdrawal failed");
    }

    /**
     * @dev Internal function to withdraw tokens to a specified address
     * @param tokenAddress The address of the token contract
     * @param to The address to send the tokens to
     * @param amount The amount of tokens to withdraw
     */
    function _withdrawTokens(
        address tokenAddress,
        address to,
        uint256 amount
    ) private onlyOwner nonReentrant {
        require(
            amount > 0,
            "Withdrawal: Withdrawal amount must be greater than zero"
        );

        ERC20 tokenContract = ERC20(tokenAddress);

        uint256 balance = tokenContract.balanceOf(address(this));
        require(
            amount <= balance,
            "Withdrawal: Withdrawal amount exceeds the balance"
        );

        bool sent = tokenContract.transfer(to, amount);
        require(sent, "Withdrawal: Withdrawal failed");
    }

    /**
     * @dev Internal function to withdraw all tokens to a specified address
     * @param tokenAddress The address of the token contract
     * @param to The address to send the tokens to
     */
    function _withdrawAllTokens(
        address tokenAddress,
        address to
    ) private onlyOwner nonReentrant {
        ERC20 tokenContract = ERC20(tokenAddress);

        uint256 balance = tokenContract.balanceOf(address(this));
        require(balance > 0, "Withdrawal: No balance to withdraw");

        bool sent = tokenContract.transfer(to, balance);
        require(sent, "Withdrawal: Withdrawal failed");
    }

    /**
     * @dev Withdraws a specified amount of USDT to a specified address
     * @param to The address to send the USDT to
     * @param amount The amount of USDT to withdraw
     */
    function withdrawUSDT(address to, uint256 amount) public onlyOwner {
        _withdrawTokens(usdtContract, to, amount);
    }

    /**
     * @dev Withdraws all USDT to a specified address
     * @param to The address to send the USDT to
     */
    function withdrawAllUSDT(address to) public onlyOwner {
        _withdrawAllTokens(usdtContract, to);
    }

    /**
     * @dev Withdraws a specified amount of USDC to a specified address
     * @param to The address to send the USDC to
     * @param amount The amount of USDC to withdraw
     */
    function withdrawUSDC(address to, uint256 amount) public onlyOwner {
        _withdrawTokens(usdcContract, to, amount);
    }

    /**
     * @dev Withdraws all USDC to a specified address
     * @param to The address to send the USDC to
     */
    function withdrawAllUSDC(address to) public onlyOwner {
        _withdrawAllTokens(usdcContract, to);
    }
}
