const { requestFor, readChoice } = require('./decision-format');
const DEFAULT_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const DEFAULT_KEY_ENV = 'TYPESAFE_API_KEY';
const failure = (message, code) => Object.assign(Error(message), { code });
const abortError = () => Object.assign(Error('Decision cancelled'), { name: 'AbortError' });

function validate(config) {
  let url;
  try { url = new URL(config.endpoint ?? DEFAULT_ENDPOINT); } catch (_) { throw Error('Invalid Jev endpoint'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.search || url.hash) {
    throw Error('Jev endpoint requires HTTPS (HTTP is allowed only on loopback), without credentials, query or fragment');
  }
  if (config.apiKey !== undefined && (typeof config.apiKey !== 'string' || /[^\x21-\x7e]/.test(config.apiKey))) throw Error('Invalid Jev apiKey');
  if (config.apiKeyEnv !== undefined && (typeof config.apiKeyEnv !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(config.apiKeyEnv))) throw Error('Invalid Jev apiKeyEnv');
  if (config.model !== undefined && (typeof config.model !== 'string' || !config.model.trim())) throw Error('Invalid Jev model');
}
function credentials(config) {
  validate(config);
  const name = config.apiKeyEnv ?? DEFAULT_KEY_ENV;
  const key = config.apiKey || config.env?.[name] || process.env[name];
  if (typeof key !== 'string' || !key || /[^\x21-\x7e]/.test(key)) {
    throw Error('Missing or invalid Jev API key; set apiKey or the configured apiKeyEnv in the private connection');
  }
  return key;
}
async function readAnswer(response) {
  if (!response.body) throw failure('Jev returned an empty response', 'INVALID_RESPONSE');
  const chunks = []; let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > 1024 * 1024) throw failure('Jev response exceeds limit', 'INVALID_RESPONSE');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch (_) { throw failure('Jev returned invalid JSON', 'INVALID_RESPONSE'); }
}
class JevProvider {
  constructor(config) { this.config = config; }
  async choose(decision, signal) {
    if (signal?.aborted) throw abortError();
    const request = requestFor(decision), key = credentials(this.config);
    const controller = new AbortController();
    const abort = () => controller.abort();
    let timedOut = false, answer;
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, this.config.timeoutMs ?? 120000);
    try {
      const response = await fetch(this.config.endpoint ?? DEFAULT_ENDPOINT, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: this.config.model ?? 'jev-latest', ...request })
      });
      if (!response.ok) {
        await response.body?.cancel();
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        const hint = [401, 403].includes(response.status) ? '; check the configured API key and access' : '';
        throw failure(`Jev HTTP ${response.status}${hint}`, retryable ? 'ENGINE_UNAVAILABLE' : 'JEV_REQUEST_FAILED');
      }
      answer = await readAnswer(response);
    } catch (error) {
      if (signal?.aborted) throw abortError();
      if (timedOut) throw failure('Jev decision timed out', 'ENGINE_UNAVAILABLE');
      if (['ENGINE_UNAVAILABLE', 'JEV_REQUEST_FAILED', 'INVALID_RESPONSE'].includes(error.code)) throw error;
      // Never include remote bodies, fetch error causes, prompts or credentials in logs.
      throw failure('Jev connection failed', 'ENGINE_UNAVAILABLE');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
    return readChoice(answer, request);
  }
}
module.exports = JevProvider;
module.exports.validate = validate;
module.exports.credentials = credentials;
