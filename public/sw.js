const C="qa3da90-v1";
const FILES=["./","index.html","manifest.webmanifest","icon-192.png","icon-512.png",
"fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2","fonts/ibm-plex-sans-arabic-arabic-500-normal.woff2","fonts/ibm-plex-sans-arabic-arabic-700-normal.woff2",
"fonts/ibm-plex-sans-arabic-latin-400-normal.woff2","fonts/ibm-plex-sans-arabic-latin-500-normal.woff2","fonts/ibm-plex-sans-arabic-latin-700-normal.woff2"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(FILES)));self.skipWaiting()});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener("fetch",e=>{const u=new URL(e.request.url);if(e.request.method!=="GET"||u.pathname.startsWith("/api")||u.pathname.startsWith("/stats"))return;
  e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match("index.html"))))});
