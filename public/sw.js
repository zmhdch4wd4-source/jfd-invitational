/* JFD 70's Invitational — cache hors ligne.
   Les visuels et le carnet restent consultables sans réseau ;
   les scores passent toujours par le serveur (voir la file d'attente côté client). */
const CACHE = "jfd-v2";

const CORE = ["/", "/index.html", "/app.js", "/icon.png",
  "/logo-blanc.png", "/logo-mark.png", "/logo-noir.png"];
const IMGS = [];
for (let i = 1; i <= 18; i++) {
  const n = String(i).padStart(2, "0");
  IMGS.push("/img/izki-" + n + ".jpg", "/img/izki-" + n + "p.jpg", "/img/logrono-" + n + ".jpg");
}

/* Un fichier manquant ne doit pas faire échouer toute l'installation. */
self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.allSettled([...CORE, ...IMGS].map((u) => c.add(new Request(u, { cache: "reload" }))));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // jamais de cache sur les données

  const isShell = req.mode === "navigate" || url.pathname === "/app.js" || url.pathname === "/index.html";

  if (isShell) {
    // réseau d'abord, pour que les mises en ligne arrivent ; le cache prend le relais hors ligne
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        const c = await caches.open(CACHE);
        c.put(req.mode === "navigate" ? "/index.html" : req, r.clone());
        return r;
      } catch {
        return (await caches.match(req.mode === "navigate" ? "/index.html" : req)) ||
               Response.error();
      }
    })());
    return;
  }

  // images et logos : le cache d'abord, ils ne changent pas en cours de séjour
  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const r = await fetch(req);
      const c = await caches.open(CACHE);
      c.put(req, r.clone());
      return r;
    } catch {
      return Response.error();
    }
  })());
});
