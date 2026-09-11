---
locale: fr
title: "Politique de confidentialité"
description: "Comment Chat Enhancer for YouTube gère le stockage local, la traduction, les données Playground et les contrôles de confidentialité."
---

# Politique de confidentialité

Dernière mise à jour : 11 septembre 2026

Chat Enhancer for YouTube est une extension de navigateur pour le chat en direct YouTube. Elle est conçue pour ajouter de petites fonctions au chat sans remplacer le chat YouTube ni collecter d’analyses.

Version courte :

- La plupart des fonctions de l’extension s’exécutent localement dans votre navigateur.
- La traduction est désactivée par défaut.
- Lorsque la traduction est activée, le texte traduit est envoyé à Google Translate.
- Les jeux Playground sont désactivés par défaut. Si vous activez et utilisez Playground, la présence de jeu, les invitations et les actions de jeu sont envoyées au serveur de jeu Chat Enhancer Playground sous un nom de joueur généré.
- L’extension n’exécute pas d’analyses, ne vend pas de données et ne collecte pas l’historique de navigation.

## Où l’extension s’exécute

L’extension s’exécute sur les pages de chat en direct YouTube et de replay du chat. Elle s’exécute aussi sur les pages YouTube pour prendre en charge la vidéo et le chat en mode image dans l’image.

L’extension utilise une autorisation pour enregistrer ses propres paramètres et données dans votre navigateur. Elle utilise aussi l’accès aux sites précis nécessaires au fonctionnement de ses fonctions : pages de chat en direct YouTube, service de traduction Google Translate et serveur de jeu Chat Enhancer Playground opt-in.

Dans Chrome et Edge, l’autorisation `scripting` rétablit le mode image dans l’image pour la vidéo et le chat après un rechargement ou une mise à jour de l’extension, sans actualiser l’onglet YouTube. L’extension ne demande pas d’autorisations générales d’historique de navigation, de lecture des onglets ou de navigation web.

Cette autorisation permet aussi à l’extension de se connecter aux chats YouTube déjà ouverts lorsque vous l’installez ou l’activez.

## Données stockées dans votre navigateur

L’extension stocke certaines données afin que ses fonctions continuent de fonctionner entre les rechargements de page.

Sauf indication contraire ci-dessous, les données de cette section restent dans votre profil de navigateur et ne sont pas envoyées à Chat Enhancer. Votre navigateur peut synchroniser les paramètres de l’extension entre vos propres installations connectées.

- **Paramètres :** vos choix de fonctions et préférences.

- **Données Inbox :** les mots-clés surveillés et jusqu’à 100 enregistrements Inbox par stream ou replay. Les enregistrements Inbox peuvent inclure le texte du message, le nom de l’auteur, l’horodatage, les détails de base du message YouTube nécessaires pour indiquer d’où vient le message enregistré, les détails de correspondance et les informations d’emoji ou d’image nécessaires pour afficher correctement le message enregistré.

- **Données d’emojis fréquents :** les compteurs d’utilisation locaux et les informations d’affichage des emojis utilisées pour créer la rangée d’emojis fréquents.

- **Données des favoris :** le texte du message enregistré et les informations d’affichage des emojis, le nom, l’URL d’avatar et, si disponible, l’ID de chaîne de l’auteur, les heures du message et de l’enregistrement, ainsi que le titre et l’URL du stream. Les favoris restent disponibles entre les streams dans le profil de navigateur actuel.

- **Données des anneaux d’avatar :** le nom de l’auteur, la date et l’heure d’ajout de l’anneau, l’URL du stream et, s’ils sont disponibles, l’URL de l’avatar, l’ID de chaîne et le titre du stream pour les utilisateurs auxquels vous ajoutez explicitement un anneau depuis leur profil de messages récents. La sélection reste disponible entre les streams dans le profil de navigateur actuel et sert uniquement à décorer les avatars correspondants.

- **Brouillons de chat non envoyés :** enregistrés séparément pour chaque stream et restaurés après l’actualisation d’une page. Les brouillons sont supprimés lorsque le champ de chat est vidé, que le message est envoyé ou que les données de l’extension sont réinitialisées.

