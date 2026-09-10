/**
 * Port selection and server startup.
 *
 * Environment variables:
 *   HYPERMARK_PORT - Fixed port or inclusive range (default: random)
 *
 * Every session is local: the server binds loopback and advertises
 * localhost. Remote (SSH/devcontainer) and tailnet publication are not
 * supported, so nothing here consults a remote-mode switch.
 */

import { parsePortSelection } from "@hypermark/shared/port-range";

const LOOPBACK_HOST = "127.0.0.1";
const MAX_FIXED_PORT_RETRIES = 5;
const PORT_RETRY_DELAY_MS = 500;

/** Return whether a runtime listen failure represents an occupied address. */
function isAddressInUseError(err: unknown): boolean {
  return err instanceof Error && (
    (err as NodeJS.ErrnoException).code === "EADDRINUSE" ||
    err.message.includes("EADDRINUSE")
  );
}

function getServerPortConfiguration(): {
  ports: number[];
  isRange: boolean;
} {
  const envPort = process.env.HYPERMARK_PORT;
  if (envPort) {
    const parsed = parsePortSelection(envPort);
    if (parsed) {
      return { ports: parsed.ports, isRange: parsed.kind === "range" };
    }
    console.error(
      `[Hypermark] Warning: Invalid HYPERMARK_PORT "${envPort}", using default`
    );
  }

  // No env override: let the OS pick a free port.
  return { ports: [0], isRange: false };
}

/**
 * Start a Bun server on the first available configured port.
 *
 * Bounded ranges advance immediately after EADDRINUSE. A fixed port retains
 * the existing five-attempt retry behavior for transient conflicts.
 */
export async function startBunServerOnAvailablePort<TServer>(
  startServer: (port: number) => TServer,
): Promise<TServer> {
  const { ports: configuredPorts, isRange } = getServerPortConfiguration();
  const portsToTry = isRange
    ? configuredPorts
    : Array(MAX_FIXED_PORT_RETRIES).fill(configuredPorts[0]);

  for (const [index, port] of portsToTry.entries()) {
    try {
      return startServer(port);
    } catch (error: unknown) {
      if (!isAddressInUseError(error)) {
        throw error;
      }

      if (index < portsToTry.length - 1) {
        if (!isRange) {
          await Bun.sleep(PORT_RETRY_DELAY_MS);
        }
        continue;
      }

      if (!isRange) {
        throw new Error(
          `Port ${port} in use after ${MAX_FIXED_PORT_RETRIES} retries (set HYPERMARK_PORT to use a different port)`,
        );
      }

      const configured = `${configuredPorts[0]}-${configuredPorts.at(-1)}`;
      throw new Error(
        `Port selection ${configured} exhausted (set HYPERMARK_PORT to use a different port or range)`,
      );
    }
  }

  throw new Error("Failed to start server");
}

/** Every session binds loopback. */
export function getServerHostname(): string {
  return LOOPBACK_HOST;
}

/**
 * Compose the URL advertised to the user for a bound port. The server always
 * binds loopback, so this is always a localhost URL.
 */
export function buildAdvertisedUrl(port: number): string {
  return `http://localhost:${port}`;
}
