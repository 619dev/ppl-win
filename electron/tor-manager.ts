import { app, net, session } from 'electron'
import { ChildProcess, spawn } from 'child_process'
import { createServer } from 'net'
import { appendFileSync, existsSync, mkdirSync } from 'fs'
import path from 'path'

export type TorStatus = 'OFF' | 'STARTING' | 'ON' | 'STOPPING' | 'FETCHING_WEBTUNNEL' | 'STARTING_WEBTUNNEL' | 'WEBTUNNEL_ERROR'

export interface TorState {
  status: TorStatus
  host: string
  port: number
  ready: boolean
  transport: 'direct' | 'webtunnel'
  bootstrap?: number
  error?: string
}

interface BridgeStore {
  get(key: string): unknown
  set(key: string, value: unknown): void
}

const DIRECT_TIMEOUT_MS = 20_000
const WEBTUNNEL_TIMEOUT_MS = 60_000
const MAX_WEBTUNNEL_BRIDGES = 5
const MOAT_URL = 'https://bridges.torproject.org/moat/circumvention/settings'
const BRIDGE_CACHE_KEY = 'torWebTunnelBridge'

export class EmbeddedTorManager {
  private child: ChildProcess | null = null
  private listeners = new Set<(state: TorState) => void>()
  private timer: NodeJS.Timeout | null = null
  private generation = 0
  private stopping = false
  private logBuffer = ''
  private webTunnelQueue: string[] = []
  private state: TorState = {
    status: 'OFF', host: '127.0.0.1', port: 0, ready: false, transport: 'direct', bootstrap: 0,
  }

  constructor(private readonly store: BridgeStore) {}

  getState(): TorState { return { ...this.state } }

  onState(listener: (state: TorState) => void): () => void {
    this.listeners.add(listener)
    listener(this.getState())
    return () => this.listeners.delete(listener)
  }

  async start(): Promise<TorState> {
    if (this.child && ['STARTING', 'FETCHING_WEBTUNNEL', 'STARTING_WEBTUNNEL', 'ON'].includes(this.state.status)) {
      return this.getState()
    }
    this.stopping = false
    this.webTunnelQueue = []
    await this.launch('direct')
    return this.getState()
  }

  async stop(): Promise<void> {
    this.stopping = true
    this.clearTimer()
    this.update({ status: 'STOPPING', ready: false })
    await this.stopChild()
    await session.defaultSession.setProxy({ mode: 'direct' })
    this.update({ status: 'OFF', port: 0, ready: false, bootstrap: 0, transport: 'direct', error: undefined })
  }

  private runtimeRoot(): string {
    const folder = process.platform === 'win32'
      ? 'win32-x64'
      : `darwin-${process.arch === 'arm64' ? 'arm64' : 'x64'}`
    const packaged = path.join(process.resourcesPath, 'tor', folder)
    const development = path.join(app.getAppPath(), 'resources', 'tor', folder)
    const root = app.isPackaged ? packaged : development
    if (!existsSync(path.join(root, 'tor', this.binaryName('tor')))) throw new Error(`Bundled Tor runtime is missing: ${root}`)
    return root
  }

  private binaryName(name: string): string {
    return process.platform === 'win32' ? `${name}.exe` : name
  }

