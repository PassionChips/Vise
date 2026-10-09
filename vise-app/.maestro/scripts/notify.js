// Asks the helper started by `npm run e2e:capture` to post a notification on the device as if a payment app had.
// Env: TAG (phonepe, gpay, revolut, paypal ...), TITLE, TEXT, and optionally NOTIFY_PORT.
const port = typeof NOTIFY_PORT !== 'undefined' && NOTIFY_PORT ? NOTIFY_PORT : '7777';
const query =
  'tag=' + encodeURIComponent(TAG) +
  '&title=' + encodeURIComponent(TITLE) +
  '&text=' + encodeURIComponent(typeof TEXT !== 'undefined' ? TEXT : '');
const response = http.get('http://localhost:' + port + '/post?' + query);
if (!response.ok) {
  throw new Error('Could not post the test notification (is `npm run e2e:capture` running?): ' + response.body);
}
