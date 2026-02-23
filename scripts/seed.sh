#!/bin/bash
# Seed script: creates test villages with buildings for attack testing.
# Run after: katana start, sozo migrate, sozo auth grant writer, torii start.
# Usage: ./scripts/seed.sh
#
# Creates 3 villages using katana1-3 prefunded accounts:
#   katana1 "Goblin"  - DiamondMine + GasCollector (easy target)
#   katana2 "Defender" - Cannon + DiamondMine (defended village)
#   katana4 "Farmer"   - DiamondMine + GasCollector + Barracks (medium target)
#
# Note: katana0 is used by the browser dev connector, so we skip it.
# Note: katana4 has an unusual private key that causes signing errors, so we skip it.

set -e

PROFILE="dev"
RPC="http://localhost:5051"

# Advance Katana block time by N seconds and mine an empty block,
# so the next transaction's block timestamp reflects the advanced time.
advance_time() {
  local seconds=$1
  curl -s -X POST "$RPC" -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"dev_increaseNextBlockTimestamp\",\"params\":[$seconds],\"id\":1}" > /dev/null
  curl -s -X POST "$RPC" -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"dev_generateBlock\",\"params\":[],\"id\":1}" > /dev/null
}

# Place a building and immediately finish it
# Args: account building_type x y building_id
place_and_finish() {
  local account=$1
  local btype=$2
  local x=$3
  local y=$4
  local bid=$5

  echo "  Placing building type=$btype at ($x,$y) → id=$bid"
  sozo execute --profile "$PROFILE" --katana-account "$account" \
    clash-building_system place_building "$btype" "$x" "$y"

  advance_time 120
  sozo execute --profile "$PROFILE" --katana-account "$account" \
    clash-building_system finish_upgrade "$bid"
}

# ── Village 1: katana1 "Goblin" ──────────────────────────────────
echo "=== Village 1: Goblin (katana1) ==="
sozo execute --profile "$PROFILE" --katana-account katana1 \
  clash-village spawn sstr:Goblin

# TownHall is building_id=1 at (18,18) 4x4
# First placed building gets building_id=2
place_and_finish katana1 1 14 18 2   # DiamondMine (3x3) left of TH
place_and_finish katana1 2 22 18 3   # GasCollector (3x3) right of TH

echo ""

# ── Village 2: katana2 "Defender" ────────────────────────────────
echo "=== Village 2: Defender (katana2) ==="
sozo execute --profile "$PROFILE" --katana-account katana2 \
  clash-village spawn sstr:Defender

place_and_finish katana2 7 14 18 2   # Cannon (3x3) left of TH
place_and_finish katana2 1 22 18 3   # DiamondMine (3x3) right of TH

echo ""

# ── Village 3: katana4 "Farmer" ──────────────────────────────────
echo "=== Village 3: Farmer (katana4) ==="
sozo execute --profile "$PROFILE" --katana-account katana4 \
  clash-village spawn sstr:Farmer

place_and_finish katana4 1 14 18 2   # DiamondMine (3x3) left of TH
place_and_finish katana4 2 22 18 3   # GasCollector (3x3) right of TH
place_and_finish katana4 5 18 22 4   # Barracks (3x3) below TH

echo ""
echo "Done! 3 test villages created."
echo "  katana1 → Goblin    (no defenses)"
echo "  katana2 → Defender  (has Cannon)"
echo "  katana4 → Farmer    (has Barracks)"
