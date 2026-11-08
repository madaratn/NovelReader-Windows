## NovelReader 0.9.4

Cette version s'installe toute seule en arrière-plan (fermez NovelReader et rouvrez-le).

### Correction : films et séries sans son
- Certains gros fichiers (souvent les « remux » 1080p / 4K de HubCloud, UHD Movies, 4KHDHub…) ont un son en **Dolby (AC3 / E-AC3) ou DTS**, que le lecteur intégré ne sait pas lire : l'image passait mais sans son, et le bouton du volume était grisé.
- NovelReader le détecte maintenant tout seul après quelques secondes de lecture, et **convertit le son en direct**. Le son reste calé sur l'image (pause, avance, retour, vitesse).
- La première fois, NovelReader télécharge le convertisseur de son (ffmpeg, environ 30 Mo, une seule fois).
- S'il y a plusieurs langues dans le fichier (VF, VO…), un menu **Piste son** apparaît au-dessus de la vidéo ; votre choix est retenu. Un curseur de volume est aussi affiché, car celui du lecteur est grisé pour ces fichiers.
- Bon à savoir : pour convertir le son, le fichier est lu une deuxième fois en parallèle, donc ces fichiers demandent plus de connexion. Avec une connexion lente, choisissez plutôt une qualité plus légère.

### Installation
Téléchargez `NovelReader-Setup-0.9.4.exe` ci-dessous. Windows SmartScreen peut afficher un avertissement car l'installeur n'est pas signé : « Informations complémentaires » › « Exécuter quand même ».
