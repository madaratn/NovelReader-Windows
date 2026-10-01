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
