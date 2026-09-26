# Deploying the market-only MCP to Prefect Horizon

This fork exposes only Bybit's public market tools. It does not register account,
position, asset, trading, strategy, P2P, earn, or authenticated WebSocket tools.
No Bybit API key or secret is required.

## Runtime modes

- `npm start` starts a stateless Streamable HTTP MCP server for Horizon.
- `npm run start:stdio` starts the local stdio MCP transport.
- The CLI defaults to stdio when no transport flag is supplied.

## Build and run

```bash
npm ci
npm run typecheck
npm run build
npm start
```

The HTTP server binds to `0.0.0.0:3000` by default:

- MCP endpoint: `/mcp`
- Health endpoint: `/health`

Horizon can inject its assigned `PORT`. Optional variables:

- `HOST` — bind host, default `0.0.0.0`
- `PORT` — listen port, default `3000`
- `MCP_PATH` — MCP endpoint path, default `/mcp`
- `MCP_ALLOWED_HOSTS` — comma-separated Host-header allowlist

For a Horizon deployment, use the normal Node build command (`npm ci && npm run build`)
and start command (`npm start`). Point MCP clients at the deployed `/mcp` URL.

## Security boundary

This fork imports `src/tools/market/index.ts` directly instead of the upstream
`allTools` registry. Authenticated tools are therefore absent from `tools/list`
and cannot be invoked through this server.

The upstream release integrity/version gate is intentionally not executed by
this fork. A modified build cannot match Bybit's official release hashes, and
the server only exposes unauthenticated public market endpoints.
