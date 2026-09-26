import { startHttpServer, startStdioServer } from './server.js';

type TransportMode = 'stdio' | 'http';

function resolveTransportMode(): TransportMode {
  const args = process.argv.slice(2);
  const transportIndex = args.findIndex(
    (arg) => arg === '--transport' || arg.startsWith('--transport='),
  );

  let value: string | undefined;
  if (transportIndex >= 0) {
    const transportArg = args[transportIndex];
    value =
      transportArg === '--transport'
        ? args[transportIndex + 1]
        : transportArg.slice('--transport='.length);
  }

  value = (value || process.env.MCP_TRANSPORT || 'stdio').toLowerCase();

  if (value === 'stdio') return 'stdio';
  if (value === 'http' || value === 'streamable-http') return 'http';
  throw new Error('Unsupported transport "' + value + '". Use "stdio" or "http".');
}

async function main(): Promise<void> {
  const transport = resolveTransportMode();
  if (transport === 'http') {
    await startHttpServer();
  } else {
    await startStdioServer();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
