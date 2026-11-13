/**
 * Persistent JavaScript sandbox for the browser Lite Client:
 * opaque iframe (fixed CSP) → Blob Worker.
 *
 * Public surface of a sandbox instance:
 *   initialize()
 *   execute({ source, context, api, handlers, limits })
 *   terminate()
 *
 * This module must remain free of Node.js built-ins (including worker_threads)
 * so Webpack can bundle it for the browser. Node/Jest tests use sandbox-server.js.
 */

/**
 * Base CSP for the opaque sandbox document.
 * script-src is completed per init with a nonce that authorizes only the
 * trusted iframe bootstrap. Untrusted user code never runs as a document
 * script; it runs only inside the Blob Worker created after handshake.
 *
 * 'unsafe-eval' is required for the existing persistent Worker bootstrap,
 * which compiles validated user source with AsyncFunction. It is not used
 * to deliver or authorize the iframe bootstrap (that is nonce-only). There
 * is still no 'unsafe-inline'.
 */
const SANDBOX_CSP_BASE = [
  "default-src 'none'",
  'worker-src blob:',
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  'child-src blob:'
];

function buildSandboxCsp(nonce) {
  return [...SANDBOX_CSP_BASE, `script-src 'nonce-${nonce}' 'unsafe-eval' blob:`].join('; ');
}

/** Exported for tests; production inits always build CSP with a fresh nonce. */
const SANDBOX_CSP = buildSandboxCsp('saito-sandbox');

