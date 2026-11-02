// `npm run qa:start` and `npm run qa:stop`: run the game server in the background for the
// qa-tester, and stop it again. The server is started with `node` directly (not through npm or a
// shell), so the process id written to the pid file is the server's own and stopping it works on
// Windows as well as elsewhere.
import { spawn, spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { connect } from 'node:net';
import { join } from 'node:path';
import { argv, cwd, env, execPath, exit, kill, platform, stdout } from 'node:process';
import { setTimeout } from 'node:timers';

const PORT = Number(env.PORT ?? 8787);
const HOST = '127.0.0.1';
const READY_TIMEOUT_MS = 15_000;
const POLL_MS = 100;

const root = cwd();
const stateDirectory = join(root, 'node_modules', '.cache', 'quiz-versus');
const pidFile = join(stateDirectory, 'qa-server.pid');
const logFile = join(stateDirectory, 'qa-server.log');
const serverEntry = join(root, 'packages', 'worker', 'dist', 'src', 'main.js');

const say = (text) => stdout.write(`${text}\n`);

function isAlive(pid) {
  try {
    kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPid() {
  if (!existsSync(pidFile)) return undefined;
  const pid = Number(readFileSync(pidFile, 'utf8').trim());
  return Number.isInteger(pid) && pid > 0 ? pid : undefined;
}

/** True once something accepts connections on the port. */
function accepts() {
  return new Promise((resolve) => {
    const socket = connect({ port: PORT, host: HOST }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });
}

async function waitUntilReady(child) {
  let exited = false;
  child.once('exit', () => {
    exited = true;
  });
  for (let waited = 0; waited < READY_TIMEOUT_MS; waited += POLL_MS) {
    if (exited) return false;
    if (await accepts()) return true;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return false;
}

function build() {
  const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
  return spawnSync(execPath, [tsc, '-b'], { stdio: 'inherit' }).status === 0;
}

async function start() {
  const running = readPid();
  if (running !== undefined && isAlive(running)) {
    say(`The server is already running (process ${running}) at http://localhost:${PORT}`);
    return 0;
  }
  rmSync(pidFile, { force: true });
  if (await accepts()) {
    say(`Port ${PORT} is already in use by something else. Free it or set PORT.`);
    return 1;
  }
  if (!build()) return 1;
  mkdirSync(stateDirectory, { recursive: true });
  const log = openSync(logFile, 'w');
  const child = spawn(execPath, [serverEntry], {
    cwd: root,
    detached: true,
    stdio: ['ignore', log, log],
    env: { ...env, PORT: String(PORT), HOST },
  });
  closeSync(log);
  child.unref();
  if (child.pid === undefined || !(await waitUntilReady(child))) {
    say(`The server did not start. See ${logFile}`);
    return 1;
  }
  writeFileSync(pidFile, String(child.pid));
  say(`Server running (process ${child.pid}) at http://localhost:${PORT}`);
  return 0;
}

function stop() {
  const pid = readPid();
  rmSync(pidFile, { force: true });
  if (pid === undefined || !isAlive(pid)) {
    say('No server was running.');
    return 0;
  }
  if (platform === 'win32')
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  else kill(pid, 'SIGTERM');
  say(`Server stopped (process ${pid}).`);
  return 0;
}

const command = argv[2];
if (command === 'start') exit(await start());
else if (command === 'stop') exit(stop());
else {
  say('Usage: node scripts/qa-server.mjs start|stop');
  exit(2);
}
