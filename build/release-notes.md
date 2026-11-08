## NovelReader 0.13.2

Cette mise à jour s'applique **sans fermer NovelReader**.

### Correction : écran noir (le temps défile mais pas d'image)
- Certaines qualités (souvent les gros fichiers **HEVC / x265**, 4K ou 10 bits) ne peuvent pas être affichées par certains PC : le son et le temps avancent, mais l'image reste noire. C'était le cas pour des invités de watch party, puisque chacun a sa propre qualité.
- Le lecteur le détecte maintenant après quelques secondes et **passe tout seul à une autre qualité** qui n'a pas encore été essayée, en restant au même endroit (et en restant synchronisé dans un watch party).
- Les autres changements de qualité automatiques (serveur bloqué, erreur réseau) essaient aussi toutes les qualités, plus seulement celle d'après.

### Installation
Téléchargez `NovelReader-Setup-0.13.2.exe` ci-dessous. Windows SmartScreen peut afficher un avertissement car l'installeur n'est pas signé : « Informations complémentaires » › « Exécuter quand même ».
