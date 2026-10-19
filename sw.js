// Build replaces this token with a digest of the complete app shell.
const VERSION = '4ad2b66f821d156e';
const PREFIX = 'lao-shell-' + encodeURIComponent(self.registration.scope) + '-';
const CACHE = PREFIX + VERSION;
const FILES = ['./', 'manifest.webmanifest', 'offline.js', 'icon-192.png', 'icon-512.png', 'assets/fonts/NotoSansLaoLooped-Variable.woff2', 'assets/fonts/NotoSansLaoLooped-Variable.ttf'];
const urls = FILES.map(path => new URL(path, self.registration.scope).href);
self.addEventListener('message', event => {
  if(event.data?.type==='GET_APP_VERSION'&&event.source?.url?.startsWith(self.registration.scope))event.ports?.[0]?.postMessage({version:VERSION});
  if(event.data?.type==='ACTIVATE_SAVED_UPDATE'&&event.source?.url?.startsWith(self.registration.scope))event.waitUntil(self.skipWaiting());
});
async function cleanResponse(response) {
  if (!response.ok) throw new Error('Shell download failed: ' + response.status);
  const headers = new Headers(response.headers);
  headers.delete('content-encoding');
  headers.delete('content-length');
  return new Response(await response.arrayBuffer(), {status: response.status, statusText: response.statusText, headers});
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const url of urls) {
      const response = await fetch(new Request(url, {cache: 'reload'}));
      if (response.url && new URL(response.url).origin !== new URL(self.registration.scope).origin)
        throw new Error('Unexpected cross-origin shell redirect');
      if(url===urls[0]){const body=await response.clone().text();if(!body.includes('name="lao-app-build" content="'+VERSION+'"'))throw Error('Deployment versions differ; finish uploading all app files and retry');}
      await cache.put(url, await cleanResponse(response));
    }
    // Do not activate over an open page/recording. The new version waits for all old windows to close.
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
    if(self.clients.matchAll)for(const client of await self.clients.matchAll({type:'window'}))client.postMessage({type:'APP_VERSION_ACTIVATED',version:VERSION});
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const root = new URL('./', self.registration.scope).href;
  const isHome = request.mode === 'navigate' && (url.origin + url.pathname === root || url.origin + url.pathname === new URL('index.html', root).href);
  // Only the public shell is cached: never cache login, sync or paid speech requests.
  const asset = urls.find(item => item === url.origin + url.pathname);
  if (!isHome && !asset) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const response = await cache.match(isHome ? urls[0] : asset);
    if (response) return response.redirected ? cleanResponse(response) : response;
    return cleanResponse(await fetch(request));
  })());
});
