import { Connector } from '@starknet-react/core'
import { Account, RpcProvider, type AccountInterface, type ProviderInterface } from 'starknet'

// Katana prefunded account (from dojo_dev.toml)
const KATANA_PREFUNDED_ADDRESS = '0x127fd5f1fe78a71f8bcd1fec63e3fe2f0486b6ecd5c86a0466c3a21fa5cfcec'
const KATANA_PREFUNDED_PRIVATE_KEY = '0xc5b2fcab997346f3ea1c00b002ecf6f382c5f9c9659a3894eb783c5320f912'
const KATANA_CHAIN_ID = BigInt('0x4b4154414e41') // KATANA

type ConnectorIcon = {
  dark: string
  light: string
}

export class DevConnector extends Connector {
  private _account: Account
  private _provider: RpcProvider
  private _connected: boolean = false

  constructor(rpcUrl: string) {
    super()
    this._provider = new RpcProvider({ nodeUrl: rpcUrl })
    this._account = new Account({
      provider: this._provider,
      address: KATANA_PREFUNDED_ADDRESS,
      signer: KATANA_PREFUNDED_PRIVATE_KEY,
    })
  }

  get id(): string {
    return 'dev-connector'
  }

  get name(): string {
    return 'Dev Account'
  }

  get icon(): ConnectorIcon {
    return {
      dark: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23fff"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>',
      light: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23000"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>',
    }
  }

  available(): boolean {
    return true
  }

  async chainId(): Promise<bigint> {
    return KATANA_CHAIN_ID
  }

  async ready(): Promise<boolean> {
    return this._connected
  }

  async connect(): Promise<{ account?: string; chainId?: bigint }> {
    this._connected = true
    return {
      account: KATANA_PREFUNDED_ADDRESS,
      chainId: KATANA_CHAIN_ID,
    }
  }

  async disconnect(): Promise<void> {
    this._connected = false
    this.emit('disconnect')
  }

  async account(_provider: ProviderInterface): Promise<AccountInterface> {
    return this._account
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async request(call: { type: string; params?: any }): Promise<any> {
    const { type, params } = call

    switch (type) {
      case 'wallet_requestChainId':
        return `0x${KATANA_CHAIN_ID.toString(16)}`

      case 'wallet_getPermissions':
        if (this._connected) return ['accounts']
        return []

      case 'wallet_requestAccounts':
        return [KATANA_PREFUNDED_ADDRESS]

      case 'wallet_addStarknetChain':
        return true

      case 'wallet_watchAsset':
        return true

      case 'wallet_switchStarknetChain':
        return true

      case 'wallet_addInvokeTransaction': {
        if (!params) throw new Error('Params are missing')
        const { calls } = params
        const transformedCalls = calls.map((call: { contract_address: string; entry_point: string; calldata: string[] }) => ({
          contractAddress: call.contract_address,
          entrypoint: call.entry_point,
          calldata: call.calldata,
        }))
        // Skip fee estimation for dev mode (Katana with --dev.no-fee)
        const result = await this._account.execute(transformedCalls, { skipValidate: true } as any)
        return { transaction_hash: result.transaction_hash }
      }

      case 'wallet_signTypedData': {
        if (!params) throw new Error('Params are missing')
        return await this._account.signMessage(params)
      }

      default:
        throw new Error(`Unsupported request type: ${type}`)
    }
  }
}
