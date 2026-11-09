## NovelReader 0.18.7

- **Cast sur Android, télé introuvable** : quand le réseau ne laisse pas passer les messages de découverte (certaines box et certaines télés), l'application essaie maintenant directement chaque adresse du Wi-Fi sur le port des télés Chromecast / Google TV / Android TV, puis demande son nom à la télé. Quelques secondes.
- Le diagnostic affiché quand aucune télé n'est trouvée dit aussi ce qui répond sur le réseau (télé DLNA, télé qui ne connaît que YouTube…).
- (0.18.6) Les flux HLS dont l'adresse ne se termine pas par .m3u8 (Vidplay…) sont reconnus et lus au lieu d'être abandonnés ; message clair quand le serveur d'une qualité refuse la vidéo.
- Android : la mise à jour se propose toute seule dans l'application (bouton **Installer**).