- **Données d’identité Playground :** une identité locale générée aléatoirement et créée si Playground est utilisé. Elle sert à reconnaître la même installation du navigateur lorsqu’elle se reconnecte à Playground. Ce n’est pas votre identité YouTube.

- **Données temporaires de la page :** les messages de profil récents, l’état des commandes et les résultats de traduction sont conservés uniquement en mémoire pour la page actuelle de chat en direct. Ils sont effacés lorsque vous quittez ou actualisez la page de chat.

## Données envoyées hors de votre navigateur

Les données ne sont envoyées à ces services que lorsque la fonction correspondante est activée et utilisée :

### Google Translate (`translate-pa.googleapis.com`)

La traduction du chat envoie le texte des messages visibles dans le chat en direct et éligibles à la traduction pendant que la traduction est activée. La traduction des brouillons envoie le texte du brouillon que vous choisissez de traduire depuis le champ de chat.

Les requêtes de traduction incluent le texte à traduire et la langue cible. L’extension n’envoie pas vos cookies YouTube ni vos identifiants YouTube avec les requêtes de traduction.

L’accès à Google Translate via `translate-pa.googleapis.com` est non officiel et peut être limité, modifié ou indisponible.

### <span id="playground"></span>Chat Enhancer Playground ([playground.chatenhancer.com](https://playground.chatenhancer.com))

Si vous activez Playground et utilisez le panneau de jeux, l’extension se connecte au serveur de jeu Chat Enhancer Playground afin que les utilisateurs opt-in du même stream puissent voir la disponibilité, échanger des invitations et jouer.

Les messages Playground peuvent inclure l’identifiant du stream ou de la vidéo YouTube, votre identité de joueur Playground générée, votre nom de joueur généré, votre liste de jeux disponibles, les invitations et réponses aux invitations, ainsi que des actions de jeu comme les coups d’échecs.

Playground stocke des résultats de partie compacts liés aux identités de joueur Playground générées afin de fournir des statistiques de joueur. Les résultats stockés peuvent inclure la version du jeu, les heures de début et de fin, le résultat et le motif de fin, les rôles des participants et de petites statistiques propres au jeu, telles que les coups ou les scores. Ils n’incluent pas le contenu des questions de trivia ni l’état complet de la partie.

L’extension n’envoie pas au serveur de jeu Playground le texte du chat en direct, votre nom d’affichage YouTube, l’URL de votre avatar YouTube, vos cookies YouTube ni vos identifiants YouTube.

Séparément, la génération de questions HELP-A-FRIEND! Trivia peut envoyer des extraits sélectionnés de transcripts publics de vidéos YouTube et des identifiants de jeu au serveur de jeu Playground. Ces extraits proviennent du transcript de la vidéo, pas du chat en direct. Le serveur utilise OpenAI pour générer des questions de trivia à partir de ces extraits.

La génération Replay Trivia peut nécessiter une vérification Cloudflare Turnstile sur [playground.chatenhancer.com](https://playground.chatenhancer.com). Cloudflare peut recevoir des données normales de vérification telles que l’adresse IP, des informations sur le navigateur et l’appareil, et le résultat du défi.

Comme tout service web, le serveur de jeu Playground peut recevoir des informations normales de connexion telles que l’adresse IP et des informations sur le navigateur/l’appareil depuis le navigateur ou le fournisseur réseau.

## Contrôles des données

Vous pouvez effacer les données de l’extension depuis le popup de l’extension avec le bouton de réinitialisation. Cela efface les données locales et les paramètres synchronisés de l’extension, puis restaure les paramètres par défaut.

Vous pouvez également supprimer l’extension de votre navigateur. Selon le navigateur, supprimer l’extension peut aussi supprimer son stockage local.

La réinitialisation ou la suppression de l’extension ne supprime pas à elle seule les résultats de partie déjà stockés par Playground.

## Ce que l’extension ne fait pas

- Exécuter des analyses.
- Collecter l’historique de navigation.
- Vendre les données utilisateur.
- Envoyer des données à un serveur Chat Enhancer, sauf si vous utilisez les fonctions Playground opt-in décrites ci-dessus.

## Questions

Pour les questions de confidentialité, [contactez l’assistance](https://www.chatenhancer.com/fr/support).

Chat Enhancer for YouTube n’est pas affilié à YouTube ni à Google.
