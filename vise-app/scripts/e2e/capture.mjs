// Runs the payment-capture end-to-end test: starts the notification helper, runs the Maestro flow, stops the helper.
//
//   npm run e2e:capture                 run the flow on the connected device or emulator
//   npm run e2e:capture -- --port 7788  use another port for the helper
//
// Needs: `adb` and `maestro` on the PATH, one device or emulator connected, and a DEBUG build of the app installed
// (npx expo run:android). A release build ignores the test notifications on purpose.

import { execFile, spawn } from 'node:child_process';

import { APP_ID, DEFAULT_PORT, startServer } from './notify.mjs';

const FLOW = '.maestro/capture/payment-capture.yaml';
const portIndex = process.argv.indexOf('--port');
const port = portIndex > -1 ? Number(process.argv[portIndex + 1]) : DEFAULT_PORT;

const run = (command, args) =>
  new Promise((resolve) => execFile(command, args, { timeout: 20_000 }, (error, stdout, stderr) => resolve({ error, stdout, stderr })));

async function preflight() {
  const devices = await run('adb', ['devices']);
  if (devices.error) return 'adb was not found. Install the Android platform-tools and put adb on your PATH.';
  const attached = devices.stdout.split('\n').slice(1).filter((line) => /\tdevice$/.test(line.trim() ? line : ''));
  if (attached.length === 0) return 'No device or emulator is connected. Start one, then run this again (adb devices should list it).';
  if (attached.length > 1) return 'More than one device is connected. Disconnect all but one, or set ANDROID_SERIAL.';

  const debuggable = await run('adb', ['shell', 'run-as', APP_ID, 'true']);
  if (debuggable.error) {
    return `VISE (${APP_ID}) is not installed as a debug build on that device. Run: npx expo run:android`;
  }
  const maestro = await run('maestro', ['--version']);
  if (maestro.error) return 'maestro was not found. Install it (https://docs.maestro.dev) and put it on your PATH.';
  return null;
}

const problem = await preflight();
if (problem) {
  console.error(`✖ ${problem}`);
  process.exit(2);
}

const { server } = await startServer({ port });
console.log(`Notification helper listening on 127.0.0.1:${port}`);

const maestro = spawn('maestro', ['test', '-e', `NOTIFY_PORT=${port}`, FLOW], { stdio: 'inherit', shell: process.platform === 'win32' });
maestro.on('exit', (code) => {
  server.close();
  process.exit(code ?? 1);
});
maestro.on('error', (error) => {
  console.error(`✖ Could not start maestro: ${error.message}`);
  server.close();
  process.exit(2);
});
