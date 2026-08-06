self.__SYSCOFLOW_PRECACHE__ = ["assets/excel-export-CXHP_-tc.js","assets/html2canvas.esm-DXEQVQnt.js","assets/index-1Pcb8Xoa.css","assets/index-aQ5jQe2g.js","assets/index.es-DM3xLrsj.js","assets/pdf-export-BPEmJzCW.js","assets/purify.es-VaSPOPhr.js","assets/xlsx-CKwrMZHi.js","balance-demo-syscoflow.xlsx","icone-192.png","icone-512-maskable.png","icone-512.png","index.html","logo-syscoflow.svg","manifest.webmanifest","og-syscoflow.png"];
/*
 * Service worker de SyscoFlow.
 *
 * Sa raison d'être n'est pas le confort, c'est la PREUVE.
 *
 * SyscoFlow annonce qu'aucune balance ne quitte l'ordinateur. Un comptable a
 * raison de ne pas croire une phrase sur une page : c'est exactement ce qu'a
 * répondu le premier utilisateur réel, « quelle assurance que les balances ne
 * seront pas capturées ? ».
 *
 * La seule réponse qu'un non-informaticien peut vérifier lui-même tient en un
 * geste : couper la connexion, et constater que l'application continue de
 * produire les états. Un outil qui fonctionne sans réseau n'envoie rien, par
 * construction. Encore faut-il qu'il fonctionne vraiment sans réseau, exports
 * compris, sinon la démonstration s'arrête au moment décisif.
 *
 * D'où le pré-cache de la liste complète des fichiers du build, injectée par
 * scripts/publier-pages.mjs : les modules d'export (jsPDF, SheetJS) sont
 * chargés à la demande, donc absents du cache tant qu'on n'a rien exporté.
 * Sans eux, « générer un PDF hors ligne » échouerait au premier essai.
 */

const CACHE = 'syscoflow-v1';

/** Racine réelle du site, déduite de l'emplacement de ce fichier. */
const BASE = new URL('./', self.location).pathname;

/**
 * Fichiers du build, injectés à la publication.
 *
 * Les noms portent une empreinte qui change à chaque build : les écrire à la
 * main serait les figer sur une version morte.
 */
const FICHIERS = self.__SYSCOFLOW_PRECACHE__ || [];

const PRECACHE = [BASE, ...FICHIERS.map((f) => BASE + f)];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // addAll échoue en bloc si un seul fichier manque, ce qui laisserait
      // l'application sans cache du tout. On tolère les absences.
      .then((cache) => Promise.allSettled(PRECACHE.map((u) => cache.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cles) => Promise.all(cles.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Le relais de licence ne doit jamais être servi depuis le cache : une
  // licence révoquée resterait valide indéfiniment.
  if (url.pathname.includes('/api/')) return;

  // Navigation : réseau d'abord pour ne pas figer une version, repli sur le
  // cache puis sur la racine, qui porte l'application entière.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copie = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copie));
          return res;
        })
        .catch(() => caches.match(request).then((c) => c || caches.match(BASE))),
    );
    return;
  }

  // Assets : cache d'abord. Leurs noms portent une empreinte, donc un fichier
  // en cache ne peut pas être périmé.
  event.respondWith(
    caches.match(request).then((cache) => {
      const reseau = fetch(request)
        .then((res) => {
          const copie = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copie));
          return res;
        })
        .catch(() => cache);
      return cache || reseau;
    }),
  );
});
