// Recette locale sur la pile de production (*.localhost, RFC 6761) : Chrome
// résout ces noms vers la machine, Node sous Windows non. Chargé avant
// Playwright : NODE_OPTIONS="--require ./localhost-dns.cjs".
const dns = require('dns');
const lookup = dns.lookup;
dns.lookup = function (host, options, callback) {
  const cb = typeof options === 'function' ? options : callback;
  const opts = typeof options === 'function' ? {} : typeof options === 'number' ? { family: options } : options || {};
  if (!/\.localhost$/i.test(host)) return lookup.apply(dns, arguments);
  return opts.all ? cb(null, [{ address: '127.0.0.1', family: 4 }]) : cb(null, '127.0.0.1', 4);
};
const plookup = dns.promises.lookup;
dns.promises.lookup = function (host, options) {
  if (!/\.localhost$/i.test(host)) return plookup.apply(dns.promises, arguments);
  const opts = typeof options === 'number' ? { family: options } : options || {};
  if (opts.family === 6) return Promise.resolve(opts.all ? [] : { address: '::1', family: 6 });
  return Promise.resolve(opts.all ? [{ address: '127.0.0.1', family: 4 }] : { address: '127.0.0.1', family: 4 });
};
