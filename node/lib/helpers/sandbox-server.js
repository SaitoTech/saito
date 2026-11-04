/**
 * Server/Node sandbox using worker_threads.
 *
 * Not imported by browser code or Lite Client bundles. Jest tests mock
 * ./sandbox-browser with this module so executeJS can run without a DOM.
 *
 * Same public surface as createSandbox() in sandbox-browser.js:
 *   initialize() / execute(...) / terminate()
 */

const { Worker } = require('worker_threads');

function jsonSafeClone(value, label) {
  try {
    return JSON.parse(JSON.stringify(value === undefined ? null : value));
  } catch (err) {
    throw new Error(`Invalid ${label}: ${err.message}`);
  }
}

function measureMessageSize(message) {
  return JSON.stringify(message).length;
}

function getNodeWorkerBootstrapSource() {
  return `
'use strict';
(function () {
  var { parentPort } = require('worker_threads');
  var pendingCaps = Object.create(null);
  var nextCapId = 1;
  var terminated = false;

  function reply(type, requestId, ok, value, error) {
    var msg = { type: type, requestId: requestId, ok: ok };
    if (ok) {
      msg.value = value;
    } else {
      msg.error = error || 'Unknown error';
    }
    parentPort.postMessage(msg);
  }

  function apiCall(namespace, method, args) {
    var requestId = nextCapId++;
    return new Promise(function (resolve, reject) {
      pendingCaps[requestId] = { resolve: resolve, reject: reject };
      parentPort.postMessage({
        type: 'API_REQUEST',
        requestId: requestId,
        namespace: namespace,
        method: method,
        args: args || []
      });
    });
  }

  function buildApi(descriptors) {
    var iface = Object.create(null);
    var namespaces = Object.keys(descriptors || {});
    for (var i = 0; i < namespaces.length; i++) {
      var ns = namespaces[i];
      var methods = descriptors[ns] || [];
      var obj = Object.create(null);
      for (var j = 0; j < methods.length; j++) {
        (function (namespace, method) {
          obj[method] = function () {
            var args = Array.prototype.slice.call(arguments);
            return apiCall(namespace, method, args);
          };
        })(ns, methods[j]);
      }
      iface[ns] = obj;
    }
    return iface;
  }

  function runUserSource(source, paramNames, paramValues) {
    var AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    var body = String(source) + '\\n';
    var fn = AsyncFunction.apply(null, paramNames.concat([body]));
    return fn.apply(null, paramValues);
  }

  parentPort.on('message', async function (msg) {
    if (!msg || typeof msg !== 'object' || terminated) {
      return;
    }

    if (msg.type === 'API_RESULT') {
      var waiter = pendingCaps[msg.requestId];
      if (!waiter) {
        return;
      }
      delete pendingCaps[msg.requestId];
      if (msg.ok) {
        waiter.resolve(msg.value);
      } else {
        waiter.reject(new Error(msg.error || 'Api request failed'));
      }
      return;
    }

    if (msg.type === 'TERMINATE') {
      terminated = true;
      var ids = Object.keys(pendingCaps);
      for (var i = 0; i < ids.length; i++) {
        pendingCaps[ids[i]].reject(new Error('Execution terminated'));
        delete pendingCaps[ids[i]];
      }
      return;
    }

    if (msg.type === 'EXEC') {
      try {
        var built = buildApi(msg.api || {});
        var api = built.api || Object.create(null);
        var context = msg.context || {};
        var args = Array.isArray(msg.args) ? msg.args : [];
        var paramNames = ['api', 'context', 'args'];
        var paramValues = [api, context, args];
        var result = await runUserSource(msg.source || '', paramNames, paramValues);
        reply('EXEC_RESULT', msg.requestId, true, result === undefined ? null : result);
      } catch (err) {
        reply('EXEC_RESULT', msg.requestId, false, null, err && err.message ? err.message : String(err));
      }
    }
  });

  parentPort.postMessage({ type: 'WORKER_READY' });
})();
`;
}

