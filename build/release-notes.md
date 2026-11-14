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
