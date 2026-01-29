/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TORII_URL: string
  readonly VITE_KATANA_URL: string
  readonly VITE_WORLD_ADDRESS: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
