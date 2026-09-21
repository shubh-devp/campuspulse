const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const AI_DIR = path.join(__dirname, '..', '..', 'ai');
const DEFAULT_TIMEOUT_MS = 10000;

function resolvePythonBinary() {
  if (process.env.PYTHON_BIN) {
    return process.env.PYTHON_BIN;
  }

  const candidates = [
    path.join(AI_DIR, '.venv', 'Scripts', 'python.exe'), // Windows
    path.join(AI_DIR, '.venv', 'bin', 'python'), // macOS / Linux
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || 'python';
}

function timeoutMs() {
  return Number(process.env.AI_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
}


const workers = new Map();

const STARTUP_TIMEOUT_MS = 120000;

function startWorker(scriptName) {
  const child = spawn(resolvePythonBinary(), [path.join(AI_DIR, scriptName), '--serve'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const worker = { scriptName, child, queue: [], current: null, buffer: '', ready: false };
  workers.set(scriptName, worker);

  worker.startupTimer = setTimeout(() => {
    console.warn(`${scriptName} did not start in time, restarting it`);
    child.kill();
  }, STARTUP_TIMEOUT_MS);

  child.stdout.on('data', (chunk) => {
    worker.buffer += chunk;

    let newline = worker.buffer.indexOf('\n');
    while (newline !== -1) {
      const line = worker.buffer.slice(0, newline).trim();
      worker.buffer = worker.buffer.slice(newline + 1);

      if (line === 'READY') {
        clearTimeout(worker.startupTimer);
        worker.ready = true;
        sendNext(worker);
      } else if (line) {
        finishRequest(worker, line);
      }

      newline = worker.buffer.indexOf('\n');
    }
  });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString().trim();
    if (text) {
      console.warn(`${scriptName}:`, text.split('\n').pop());
    }
  });

  child.on('error', () => {
    workers.delete(scriptName);
    failPending(worker);
  });
  child.on('exit', () => {
    workers.delete(scriptName);
    failPending(worker);
  });

  child.stdin.on('error', () => {});

  return worker;
}

function getWorker(scriptName) {
  const worker = workers.get(scriptName);

  if (worker && worker.child.exitCode === null && !worker.child.killed) {
    return worker;
  }

  return startWorker(scriptName);
}

function finishRequest(worker, line) {
  const request = worker.current;

  if (!request) {
    return;
  }

  worker.current = null;
  clearTimeout(request.timer);

  try {
    request.resolve(JSON.parse(line));
  } catch {
    console.warn(`${worker.scriptName} ignored: output was not JSON`);
    request.resolve(null);
  }

  sendNext(worker);
}

function failPending(worker) {
  const pending = [worker.current, ...worker.queue].filter(Boolean);

  clearTimeout(worker.startupTimer);
  worker.current = null;
  worker.queue = [];
  pending.forEach((request) => {
    clearTimeout(request.timer);
    request.resolve(null);
  });
}

function sendNext(worker) {
  if (!worker.ready || worker.current || worker.queue.length === 0) {
    return;
  }

  const request = worker.queue.shift();
  worker.current = request;

  request.timer = setTimeout(() => {
    console.warn(`${worker.scriptName} timed out, restarting it`);
    worker.current = null;
    request.resolve(null);
    worker.child.kill();
  }, timeoutMs());

  worker.child.stdin.write(`${JSON.stringify(request.payload)}\n`);
}

// Resolves to null if the script could not start, crashed or timed out
function runWarmScript(scriptName, payload) {
  return new Promise((resolve) => {
    const worker = getWorker(scriptName);

    worker.queue.push({ payload, resolve, timer: null });
    sendNext(worker);
  });
}

function warmUp(scriptName) {
  try {
    getWorker(scriptName);
  } catch (error) {
    console.warn(`could not start ${scriptName}:`, error.message);
  }
}

module.exports = {
  runWarmScript,
  warmUp,
  resolvePythonBinary,
  AI_DIR,
  DEFAULT_TIMEOUT_MS,
};
