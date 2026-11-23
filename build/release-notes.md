## NovelReader 0.40.0

- **Regarder ensemble sans avoir la source.** Un ami qui n'a pas la source, ou chez qui elle ne marche pas, peut regarder ta vidéo en direct : image, son du film en stéréo et sous-titres, d'un clic sur « Regarder la diffusion ». Tu peux aussi l'envoyer à tout le monde avec le bouton « Diffuser ». Plus besoin d'un partage d'écran à côté : il n'y a que la vidéo, sans l'interface autour, et le son du film ne dépend pas de ton volume.
- **Des lecteurs vraiment ensemble.** Les PC s'accordent sur une horloge commune : l'écart entre deux lecteurs passe d'une seconde et demie au maximum à environ un dixième de seconde. Un petit retard se rattrape en douceur par la vitesse, sans saut ni rechargement ; en pause, tout le monde est sur la même image.
- **On sait qui a fait quoi.** « Ali a mis en pause », « Sara a mis la vidéo à 12:34 » s'affiche sur la vidéo et dans la discussion. À côté de chaque nom : en phase, en chargement, pas de vidéo ouverte, regarde la diffusion.
- **Ton salon garde son code.** Le même code à chaque séance (tu peux en changer), les salons où tu es déjà allé se rejoignent en un clic, et un QR code invite un téléphone.
- **Sur Android**, le vocal fonctionne enfin (l'application ne demandait pas le micro), le lien d'invitation ouvre l'application directement dans la séance, et tout le panneau est à la taille du doigt.
- **Pour l'hôte** : garder les commandes de lecture pour soi, retirer quelqu'un, et un compte à rebours « 3, 2, 1 » pour démarrer tous ensemble.
- **Vocal** : un volume pour chaque personne (retenu pour les prochaines séances), le choix du micro, et le nom de celui qui parle s'affiche sur la vidéo.
- **Discussion** : « Sara écrit… », l'heure des messages, et celui qui arrive en cours de route retrouve ce qui s'est dit. De petits sons signalent une arrivée, un départ ou un message (désactivables).
- **Corrigé** : relancer la lecture juste après la pause d'un ami remettait ton lecteur en pause tout seul pendant que les autres repartaient ; quand l'hôte disparaît, la séance reprend plus vite avec un nouvel hôte. Un ami resté sur la version précédente peut toujours rejoindre (sans les nouveautés).

---

## NovelReader 0.39.1

- **Les épisodes rangés dans la bonne saison.** Avec beaucoup de sources, plusieurs saisons se retrouvaient mélangées dans une seule liste, ou des épisodes sous la mauvaise saison : l'application lisait mal la façon dont chaque source écrit ses épisodes. Cas réels corrigés : « S01 - Episode 10 » (4KHDHub) et « T2 - E5 » (toutes les sources espagnoles) mettaient tout en saison 1 ; « S4 - Ep. 5 » (WatchAnimeWorld) rangeait la saison 4 dans la saison 1 ; « Épisode 8 Saison 1 » partait en saison 8.
- **Le bon numéro d'épisode.** À côté du nom, beaucoup de sources envoient un numéro qui n'est pas celui de l'épisode : un compteur sur toutes les saisons, un code (112 pour saison 2 épisode 12) ou la place dans la liste. L'étiquette affichait « S2 E112 » ; elle affiche « S2 E12 ». La recherche de sous-titres, qui s'appuie sur ce numéro, tombe plus souvent juste.
- **Anime-Sama affiche ses épisodes.** Cette source range chaque saison à part et l'application ne lui demandait pas la liste de ses saisons : résultat, aucun épisode. Elle les demande maintenant une par une et garde les noms de la source (« Saison 1 », « Saison 1hs », « Kai », les films sous leur titre). Un anime à quarante saisons et films met quelques dizaines de secondes à s'ouvrir la première fois.
- **Films et épisodes spéciaux à part** : quand une source les liste avec les saisons (« Film 1 : … », saison 0), ils ont leur propre groupe, après les saisons, au lieu de se glisser dans la saison 1.
- **Plus de fausses saisons** : un titre d'épisode qui cite une saison (« Episode 14 - … Season 4 Episode 14 ») ne crée plus une saison à lui tout seul. Et quand une source colle des « saisons » qui n'en sont pas (une par film, ou des numéros qui montent et descendent alors que les épisodes se suivent), la liste reste une seule liste, dans l'ordre.
- **« Reprendre » et « Suivant »** savent s'il reste un épisode même quand la numérotation repart à 1 à chaque saison. La saison choisie dans la liste ne suit plus d'un titre à l'autre.
- **Téléchargements** : un épisode garde sa saison dans son nom (« S2 · Episode 5 ») et la page les range par saison.
- **AniLab remarche, et la fiche des titres (résumé, genres) se charge de nouveau** avec Torrentio Anime, Subsplease, Castle TV et Lunar : le moteur ne transmettait pas le titre à la source, et celles qui le lisent échouaient.
- **Vérifié sur du vrai** : les noms d'épisodes ont été relevés auprès de 246 sources (659 titres). Le rangement par saison change pour 44 titres et les numéros pour 70 ; ces listes réelles servent désormais de tests, pour qu'une prochaine retouche ne les abîme pas.

---

## NovelReader 0.39.0

- **Téléchargements : un échec est réessayé tout seul**, avec des liens neufs (ceux des sites expirent) : tout de suite, puis 2 et 10 minutes plus tard. Ensuite seulement il t'attend, avec la raison en clair et un bouton « Réessayer ».
- **Coupure ou fermeture** : sans connexion, un téléchargement attend qu'elle revienne. Si tu fermes l'application, il reprend au prochain lancement ; avant, la file était oubliée sans rien dire.
- **Reprise où il s'était arrêté** : un fichier continue à l'octet près, un flux garde les morceaux déjà enregistrés (quand le site le permet ; sinon il recommence). Une connexion qui ne répond plus est abandonnée après 30 secondes et reprise ; sur PC, elle bloquait toute la file sans fin.
- La page Téléchargements affiche **la vitesse et le temps restant**.
- **L'application se relève toute seule** : sur PC, si la page plante, la fenêtre se recharge au lieu de rester blanche jusqu'au redémarrage. Sur téléphone, quand Android reprend la mémoire de la page, l'application ne se ferme plus : l'interface revient, le moteur vidéo et les téléchargements continuent.
- **Grandes bibliothèques, bien plus rapides** (mesuré en simulant un téléphone modeste) : un roman de 5 000 chapitres s'ouvre cinq fois plus vite, un anime de plus de 1 000 épisodes près de quatre fois, un historique de 3 000 lignes sept fois. La liste des chapitres s'ouvre autour de celui que tu lis ; les épisodes sont rangés par centaines (« 401–500 »).
- **Sur téléphone**, « Afficher le chapitre en cours » ne faisait rien : il y va.
- **Regarder ensemble** : la fenêtre reprenait par erreur l'habillage du menu de gauche (boutons sans cadre, grands vides, discussion cachée en bas). Elle est redessinée : la discussion et le champ du message restent visibles, les réglages (volume des voix, appuyer pour parler, caméras) ont leur page derrière la roue dentée, et sur téléphone elle se pose au-dessus de la barre du bas.
- **Détails** : tailles écrites à la française (« 1,3 Go », « 37 % ») ; « Ajouter un profil » à côté de la liste des profils ; la petite fenêtre « Caster » reste dans la page.

---

## NovelReader 0.38.0

- **Affichage en couvertures** : les bibliothèques (livres, anime, séries, films) et Découvrir montrent maintenant tes titres comme un mur de couvertures, plusieurs par ligne sur PC et tablette, deux par ligne sur téléphone.
  - La progression est une ligne sous la couverture, « +3 nouveaux » une pastille dessus.
  - Le bouton sous chaque couverture reprend la lecture (« Ch. 42 ») ou ouvre les épisodes ; la couverture et le titre ouvrent la fiche, comme avant.
- **Liste détaillée toujours disponible** : les deux boutons à côté du filtre (couvertures / liste) changent l'affichage. Le choix est gardé et vaut pour toute l'application.
- **Sur téléphone**, chaque écran a été repris un par un :
  - **Épisodes** : « vu » et « télécharger » sont toujours visibles à droite de chaque épisode. Avant, ils n'apparaissaient qu'au survol de la souris, donc jamais sur un téléphone.
  - **Fiche d'un titre** : la couverture, le titre et la progression sont côte à côte (le titre passait sous la couverture).
  - **Bibliothèques** : filtre, tri et affichage sur une ligne (le tri est une icône qui ouvre sa liste), « Vérifier les nouveaux chapitres » en entier sur la suivante ; le menu « ⋯ » d'une carte s'ouvre vers le haut près de la barre du bas.
  - **Lecture, téléchargements, historique, réglages** : champ de recherche du chapitre sur toute la largeur, titres entiers, listes alignées, phrases qui ne sont plus coupées par « … ».
- **Réglages de traduction du lecteur** : le menu (langue, « Toujours traduire ce roman ») s'ouvrait sans s'afficher sur téléphone et dans une fenêtre de moins de 980 px. Il s'affiche partout.
- **Sur PC** : dans une fenêtre moyenne, le filtre des bibliothèques garde sa place (il se réduisait à un mot) ; une fiche ouverte depuis Découvrir a un en-tête lisible ; l'onglet choisi est marqué dans Historique et Calendrier ; dans « Ton année », un titre sans image garde une petite vignette (elle remplissait la page).
- **Thème clair** : il reprend exactement les formes du thème sombre. Des cadres apparaissaient en thème clair seulement (autour de « Plus », sous les onglets de Découvrir, dans le menu « ⋯ »). Avec un thème de lecture sombre dans l'application claire, les boutons du lecteur sont assortis et « ← Chapitres » est lisible.
- **Lecteur vidéo** : le cadre garde la forme d'un écran pendant le chargement, donc la page ne saute plus quand l'image arrive. Le bouton plein écran de la vidéo, grisé depuis la 0.37, est retiré : le plein écran est dans la barre du lecteur, avec F ou un double-clic.
- **Livres** : quand un site ne répond plus pendant l'ouverture d'un roman, l'application le dit après une minute au lieu d'attendre sans fin ; la vérification des nouveaux chapitres ne reste plus bloquée sur ce site.
- **Français** : le bouton « Lire » de Découvrir et de la recherche s'affichait « Lu » ; « Bibliothèque » tient en entier dans la barre du bas du téléphone ; plus de « ? » ou « : » seul en début de ligne.

---

## NovelReader 0.37.0

- **Plein écran complet (PC)** : le plein écran montre maintenant tout le lecteur, pas seulement l'image.
  - « Passer l'intro », « Épisode suivant » et les messages restent visibles.
  - Le titre, la qualité, l'audio, les sous-titres et le menu « ⋯ » sont en haut de l'image ; ils se cachent avec la souris après 3 secondes sans mouvement.
  - Le plein écran est **gardé d'un épisode au suivant** et quand le lecteur change de qualité ou de serveur. Avant, il fallait le remettre à chaque épisode.
  - Touche F, double-clic sur l'image ou bouton « Plein écran » au-dessus de la vidéo.
- **Moteur vidéo qui se relance tout seul** : si le moteur n'a pas fini de démarrer ou s'est arrêté (mémoire, antivirus, sortie de veille), la demande l'attend et le relance au lieu d'échouer avec « fetch failed ».
- **Flux impossible à décoder** : deux réparations sont tentées, puis le lecteur passe à un autre flux à la même position, au lieu de rester bloqué sur une image figée.
- **Lecture des livres** : le chapitre suivant est chargé pendant que tu lis, donc « Chapitre suivant » s'ouvre tout de suite.
- **Finition de l'interface** :
  - Plus aucun bouton, liste ou case avec l'aspect gris du navigateur : tout est dessiné par l'application, en thème sombre et clair (cases à cocher, menu « ⋯ », listes, barres de défilement sombres).
  - Même police partout (Inter, fournie avec l'application), sur PC et sur téléphone.
  - Transitions discrètes : les pages, fenêtres, menus et messages apparaissent en douceur ; les couvertures arrivent sans à-coup ; des formes grises remplacent le vide pendant le chargement de Découvrir. Rien ne bouge si Windows ou Android demande de réduire les animations.
  - Tout ce qui s'affiche par-dessus la vidéo est sombre dans les deux thèmes (« Passer l'intro » était blanc sur blanc en plein écran clair).
  - Sources : les offres de « Ajouter des sources » sont séparées, « Plus » reste un mot de la phrase.
- **Clavier** : dans une fenêtre (recherche partout, Continuer, raccourcis…), Tab reste dans la fenêtre ; à la fermeture, le focus revient au bouton qui l'a ouverte.
- **Corrections** : page trop serrée sur tablette Android (une règle d'affichage était ignorée), pastille de l'épisode en cours illisible en thème clair, épisodes vus rendus pâles par transparence.

---

## NovelReader 0.36.0

- **Accessibilité au niveau le plus exigeant (WCAG AAA)**, vérifiée automatiquement sur chaque page, en thème sombre et clair, sur PC et téléphone :
  - **Contrastes 7:1** : les textes discrets (dates, sous-titres de cartes, aides), les liens violets, le texte des boutons violets et les textes secondaires du lecteur (4 thèmes) sont plus lisibles. Le thème clair est recalculé avec la même règle.
  - **Boutons assez grands** : au moins 44 px sur téléphone (pour le doigt) et 24 px sur PC, cases à cocher comprises.
  - Plus de texte rendu pâle par transparence : il garde une vraie couleur lisible.
  - **Lecteurs d'écran** : le nom de chaque bouton contient le texte affiché, les listes de Découvrir et l'historique ont de vrais titres, les menus « ⋯ », la recherche partout, le panneau Continuer, le guide de bienvenue et « Nouveautés » sont vérifiés eux aussi.

---

## NovelReader 0.35.2

- **Protection Cloudflare (FlareSolverr)** : « Lancer » ne laissait que 2,5 secondes à FlareSolverr pour démarrer, alors qu'il ouvre d'abord un navigateur, ce qui prend souvent 10 à 30 secondes.
  - « Lancer » attend maintenant jusqu'à 45 secondes, et affiche « Démarrage… » pendant ce temps.
  - Si FlareSolverr s'arrête, l'app dit pourquoi : port déjà utilisé, antivirus, etc. Elle montre aussi ses dernières lignes de journal, avec les boutons « Réessayer », « Réinstaller » et « Voir le journal ».
  - En quittant NovelReader, le navigateur de FlareSolverr est maintenant fermé aussi. Avant, il pouvait rester ouvert et bloquer le lancement suivant.

---

## NovelReader 0.35.1

- **Mise à jour et désinstallation sur PC** : l'installateur ferme maintenant NovelReader lui-même, y compris quand il tourne près de l'horloge. Avant, Windows refusait de remplacer ses fichiers avec le message « le fichier est ouvert dans NovelReader » (v8_context_snapshot.bin).

---

## NovelReader 0.35.0

- **Sans internet, l'app dit clairement ce qui se passe** : chaque page a été vérifiée connexion coupée, et aucune ne reste à charger indéfiniment.
  - « Vérifier les nouveaux chapitres / épisodes » disait « Tout est à jour » alors qu'aucune source n'avait répondu. Il dit maintenant que la vérification est impossible et qu'il faut vérifier la connexion.
  - Les pages vidéo (Découvrir, Recherche, Calendrier) affichaient « Failed to fetch » ; elles expliquent maintenant le problème en français.
  - Une série qui ne s'ouvrait pas affichait une fenêtre système ; c'est maintenant un message dans la page, comme pour les animes.
  - Un film qui ne se chargeait pas disait « Cette source n'a pas renvoyé de film lisible » ; il dit maintenant pourquoi.
- **Démarrage plus léger** : le code de lecture des flux vidéo (HLS) n'est plus chargé au lancement, seulement quand une vidéo en a besoin. L'app charge environ 40 % de code en moins au démarrage (1,5 Mo → 0,9 Mo).

---

## NovelReader 0.34.0

- **Historique partagé entre le PC et le téléphone** :
  - Quand la synchronisation est activée, la page Historique et « Ton année » regroupent ce que tu as lu et regardé sur les deux appareils. Chaque ligne indique 📱 Téléphone ou 💻 PC.
  - L'historique garde maintenant 1 000 lignes au lieu de 300.
  - « Effacer » sur un appareil efface aussi sur l'autre.
- **Plus rapide avec une grande bibliothèque** : avec 1 500 romans, sur un appareil lent, la bibliothèque s'affiche en 1 à 2 s au lieu de 7 s, et le panneau « Continuer » s'ouvre en 0,5 s au lieu de 10 s.
  - Les bibliothèques et les longues listes de chapitres n'affichent d'abord que les premières cartes ; la suite se charge pendant que tu fais défiler.
  - En revenant d'un roman, tu retrouves l'endroit où tu étais dans la bibliothèque.
- **Plus de risque de perdre ta bibliothèque** : les listes de chapitres sont maintenant rangées à part. Avant, une bibliothèque avec beaucoup de longs romans pouvait remplir la mémoire de l'app ; à partir de là, chaque changement était perdu sans prévenir.
  - Le passage au nouveau rangement est automatique au premier lancement.
  - Les sauvegardes et la synchronisation gardent les chapitres.

---

## NovelReader 0.33.0

- **Livres › Découvrir › Pour toi** : des romans des mêmes genres que ceux que tu as terminés ou que tu lis en ce moment, sous la forme « Parce que tu as aimé X · Fantasy ».
  - Ils viennent de tes propres sources de livres : « Lire » les ouvre tout de suite, et « ＋ Ajouter » les met dans ta bibliothèque.
  - Les romans que tu as déjà ne sont pas proposés.
- **Ton année** (Historique › 🎉 Ton année 2026) :
  - ton temps de lecture et de visionnage, et les chapitres et épisodes terminés ;
  - le nombre de jours actifs et ta plus longue série de jours d'affilée ;
  - ton mois le plus chargé, les titres que tu as le plus suivis et tes genres préférés.
  - Tout est calculé à partir de ce que l'app a déjà noté sur cet appareil.

---

## NovelReader 0.32.0

- **Sous-titres lisibles en thème clair** : la couleur « Blanc » des sous-titres suivait la couleur du texte de l'app, presque noire en thème clair. Ils s'affichaient donc en noir sur l'ombre ou le fond noir. Ils sont maintenant toujours en vrai blanc (ou vrai jaune), que le thème soit clair ou sombre. Ça vaut pour tous les sous-titres : ceux de la source, ceux trouvés en ligne, ceux générés et ceux traduits.
- **Découvrir › Pour toi** : des suggestions « Parce que tu as aimé… » pour les titres que tu as terminés (étagère « Terminés ») ou regardés dernièrement.
  - Pour les animes, ce sont les recommandations des utilisateurs d'AniList.
  - Pour les séries et les films, ce sont des titres des mêmes genres parmi les plus regardés sur IMDb, ceux qui partagent le plus de genres en premier.
  - Les titres déjà dans ta bibliothèque ne sont pas proposés, et « Trouver » cherche le titre sur tes sources.
- **Mini-lecteur sur PC** (menu ⋯ du lecteur › Mini-lecteur) :
  - La fenêtre devient une petite vidéo dans le coin de l'écran, au-dessus de tes autres programmes, avec les sous-titres.
  - Tu la déplaces par la barre du haut. « Retour à l'app » ou Échap rend à la fenêtre sa taille et sa place d'avant.

---

## NovelReader 0.31.0

- **Continuer ici** : si tu as commencé un épisode ou un chapitre sur ton téléphone, le PC te propose en haut de l'écran de « Continuer ici », à l'épisode et à la position où tu t'es arrêté. L'inverse marche aussi. Il faut que la synchronisation entre le PC et le téléphone soit activée.
- **Affichage vérifié partout** : chaque page de l'app est maintenant contrôlée automatiquement en taille petit téléphone, téléphone, tablette et petite fenêtre PC. Rien ne doit dépasser de l'écran.
  - Corrigé : le bouton « Installer le pack anime » sortait de l'écran sur les petits téléphones.
  - Plus généralement, sur toutes les lignes « texte + bouton » des pages Sources, le bouton passe sous le texte quand il manque de place.

---

## NovelReader 0.30.1

- **Sources vidéo › Avancé** : sur téléphone, les cadres « Moteur vidéo », « Cloudflare » et « Dépôts d'extensions » ne sortent plus de l'écran. Les adresses longues sont coupées avec « … », et les boutons passent sous le texte.

---

## NovelReader 0.30.0

- **Les autres noms d'un titre** : « Chercher sur mes autres sources » essaie aussi les noms dans d'autres langues et les autres orthographes.
  - Exemple : « L'Attaque des Titans », « Attack on Titan », « Shingeki no Kyojin ».
  - Ces noms viennent d'AniList pour les animes, de TVmaze pour les séries et de Wikidata pour les films.
  - Chaque résultat reste vérifié aussi strictement qu'avant : même titre, même saison, même année.
- **Télécharger une saison entière** :
  - Le menu du nombre d'épisodes propose « Le reste de la saison » et « Tous les suivants ».
  - Sur le téléphone, avec **Wi‑Fi seulement**, les épisodes attendent le Wi‑Fi au lieu d'utiliser les données mobiles. Un téléchargement en cours s'arrête si le téléphone quitte le Wi‑Fi, puis reprend au retour du Wi‑Fi.
  - La suppression automatique des épisodes vus reste dans Téléchargements.
- **Profil enfant et code parental** (Réglages › Profils) :
  - Tu définis un code de 4 à 8 chiffres, puis tu fais d'un profil un profil enfant. Tu peux aussi y choisir des genres autorisés.
  - Dans ce profil, les titres pour adultes (ecchi, horreur, etc.) ne s'ouvrent pas, et l'onglet Genres ne montre que les genres permis.
  - Les Réglages, les sources et la sortie du profil demandent le code.
  - Le code n'est jamais enregistré en clair. Après 5 erreurs, il faut attendre 30 secondes.
  - Un titre dont la source ne donne pas les genres n'est pas bloqué.

---

## NovelReader 0.29.1

- **« Chercher sur mes autres sources » plus précis** : seul le même film ou la même série est retenu.
  - Le nom est comparé mot à mot, sans tenir compte des accents, des articles ni des mentions comme VF, VOSTFR ou 1080p.
  - Une suite (« Dune 2 », « Partie 2 »), une autre saison, un homonyme (« Green Lanterns ») ou un titre d'une autre année n'est jamais pris.
  - Chaque résultat est vérifié sur sa fiche : l'année, et film ou série selon le nombre d'épisodes.
  - Un nom avec un sous-titre en plus n'est gardé que si l'année ou le nombre d'épisodes concorde.
  - Le menu « Source » indique le nom trouvé quand il diffère.
  - Les sources ajoutées par erreur avec l'ancienne recherche sont masquées.
- La même règle sert quand la lecture passe toute seule sur une autre source parce que la sienne ne marche pas.

---

## NovelReader 0.29.0

- **Calendrier des sorties** (Animes et Séries › Calendrier) : les prochains épisodes des titres de tes bibliothèques, jour par jour, pour les deux semaines à venir, à l'heure de ton fuseau horaire. Les dates viennent d'AniList pour les animes et de TVmaze pour les séries. Un clic ouvre le titre.
- **Prochain épisode sur la fiche** : « Prochain épisode : Ép. 6 · vendredi à 17:00 (dans 3 j) ».
- **Touches média** :
  - Sur PC : les touches lecture/pause, suivant et précédent du clavier, et la fenêtre média de Windows, pilotent la vidéo.
  - Sur téléphone : les contrôles dans les notifications et sur l'écran verrouillé, avec la jaquette, ainsi que les boutons des écouteurs et du Bluetooth.
- **Widget « Continuer »** (Android) : sur l'écran d'accueil, ton dernier épisode ou chapitre en cours. Un geste suffit pour le reprendre. Pour l'ajouter, fais un appui long sur l'écran d'accueil › Widgets › NovelReader.

---

## NovelReader 0.28.1

- **Épisode suivant : même serveur, même qualité** — le serveur et la qualité choisis pour un titre (ex. « HubCloud 1080p ») sont repris aux épisodes suivants, même quand le nom du flux change d'un épisode à l'autre (taille du fichier, ordre de la liste). Si ce serveur n'est pas là, la même qualité ou la plus proche est prise. Pour un nouveau titre, la dernière qualité choisie sert de point de départ.
- **Même source vidéo** : si un titre a dû être lu depuis une autre source (la sienne ne marchait pas), les épisodes suivants commencent directement par celle qui a marché.
- **Choisir la source** d'une série ou d'un anime : sur la page du titre, un menu « Source » liste les sources où il a été trouvé ; « Chercher sur mes autres sources » en ajoute d'autres. Le choix est gardé pour les épisodes suivants.
- **Profils sur le téléphone** : comme sur PC, chacun a sa bibliothèque, sa progression, son historique et ses réglages (Réglages › Général › Profils, ou le menu). Les sources et les réglages de l'appareil restent communs.
- **Lecteur** : un nom de qualité très long ne dépasse plus du cadre de la vidéo (tablette, petite fenêtre).

---

## NovelReader 0.28.0

- **Genres dans les bibliothèques** (livres, animes, séries, films) : une ligne de genres sous les étagères (les plus fréquents d'abord, les autres dans « Autres genres… ») pour ne voir que tes titres d'un genre. Les genres viennent des sources ; pour les titres déjà ajoutés, ils sont récupérés petit à petit (livres : à la prochaine vérification des nouveaux chapitres ; vidéos : en ouvrant la bibliothèque).
- **Découvrir › Genres** :
  - Livres : un menu « Genre » quand la source en propose (selon la source).
  - Animes : les plus populaires de chaque genre (AniList).
  - Séries et films : les plus populaires de chaque genre (catalogue Cinemeta / IMDb).
  - « Trouver » cherche le titre sur tes sources pour le regarder ou l'ajouter.

---

## NovelReader 0.27.1

- **Panneau « Reprendre » plus court** : l'historique y montre une seule ligne par titre — le dernier épisode ou chapitre — au lieu de tous les épisodes (5 titres au plus). « Tout l'historique » ouvre une page à part, jour par jour, avec un filtre Livres / Animes / Séries / Films.

---

## NovelReader 0.27.0

- **Téléphone : sources de livres protégées par Cloudflare** — la page « Just a moment… » est maintenant passée dans l'application, comme sur PC. Si le site demande de cocher une case, une page s'affiche avec une courte explication ; elle se ferme toute seule ensuite. Le passage est gardé quelques heures pour ce site.
- **Sources vidéo : pourquoi une source ne marche pas, en clair** — dans Sources, chaque source en panne dit ce qui se passe (site fermé, compte demandé, site qui a changé, pas de vidéo…) et quoi faire.
- **Titre qui ne s'ouvre plus** : si sa source ne donne plus la liste des épisodes, NovelReader l'ouvre tout seul depuis une autre source où il a été trouvé (un message l'indique).
- **Épisode suivant automatique** : le compte à rebours de 10 s démarre dès le début du générique de fin (quand la source l'indique), annulable. Sans repère, un bouton « Épisode suivant » apparaît dans la dernière minute.
- **Passer les génériques tout seul** (option, Réglages › Vidéo › Lecture) avec « Le regarder » pour revenir en arrière.
- **« Reprendre » passe à l'épisode suivant** quand le dernier regardé est fini (« Suivant · Ép. 3 ») ; tout vu → « Chercher la saison suivante ».

---

## NovelReader 0.26.0

- **Regarder ou lire sans ajouter** : dans la recherche et dans Découvrir, chaque titre a maintenant « ▶ Regarder » (animes, séries, films) ou « Lire » (livres) à côté de « ＋ Ajouter ». La page du titre s'ouvre telle quelle, avec un bouton « Ajouter à la bibliothèque » si tu veux le garder ; ce que tu as regardé est conservé si tu l'ajoutes ensuite. « ← Retour » ramène aux résultats, qui sont toujours là.
- **Nouveaux épisodes : tu es prévenu même quand NovelReader est ouvert** — un message apparaît dans l'application avec les titres concernés et un bouton « Voir » (avant, seule une notification Windows s'affichait, et seulement quand NovelReader était en arrière-plan).
- **PC : la vérification continue quand tu fermes la fenêtre** — NovelReader reste près de l'horloge (clic droit sur son icône pour quitter) et vérifie tes animes et séries toutes les 6 heures. Option « Démarrer avec Windows » pour être prévenu même sans l'ouvrir. Réglages › Notifications.

---

## NovelReader 0.25.5

- **Téléphone : vidéo sans son** — certains fichiers (souvent les versions 4K / « remux ») ont un son Dolby ou DTS que le lecteur intégré du téléphone ne sait pas lire : l'image passe, le son non. L'application le détecte maintenant après quelques secondes et propose « Ouvrir dans un autre lecteur » (VLC, MX Player…), qui reprend au même moment. Autre solution : choisir une autre qualité.

---

## NovelReader 0.25.4

- **Android : panneau « Reprendre » vide après avoir fait défiler** — quand on descendait puis remontait, les cartes n'étaient plus dessinées. Le flou derrière les panneaux est retiré sur Android (voile plus sombre à la place) et la zone qui défile est redessinée à chaque fois.
- **Plus de cadre mauve épais** autour du panneau à son ouverture.

---

## NovelReader 0.25.3

- **Historique lisible** : dans le panneau « Reprendre », les titres de l'historique s'affichaient en noir sur fond sombre. Ils sont maintenant en clair, et « Effacer » a la couleur des liens.

---

## NovelReader 0.25.2

- **Mise à jour sur PC quand le Wi-Fi ne la laisse pas passer** : si la mise à jour échoue deux fois ou reste bloquée, l'application la télécharge par un second chemin (connexion directe, IPv4 d'abord, reprise là où elle s'est arrêtée, plusieurs essais) et vérifie l'empreinte du fichier avant de l'installer. Si même cela échoue, Réglages › Général propose un lien pour télécharger l'installateur dans le navigateur.
- **« Échec de désinstallation des anciens fichiers d'application » pendant la mise à jour (PC)** : le moteur vidéo restait parfois ouvert et bloquait le remplacement des fichiers. L'installateur ferme maintenant ce qui tourne encore, et continue l'installation même si l'ancienne version ne s'enlève pas entièrement. NovelReader ferme aussi le moteur pour de bon avant de se mettre à jour.
- **Retour au même endroit** : plus fiable — la position est notée au moment du clic et retrouvée sans animation, même tout en bas d'une longue liste.

---

## NovelReader 0.25.1

- **Retour au même endroit** : quand on ouvre un titre depuis une liste puis qu'on revient en arrière (bouton Retour, Alt+←, bouton Précédent de la souris, geste Retour du téléphone), la liste réapparaît là où on l'avait laissée, plus tout en haut.
- **Toucher l'onglet où l'on est déjà** remonte en haut de la page.
- **Le nom NovelReader** en haut du menu ramène à la bibliothèque de la section.
- **Bouton pour replier le menu** : l'icône « < » ressemblait à un bouton Retour ; c'est maintenant une icône de panneau.
- **Téléphone** : le menu « Plus » a des lignes toutes identiques ; dans la bibliothèque, « Vérifier les nouveautés » et le tri tiennent sur une ligne, les titres arrivent plus haut ; le bouton de fermeture des panneaux est un vrai bouton rond.

---

## NovelReader 0.25.0

- **Premier lancement guidé** : trois étapes courtes — la langue, par quoi commencer (livres, animes, séries, films), puis les sources recommandées en un clic.
- **Messages d'erreur clairs** : au lieu du message technique, l'application dit ce qui s'est passé et quoi faire (« Ce site vérifie que tu n'es pas un robot », « Ce site n'existe plus, utilise une autre source »…). Le détail technique reste disponible.
- **Écrans vides utiles** : une bibliothèque, une recherche ou des téléchargements vides affichent une phrase et un seul bouton pour la prochaine étape.
- **Textes d'aide plus courts** : une phrase sous chaque réglage ; « Plus » ouvre le reste.
- **Mêmes cartes partout** : livres, animes, séries, films, Découvrir et résultats de recherche partagent la même carte, les mêmes tailles et la même marque verte « Dans ta bibliothèque ».
- **Téléphone plus compact** : titres, marges et blocs resserrés pour voir plus de contenu par écran ; les onglets d'étagères défilent sur une seule ligne.
- **Mêmes mots partout** : « Reprendre », « Retirer », « Sources »… un seul terme par action, sur PC et sur téléphone.
- **Confiance (antivirus, SmartScreen)** : les trois outils téléchargés sur Windows (ffmpeg, whisper, FlareSolverr) sont vérifiés par leur empreinte avant d'être lancés ; chaque version publie ses empreintes SHA-256 et une preuve de construction ; la signature Windows s'active dès qu'un certificat est ajouté au dépôt. Détails et limites (Google Play) dans docs/TRUST.md.

---

## NovelReader 0.24.3

- **Watch party : « Aucune soirée avec ce code »** — le PC qui crée la soirée reste maintenant inscrit sur le serveur de connexion : si ce lien tombe (coupure Wi-Fi, PC qui sort de veille, redémarrage du serveur), il se réinscrit tout seul avec le même code. Avant, la soirée continuait mais plus personne ne pouvait la rejoindre.
- **Watch party : caméra noire chez l'autre** — chaque PC vérifie que l'image de la caméra arrive vraiment. Si rien n'arrive au bout de quelques secondes, l'appel caméra est relancé tout seul avec un autre format vidéo (H264, puis VP9, puis VP8). En attendant, la bulle montre l'initiale de la personne au lieu d'un cercle noir. Les deux PC doivent être à jour.
- **Rejoindre une soirée** : le code est essayé plusieurs fois pendant une dizaine de secondes avant d'annoncer qu'il est inconnu.

---

## NovelReader 0.24.2

- **La vidéo en haut de la page** : quand on clique sur « Continuer » (ou sur un épisode) pour une série, un anime ou un film, le lecteur est maintenant le premier bloc de la page, juste sous le bouton Retour. L'affiche, les informations et la liste des épisodes suivent.

---

## NovelReader 0.24.1

- **Téléphone : bandeau de mise à jour** — le bandeau « Installer / Plus tard » ne passe plus derrière le menu du haut quand on fait défiler la page ; il reste visible juste en dessous.

---

## NovelReader 0.24.0

- **Sources de livres réparées** : plus de la moitié des sources ne démarraient pas du tout (il leur manquait des outils de LNReader). Au contrôle automatique, on passe de 41 à 179 sources qui marchent sur 371 ; chez vous le chiffre est plus haut, car le contrôle tourne depuis un serveur que beaucoup de sites bloquent.
- **Sur PC, les sources de livres passent par le moteur de Chrome** : certificats vérifiés comme dans un navigateur, cookies gardés par site, et la page « Just a moment… » de Cloudflare est passée dans une fenêtre cachée (elle s'affiche seulement s'il faut cocher la case).
- **Vérification automatique des sources** : les sources de livres sont contrôlées deux fois par semaine, et aussi sur votre appareil. Une source qui reste en panne est mise de côté (recherche et Découvrir) et revient toute seule quand elle remarche ; « Utiliser quand même » dans Sources. Les sources vidéo sont maintenant contrôlées deux fois par semaine et mises de côté après 5 jours.
- **Sécurité** : une source de livres ne peut joindre que des sites web (ni fichiers du PC, ni réseau de la maison) ; un chapitre ne garde que son texte et ses images (scripts, cadres, formulaires et liens piégés retirés) ; les fenêtres de vérification n'ont aucune permission.
- **Réglages en 5 onglets** : Général, Bibliothèque et synchro, Notifications, Vidéo, À propos (les raccourcis clavier y sont rangés).
- **Une seule recherche** : le bouton Rechercher (Ctrl K) cherche dans vos bibliothèques et mène à la recherche dans toutes les sources.
- **Fichiers** : Téléchargements, Vidéos locales et Internet Archive sont réunis en une entrée avec trois onglets.
- **Sources vidéo en trois blocs** : Ajouter des sources, Mes sources, Avancé (moteur, Cloudflare, dépôts — replié).
- **Cartes de bibliothèque allégées** : un clic sur la carte ouvre le titre, un seul bouton principal, l'étagère et « Retirer » dans le menu « ⋯ ».
- **Lecteur** : audio, qualité, sous-titres et diffusion restent visibles ; vitesse, style des sous-titres et mini-lecteur sont dans le menu « ⋯ ».

---

## NovelReader 0.23.0

- **Interface plus harmonieuse** : une seule palette de couleurs, une échelle de tailles de texte, trois arrondis et des espacements réguliers sur tous les écrans, en sombre comme en clair.
- **Boutons et champs identiques partout** : trois hauteurs (lignes denses, normal, recherche), les mêmes styles principal / secondaire / suppression, et le même contour quand on navigue au clavier.
- **Icônes au trait** à la place des émojis (Regarder ensemble, micro, caméra, cast, signets, lecture à voix haute…). Les drapeaux, que Windows affichait en lettres « TR » / « TN », sont remplacés.
- **Titres et sections** : titres de page plus nets, titres de section de même taille, et un espace clair entre les sujets d'un même panneau.
- **Thème clair** : l'élément sélectionné du menu se voit mieux ; une liste de choix des Réglages qui n'avait aucun style est corrigée.
- **Nouveautés** : la fenêtre « Nouveautés » ne montre plus que la dernière version.

---

## NovelReader 0.22.3 — Bêta familiale Android

- **Lecture vidéo : publicité à la place de l'épisode** — nouveau bouton « Publicité à la place de l'épisode ? » sous le lecteur.
- Si l'extension propose plusieurs flux, le bouton passe à un autre flux en évitant de revenir sur ceux déjà essayés.
- Si un seul flux est disponible, NovelReader explique qu'il faut choisir une autre source. **Les publicités incorporées dans le flux ne peuvent pas être reconnues et supprimées automatiquement.**
- Tests UI ajoutés pour le changement de serveur et l'absence d'alternative ; contrôles de compilation et d'émulateur Android avant publication.
- Pour tester depuis **0.22.1**, installer directement l'APK 0.22.3 par-dessus l'application après sauvegarde. Pour les mises à jour suivantes, activer « Recevoir les versions bêta » dans Paramètres.

**Bêta familiale :** les extensions vidéo restent de confiance variable. Ne touchez pas aux publicités suspectes et utilisez une autre source si nécessaire. La sécurité complète des plugins reste à renforcer.

---

## NovelReader 0.22.2 — Bêta familiale Android

- **Nouveau : recevoir les versions bêta** dans **Paramètres › Mises à jour** sur Android. Cette option reste **désactivée par défaut** : les proches restent sur le canal stable.
- **Changement de canal sans risque de mauvaise installation** : désactiver les bêtas retire toute bêta déjà téléchargée de la proposition d'installation. Les téléchargements précédents ne peuvent pas réactiver l'ancienne proposition.
- **Vérification des téléchargements** : seuls les APK de version présents dans les publications du dépôt officiel NovelReader sont sélectionnés.
- **Tests** : sélection des versions stables/bêta, retour vers le canal stable, redémarrage avec préférence conservée, ouverture des romans et synchronisation PC ↔ Android automatisée.
- **Installation initiale** : installer une fois cette 0.22.2 manuellement par-dessus la 0.22.1, puis activer « Recevoir les versions bêta » pour les suivantes.

**Attention : version d'essai.** Faites une sauvegarde de votre bibliothèque avant installation. Ne désinstallez pas l'application avant mise à jour. Les plugins de lecture ne disposent pas encore d'une isolation complète ; les extensions vidéo Aniyomi demandent une revue de sécurité supplémentaire.

---

## NovelReader 0.22.1 — Bêta familiale Android

Cette version est destinée aux premiers tests sur téléphone Android, avant une distribution plus large.

### Corrections et sécurité
- **Stabilité Windows et Android** : contrôles des traductions, de TypeScript et des tests avant la création de l'installeur Windows ; publication de l'APK seulement si le démarrage sur émulateur fonctionne.
- **Continuer sur téléphone** : deux envois quasi simultanés du PC ne font plus perdre le deuxième.
- **Sous-titres Windows** : évite les doublons quand les dossiers « Subs » et « subs » sont le même dossier.
- **Sources de romans LNReader** : les téléchargements de scripts sont limités au dépôt officiel LNReader et à 2 Mo ; les URL douteuses et les redirections vers des sources externes sont refusées.
- **Tests automatiques** renforcés pour vérifier ces protections.

### À savoir
- **Bêta, pas une sandbox complète** : une extension officielle compromise pourrait toujours présenter un risque. N'installez pas de sources non fiables.
- La sécurité des extensions vidéo Aniyomi et l'isolation complète du moteur LNReader restent à renforcer.
- Installez l'APK **par-dessus** l'ancienne version : ne désinstallez pas NovelReader. Faites une sauvegarde des bibliothèques dans les réglages avant de tester.
- Cette publication est marquée « préversion » pour ne pas imposer cette bêta aux proches recevant les mises à jour Android habituelles.
