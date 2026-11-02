import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';
import dnsPromises from 'node:dns/promises';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';

const deny = () => { throw new Error('MSS_TEST_NETWORK_DENIED'); };
globalThis.fetch = deny;
for (const module of [http, https]) { module.request = deny; module.get = deny; }
tls.connect = deny;
for (const module of [dns, dnsPromises]) {
  for (const key of Object.keys(module)) if (/^(?:lookup|resolve|reverse)/.test(key) && typeof module[key] === 'function') module[key] = deny;
  for (const key of Object.getOwnPropertyNames(module.Resolver?.prototype || {})) if (/^(?:resolve|reverse)/.test(key)) module.Resolver.prototype[key] = deny;
}
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const value = typeof args[0] === 'object' ? args[0]?.path : typeof args[0] === 'string' && !/^\d+$/.test(args[0]) ? args[0] : null;
  const root = process.env.MSS_TEST_SOCKET_ROOT;
  // 明示した架空fixtureディレクトリ内のUnix socketだけを許可する。
  if (root && value && path.isAbsolute(root) && path.resolve(value).startsWith(`${path.resolve(root)}${path.sep}`)) return connect.apply(this, args);
  return deny();
};
syncBuiltinESMExports();
