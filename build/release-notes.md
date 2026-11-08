## NovelReader 0.14.1

Cette mise à jour s'applique **sans fermer NovelReader**.

### Correction : « matched … but it has no episode » avec les autres sources
- Quand la source principale n'a pas l'épisode, NovelReader le cherche dans vos autres sources. Mais il cherchait l'épisode avec le numéro tel que donné par la source, et beaucoup de sources envoient « -1 » : l'épisode n'était jamais trouvé.
- Maintenant l'épisode est trouvé par **saison et numéro**, lus aussi dans le nom (« S1 E2 », « Episode 2 »…).
- Quand plusieurs titres portent le même nom (un film et une série « Deep in Love »…), les **3 premiers** sont essayés au lieu du premier seulement.

### Messages d'erreur plus clairs
- La liste « Pourquoi chaque source a échoué » explique maintenant les cas courants : site **protégé par Cloudflare** (installez ou démarrez FlareSolverr dans Sources › Protection Cloudflare), **bloqué dans votre pays**, site qui **refuse l'app**, **aucune vidéo pour cet épisode**, **site qui n'existe plus**.

### Installation
Téléchargez `NovelReader-Setup-0.14.1.exe` ci-dessous. Windows SmartScreen peut afficher un avertissement car l'installeur n'est pas signé : « Informations complémentaires » › « Exécuter quand même ».
