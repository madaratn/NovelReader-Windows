## NovelReader 0.18.6

- **« Cette qualité n'est pas prise en charge »** : certains serveurs (Vidplay…) donnent un flux HLS à une adresse qui n'a pas l'air d'en être un. Le lecteur le prenait pour un fichier vidéo, n'arrivait pas à le lire et abandonnait cette qualité. Maintenant, il regarde ce que contient le lien, reconnaît le flux HLS et le lit (Android et PC).
- Quand le serveur d'une qualité refuse d'envoyer la vidéo (erreur 403, page web au lieu d'une vidéo…), le message le dit clairement avant d'essayer un autre flux.
- Android : la mise à jour se propose toute seule dans l'application (bouton **Installer**).
