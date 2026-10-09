// Turns VISE's notification access on or off, as the user would in Android Settings. Env: ALLOW ("1" or "0").
const port = typeof NOTIFY_PORT !== 'undefined' && NOTIFY_PORT ? NOTIFY_PORT : '7777';
const response = http.get('http://localhost:' + port + '/listener?allow=' + (ALLOW === '1' ? '1' : '0'));
if (!response.ok) {
  throw new Error('Could not change notification access: ' + response.body);
}