function createSandbox() {
  const state = {
    terminated: false,
    initialized: false,
    worker: null,
    nextRequestId: 1,
    pending: new Map(),
    currentHandlers: null,
    messageCount: 0,
    maxMessages: 1000,
    maxMessageSize: 2 * 1024 * 1024,
    queue: Promise.resolve()
  };

  function rejectAll(reason) {
    for (const [, pending] of state.pending) {
      pending.reject(reason);
    }
    state.pending.clear();
  }

  function postToIsolate(payload) {
    if (!state.worker) {
      throw new Error('Sandbox worker is not available');
    }
    state.worker.postMessage(payload);
  }

  async function handleApiRequest(msg) {
    const requestId = msg.requestId;
    const handlers = state.currentHandlers;
    try {
      if (!handlers || typeof msg.namespace !== 'string' || typeof msg.method !== 'string') {
        throw new Error('Malformed api request');
      }
      if (!handlers[msg.namespace] || !handlers[msg.namespace][msg.method]) {
        throw new Error(`Unauthorized api: ${msg.namespace}.${msg.method}`);
      }
      const args = jsonSafeClone(msg.args || [], 'api args');
      const entry = handlers[msg.namespace][msg.method];
      if (entry.validateArgs) {
        entry.validateArgs(args);
      }
      const result = await entry.fn(...args);
      const value = jsonSafeClone(result === undefined ? null : result, 'api result');
      const response = { type: 'API_RESULT', requestId, ok: true, value };
      if (measureMessageSize(response) > state.maxMessageSize) {
        throw new Error('Api result exceeds maxMessageSize');
      }
      postToIsolate(response);
    } catch (err) {
      try {
        postToIsolate({
          type: 'API_RESULT',
          requestId,
          ok: false,
          error: err && err.message ? err.message : String(err)
        });
      } catch (_err) {
        rejectAll(new Error('Failed to deliver api error'));
      }
    }
  }

  function handleIsolatePayload(payload) {
    if (!payload || typeof payload !== 'object' || state.terminated) {
      return;
    }

    if (payload.type === 'API_REQUEST') {
      state.messageCount += 1;
      if (state.messageCount > state.maxMessages) {
        rejectAll(new Error('Worker exceeded maxMessages'));
        return;
      }
      handleApiRequest(payload);
      return;
    }

    if (payload.type === 'EXEC_RESULT') {
      state.messageCount += 1;
      const pending = state.pending.get(payload.requestId);
      if (!pending || pending.responseType !== 'EXEC_RESULT') {
        return;
      }
      state.pending.delete(payload.requestId);
      if (payload.ok) {
        try {
          pending.resolve(jsonSafeClone(payload.value, 'worker result'));
        } catch (err) {
          pending.reject(err);
        }
      } else {
        pending.reject(new Error(payload.error || 'Worker request failed'));
      }
    }
  }

  function sendRequest(type, payload, responseType, timeoutMs) {
    if (state.terminated) {
      return Promise.reject(new Error('Sandbox terminated'));
    }
    const requestId = state.nextRequestId++;
    const message = { type, requestId, ...payload };
    let size;
    try {
      size = measureMessageSize(message);
    } catch (err) {
      return Promise.reject(new Error(`Unable to serialize sandbox message: ${err.message}`));
    }
    if (size > state.maxMessageSize) {
      return Promise.reject(new Error('Host message exceeds maxMessageSize'));
    }

    return new Promise((resolve, reject) => {
      const timer =
        timeoutMs > 0
          ? setTimeout(() => {
              if (state.pending.has(requestId)) {
                state.pending.delete(requestId);
                reject(new Error('Execution timed out'));
              }
            }, timeoutMs)
          : null;

      state.pending.set(requestId, {
        resolve: (value) => {
          if (timer) {
            clearTimeout(timer);
          }
          resolve(value);
        },
        reject: (err) => {
          if (timer) {
            clearTimeout(timer);
          }
          reject(err);
        },
        responseType
      });

      try {
        postToIsolate(message);
      } catch (err) {
        state.pending.delete(requestId);
        if (timer) {
          clearTimeout(timer);
        }
        reject(err);
      }
    });
  }

  const sandbox = {
    isTerminated() {
      return state.terminated;
    },

    async initialize() {
      if (state.terminated) {
        throw new Error('Sandbox terminated');
      }
      if (state.initialized) {
        return;
      }

      const worker = new Worker(getNodeWorkerBootstrapSource(), { eval: true });
      state.worker = worker;

      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('Sandbox worker initialization timed out'));
        }, 10000);

        const onMessage = (msg) => {
          if (msg && msg.type === 'WORKER_READY') {
            clearTimeout(timer);
            worker.off('message', onMessage);
            worker.on('message', (m) => handleIsolatePayload(m));
            resolve(true);
            return;
          }
          handleIsolatePayload(msg);
        };

        worker.on('message', onMessage);
        worker.on('error', (err) => {
          clearTimeout(timer);
          reject(err instanceof Error ? err : new Error(String(err)));
        });
      });

      state.initialized = true;
    },

    execute(job) {
      const run = async () => {
        if (state.terminated || !state.initialized) {
          throw new Error('Sandbox is not ready');
        }

        const limits = job.limits || {};
        // 0 / negative disables the EXEC watchdog (NFT cards may await player input).
        // undefined/null keeps the historical 5s default for ordinary executeJS callers.
        const maxExecutionTime =
          limits.maxExecutionTime === undefined || limits.maxExecutionTime === null
            ? 5000
            : Number(limits.maxExecutionTime);
        state.maxMessages = Number(limits.maxMessages) > 0 ? Number(limits.maxMessages) : 1000;
        state.maxMessageSize =
          Number(limits.maxMessageSize) > 0 ? Number(limits.maxMessageSize) : 2 * 1024 * 1024;

        state.currentHandlers = job.handlers || null;
        try {
          return await sendRequest(
            'EXEC',
            {
              source: job.source,
              context: job.context || {},
              args: Array.isArray(job.args) ? job.args : [],
              api: job.api || {}
            },
            'EXEC_RESULT',
            maxExecutionTime
          );
        } catch (err) {
          if (err && /timed out/i.test(String(err.message || err))) {
            sandbox.terminate();
          }
          throw err;
        } finally {
          state.currentHandlers = null;
        }
      };

      const queued = state.queue.then(run, run);
      state.queue = queued.then(
        () => undefined,
        () => undefined
      );
      return queued;
    },

    terminate() {
      if (state.terminated) {
        return;
      }
      state.terminated = true;
      state.initialized = false;
      rejectAll(new Error('Sandbox terminated'));

      try {
        if (state.worker) {
          state.worker.postMessage({ type: 'TERMINATE' });
          state.worker.terminate();
        }
      } catch (_err) {
        // ignore
      }
      state.worker = null;
    }
  };

  return sandbox;
}

module.exports = {
  createSandbox
};
