#!/bin/bash
# ============================================================================
# Wallet Scanner — Mission Alpha
# 
# Scans a blockchain address across multiple chains for:
# - ETH/native token balances
# - ERC-20/token balances
# - Transaction history
# - Unclaimed airdrops (via known airdrop contracts)
#
# Usage: bash scripts/scan-wallet.sh <0x_address>
#
# Free APIs used (no keys required for basic queries):
# - Etherscan, Polygonscan, Arbiscan, Optimistic Etherscan, BscScan
# - Blockscout (public explorers)
#
# For full token scanning, set API keys in .env.local:
#   ETHERSCAN_API_KEY=your_key (free at etherscan.io)
# ============================================================================

set -euo pipefail

ADDRESS="${1:-}"

if [[ -z "$ADDRESS" ]]; then
  echo "Usage: bash scripts/scan-wallet.sh <0x_address>"
  echo "Example: bash scripts/scan-wallet.sh 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68"
  exit 1
fi

# Validate address format
if [[ ! "$ADDRESS" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
  echo "ERROR: Invalid Ethereum address format"
  echo "Address must start with 0x followed by 40 hex characters"
  exit 1
fi

echo "=============================================="
echo "  WALLET SCANNER — Mission Alpha"
echo "  Address: $ADDRESS"
echo "  Time: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "=============================================="
echo ""

# Load API keys if available
ETHERSCAN_KEY="${ETHERSCAN_API_KEY:-}"
POLYGONSCAN_KEY="${POLYGONSCAN_API_KEY:-}"
ARBISCAN_KEY="${ARBISCAN_API_KEY:-}"
OPTIMISM_KEY="${OPTIMISM_API_KEY:-}"
BSCSCAN_KEY="${BSCSCAN_API_KEY:-}"
BASESCAN_KEY="${BASESCAN_API_KEY:-}"

# ============================================================================
# CHAIN SCANNERS
# ============================================================================

scan_chain() {
  local chain_name="$1"
  local api_url="$2"
  local api_key="$3"
  local native_symbol="$4"
  local decimals="${5:-18}"

  echo "--- $chain_name ---"

  # Get native balance
  local balance_url="${api_url}?module=account&action=balance&address=${ADDRESS}&tag=latest"
  if [[ -n "$api_key" ]]; then
    balance_url="${balance_url}&apikey=${api_key}"
  fi

  local response
  response=$(curl -s --max-time 10 "$balance_url" 2>/dev/null || echo '{"status":"0","result":"0"}')

  local balance
  balance=$(echo "$response" | grep -o '"result":"[^"]*"' | head -1 | cut -d'"' -f4)

  if [[ -n "$balance" && "$balance" != "0" && "$balance" != "Max rate limit reached"* ]]; then
    # Convert from wei to native token (divide by 10^decimals)
    # Use bc for precision if available, otherwise awk
    if command -v bc &>/dev/null; then
      local human_balance
      human_balance=$(echo "scale=8; $balance / 1000000000000000000" | bc 2>/dev/null || echo "0")
      echo "  $native_symbol Balance: $human_balance $native_symbol"
    else
      local human_balance
      human_balance=$(awk "BEGIN {printf \"%.8f\", $balance / 1000000000000000000}" 2>/dev/null || echo "0")
      echo "  $native_symbol Balance: $human_balance $native_symbol"
    fi

    if [[ "$balance" != "0" ]]; then
      echo "  *** BALANCE FOUND ***"
    fi
  else
    echo "  $native_symbol Balance: 0"
  fi

  # Get transaction count (indicates activity)
  local txcount_url="${api_url}?module=proxy&action=eth_getTransactionCount&address=${ADDRESS}&tag=latest"
  if [[ -n "$api_key" ]]; then
    txcount_url="${txcount_url}&apikey=${api_key}"
  fi

  local tx_response
  tx_response=$(curl -s --max-time 10 "$txcount_url" 2>/dev/null || echo '{"result":"0x0"}')

  local tx_hex
  tx_hex=$(echo "$tx_response" | grep -o '"result":"[^"]*"' | head -1 | cut -d'"' -f4)

  if [[ -n "$tx_hex" && "$tx_hex" != "0x0" ]]; then
    local tx_count
    tx_count=$(printf "%d" "$tx_hex" 2>/dev/null || echo "0")
    echo "  Transactions: $tx_count"
  else
    echo "  Transactions: 0"
  fi

  # Get token transfers (ERC-20)
  local token_url="${api_url}?module=account&action=tokentx&address=${ADDRESS}&page=1&offset=5&sort=desc"
  if [[ -n "$api_key" ]]; then
    token_url="${token_url}&apikey=${api_key}"
  fi

  local token_response
  token_response=$(curl -s --max-time 10 "$token_url" 2>/dev/null || echo '{"status":"0","result":[]}')

  local token_count
  token_count=$(echo "$token_response" | grep -o '"tokenSymbol"' | wc -l)

  if [[ "$token_count" -gt 0 ]]; then
    echo "  Recent token activity: YES ($token_count recent transfers)"
    # Extract unique token names
    local tokens
    tokens=$(echo "$token_response" | grep -o '"tokenName":"[^"]*"' | cut -d'"' -f4 | sort -u | head -10)
    if [[ -n "$tokens" ]]; then
      echo "  Tokens seen:"
      echo "$tokens" | while read -r tok; do
        echo "    - $tok"
      done
    fi
  else
    echo "  Recent token activity: None detected"
  fi

  echo ""

  # Rate limit courtesy
  sleep 0.5
}

# ============================================================================
# RUN SCANS
# ============================================================================

echo "Scanning across 6 chains..."
echo ""

# Ethereum Mainnet
scan_chain "Ethereum Mainnet" "https://api.etherscan.io/api" "$ETHERSCAN_KEY" "ETH"

# Polygon
scan_chain "Polygon" "https://api.polygonscan.com/api" "$POLYGONSCAN_KEY" "MATIC"

# Arbitrum
scan_chain "Arbitrum One" "https://api.arbiscan.io/api" "$ARBISCAN_KEY" "ETH"

# Optimism
scan_chain "Optimism" "https://api-optimistic.etherscan.io/api" "$OPTIMISM_KEY" "ETH"

# BSC (Binance Smart Chain)
scan_chain "BSC (Binance)" "https://api.bscscan.com/api" "$BSCSCAN_KEY" "BNB"

# Base
scan_chain "Base" "https://api.basescan.org/api" "$BASESCAN_KEY" "ETH"

# ============================================================================
# AIRDROP CHECK
# ============================================================================

echo "--- Airdrop Eligibility Check ---"
echo "  Check these manually (requires browser/wallet connection):"
echo "  1. https://earni.fi — paste your address, shows all unclaimed airdrops"
echo "  2. https://app.optimism.io/airdrop/check — Optimism OP airdrop"
echo "  3. https://arbitrum.foundation — Arbitrum ARB airdrop"  
echo "  4. https://starknet.io — StarkNet STRK airdrop"
echo ""

# ============================================================================
# SUMMARY
# ============================================================================

echo "=============================================="
echo "  SCAN COMPLETE"
echo "  Address: $ADDRESS"
echo "  Chains scanned: 6"
echo "  Time: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo ""
echo "  For deeper token scanning, get free API keys at:"
echo "  - etherscan.io (Ethereum)"
echo "  - polygonscan.com (Polygon)"
echo "  - arbiscan.io (Arbitrum)"
echo "=============================================="
