# Confiance : antivirus, SmartScreen, Play Protect

Ce document dit ce que l'application fait déjà pour ne pas ressembler à un logiciel
dangereux, et ce qui ne peut être obtenu que par le propriétaire du projet.

## Ce qui est en place (dans le code et la chaîne de publication)

- **Aucun programme inconnu n'est exécuté.** Les trois outils que l'application
  télécharge sur Windows (ffmpeg, whisper.cpp, FlareSolverr) viennent d'une version
  précise, et leur empreinte SHA-256 est vérifiée avant le premier lancement. Un
  fichier qui ne correspond pas est supprimé.
- **Empreintes publiées.** Chaque version contient `SHA256SUMS-windows.txt` et
  `SHA256SUMS-android.txt` : n'importe qui peut vérifier que son fichier est bien
  celui construit ici.
- **Provenance de construction.** L'installateur Windows reçoit une attestation
  GitHub (« build provenance ») : `gh attestation verify NovelReader-Setup-x.y.z.exe -R madaratn/NovelReader-Windows`.
- **Signature Windows prête.** Dès que le dépôt a les secrets `WIN_CSC_LINK`
  (certificat .pfx en base64) et `WIN_CSC_KEY_PASSWORD`, l'installateur et
  l'application sont signés automatiquement. Sans eux, rien ne change.
- **Rapport antivirus optionnel.** Avec le secret `VT_API_KEY` (clé gratuite
  VirusTotal), chaque installateur publié est analysé et le lien du rapport est écrit
  dans le résumé de la construction.
- **Android** : même clé de signature à chaque version, peu de permissions (caméra
  pour le QR code, notifications, installation des mises à jour).
- **Sécurité interne** : fenêtres isolées, sources de livres limitées aux sites web,
  chapitres nettoyés, serveurs locaux protégés par un code.

## Ce qui demande une action du propriétaire

### Windows : l'avertissement SmartScreen et les faux positifs

Un installateur **non signé** déclenche l'avertissement bleu de SmartScreen et attire
les antivirus. Il n'y a que trois façons d'y remédier (source : Microsoft, « Code
signing options ») :

| Option | Coût | Pour un particulier au Luxembourg | Effet |
|---|---|---|---|
| Microsoft Store (MSIX) | gratuit | oui | Microsoft signe le paquet : aucun avertissement |
| Certificat OV (Certum, Sectigo, DigiCert…) | environ 150–300 $/an | oui | la réputation se construit avec les téléchargements |
| Azure Artifact Signing | environ 10 $/mois | non (particuliers : USA et Canada seulement) | idem OV |
| SignPath Foundation | gratuit | réservé aux projets open source acceptés | idem OV |

Même signé, un nouvel installateur peut afficher l'avertissement quelques semaines,
le temps que la réputation se construise.

Si Microsoft Defender signale l'installateur à tort : le soumettre sur
<https://www.microsoft.com/wdsi/filesubmission> (catégorie « Software developer »).

### Google Play

L'application actuelle **ne peut pas être publiée telle quelle** sur Google Play, pour
trois règles de Google (« Device and Network Abuse ») :

1. Une application ne peut se mettre à jour que par Google Play. NovelReader télécharge
   et installe son propre APK (permission `REQUEST_INSTALL_PACKAGES`).
2. Une application ne peut pas télécharger de code exécutable hors de Google Play. Les
   extensions vidéo (format Aniyomi) sont des APK chargés par l'application. Les
   sources de livres (JavaScript interprété) sont, elles, tolérées par la règle.
3. Les sources donnent accès à des contenus dont l'application n'a pas les droits :
   c'est la raison pour laquelle Aniyomi, Mihon et LNReader ne sont pas sur Google Play.

Une « édition Play » est possible techniquement (sans mise à jour interne, sans
extensions vidéo, sans sources fournies), mais ce serait une application bien plus
limitée. Hors Play, Play Protect peut afficher « application inconnue » à
l'installation : c'est normal pour tout APK installé à la main.
