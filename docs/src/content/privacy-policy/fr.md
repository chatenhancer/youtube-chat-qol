---
locale: fr
title: "Politique de confidentialité"
description: "Comment Chat Enhancer for YouTube gère le stockage local, la traduction, les données Playground et les contrôles de confidentialité."
---

# Politique de confidentialité

Dernière mise à jour : 21 juin 2026

Chat Enhancer for YouTube est une extension de navigateur pour le chat en direct YouTube. Elle est conçue pour ajouter de petites fonctions au chat sans remplacer le chat YouTube ni collecter d’analyses.

Version courte :

- La plupart des fonctions de l’extension s’exécutent localement dans votre navigateur.
- La traduction est désactivée par défaut.
- Lorsque la traduction est activée, le texte traduit est envoyé à Google Translate.
- Les jeux Playground sont désactivés par défaut. Si vous activez et utilisez Playground, la présence de jeu, les invitations et les actions de jeu sont envoyées au serveur de jeu Chat Enhancer Playground sous un nom de joueur généré.
- L’extension n’exécute pas d’analyses, ne vend pas de données et ne collecte pas l’historique de navigation.

## Où l’extension s’exécute

L’extension s’exécute uniquement sur les pages de chat en direct YouTube et de replay de chat en direct auxquelles l’extension est autorisée à accéder.

L’extension utilise une autorisation pour enregistrer ses propres paramètres et données dans votre navigateur. Elle utilise aussi l’accès aux sites précis nécessaires au fonctionnement de ses fonctions : pages de chat en direct YouTube, service de traduction Google Translate et serveur de jeu Chat Enhancer Playground opt-in.

L’extension ne demande pas d’autorisations générales d’historique de navigation, de lecture des onglets, de scripting ou de navigation web.

## Données stockées dans votre navigateur

L’extension stocke certaines données afin que ses fonctions continuent de fonctionner entre les rechargements de page.

Les données listées dans cette section sont stockées par l’extension dans votre propre profil de navigateur. Elles ne sont pas envoyées à Chat Enhancer, sauf si elles sont aussi listées dans la section « Données envoyées hors de votre navigateur » ci-dessous.

- **Paramètres :** enregistrés avec le stockage synchronisé de l’extension du navigateur (`chrome.storage.sync`). Selon les réglages de votre navigateur, celui-ci peut synchroniser ces paramètres d’extension entre vos installations de navigateur connectées.

- **Données Inbox :** enregistrées avec le stockage local de l’extension (`chrome.storage.local`). Cela inclut les mots-clés surveillés et jusqu’à 100 enregistrements Inbox par stream ou replay. Les enregistrements Inbox peuvent inclure le texte du message, le nom de l’auteur, l’horodatage, les détails de base du message YouTube nécessaires pour indiquer d’où vient le message enregistré, les détails de correspondance et les informations d’emoji ou d’image nécessaires pour afficher correctement le message enregistré.

- **Données d’emojis fréquents :** enregistrées avec le stockage local de l’extension (`chrome.storage.local`). Cela inclut les compteurs d’utilisation locaux et les informations d’affichage des emojis utilisées pour créer la rangée d’emojis fréquents.

- **Données des favoris :** enregistrées dans le stockage local de l’extension (`chrome.storage.local`). Elles peuvent inclure le texte du message enregistré et les informations d’affichage des emojis, le nom, l’URL d’avatar et, si disponible, l’ID de chaîne de l’auteur, les heures du message et de l’enregistrement, ainsi que le titre et l’URL du stream. Les favoris restent disponibles entre les streams dans le profil de navigateur actuel.

- **Données des anneaux d’avatar :** enregistrées dans le stockage local de l’extension (`chrome.storage.local`). Elles comprennent le nom de l’auteur, son ID de chaîne s’il est disponible, ainsi que la date et l’heure d’ajout de l’anneau pour les utilisateurs auxquels vous ajoutez explicitement un anneau depuis leur profil de messages récents. La sélection reste disponible entre les streams dans le profil de navigateur actuel et sert uniquement à décorer les avatars correspondants ; elle ne vérifie pas si un utilisateur est en ligne.

- **Brouillons de chat non envoyés :** enregistrés avec le stockage local de l’extension (`chrome.storage.local`) par stream. Ils sont restaurés après l’actualisation d’une page. Les brouillons sont supprimés lorsque le champ de chat est vidé, que le message est envoyé ou que les données de l’extension sont réinitialisées.

