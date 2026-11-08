## NovelReader 0.10.1

Cette version s'installe toute seule quand vous fermez NovelReader. C'est la dernière fois qu'il faut fermer l'app pour une mise à jour de l'interface (voir ci-dessous).

### Mises à jour sans fermer l'app
- À partir de maintenant, la plupart des mises à jour (watch party, lecteur, menus, corrections…) s'appliquent **sans fermer NovelReader** : la nouvelle interface est téléchargée en arrière-plan, puis la fenêtre se recharge en une seconde.
- Elle s'applique toute seule quand vous n'utilisez pas l'app (en arrière-plan ou sans y toucher pendant 2 minutes), jamais pendant une vidéo, un watch party ou une lecture. Une bannière propose aussi **Mettre à jour maintenant (1 seconde)**.
- Les rares mises à jour du « moteur » (lecteur vidéo de fond, sources, convertisseur de son) s'installent toujours en silence à la fermeture.
- Sécurité : l'interface vient uniquement de la page officielle des versions de NovelReader sur GitHub et son empreinte est vérifiée avant d'être utilisée. Si une nouvelle interface ne démarre pas, NovelReader revient tout seul à la précédente.

### Correction : avancer dans la vidéo
- Avec certains serveurs vidéo, il était impossible d'avancer dans la vidéo (le curseur revenait en arrière) : le moteur vidéo n'indiquait pas la taille du fichier, et certains serveurs ignorent les demandes « à partir de tel endroit ». Le moteur envoie maintenant la taille, et saute lui-même au bon endroit quand le serveur ne le fait pas.

### Installation
Téléchargez `NovelReader-Setup-0.10.1.exe` ci-dessous. Windows SmartScreen peut afficher un avertissement car l'installeur n'est pas signé : « Informations complémentaires » › « Exécuter quand même ».
