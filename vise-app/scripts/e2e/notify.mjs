// Posts notifications on a connected Android device or emulator for the payment-capture end-to-end test.
//
// The payment apps cannot be made to send a notification on demand (and a test must not spend real money), so the
// test posts one through Android itself with `adb shell cmd notification post`. A debuggable VISE build treats a
// notification from the shell whose title starts with an app tag, e.g. "[phonepe] Paid ₹250 to Starbucks", as if
// that app had posted it (see DebugPaymentNotifications.kt). Everything after that is the real path.
//
// A Maestro flow cannot run shell commands, so `startServer` offers the same actions over HTTP on this machine
// only (127.0.0.1), and `.maestro/scripts/*.js` call it.

import { execFile } from 'node:child_process';
import http from 'node:http';
import { pathToFileURL } from 'node:url';

export const APP_ID = 'com.reborn_lvl.viseapp';
export const SERVICE = `${APP_ID}/expo.modules.visecore.PaymentNotificationService`;
export const DEFAULT_PORT = 7777;

/** Wraps text in single quotes for the device's shell, so spaces, ₹, $ and quotes arrive as typed. */
export const quote = (text) => `'${String(text).replace(/'/g, `'\\''`)}'`;

/** The device-side command that posts one notification. `id` makes each post a separate notification. */
export function postCommand({ tag, title, text, id }) {
  if (!/^[a-z]+$/.test(tag)) throw new Error(`Bad app tag "${tag}": use letters only, e.g. phonepe`);
  return ['cmd notification post -S bigtext -t', quote(`[${tag}] ${title}`), quote(id), quote(text ?? '')].join(' ');
}

/** The device-side command that turns VISE's notification access on or off (what the user does in Settings). */
export const listenerCommand = (allow) => `cmd notification ${allow ? 'allow_listener' : 'disallow_listener'} ${SERVICE}`;

/** Runs `adb shell <command>` and resolves with its output. */
export function adbShell(command, { adb = process.env.ADB || 'adb' } = {}) {
  return new Promise((resolve, reject) => {
    execFile(adb, ['shell', command], { timeout: 20_000 }, (error, stdout, stderr) => {
      if (error) reject(new Error(`adb failed: ${stderr || error.message}`));
      else resolve(stdout);
    });
  });
}

let counter = 0;
const nextId = () => `vise-e2e-${Date.now()}-${(counter += 1)}`;

/**
 * An HTTP server for the Maestro flows.
 *   GET /post?tag=phonepe&title=...&text=...   post a notification
 *   GET /listener?allow=1|0                    grant or revoke VISE's notification access
 *   GET /ping
 * `run` runs a device command (injected so it can be tested without a phone).
 */
export function createServer({ run = adbShell } = {}) {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const reply = (status, body) => {
      response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(body);
    };
    try {
      if (url.pathname === '/ping') return reply(200, 'ok');
      if (url.pathname === '/post') {
        const q = url.searchParams;
        await run(postCommand({ tag: q.get('tag') ?? '', title: q.get('title') ?? '', text: q.get('text') ?? '', id: nextId() }));
        return reply(200, 'posted');
      }
      if (url.pathname === '/listener') {
        await run(listenerCommand(url.searchParams.get('allow') === '1'));
        return reply(200, 'ok');
      }
      return reply(404, 'not found');
    } catch (error) {
      return reply(500, error instanceof Error ? error.message : String(error));
    }
  });
}

/** Starts the server on 127.0.0.1 only. Resolves with the server and the port it is on. */
export function startServer({ port = DEFAULT_PORT, run } = {}) {
  const server = createServer({ run });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// Command line: node scripts/e2e/notify.mjs <tag> "<title>" "<text>"
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [tag, title, text] = process.argv.slice(2);
  if (!tag || !title) {
    console.error('Usage: node scripts/e2e/notify.mjs <tag> "<title>" "<text>"   (tags: phonepe gpay revolut paypal ...)');
    process.exit(2);
  }
  adbShell(postCommand({ tag, title, text, id: nextId() }))
    .then(() => console.log('posted'))
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
