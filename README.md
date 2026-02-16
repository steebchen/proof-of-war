# Clash Prototype

A Clash of Clans-style prototype game built on Starknet using the Dojo framework.

## Features

- **Village Building**: Place and upgrade buildings on a 40x40 grid
- **Resource Management**: Gold mines and elixir collectors produce resources over time
- **Troop Training**: Train barbarians and archers in barracks
- **Combat System**: Attack other players' bases, deploy troops, and steal resources

## Project Structure

```
├── src/
│   ├── models/           # Dojo models (Player, Building, Army, Battle)
│   ├── systems/          # Game logic (village, building, resource, training, combat)
│   ├── utils/            # Configuration and constants
│   └── tests/            # Unit tests
├── client/               # React frontend
│   ├── src/
│   │   ├── components/   # UI components
│   │   ├── hooks/        # React hooks for game state
│   │   └── providers/    # Context providers
│   └── ...
├── Scarb.toml           # Cairo package config
└── dojo_dev.toml        # Dojo development config
```

## Prerequisites

- [Scarb](https://docs.swmansion.com/scarb/) 2.8.4
- [Dojo](https://book.dojoengine.org/) 1.0.12
- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/)

## Quick Start

### Backend

```bash
# Build the contracts
sozo build

# Run tests
sozo test

# Start local Katana
katana --dev --dev.no-fee

# Deploy to local network (in another terminal)
sozo migrate apply

# Start Torii indexer (in another terminal)
torii --world <WORLD_ADDRESS>
```

### Frontend

```bash
cd client
pnpm install

# Update .env with your world address
# VITE_WORLD_ADDRESS=<your_world_address>

# Start development server
pnpm dev
```

## Game Mechanics

### Buildings

| Building | Size | Cost | Description |
|----------|------|------|-------------|
| Town Hall | 4x4 | - | Main building, required for upgrades |
| Gold Mine | 3x3 | 150 Gold | Produces gold over time |
| Elixir Collector | 3x3 | 150 Gold | Produces elixir over time |
| Gold Storage | 3x3 | 300 Gold | Increases gold capacity |
| Elixir Storage | 3x3 | 300 Gold | Increases elixir capacity |
| Barracks | 3x3 | 200 Elixir | Trains troops |
| Army Camp | 4x4 | 250 Elixir | Houses troops |
| Cannon | 3x3 | 250 Gold | Ground defense |
| Archer Tower | 3x3 | 300 Elixir | Air & ground defense |
| Wall | 1x1 | 50 Gold | Defensive structure |

### Troops

| Troop | Housing | Cost | Description |
|-------|---------|------|-------------|
| Barbarian | 1 | 25 Elixir | Melee ground troop |
| Archer | 1 | 50 Elixir | Ranged ground troop |

### Combat

- Start an attack by selecting a target player
- Deploy troops on the edges of the battlefield
- Troops automatically target the nearest building
- Defenses (Cannon, Archer Tower) attack nearby troops
- Battle ends when all troops are destroyed or time runs out
- Steal up to 20% of defender's resources based on destruction

## License

MIT
