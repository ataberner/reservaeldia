const fs = require("fs");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");
const { readClientEnvironment } = require("../shared/firebaseEnvironment.cjs");

const DEFAULT_PORT = 3100;

function parsePort(args) {
  if (args.length === 1) {
    const parsed = Number(args[0]);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if ((arg === "-p" || arg === "--port") && args[index + 1]) {
      const parsed = Number(args[index + 1]);
      if (Number.isInteger(parsed) && parsed > 0) return parsed;
    }
    if (arg.startsWith("--port=")) {
      const parsed = Number(arg.slice("--port=".length));
      if (Number.isInteger(parsed) && parsed > 0) return parsed;
    }
  }

  const envPort = Number(process.env.PORT || process.env.NEXT_DEV_PORT);
  if (Number.isInteger(envPort) && envPort > 0) return envPort;
  return DEFAULT_PORT;
}

function hasPortArg(args) {
  return args.some(
    (arg) =>
      arg === "-p" ||
      arg === "--port" ||
      arg.startsWith("--port=") ||
      (args.length === 1 && Number.isInteger(Number(arg)) && Number(arg) > 0)
  );
}

function normalizeForwardedArgs(args) {
  if (args.length === 1) {
    const parsed = Number(args[0]);
    if (Number.isInteger(parsed) && parsed > 0) return [];
  }
  return args;
}

function isHostPortAvailable(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

async function isPortAvailable(port) {
  const checks = await Promise.all([
    isHostPortAvailable(port, "0.0.0.0"),
    isHostPortAvailable(port, "::"),
  ]);
  return checks.every(Boolean);
}

async function main() {
  readClientEnvironment();
  if (!process.env.RESERVA_LOCAL_SESSION || path.resolve(process.cwd()) !== path.resolve(process.env.RESERVA_LOCAL_SESSION, "workspace")) {
    throw new Error("Usar npm run dev: Next sólo se inicia dentro de la copia aislada.");
  }
  const forwardedArgs = process.argv.slice(2);
  const port = parsePort(forwardedArgs);
  const available = await isPortAvailable(port);

  if (!available) {
    console.error(
      `El puerto ${port} ya esta en uso. Reutiliza http://localhost:${port} o cerra ese dev server antes de iniciar otro.`
    );
    process.exit(1);
  }

  const cwd = process.cwd();
  const distDir = `.next-dev-${port}`;
  const distPath = path.join(cwd, distDir);
  if (fs.existsSync(distPath)) throw new Error("La sesión ya tiene una caché Next; iniciar una nueva sesión con npm run dev.");

  const nextBin = path.join(cwd, "node_modules", "next", "dist", "bin", "next");
  const nextForwardedArgs = normalizeForwardedArgs(forwardedArgs);
  const nextArgs = ["dev", "--hostname", "127.0.0.1"];
  if (!hasPortArg(forwardedArgs)) {
    nextArgs.push("-p", String(port));
  }
  nextArgs.push(...nextForwardedArgs);

  const child = spawn(process.execPath, [nextBin, ...nextArgs], {
    cwd,
    env: {
      ...process.env,
      NEXT_DEV_DIST_DIR: distDir,
      PORT: String(port),
    },
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