- **Données d’identité Playground :** enregistrées avec le stockage local de l’extension (`chrome.storage.local`) si Playground est utilisé. Il s’agit d’une identité Playground locale générée aléatoirement, utilisée pour reconnaître la même installation du navigateur lorsqu’elle se reconnecte à Playground. Ce n’est pas votre identité YouTube.

- **Messages de profil récents, état des commandes et résultats de traduction :** conservés uniquement en mémoire pour la page actuelle de chat en direct. Ils sont effacés lorsque vous quittez ou actualisez la page de chat.

## Données envoyées hors de votre navigateur

La traduction du chat, la traduction des brouillons et les jeux Playground sont désactivés par défaut.

Lorsque la traduction ou les fonctions Playground sont activées et utilisées, des données peuvent être envoyées à ces services :

- **Google Translate à `https://translate.googleapis.com/translate_a/single`**

  La traduction du chat envoie le texte des messages visibles dans le chat en direct et éligibles à la traduction pendant que la traduction est activée. La traduction des brouillons envoie le texte du brouillon que vous choisissez de traduire depuis le champ de chat.

  Les requêtes de traduction incluent le texte à traduire et la langue cible. L’extension n’envoie pas vos cookies YouTube ni vos identifiants YouTube avec les requêtes de traduction.

  L’accès à Google Translate via `translate.googleapis.com` est non officiel et peut être limité, modifié ou indisponible.

- <span id="playground"></span>**Chat Enhancer Playground à `https://playground.chatenhancer.com`**

  Playground est désactivé par défaut. Si vous activez Playground et utilisez le panneau de jeux, l’extension se connecte au serveur de jeu Chat Enhancer Playground afin que les utilisateurs opt-in du même stream puissent voir la disponibilité, échanger des invitations et jouer.

  Les messages Playground peuvent inclure l’identifiant du stream ou de la vidéo YouTube, votre identité de joueur Playground générée, votre nom de joueur généré, votre liste de jeux disponibles, les invitations et réponses aux invitations, ainsi que des actions de jeu comme les coups d’échecs.

  Playground n’envoie pas au serveur de jeu Playground le texte du chat en direct, votre nom d’affichage YouTube, l’URL de votre avatar YouTube, vos cookies YouTube ni vos identifiants YouTube.

  Séparément, la génération de questions HELP-A-FRIEND! Trivia peut envoyer des extraits sélectionnés de transcripts publics de vidéos YouTube et des identifiants de jeu au serveur de jeu Playground. Ces extraits proviennent du transcript de la vidéo, pas du chat en direct. Le serveur utilise OpenAI pour générer des questions de trivia à partir de ces extraits.

  La génération Replay Trivia peut nécessiter une vérification Cloudflare Turnstile sur `https://playground.chatenhancer.com`. Cloudflare peut recevoir des données normales de vérification telles que l’adresse IP, des informations sur le navigateur et l’appareil, et le résultat du défi.

  Comme tout service web, le serveur de jeu Playground peut recevoir des informations normales de connexion telles que l’adresse IP et des informations sur le navigateur/l’appareil depuis le navigateur ou le fournisseur réseau.

## Contrôles des données

Vous pouvez effacer les données de l’extension depuis le popup de l’extension avec le bouton de réinitialisation. Cela efface les données locales et les paramètres synchronisés de l’extension, puis restaure les paramètres par défaut.

Vous pouvez également supprimer l’extension de votre navigateur. Selon le navigateur, supprimer l’extension peut aussi supprimer son stockage local.

## Ce que Chat Enhancer ne fait pas

L’extension n’exécute pas d’analyses.

L’extension ne collecte pas l’historique de navigation.

L’extension ne vend pas les données utilisateur.

Sauf pour les fonctions Playground opt-in décrites ci-dessus, l’extension n’envoie pas de données à un serveur Chat Enhancer.

L’extension ne stocke pas les messages de profil récents ni les résultats de traduction après que vous quittez ou actualisez la page de chat en direct.

Chat Enhancer for YouTube n’est pas affilié à YouTube ni à Google.

Pour les questions de confidentialité, utilisez le lien e-mail sur https://www.chatenhancer.com.
