// Tests for the notification helper. They need no phone: the device command is captured instead of run.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SERVICE, listenerCommand, postCommand, quote, startServer } from './notify.mjs';

test('quoting keeps symbols, spaces and apostrophes intact for the device shell', () => {
  assert.equal(quote('Paid ₹250 to Starbucks'), `'Paid ₹250 to Starbucks'`);
  assert.equal(quote("Dunkin' Donuts"), String.raw`'Dunkin'\'' Donuts'`);
  assert.equal(quote('$25.00 USD'), `'$25.00 USD'`);
  assert.equal(quote('a; rm -rf /'), `'a; rm -rf /'`);
});

test('a post command carries the app tag in the title and the text as big text', () => {
  const command = postCommand({ tag: 'phonepe', title: 'Paid ₹250 to Starbucks', text: 'Payment successful', id: 'n1' });
  assert.equal(command, `cmd notification post -S bigtext -t '[phonepe] Paid ₹250 to Starbucks' 'n1' 'Payment successful'`);
});

test('a bad tag is refused, so nothing odd reaches the shell', () => {
  assert.throws(() => postCommand({ tag: 'phone pe; ls', title: 't', text: 'x', id: 'n' }), /Bad app tag/);
  assert.throws(() => postCommand({ tag: '', title: 't', text: 'x', id: 'n' }), /Bad app tag/);
});

test('granting and revoking notification access target the payment service', () => {
  assert.equal(listenerCommand(true), `cmd notification allow_listener ${SERVICE}`);
  assert.equal(listenerCommand(false), `cmd notification disallow_listener ${SERVICE}`);
});

test('the HTTP bridge posts, grants, revokes, and refuses bad requests', async () => {
  const commands = [];
  const { server, port } = await startServer({ port: 0, run: async (command) => commands.push(command) });
  const get = async (path) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    return { status: response.status, body: await response.text() };
  };
  try {
    assert.deepEqual(await get('/ping'), { status: 200, body: 'ok' });

    const posted = await get(`/post?tag=revolut&title=${encodeURIComponent('Starbucks')}&text=${encodeURIComponent('You paid €4.50 • Card payment')}`);
    assert.equal(posted.status, 200);
    assert.match(commands[0], /^cmd notification post -S bigtext -t '\[revolut\] Starbucks' 'vise-e2e-\d+-\d+' 'You paid €4\.50 • Card payment'$/);

    // Posting the same words twice makes two separate notifications.
    await get(`/post?tag=revolut&title=Starbucks&text=x`);
    await get(`/post?tag=revolut&title=Starbucks&text=x`);
    assert.notEqual(commands[1].split("'")[3], commands[2].split("'")[3]);

    await get('/listener?allow=1');
    await get('/listener?allow=0');
    assert.match(commands.at(-2), /allow_listener/);
    assert.match(commands.at(-1), /disallow_listener/);

    assert.equal((await get('/post?tag=Bad%20Tag&title=t')).status, 500);
    assert.equal((await get('/nope')).status, 404);
  } finally {
    server.close();
  }
});

test('the server listens on this machine only', async () => {
  const { server } = await startServer({ port: 0, run: async () => '' });
  try {
    assert.equal(server.address().address, '127.0.0.1');
  } finally {
    server.close();
  }
});