function createBootstrapNonce() {
  // Prefer Web Crypto on globalThis (browsers and modern Node). Avoid the
  // Node `crypto` module binding — this file must stay Webpack-safe.
  const webCrypto = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
  if (webCrypto && typeof webCrypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    webCrypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  throw new Error('Sandbox bootstrap nonce requires Web Crypto getRandomValues');
}

function escapeInlineScript(source) {
  // Prevent early </script> termination if the trusted source ever contains it.
  return String(source).replace(/<\/(script)/gi, '<\\/$1');
}

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

/**
 * Trusted Worker bootstrap. Speaks EXEC / EXEC_RESULT / capability messages.
 */
function getWorkerBootstrapSource() {
  return `
'use strict';
(function () {
  var pendingCaps = Object.create(null);
  var nextCapId = 1;
  var terminated = false;

  function getPort() {
    return {
      post: function (msg) { self.postMessage(msg); },
      onMessage: function (handler) {
        self.onmessage = function (ev) { handler(ev.data); };
      }
    };
  }

  var port = getPort();

  function reply(type, requestId, ok, value, error) {
    var msg = { type: type, requestId: requestId, ok: ok };
    if (ok) {
      msg.value = value;
    } else {
      msg.error = error || 'Unknown error';
    }
    port.post(msg);
  }

  function apiCall(namespace, method, args) {
    var requestId = nextCapId++;
    return new Promise(function (resolve, reject) {
      pendingCaps[requestId] = { resolve: resolve, reject: reject };
      port.post({
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

  port.onMessage(async function (msg) {
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

    if (msg.type === 'PING') {
      reply('PONG', msg.requestId, true, null);
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

  port.post({ type: 'WORKER_READY' });
})();
`;
}

function getIframeBootstrapSource() {
  return `
'use strict';
(function () {
  var worker = null;
  var workerBlobUrl = null;
  var parentOrigin = '*';
  var waitingForWorkerReady = false;

  function postToParent(msg) {
    parent.postMessage(msg, parentOrigin);
  }

  function revokeWorkerBlob() {
    if (workerBlobUrl) {
      try {
        URL.revokeObjectURL(workerBlobUrl);
      } catch (e) {}
      workerBlobUrl = null;
    }
  }

  function createWorker(bootstrapSource) {
    var blob = new Blob([bootstrapSource], { type: 'application/javascript' });
    // Do not revoke immediately: Chromium can fail to fetch the Worker script
    // if the Blob URL is revoked before the worker finishes loading.
    workerBlobUrl = URL.createObjectURL(blob);
    worker = new Worker(workerBlobUrl);
    waitingForWorkerReady = true;
    worker.onmessage = function (ev) {
      var msg = ev.data;
      if (
        waitingForWorkerReady &&
        msg &&
        typeof msg === 'object' &&
        msg.type === 'WORKER_READY'
      ) {
        waitingForWorkerReady = false;
        postToParent({
          channel: 'saito-sandbox',
          from: 'iframe',
          payload: { type: 'SANDBOX_READY' }
        });
      }
      postToParent({ channel: 'saito-sandbox', from: 'worker', payload: msg });
    };
    worker.onerror = function (err) {
      waitingForWorkerReady = false;
      postToParent({
        channel: 'saito-sandbox',
        from: 'iframe',
        payload: {
          type: 'WORKER_ERROR',
          error: err && err.message ? err.message : 'Worker error'
        }
      });
    };
  }

  window.addEventListener('message', function (ev) {
    var data = ev.data;
    if (!data || data.channel !== 'saito-sandbox' || data.from !== 'parent') {
      return;
    }
    var payload = data.payload;
    if (!payload || typeof payload !== 'object') {
      return;
    }
    if (payload.type === 'BOOTSTRAP') {
      try {
        createWorker(payload.workerBootstrap);
        // SANDBOX_READY is posted only after the Worker emits WORKER_READY.
      } catch (err) {
        waitingForWorkerReady = false;
        postToParent({
          channel: 'saito-sandbox',
          from: 'iframe',
          payload: {
            type: 'SANDBOX_ERROR',
            error: err && err.message ? err.message : String(err)
          }
        });
      }
      return;
    }
    if (!worker) {
      return;
    }
    if (payload.type === 'TERMINATE') {
      try {
        worker.postMessage({ type: 'TERMINATE' });
        worker.terminate();
      } catch (e) {}
      worker = null;
      waitingForWorkerReady = false;
      revokeWorkerBlob();
      return;
    }
    worker.postMessage(payload);
  });

  postToParent({ channel: 'saito-sandbox', from: 'iframe', payload: { type: 'IFRAME_READY' } });
})();
`;
}

function canUseBrowserSandbox() {
  return (
    typeof document !== 'undefined' &&
    typeof document.createElement === 'function' &&
    typeof Blob !== 'undefined' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function' &&
    typeof Worker !== 'undefined'
  );
}

function createSandbox() {
  const state = {
    kind: null,
    terminated: false,
    initialized: false,
    iframe: null,
    iframeUrl: null,
    nextRequestId: 1,
    pending: new Map(),
    currentHandlers: null,
    messageCount: 0,
    maxMessages: 1000,
    maxMessageSize: 2 * 1024 * 1024,
    queue: Promise.resolve(),
    onParentMessage: null
  };

  function rejectAll(reason) {
    for (const [, pending] of state.pending) {
      pending.reject(reason);
    }
    state.pending.clear();
  }

  function postToIsolate(payload) {
    if (!state.iframe || !state.iframe.contentWindow) {
      throw new Error('Sandbox iframe is not available');
    }
    state.iframe.contentWindow.postMessage(
      { channel: 'saito-sandbox', from: 'parent', payload },
      '*'
    );
  }

  function handleIsolatePayload(payload) {
    if (!payload || typeof payload !== 'object' || state.terminated) {
      return;
    }

    if (payload.type === 'WORKER_READY' || payload.type === 'PONG') {
      const pendingReady = state.pending.get(payload.requestId);
      if (pendingReady && pendingReady.responseType === payload.type) {
        state.pending.delete(payload.requestId);
        pendingReady.resolve(true);
      }
      return;
    }

    if (payload.type === 'WORKER_ERROR' || payload.type === 'SANDBOX_ERROR') {
      const err = new Error(payload.error || 'Sandbox error');
      rejectAll(err);
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

  async function initializeBrowser() {
    // Opaque-origin iframes (sandbox without allow-same-origin) cannot load
    // parent-created Blob script URLs. Deliver the trusted bootstrap as an
    // inline script authorized only by a per-init CSP nonce. Saito parent
    // pages currently ship no CSP; the iframe meta policy is therefore the
    // effective document policy. A later parent CSP cannot be loosened by
    // this meta tag — if one is added that blocks this bootstrap, init must
    // fail closed rather than weaken sandbox flags.
    const nonce = createBootstrapNonce();
    const bootstrap = escapeInlineScript(getIframeBootstrapSource());
    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${buildSandboxCsp(nonce)}">
</head>
<body>
<script nonce="${nonce}">${bootstrap}</script>
</body>
</html>`;

    const htmlBlob = new Blob([html], { type: 'text/html' });
    state.iframeUrl = URL.createObjectURL(htmlBlob);

    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.style.display = 'none';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.src = state.iframeUrl;

    state.kind = 'browser';
    state.iframe = iframe;

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Sandbox iframe initialization timed out'));
      }, 10000);

      let settled = false;
      const settleOk = () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        resolve(true);
      };
      const settleErr = (err) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        reject(err);
      };

      state.onParentMessage = (event) => {
        if (event.source !== iframe.contentWindow) {
          return;
        }
        const data = event.data;
        if (!data || data.channel !== 'saito-sandbox') {
          return;
        }
        if (data.from !== 'iframe' && data.from !== 'worker') {
          return;
        }
        const payload = data.payload;
        if (!payload) {
          return;
        }
        if (payload.type === 'IFRAME_READY') {
          try {
            postToIsolate({
              type: 'BOOTSTRAP',
              workerBootstrap: getWorkerBootstrapSource()
            });
          } catch (err) {
            settleErr(err);
          }
          return;
        }
        if (payload.type === 'SANDBOX_READY') {
          settleOk();
          return;
        }
        if (payload.type === 'SANDBOX_ERROR') {
          settleErr(new Error(payload.error || 'Sandbox failed to start'));
          return;
        }
        handleIsolatePayload(payload);
      };

      window.addEventListener('message', state.onParentMessage);
      if (!document.body) {
        settleErr(new Error('document.body is required to mount the sandbox iframe'));
        return;
      }
      document.body.appendChild(iframe);
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

      if (!canUseBrowserSandbox()) {
        throw new Error(
          'JavaScript isolation unavailable: sandboxed iframe/Worker requires a browser environment'
        );
      }

      await initializeBrowser();
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
          // A hung Worker cannot serve later EXECs; tear down so the next
          // executeJS call can recreate a clean sandbox.
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
        postToIsolate({ type: 'TERMINATE' });
      } catch (_err) {
        // ignore
      }

      if (state.onParentMessage) {
        try {
          window.removeEventListener('message', state.onParentMessage);
        } catch (_err) {
          // ignore
        }
      }
      if (state.iframe && state.iframe.parentNode) {
        state.iframe.parentNode.removeChild(state.iframe);
      }
      state.iframe = null;
      if (state.iframeUrl) {
        try {
          URL.revokeObjectURL(state.iframeUrl);
        } catch (_err) {
          // ignore
        }
        state.iframeUrl = null;
      }

      state.kind = null;
    }
  };

  return sandbox;
}

module.exports = {
  createSandbox,
  SANDBOX_CSP,
  buildSandboxCsp,
  createBootstrapNonce,
  escapeInlineScript,
  getIframeBootstrapSource,
  getWorkerBootstrapSource
};
