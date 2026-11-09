## NovelReader 0.18.5

- **Cast sur Android : la télé n'était pas trouvée** (par exemple une TCL Google TV).
  - La recherche des télés passe maintenant explicitement par le Wi-Fi, même quand les données mobiles sont allumées.
  - En plus de la recherche d'Android, l'application interroge elle-même le réseau pour trouver les Chromecast / Google TV (certains téléphones, dont des Samsung, rendent celle d'Android lente ou muette).
  - La recherche dure un peu plus longtemps (6 secondes).
  - Si aucune télé n'est trouvée, la fenêtre affiche un petit diagnostic (adresse Wi-Fi, réponses reçues) pour comprendre ce qui bloque.
- Les boutons « Chercher à nouveau » et « Fermer » de la fenêtre du cast sont de nouveau lisibles.
- La mise à jour se propose toute seule dans l'application (bouton **Installer**).