  private async launch(transport: 'direct' | 'webtunnel', bridge?: string): Promise<void> {
    this.clearTimer()
    // Invalidate callbacks from the current child before terminating it.
    const generation = ++this.generation
    await this.stopChild()
    const port = await this.reservePort()
    const root = this.runtimeRoot()
    const torDirectory = path.join(root, 'tor')
    const torBinary = path.join(torDirectory, this.binaryName('tor'))
    const lyrebirdBinary = path.join('pluggable_transports', this.binaryName('lyrebird'))
    const dataDirectory = path.join(app.getPath('userData'), 'tor', transport)
    mkdirSync(dataDirectory, { recursive: true })

    const args = [
      '--ignore-missing-torrc',
      '--DataDirectory', dataDirectory,
      '--SocksPort', `127.0.0.1:${port}`,
      '--GeoIPFile', path.join(root, 'data', 'geoip'),
      '--GeoIPv6File', path.join(root, 'data', 'geoip6'),
      '--ClientOnly', '1',
      '--AvoidDiskWrites', '1',
      '--Log', 'notice stdout',
    ]
    if (transport === 'webtunnel' && bridge) {
      args.push(
        '--UseBridges', '1',
        // Tor's configuration parser does not reliably preserve quotes around
        // Windows paths. Run Tor from its own directory and use a space-free
        // relative path for the managed transport executable instead.
        '--ClientTransportPlugin', `webtunnel exec ${lyrebirdBinary}`,
        '--Bridge', bridge,
      )
    }

    this.state = {
      status: transport === 'direct' ? 'STARTING' : 'STARTING_WEBTUNNEL',
      host: '127.0.0.1', port, ready: false, transport, bootstrap: 0,
    }
    this.logBuffer = ''
    this.publish()

    const child = spawn(torBinary, args, {
      cwd: torDirectory,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.child = child
    const consume = (chunk: Buffer) => this.consumeLog(chunk.toString(), generation)
    child.stdout?.on('data', consume)
    child.stderr?.on('data', consume)
    child.on('error', error => this.fail(error, generation))
    child.on('exit', (code, signal) => {
      if (generation !== this.generation || this.stopping) return
      if (!this.state.ready) this.fail(new Error(`Tor exited before bootstrap (code ${code ?? 'none'}, signal ${signal ?? 'none'})`), generation)
    })

    this.timer = setTimeout(() => {
      if (generation !== this.generation || this.state.ready) return
      if (transport === 'direct') void this.startWebTunnelFallback()
      else void this.tryNextWebTunnel(generation)
    }, transport === 'direct' ? DIRECT_TIMEOUT_MS : WEBTUNNEL_TIMEOUT_MS)
  }

  private consumeLog(text: string, generation: number): void {
    if (generation !== this.generation) return
    this.writeLog(text)
    const lines = `${this.logBuffer}${text}`.split(/\r?\n/)
    this.logBuffer = lines.pop() ?? ''
    for (const line of lines) {
      const match = line.match(/Bootstrapped\s+(\d+)%/)
      if (match) {
        const bootstrap = Number(match[1])
        this.update({ bootstrap })
        if (bootstrap === 100) void this.markReady(generation)
      }
      if (this.state.transport === 'webtunnel' && /(?:Managed proxy|Pluggable Transport).*(?:failed|terminated)|Could not launch managed proxy/i.test(line)) {
        this.fail(new Error(`lyrebird failed: ${line.trim()}`), generation)
        return
      }
      if (/\[err\]|Problem bootstrapping|Unable to find IPv4 address/i.test(line)) console.warn('[Tor]', line)
    }
  }

  private async markReady(generation: number): Promise<void> {
    if (generation !== this.generation || this.state.ready) return
    this.clearTimer()
    await session.defaultSession.setProxy({
      proxyRules: `socks5://127.0.0.1:${this.state.port}`,
      proxyBypassRules: '<local>,localhost,127.0.0.1',
    })
    await session.defaultSession.closeAllConnections()
    if (generation !== this.generation) return
    this.update({ status: 'ON', ready: true, bootstrap: 100, error: undefined })
  }

  private async startWebTunnelFallback(): Promise<void> {
    const fallbackGeneration = ++this.generation
    this.clearTimer()
    await this.stopChild()
    this.update({ status: 'FETCHING_WEBTUNNEL', ready: false, transport: 'webtunnel', bootstrap: 0, error: undefined })
    let bridges: string[] = []
    try {
      bridges = await this.fetchLatestWebTunnels()
      this.store.set(BRIDGE_CACHE_KEY, bridges)
    } catch (error) {
      console.warn('[Tor] Moat fetch failed, trying cached WebTunnel bridge:', error)
      bridges = this.validBridges(this.store.get(BRIDGE_CACHE_KEY))
    }
    if (fallbackGeneration !== this.generation) return
    if (bridges.length === 0) {
      this.fail(new Error('Tor Project Moat did not return a valid WebTunnel bridge'), fallbackGeneration)
      return
    }
    const [bridge, ...remaining] = bridges
    this.webTunnelQueue = remaining
    await this.launch('webtunnel', bridge)
  }

  private async fetchLatestWebTunnels(): Promise<string[]> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)
    try {
      // Electron's network stack honors defaultSession proxy settings. The
      // Node.js global fetch bypasses them, which prevents Moat access on
      // networks where the user configured an HTTP/SOCKS proxy in the app.
      const response = await net.fetch(MOAT_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/vnd.api+json',
          accept: 'application/json',
          'user-agent': `PaperPhoneLite/3.0.17 (${process.platform === 'win32' ? 'Windows' : 'macOS'})`,
        },
        body: JSON.stringify({ country: 'cn', transports: ['webtunnel'] }),
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`Moat returned HTTP ${response.status}`)
      const payload = await response.json() as { settings?: Array<{ bridges?: { type?: string; bridge_strings?: string[] } }> }
      const bridges: string[] = []
      for (const item of payload.settings ?? []) {
        if (item.bridges?.type !== 'webtunnel') continue
        for (const candidate of item.bridges.bridge_strings ?? []) {
          const bridge = this.validBridge(candidate)
          if (bridge && !bridges.includes(bridge)) bridges.push(bridge)
          if (bridges.length >= MAX_WEBTUNNEL_BRIDGES) return bridges
        }
      }
      if (bridges.length === 0) throw new Error('No WebTunnel bridge returned')
      return bridges
    } finally {
      clearTimeout(timeout)
    }
  }

  private validBridge(input: unknown): string | null {
    if (typeof input !== 'string') return null
    const value = input.trim()
    if (!value.startsWith('webtunnel ') || /[\r\n]/.test(value) || !/\surl=https:\/\//.test(value) || !/\sver=[0-9.]+(?:\s|$)/.test(value)) return null
    return /\sutls=/.test(value) ? value : `${value} utls=none`
  }

  private validBridges(input: unknown): string[] {
    const candidates = Array.isArray(input) ? input : [input]
    return candidates
      .map(candidate => this.validBridge(candidate))
      .filter((bridge): bridge is string => Boolean(bridge))
      .slice(0, MAX_WEBTUNNEL_BRIDGES)
  }

  private async tryNextWebTunnel(generation: number): Promise<void> {
    if (generation !== this.generation) return
    const bridge = this.webTunnelQueue.shift()
    if (!bridge) {
      this.fail(new Error('All available WebTunnel bridges timed out'), generation)
      return
    }
    this.writeLog(`WebTunnel timed out; trying another bridge (${this.webTunnelQueue.length + 1} remaining)\n`)
    await this.launch('webtunnel', bridge)
  }

  private writeLog(text: string): void {
    try {
      const logDirectory = path.join(app.getPath('userData'), 'logs')
      mkdirSync(logDirectory, { recursive: true })
      appendFileSync(
        path.join(logDirectory, 'tor.log'),
        `[${new Date().toISOString()}] ${text}`,
        { encoding: 'utf8' },
      )
    } catch (error) {
      console.warn('[Tor] Unable to write diagnostic log:', error)
    }
  }

  private fail(error: Error, generation: number): void {
    if (generation !== this.generation) return
    this.generation += 1
    this.clearTimer()
    console.error('[Tor]', error)
    this.writeLog(`ERROR: ${error.message}\n`)
    this.update({ status: 'WEBTUNNEL_ERROR', ready: false, error: error.message })
    void this.stopChild()
  }

  private async stopChild(): Promise<void> {
    const child = this.child
    this.child = null
    if (!child || child.exitCode !== null) return
    await new Promise<void>(resolve => {
      const force = setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL') }, 3_000)
      child.once('exit', () => { clearTimeout(force); resolve() })
      child.kill('SIGTERM')
    })
  }

  private reservePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer()
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        const port = typeof address === 'object' && address ? address.port : 0
        server.close(error => error ? reject(error) : resolve(port))
      })
    })
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private update(patch: Partial<TorState>): void {
    this.state = { ...this.state, ...patch }
    this.publish()
  }

  private publish(): void {
    const state = this.getState()
    for (const listener of this.listeners) listener(state)
  }
}
