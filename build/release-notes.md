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
