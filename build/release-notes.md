## NovelReader 0.13.5

Cette version s'installe toute seule quand vous fermez NovelReader (elle touche le lecteur de torrents).

### Correction : les épisodes des sources torrent (Torrentio) ne se lançaient pas
- Avant, seul le premier torrent de la liste était essayé (souvent une énorme version 4K) : s'il n'avait pas de sources ou ne répondait pas, rien ne se passait.
- Maintenant, les **3 meilleurs torrents** sont essayés l'un après l'autre : beaucoup de sources (seeders), 1080p ou 720p, pas de HEVC / 4K / HDR souvent illisibles, pas de fichiers géants.
- Un message montre où on en est : « Connexion au torrent (1/3)… Cela peut prendre jusqu'à 30 secondes. »
- Pour les **packs de saison**, le bon épisode est maintenant ouvert (avant, le plus gros fichier du pack était pris, donc souvent le mauvais épisode).
- Si aucune vidéo ne marche, l'erreur s'affiche maintenant directement dans le lecteur, avec le bouton pour la signaler.

### Installation
Téléchargez `NovelReader-Setup-0.13.5.exe` ci-dessous. Windows SmartScreen peut afficher un avertissement car l'installeur n'est pas signé : « Informations complémentaires » › « Exécuter quand même ».
