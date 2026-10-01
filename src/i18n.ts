// Minimal i18n: English source strings are the keys, French is a lookup table.
// t('Hello {name}', {name}) interpolates {placeholders}. Missing keys fall back
// to English, so an untranslated string never breaks the UI.

export type Lang = 'en' | 'fr'
export const LANGS: { id: Lang, label: string }[] = [{ id: 'en', label: 'English' }, { id: 'fr', label: 'Français' }]

function detect(): Lang {
  try {
    const saved = localStorage.getItem('lang')
    if (saved === 'en' || saved === 'fr') return saved
  } catch {}
  return String(navigator.language || '').toLowerCase().startsWith('fr') ? 'fr' : 'en'
}

let lang: Lang = detect()
try { document.documentElement.lang = lang } catch {}

export const getLang = () => lang
export function setLang(next: Lang) {
  lang = next
  try { localStorage.setItem('lang', next); document.documentElement.lang = next } catch {}
}

const FR: Record<string, string> = {
  // Navigation / shell
  'Books': 'Livres', 'Anime': 'Anime', 'Series': 'Séries', 'Movies': 'Films',
  'Library': 'Bibliothèque', 'Comics': 'Bandes dessinées', 'Global Search': 'Recherche globale', 'Sources': 'Sources',
  'Anime Library': 'Bibliothèque anime', 'Local Videos': 'Vidéos locales', 'Internet Archive': 'Internet Archive',
  'Series Library': 'Bibliothèque séries', 'Movie Library': 'Bibliothèque films',
  'Novel': 'Roman', 'Reader': 'Lecture', 'Episodes': 'Épisodes', 'Settings': 'Paramètres',
  'Main navigation': 'Navigation principale', 'Mode': 'Mode', 'Shortcuts': 'Raccourcis',
  'Expand sidebar': 'Déplier la barre latérale', 'Collapse sidebar': 'Replier la barre latérale',
  'Keyboard shortcuts': 'Raccourcis clavier', 'Close': 'Fermer',
  'Switch mode (Books, Anime, Series, Movies)': 'Changer de mode (Livres, Anime, Séries, Films)',
  'Jump to the search field of the page': 'Aller au champ de recherche de la page',
  'Go back to the previous page (mouse back button too)': 'Revenir à la page précédente (bouton « précédent » de la souris aussi)',
  'Collapse or expand the sidebar': 'Replier ou déplier la barre latérale',
  'Show or hide this list': 'Afficher ou masquer cette liste',
  'Close this list / leave a text field': 'Fermer cette liste / quitter un champ de texte',
  // Errors
  'Technical details': 'Détails techniques', 'Copy details': 'Copier les détails', 'Copied': 'Copié',
  'Could not add novel:': 'Impossible d’ajouter le roman :', 'Could not load chapter:': 'Impossible de charger le chapitre :',
  'Repository error:': 'Erreur du dépôt :', 'Search failed:': 'La recherche a échoué :',
  // Library
  'Your Library': 'Ma bibliothèque',
  '{n} novel saved locally.': '{n} roman enregistré sur ce PC.', '{n} novels saved locally.': '{n} romans enregistrés sur ce PC.',
  'Your library is empty': 'Ta bibliothèque est vide',
  'Search your sources for a novel, pick a result and it will be saved here.': 'Cherche un roman dans tes sources, choisis un résultat et il sera enregistré ici.',
  'Search novels': 'Chercher des romans',
  'Continue where you left off': 'Reprendre là où tu t’es arrêté',
  'Continue · Ch. {n}': 'Continuer · Ch. {n}', 'Start reading': 'Commencer la lecture',
  'Filter by title, author or source…': 'Filtrer par titre, auteur ou source…',
  'Sort': 'Trier', 'Recently read': 'Lus récemment', 'Recently added': 'Ajoutés récemment', 'Title A–Z': 'Titre A–Z', 'Most unread': 'Le plus de non lus',
  'No novel matches “{q}”.': 'Aucun roman ne correspond à « {q} ».',
  'Chapters of {name}': 'Chapitres de {name}', 'Show chapters': 'Voir les chapitres',
  '{done} of {total} chapters': '{done} chapitres sur {total}', '{n} left': '{n} restants', 'not started': 'pas commencé',
  'Remove': 'Retirer', 'Removed “{name}”.': '« {name} » retiré.', 'Undo': 'Annuler', 'Dismiss': 'Fermer',
  '{n} chapter': '{n} chapitre', '{n} chapters': '{n} chapitres',
  // Novel page
  'Unknown author': 'Auteur inconnu', '{done} / {total} read': '{done} / {total} lus', 'last read {when}': 'lu {when}',
  'Show current chapter': 'Voir le chapitre en cours', 'Filter by title or chapter number…': 'Filtrer par titre ou numéro de chapitre…',
  'Order': 'Ordre', 'Oldest first': 'Plus anciens d’abord', 'Newest first': 'Plus récents d’abord', 'Hide read': 'Masquer les lus',
  'No chapter matches.': 'Aucun chapitre ne correspond.', 'Read': 'Lu',
  'Reading · Ch. {n}': 'En cours · Ch. {n}', 'Ch. {n}': 'Ch. {n}', 'Chapter {n}': 'Chapitre {n}', 'Loading…': 'Chargement…',
  // Reader
  'Chapters': 'Chapitres', 'Chapter position': 'Position dans le roman', 'Reading settings': 'Réglages de lecture',
  'End of chapter {n} of {total}': 'Fin du chapitre {n} sur {total}', 'Previous': 'Précédent', 'Next': 'Suivant',
  'Next chapter': 'Chapitre suivant', 'Last chapter': 'Dernier chapitre',
  'Theme': 'Thème', 'Dark': 'Sombre', 'Sepia': 'Sépia', 'Light': 'Clair', 'Black': 'Noir',
  'Text size': 'Taille du texte', 'Smaller text': 'Texte plus petit', 'Larger text': 'Texte plus grand',
  'Line spacing': 'Interligne', 'Tighter lines': 'Lignes plus serrées', 'Looser lines': 'Lignes plus espacées',
  'Width': 'Largeur', 'Narrow': 'Étroite', 'Medium': 'Moyenne', 'Wide': 'Large', 'Full': 'Pleine',
  'Font': 'Police', 'Reset': 'Réinitialiser', '← → chapters · + − text size': '← → chapitres · + − taille du texte',
  // Time
  'just now': 'à l’instant', '{n} min ago': 'il y a {n} min', '{n} h ago': 'il y a {n} h',
  '{n} day ago': 'il y a {n} jour', '{n} days ago': 'il y a {n} jours',
  // Search / sources / comics
  'Find a title everywhere': 'Trouver un titre partout',
  'Novels, manhwa, manhua and manga: search every LNReader source without installing it first.': 'Romans, manhwa, manhua et manga : cherche dans toutes les sources LNReader sans les installer.',
  'Title, e.g. Shadow Slave or Solo Leveling': 'Titre, par ex. Shadow Slave ou Solo Leveling',
  'Search LNReader sources without installing them first.': 'Cherche dans les sources LNReader sans les installer d’abord.',
  'Novel title, e.g. Shadow Slave': 'Titre du roman, par ex. Shadow Slave', 'Search all sources': 'Chercher dans toutes les sources',
  'matching source result(s). Only sources that return the requested novel are shown below.': 'résultat(s). Seules les sources qui renvoient le roman demandé sont affichées.',
  'select source': 'choisir cette source',
  'Official LNReader repository · {n} sources loaded': 'Dépôt officiel LNReader · {n} sources chargées',
  'Refreshing…': 'Actualisation…', 'Refresh repository': 'Actualiser le dépôt', 'Filter sources or language…': 'Filtrer par source ou langue…',
  'Installed ✓': 'Installée ✓', 'Install': 'Installer',
  'All': 'Tout', 'Search comics, e.g. Solo Leveling…': 'Chercher une BD, par ex. Solo Leveling…', 'Search sources': 'Chercher dans les sources',
  'Your Comics Library is empty': 'Ta bibliothèque de BD est vide',
  'Search LNReader sources for a manhwa, manhua or manga and add it here. Image-page reading support is the next milestone.': 'Cherche un manhwa, manhua ou manga dans les sources LNReader et ajoute-le ici. La lecture page par page arrive dans une prochaine version.',
  // Local videos
  'Play video files stored on this PC. {files} in {folders}.': 'Lis les vidéos enregistrées sur ce PC. {files} dans {folders}.',
  '{n} file': '{n} fichier', '{n} files': '{n} fichiers', '{n} folder': '{n} dossier', '{n} folders': '{n} dossiers',
  '{n} video': '{n} vidéo', '{n} videos': '{n} vidéos',
  'watched': 'vu', 'Watched': 'Vu', 'resume at {time}': 'reprendre à {time}',
  'This file uses a format or codec the built-in player cannot decode (common with HEVC/H.265 video or AC3/DTS audio in MKV files). An MP4 with H.264 video and AAC audio will play.': 'Ce fichier utilise un format ou un codec que le lecteur intégré ne sait pas décoder (fréquent avec la vidéo HEVC/H.265 ou l’audio AC3/DTS dans les MKV). Un MP4 en H.264 avec audio AAC sera lu.',
  'The file could not be read. It may have been moved, renamed or deleted — try Rescan.': 'Impossible de lire le fichier. Il a peut-être été déplacé, renommé ou supprimé — essaie « Réanalyser ».',
  'Close player': 'Fermer le lecteur', 'Up next:': 'À suivre :',
  'Add your video folders': 'Ajoute tes dossiers de vidéos',
  'Pick a folder on this PC that contains videos (MP4, WebM, MKV…). Sub-folders are scanned too, and each one becomes its own group.': 'Choisis un dossier de ce PC qui contient des vidéos (MP4, WebM, MKV…). Les sous-dossiers sont aussi analysés, et chacun forme son propre groupe.',
  'Add folder…': 'Ajouter un dossier…', 'Continue watching': 'Reprendre la lecture', 'Filter videos…': 'Filtrer les vidéos…',
  'By folder and name': 'Par dossier et nom', 'No video matches “{q}”.': 'Aucune vidéo ne correspond à « {q} ».',
  'Folders': 'Dossiers', 'Scanning…': 'Analyse…', 'Rescan': 'Réanalyser',
  'Space play/pause · ← → 10 s · F fullscreen · M mute': 'Espace lecture/pause · ← → 10 s · F plein écran · M muet',
  'N/P next/previous': 'N/P suivante/précédente',
  // Internet Archive
  'Fetching the torrent from archive.org…': 'Récupération du torrent sur archive.org…', 'Loading torrent metadata…': 'Chargement des métadonnées du torrent…',
  'Connecting to peers…': 'Connexion aux pairs…', 'Buffering…': 'Mise en mémoire tampon…', 'Downloading': 'Téléchargement',
  'Fully downloaded': 'Entièrement téléchargé',
  'Stalled — no data received for 45 s. The peers or the archive.org web seed may be unreachable.': 'Bloqué — aucune donnée reçue depuis 45 s. Les pairs ou le serveur d’archive.org sont peut-être injoignables.',
  'The torrent failed.': 'Le torrent a échoué.', '{n} peer': '{n} pair', '{n} peers': '{n} pairs',
  'Could not open this item:': 'Impossible d’ouvrir cet élément :', 'Could not start the torrent:': 'Impossible de démarrer le torrent :',
  'Public-domain and Creative Commons films and cartoons, streamed from archive.org\'s official torrents.': 'Films et dessins animés du domaine public ou sous Creative Commons, lus depuis les torrents officiels d’archive.org.',
  'This file uses a format or codec the built-in player cannot decode. Try the MP4 version of the item.': 'Ce fichier utilise un format ou un codec que le lecteur intégré ne sait pas décoder. Essaie la version MP4 de l’élément.',
  'Playback failed while reading the torrent stream.': 'La lecture a échoué pendant la lecture du flux torrent.',
  'Stop and close': 'Arrêter et fermer', 'Search, e.g. Popeye, Superman, Night of the Living Dead…': 'Recherche, par ex. Popeye, Superman, Night of the Living Dead…',
  'Searching…': 'Recherche…', 'Search': 'Rechercher',
  'This item has no torrent on archive.org.': 'Cet élément n’a pas de torrent sur archive.org.', 'No video files in this item.': 'Aucune vidéo dans cet élément.',
  'Starting…': 'Démarrage…', 'Play': 'Lire', 'Back to results': 'Retour aux résultats',
  '{n} result': '{n} résultat', '{n} results': '{n} résultats', '{n} downloads': '{n} téléchargements', 'open': 'ouvrir',
  'Getting started': 'Pour commencer',
  'Search for a title. Results are limited to archive.org\'s public-domain collections (classic cartoons, feature films, Prelinger, silent films) and items with a Creative Commons or public-domain license. MP4 files play best.': 'Cherche un titre. Les résultats sont limités aux collections du domaine public d’archive.org (dessins animés classiques, longs métrages, Prelinger, films muets) et aux éléments sous licence Creative Commons ou domaine public. Les fichiers MP4 sont les mieux lus.',
  // Settings / backup / updates
  'Language': 'Langue', 'Language, backups and updates.': 'Langue, sauvegardes et mises à jour.', 'About': 'À propos',
  'Backup and restore': 'Sauvegarde et restauration',
  'Your library, reading progress and preferences are stored on this PC. Export a backup file to keep them safe or to move them to another computer.': 'Ta bibliothèque, ta progression et tes réglages sont enregistrés sur ce PC. Exporte une sauvegarde pour les garder en sécurité ou les transférer sur un autre ordinateur.',
  'Export a backup…': 'Exporter une sauvegarde…', 'Restore from a file…': 'Restaurer depuis un fichier…',
  'Backup saved: {path}': 'Sauvegarde enregistrée : {path}',
  'Replace your current library and settings with this backup ({n})?': 'Remplacer ta bibliothèque et tes réglages actuels par cette sauvegarde ({n}) ?',
  'Automatic backups': 'Sauvegardes automatiques',
  'NovelReader keeps the last 10 versions of your data automatically. A copy of the current data is also saved before any restore.': 'NovelReader garde automatiquement les 10 dernières versions de tes données. Une copie des données actuelles est aussi faite avant chaque restauration.',
  'No automatic backup yet.': 'Pas encore de sauvegarde automatique.', 'Restore': 'Restaurer', 'Confirm restore': 'Confirmer la restauration',
  'Back up now': 'Sauvegarder maintenant', 'Open backups folder': 'Ouvrir le dossier des sauvegardes',
  'Automatic backup created.': 'Sauvegarde automatique créée.', 'Nothing changed since the last backup.': 'Rien n’a changé depuis la dernière sauvegarde.',
  '{n} novel': '{n} roman', '{n} novels': '{n} romans',
  'This file is not a NovelReader backup.': 'Ce fichier n’est pas une sauvegarde NovelReader.',
  'The backup is damaged (no data).': 'La sauvegarde est endommagée (aucune donnée).',
  'The backup is damaged (invalid entry).': 'La sauvegarde est endommagée (entrée invalide).',
  'The backup file is too large.': 'Le fichier de sauvegarde est trop volumineux.',
  'New chapters': 'Nouveaux chapitres',
  'Check my library for new chapters when NovelReader starts (at most every 12 hours)': 'Vérifier les nouveaux chapitres de ma bibliothèque au démarrage (au plus toutes les 12 heures)',
  'Check for new chapters': 'Vérifier les nouveaux chapitres', 'Checking {done}/{total}…': 'Vérification {done}/{total}…',
  'Last check: {when}': 'Dernière vérification : {when}', '+{n} new': '+{n} nouveaux',
  '{n} novel has new chapters.': '{n} roman a de nouveaux chapitres.', '{n} novels have new chapters.': '{n} romans ont de nouveaux chapitres.',
  'Everything is up to date.': 'Tout est à jour.',
  '{n} source did not answer.': '{n} source n’a pas répondu.', '{n} sources did not answer.': '{n} sources n’ont pas répondu.',
  // Crash screen / welcome / read aloud
  'Something went wrong on this page': 'Un problème est survenu sur cette page',
  'Your library and reading progress are safe. You can go back to the library or reload NovelReader.': 'Ta bibliothèque et ta progression ne sont pas touchées. Tu peux revenir à la bibliothèque ou relancer NovelReader.',
  'Back to library': 'Retour à la bibliothèque', 'Reload': 'Relancer', 'Error:': 'Erreur :',
  'Welcome to NovelReader': 'Bienvenue dans NovelReader',
  'Read web novels, keep track of where you are, and watch your own videos — all in one place. First, choose your language:': 'Lis des romans en ligne, retrouve toujours où tu en es et regarde tes propres vidéos, au même endroit. Pour commencer, choisis ta langue :',
  'What you can do': 'Ce que tu peux faire', 'Read novels': 'Lire des romans',
  'Search hundreds of sources, add novels to your library and continue exactly where you stopped.': 'Cherche dans des centaines de sources, ajoute des romans à ta bibliothèque et reprends exactement là où tu t’es arrêté.',
  'Watch your videos': 'Regarder tes vidéos',
  'Play the video files stored on this PC, grouped by folder, with resume and shortcuts.': 'Lis les vidéos enregistrées sur ce PC, classées par dossier, avec reprise et raccourcis.',
  'Discover public-domain classics': 'Découvrir des classiques du domaine public',
  'Stream free films and cartoons from the Internet Archive.': 'Regarde gratuitement des films et dessins animés de l’Internet Archive.',
  'Stay safe': 'Garder tes données à l’abri',
  'Your data is backed up automatically. Settings lets you export it or move it to another PC.': 'Tes données sont sauvegardées automatiquement. Les Paramètres te permettent de les exporter ou de les transférer sur un autre PC.',
  'Add your first novel': 'Ajoute ton premier roman',
  'Open Global Search and type a title.': 'Ouvre la Recherche globale et tape un titre.',
  'Pick a result: NovelReader adds it to your library.': 'Choisis un résultat : NovelReader l’ajoute à ta bibliothèque.',
  'Click Continue in your library to start reading.': 'Clique sur Continuer dans ta bibliothèque pour lire.',
  'Tip: press ? at any time to see the keyboard shortcuts.': 'Astuce : appuie sur ? à tout moment pour voir les raccourcis clavier.',
  'Skip': 'Passer', 'Back': 'Retour', 'Explore on my own': 'Explorer seul', 'Search a novel': 'Chercher un roman',
  'Show the welcome guide again': 'Revoir le guide de bienvenue',
  'Read aloud': 'Lecture à voix haute', 'Pause': 'Pause', 'Previous paragraph': 'Paragraphe précédent', 'Next paragraph': 'Paragraphe suivant',
  'Paragraph {n} of {total}': 'Paragraphe {n} sur {total}', 'Speed': 'Vitesse', 'Voice': 'Voix', 'Automatic': 'Automatique',
  'Continue to the next chapter': 'Enchaîner sur le chapitre suivant',
  'The voice stopped unexpectedly.': 'La voix s’est arrêtée de façon inattendue.',
  'Read aloud is not available on this system.': 'La lecture à voix haute n’est pas disponible sur ce système.',
  // Global search
  'Could not load the source list:': 'Impossible de charger la liste des sources :', 'Choose at least one language.': 'Choisis au moins une langue.',
  'Stop': 'Arrêter', 'Languages': 'Langues', 'Loading sources…': 'Chargement des sources…', '+{n} more': '+{n} autres',
  'Default languages': 'Langues par défaut', 'All languages': 'Toutes les langues',
  '{n} source selected': '{n} source sélectionnée', '{n} sources selected': '{n} sources sélectionnées',
  'Searching {checked} / {total} sources…': 'Recherche : {checked} / {total} sources…',
  'Search stopped after {checked} of {total} sources.': 'Recherche arrêtée après {checked} sources sur {total}.',
  'Search finished: {n} sources checked.': 'Recherche terminée : {n} sources vérifiées.',
  '{n} title found': '{n} titre trouvé', '{n} titles found': '{n} titres trouvés',
  '“{name}” was added to your library.': '« {name} » a été ajouté à ta bibliothèque.', 'Open': 'Ouvrir',
  'Search tips': 'Conseils de recherche',
  'Type the title as it is usually written in English. Pick the languages of the sources you want to search: fewer languages means faster results.': 'Tape le titre comme il est habituellement écrit en anglais. Choisis les langues des sources à interroger : moins de langues, c’est des résultats plus rapides.',
  'Recent searches': 'Recherches récentes', 'No title found': 'Aucun titre trouvé',
  'Check the spelling, try a shorter title, or select more languages.': 'Vérifie l’orthographe, essaie un titre plus court ou sélectionne plus de langues.',
  'Found on {n} source': 'Trouvé sur {n} source', 'Found on {n} sources': 'Trouvé sur {n} sources',
  'In your library ✓': 'Dans ta bibliothèque ✓', 'Adding…': 'Ajout…', 'Add from {source}': 'Ajouter depuis {source}', 'Other sources': 'Autres sources',
  // Shelves / sources
  'Shelves': 'Étagères', 'Shelf': 'Étagère', 'Reading': 'En cours', 'Plan to read': 'À lire', 'Completed': 'Terminés', 'Dropped': 'Abandonnés',
  'No novel on this shelf yet.': 'Aucun roman sur cette étagère pour l’instant.',
  'The sites Global Search looks in. You do not need to install anything: search uses them directly. Here you can see which ones work.': 'Les sites dans lesquels cherche la Recherche globale. Rien à installer : la recherche les utilise directement. Ici, tu vois lesquels fonctionnent.',
  'Test the sources in my languages ({n})': 'Tester les sources de mes langues ({n})', 'Refresh the list': 'Actualiser la liste',
  'Testing {done} / {total} sources…': 'Test : {done} / {total} sources…', 'Working': 'Fonctionnent', 'Not responding': 'Ne répond pas',
  'Not tested yet': 'Pas encore testée', 'Testing…': 'Test…', 'Works': 'Fonctionne', 'Failing': 'En panne', 'Test': 'Tester', 'No source matches.': 'Aucune source ne correspond.',
  // Updates / notifications
  'NovelReader {v} is ready to install.': 'NovelReader {v} est prêt à être installé.', 'Restart and update': 'Redémarrer et mettre à jour', 'Later': 'Plus tard',
  'Checking for updates…': 'Recherche de mises à jour…', 'Downloading version {v}… {p}%': 'Téléchargement de la version {v}… {p} %',
  'Version {v} is ready to install.': 'La version {v} est prête à être installée.', 'NovelReader is up to date.': 'NovelReader est à jour.',
  'Could not check for updates:': 'Impossible de vérifier les mises à jour :',
  'Automatic updates work in the installed app (not in development mode).': 'Les mises à jour automatiques fonctionnent dans l’appli installée (pas en mode développement).',
  'Updates are checked automatically when NovelReader starts.': 'Les mises à jour sont vérifiées automatiquement au démarrage.',
  'Updates': 'Mises à jour', 'Installed version: {v}': 'Version installée : {v}', 'Check for updates': 'Rechercher des mises à jour',
  'Show a Windows notification when new chapters are found': 'Afficher une notification Windows quand de nouveaux chapitres sont trouvés',
  // Offline / import / find / stats
  'You are offline and this chapter is not downloaded.': 'Tu es hors connexion et ce chapitre n’est pas téléchargé.',
  'Downloading chapters {done} / {total}…': 'Téléchargement des chapitres : {done} / {total}…',
  '{n} chapter available offline': '{n} chapitre disponible hors ligne', '{n} chapters available offline': '{n} chapitres disponibles hors ligne',
  '{n} failed': '{n} en échec', 'How many chapters to download': 'Combien de chapitres télécharger',
  'Next {n} chapters': 'Les {n} prochains chapitres', 'All remaining chapters': 'Tous les chapitres restants', 'Download': 'Télécharger',
  'Delete downloads': 'Supprimer les téléchargements', 'Available offline': 'Disponible hors ligne',
  'Import from LNReader (Android)': 'Importer depuis LNReader (Android)',
  'In the LNReader app, open More > Backup and restore > Create backup, copy the .zip file to this PC, then import it here. Your novels and where you stopped reading are added to your library.': 'Dans l’appli LNReader, ouvre Plus > Sauvegarde et restauration > Créer une sauvegarde, copie le fichier .zip sur ce PC, puis importe-le ici. Tes romans et l’endroit où tu t’es arrêté sont ajoutés à ta bibliothèque.',
  'Importing…': 'Import…', 'Import an LNReader backup…': 'Importer une sauvegarde LNReader…',
  '{n} novel imported': '{n} roman importé', '{n} novels imported': '{n} romans importés', '{n} already in your library': '{n} déjà dans ta bibliothèque',
  '{n} skipped (source not available: {list})': '{n} ignorés (source indisponible : {list})', 'Open library': 'Ouvrir la bibliothèque',
  'This file is not an LNReader backup (not a zip file).': 'Ce fichier n’est pas une sauvegarde LNReader (pas un fichier zip).',
  'No novels were found in this LNReader backup.': 'Aucun roman trouvé dans cette sauvegarde LNReader.',
  'Offline chapters': 'Chapitres hors ligne', '{chapters} for {novels} use {size} on this PC.': '{chapters} pour {novels} occupent {size} sur ce PC.',
  'No chapter downloaded yet. Use Download on a novel page to read without an internet connection.': 'Aucun chapitre téléchargé pour l’instant. Utilise Télécharger sur la page d’un roman pour lire sans connexion.',
  'Confirm: delete all downloads': 'Confirmer : tout supprimer', 'Delete all downloaded chapters': 'Supprimer tous les chapitres téléchargés',
  'Find in chapter…': 'Rechercher dans le chapitre…', '{i} of {n}': '{i} sur {n}', 'No match': 'Aucun résultat', 'Previous match': 'Résultat précédent', 'Next match': 'Résultat suivant',
  'Your reading this week': 'Ta lecture cette semaine', 'chapters in 7 days': 'chapitres en 7 jours', 'reading time in 7 days': 'de lecture en 7 jours',
  'day in a row': 'jour d’affilée', 'days in a row': 'jours d’affilée', 'Chapters read per day, last 7 days': 'Chapitres lus par jour, 7 derniers jours',
  '{n} min': '{n} min', '{h} h {m} min': '{h} h {m} min', '{h} h': '{h} h',
  // Bookmarks & notes
  'Bookmarks & notes': 'Marque-pages et notes', 'Highlight': 'Surligner', 'yellow': 'jaune', 'green': 'vert', 'pink': 'rose',
  'Add a note…': 'Ajouter une note…', 'Your note': 'Ta note', 'Cancel': 'Annuler', 'Save': 'Enregistrer',
  'Note saved': 'Note enregistrée', 'Highlighted': 'Passage surligné', 'Bookmark this place': 'Ajouter un marque-page ici', 'Bookmark added': 'Marque-page ajouté',
  '{n} saved passage': '{n} passage enregistré', '{n} saved passages': '{n} passages enregistrés', 'Nothing saved yet': 'Rien d’enregistré pour l’instant',
  'While reading, select text to highlight it or add a note, or press the bookmark button to remember a place. Everything appears here.': 'Pendant la lecture, sélectionne du texte pour le surligner ou y ajouter une note, ou appuie sur le bouton marque-page pour retenir un endroit. Tout apparaît ici.',
  'Search your notes…': 'Rechercher dans tes notes…', 'Highlights & notes': 'Surlignages et notes', 'Bookmarks': 'Marque-pages',
  'No saved passage matches.': 'Aucun passage enregistré ne correspond.', 'This novel is no longer in your library': 'Ce roman n’est plus dans ta bibliothèque',
  'Edit note': 'Modifier la note', 'Delete': 'Supprimer',
}

export function t(key: string, vars?: Record<string, string | number>): string {
  let out = lang === 'fr' ? (FR[key] ?? key) : key
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))
  return out
}

export function plural(n: number, one: string, other: string): string {
  // French uses the singular for 0 and 1, English only for 1.
  const singular = lang === 'fr' ? n < 2 : n === 1
  return t(singular ? one : other, { n })
}

export const hasTranslation = (key: string) => key in FR
export const FR_KEYS = () => Object.keys(FR)
