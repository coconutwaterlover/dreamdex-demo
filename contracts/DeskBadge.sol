// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Soulbound DreamDesk leaderboard badge. One token per wallet; score is on-chain.
/// Session key is the sole minter and may overwrite score after each round.
contract DeskBadge {
    string public constant name = "DreamDesk Badge";
    string public constant symbol = "DDB";

    address public immutable minter;
    string public baseURI;
    uint256 public totalSupply;

    struct Player {
        string handle;
        int256 score;
    }

    mapping(uint256 => address) private _ownerOf;
    mapping(address => uint256) public tokenOf;
    mapping(uint256 => Player) private _players;
    address[] public holders;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event ScoreUpdated(uint256 indexed tokenId, address indexed player, int256 score);

    error OnlyMinter();
    error Soulbound();
    error EmptyName();
    error NameTooLong();
    error ZeroAddress();
    error LengthMismatch();
    error NotMinted();

    constructor(address minter_) {
        if (minter_ == address(0)) revert ZeroAddress();
        minter = minter_;
    }

    modifier onlyMinter() {
        if (msg.sender != minter) revert OnlyMinter();
        _;
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address owned = _ownerOf[tokenId];
        if (owned == address(0)) revert NotMinted();
        return owned;
    }

    function balanceOf(address owner) public view returns (uint256) {
        if (owner == address(0)) revert ZeroAddress();
        return tokenOf[owner] == 0 ? 0 : 1;
    }

    function playerName(uint256 tokenId) external view returns (string memory) {
        if (_ownerOf[tokenId] == address(0)) revert NotMinted();
        return _players[tokenId].handle;
    }

    function playerScore(uint256 tokenId) external view returns (int256) {
        if (_ownerOf[tokenId] == address(0)) revert NotMinted();
        return _players[tokenId].score;
    }

    function scoreOf(address wallet) external view returns (int256) {
        uint256 id = tokenOf[wallet];
        if (id == 0) return 0;
        return _players[id].score;
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        if (_ownerOf[tokenId] == address(0)) revert NotMinted();
        return string.concat(baseURI, _toString(tokenId));
    }

    function setBaseURI(string calldata uri) external onlyMinter {
        baseURI = uri;
    }

    function getBoard()
        external
        view
        returns (
            address[] memory wallets,
            string[] memory names,
            int256[] memory scores,
            uint256[] memory tokenIds
        )
    {
        uint256 n = holders.length;
        wallets = new address[](n);
        names = new string[](n);
        scores = new int256[](n);
        tokenIds = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            address w = holders[i];
            uint256 id = tokenOf[w];
            wallets[i] = w;
            names[i] = _players[id].handle;
            scores[i] = _players[id].score;
            tokenIds[i] = id;
        }
    }

    /// @notice Mint newcomers (name required) or overwrite score for existing badges. Absolute scores.
    function syncPlayers(
        address[] calldata wallets,
        string[] calldata names,
        int256[] calldata scores
    ) external onlyMinter {
        uint256 n = wallets.length;
        if (n != names.length || n != scores.length) revert LengthMismatch();
        for (uint256 i; i < n; ++i) {
            address w = wallets[i];
            if (w == address(0)) revert ZeroAddress();
            uint256 id = tokenOf[w];
            if (id == 0) {
                _mint(w, names[i], scores[i]);
            } else {
                _players[id].score = scores[i];
                emit ScoreUpdated(id, w, scores[i]);
            }
        }
    }

    function transferFrom(address, address, uint256) public pure {
        revert Soulbound();
    }

    function safeTransferFrom(address, address, uint256) public pure {
        revert Soulbound();
    }

    function safeTransferFrom(address, address, uint256, bytes calldata) public pure {
        revert Soulbound();
    }

    function approve(address, uint256) public pure {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) public pure {
        revert Soulbound();
    }

    function getApproved(uint256) public pure returns (address) {
        return address(0);
    }

    function isApprovedForAll(address, address) public pure returns (bool) {
        return false;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == 0x01ffc9a7 || // ERC165
            interfaceId == 0x80ac58cd || // ERC721
            interfaceId == 0x5b5e139f; // ERC721Metadata
    }

    function _mint(address to, string memory handle, int256 score) internal {
        bytes memory raw = bytes(handle);
        if (raw.length < 3) revert EmptyName();
        if (raw.length > 24) revert NameTooLong();
        uint256 id = ++totalSupply;
        _ownerOf[id] = to;
        tokenOf[to] = id;
        _players[id] = Player({handle: handle, score: score});
        holders.push(to);
        emit Transfer(address(0), to, id);
        emit ScoreUpdated(id, to, score);
    }

    function _toString(uint256 value) private pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + (value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
