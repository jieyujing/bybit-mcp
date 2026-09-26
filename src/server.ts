import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ZodError, type ZodTypeAny } from 'zod';
import type { Request, Response } from 'express';
import { marketTools } from './tools/market/index.js';

type MarketTool = {
  name: string;
  description: string;
  inputSchema: ZodTypeAny;
  annotations?: Record<string, boolean>;
  handler: (input: Record<string, unknown>) => Promise<unknown>;
};

const tools: MarketTool[] = marketTools;

function createMarketServer(): Server {
  const server = new Server(
    { name: 'bybit-market-mcp', version: '2.1.22' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: zodToJsonSchema(tool.inputSchema, { target: 'openApi3' }),
      ...(tool.annotations ? { annotations: tool.annotations } : {}),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = tools.find((candidate) => candidate.name === name);

    if (!tool) {
      return {
        content: [{ type: 'text', text: 'Tool not found: ' + name }],
        isError: true,
      };
    }

    try {
      const parsed = tool.inputSchema.parse(args ?? {});
      const result = await tool.handler(parsed);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      const msg =
        err instanceof ZodError
          ? 'Validation error: ' +
            err.errors
              .map((e) => (e.path.join('.') || 'input') + ': ' + e.message)
              .join('; ')
          : 'Error: ' + (err instanceof Error ? err.message : String(err));
      return {
        content: [{ type: 'text', text: msg }],
        isError: true,
      };
    }
  });

  return server;
}

export async function startStdioServer(): Promise<void> {
  const server = createMarketServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    'bybit-market-mcp started on stdio — ' +
      tools.length +
      ' public market tool(s) registered',
  );
}

function parsePort(value: string | undefined): number {
  if (!value) return 3000;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid PORT value: ' + value);
  }
  return port;
}

function jsonRpcMethodNotAllowed() {
  return {
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'Method not allowed. Use POST for this stateless MCP endpoint.',
    },
    id: null,
  };
}

export async function startHttpServer(): Promise<void> {
  const host = process.env.HOST || '0.0.0.0';
  const port = parsePort(process.env.PORT);
  const mcpPath = process.env.MCP_PATH || '/mcp';
  const allowedHosts = process.env.MCP_ALLOWED_HOSTS
    ?.split(',')
    .map((hostName) => hostName.trim())
    .filter(Boolean);

  if (!mcpPath.startsWith('/')) {
    throw new Error('MCP_PATH must start with "/"');
  }

  const app = createMcpExpressApp({
    host,
    ...(allowedHosts?.length ? { allowedHosts } : {}),
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      service: 'bybit-market-mcp',
      transport: 'streamable-http',
      tools: tools.length,
    });
  });

  app.post(mcpPath, async (req: Request, res: Response) => {
    const server = createMarketServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    let closed = false;
    const close = async () => {
      if (closed) return;
      closed = true;
      await transport.close().catch(() => undefined);
      await server.close().catch(() => undefined);
    };

    res.on('close', () => {
      void close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('Failed to handle MCP request:', err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
      await close();
    }
  });

  app.get(mcpPath, (_req: Request, res: Response) => {
    res.status(405).set('Allow', 'POST').json(jsonRpcMethodNotAllowed());
  });

  app.delete(mcpPath, (_req: Request, res: Response) => {
    res.status(405).set('Allow', 'POST').json(jsonRpcMethodNotAllowed());
  });

  await new Promise<void>((resolve, reject) => {
    const httpServer = app.listen(port, host, () => {
      httpServer.off('error', reject);
      console.error(
        'bybit-market-mcp listening on http://' +
          host +
          ':' +
          port +
          mcpPath +
          ' — ' +
          tools.length +
          ' public market tool(s) registered',
      );
      resolve();
    });
    httpServer.once('error', reject);
  });
}
