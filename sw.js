self.__SYSCOFLOW_PRECACHE__ = ["assets/excel-export-Y9Udtuej.js","assets/html2canvas.esm-DXEQVQnt.js","assets/index-CUi_OMMa.css","assets/index-VTSDXsY5.js","assets/index.es-Cc89IW5W.js","assets/pdf-export-CyXnxq9T.js","assets/purify.es-VaSPOPhr.js","assets/xlsx-CKwrMZHi.js","balance-demo-syscoflow.xlsx","fonts/fraunces-600-latin.woff2","fonts/ibm-plex-mono-400-latin.woff2","fonts/ibm-plex-mono-500-latin.woff2","fonts/ibm-plex-mono-600-latin.woff2","fonts/public-sans-400-latin.woff2","fonts/public-sans-400-latinx.woff2","fonts/public-sans-500-latin.woff2","fonts/public-sans-500-latinx.woff2","fonts/public-sans-600-latin.woff2","fonts/public-sans-600-latinx.woff2","fonts/public-sans-700-latin.woff2","fonts/public-sans-700-latinx.woff2","icone-192.png","icone-512-maskable.png","icone-512.png","index.html","logo-syscoflow.svg","manifest.webmanifest","og-syscoflow.png"];
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

// Le nom porte une version : « activate » supprime tout cache qui ne s'appelle
// pas ainsi. L'incrémenter est le seul moyen de purger un cache existant chez
// les visiteurs, ici parce que la version 1 avait archivé une réponse 404.
const CACHE = 'syscoflow-v2';

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

  /**
   * Ne mémorise qu'une réponse valable.
   *
   * Sans ce filtre, le worker mettait en cache tout ce qui passait, statut
   * compris. Sur GitHub Pages, /syscoflow/app renvoie un 404 dont le corps est
   * l'application : la réponse était donc archivée AVEC son 404, et resservie
   * telle quelle hors ligne. Plus largement, une panne passagère du serveur se
   * serait gravée dans le cache et rejouée indéfiniment.
   */
  const memoriser = (res) => {
    if (res && res.ok && res.type === 'basic') {
      const copie = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copie));
    }
    return res;
  };

  // Navigation : réseau d'abord pour ne pas figer une version, repli sur le
  // cache puis sur la racine, qui porte l'application entière.
  //
  // Le repli sur BASE fait tout le travail pour les routes profondes : hors
  // ligne, /app n'est pas en cache sous son propre nom, et c'est index.html
  // qui répond. Le routeur prend ensuite la main et affiche la bonne page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(memoriser)
        .catch(() => caches.match(request).then((c) => c || caches.match(BASE))),
    );
    return;
  }

  // Assets : cache d'abord. Leurs noms portent une empreinte, donc un fichier
  // en cache ne peut pas être périmé.
  event.respondWith(
    caches.match(request).then((cache) => {
      const reseau = fetch(request).then(memoriser).catch(() => cache);
      return cache || reseau;
    }),
  );
});
