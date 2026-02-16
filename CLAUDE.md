# Clash Prototype - Development Guide

## Project Structure

The project lives in `clash_prototype/`. It's a Dojo game (Starknet) with:
- `src/` - Cairo contracts (models, systems, utils)
- `client/` - React + Vite frontend
- `dojo_dev.toml` - Dojo dev profile config

## Dev Server Startup (Order Matters)

The app is accessed at **https://clash.localtest.me/** (not localhost).

### 1. Start Katana (Starknet sequencer)
```sh
cd clash_prototype
katana --http.port 5051 --dev --dev.no-fee --http.cors_origins "https://clash.localtest.me"
```
- `--http.port 5051` (NOT `--port`)
- `--dev.no-fee` required or migrations fail with `InsufficientResourcesForValidate`
- `--http.cors_origins` required since app runs on clash.localtest.me

### 2. Deploy contracts
```sh
cd clash_prototype
sozo migrate --profile dev
```
Must run after every Katana restart (fresh state).

### 2b. Grant writer permissions
```sh
cd clash_prototype
sozo auth grant writer --profile dev \
  clash,clash-village \
  clash,clash-building_system \
  clash,clash-resource_system \
  clash,clash-training_system \
  clash,clash-combat_system \
  --max-calls 20
```
- Uses **namespace-level** grants (`clash,clash-<contract>`) so all models in the namespace are writable
- `--max-calls 20` sends all grants in a single transaction
- Must run after every `sozo migrate` (permissions reset with fresh Katana)
- Without this, transactions fail with "does NOT have WRITER role on model"
- **Important**: Make sure no browser tab is sending transactions while running this, or nonce conflicts will occur

### 3. Start Torii (indexer)
```sh
torii --world 0x00927fd3011efc85d029b88547d5c7334f954c44e6657073b8bf382342e66169 --rpc http://localhost:5051 --http.cors_origins "https://clash.localtest.me"
```
- `--http.cors_origins` (NOT `--allowed-origins`, that flag doesn't exist in v1.8.14)
- Must start AFTER contracts are deployed

### 4. Start client dev server
```sh
cd clash_prototype/client
npm run dev
```
Runs on localhost:5173, accessible via https://clash.localtest.me/

## Important Notes

- Katana v1.8.14 uses `--http.port`, not `--port`
- Torii v1.8.14 uses `--http.cors_origins`, not `--allowed-origins`
- Both Katana and Torii need CORS configured for `https://clash.localtest.me`
- If Katana restarts, you must: redeploy contracts (sozo migrate), grant permissions (sozo auth grant), then restart Torii
- World address: `0x00927fd3011efc85d029b88547d5c7334f954c44e6657073b8bf382342e66169`

## Key Addresses (from .env)
- World: `0x00927fd3011efc85d029b88547d5c7334f954c44e6657073b8bf382342e66169`
- Building System: `0x94e3dd61721e6f9847e6f7a09bf8664b42a7cf965a367e0cce83958db53693`
- Village System: `0x2bf054cb09539f5417a280b0606def19ce156865420755a29528d04376c7bcc`

## SDK API (Dojo SDK v1.0.4)
- `sdk.getEntities({ query: queryBuilder })` - query is a `ToriiQueryBuilder` instance (NOT `.build()`)
- `sdk.subscribeEntityQuery({ query: queryBuilder, callback })` - returns `[ToriiResponse, Subscription]`
- `ToriiResponse` is a `Pagination` object, use `.getItems()` to get entities
- `Subscription` has `.free()` method (not `.cancel()`)
