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
- Les jeux Playground sont désactivés par défaut. Si vous activez et utilisez Playground, la présence de jeu, les invitations et les actions de jeu sont envoyées au backend Chat Enhancer Playground sous un nom de joueur généré.
- L’extension n’exécute pas d’analyses, ne vend pas de données et ne collecte pas l’historique de navigation.

## Où l’extension s’exécute

L’extension s’exécute uniquement sur les pages de chat en direct YouTube et de replay de chat en direct correspondant au manifeste de l’extension.

L’extension utilise l’autorisation `storage` du navigateur, ainsi qu’un accès hôte aux pages de chat en direct YouTube, au point de terminaison de traduction de Google et au backend Playground facultatif. Elle ne demande pas d’autorisations générales d’historique de navigation, de lecture des onglets, de scripting ou de navigation web.

## Données stockées dans votre navigateur

L’extension stocke certaines données afin que ses fonctions continuent de fonctionner entre les rechargements de page.

- **Les paramètres sont stockés avec `chrome.storage.sync` :** selon les réglages de votre navigateur, celui-ci peut synchroniser ces paramètres d’extension entre vos installations de navigateur connectées.

- **Les données Inbox sont stockées avec `chrome.storage.local` :** cela inclut les mots-clés surveillés et jusqu’à 100 enregistrements Inbox par stream ou replay. Les enregistrements Inbox peuvent inclure le texte du message, le nom de l’auteur, l’horodatage, les métadonnées de message/source YouTube, les métadonnées de correspondance et les données d’affichage d’emoji/image nécessaires pour afficher le message enregistré.

- **Les données d’emojis fréquents sont stockées avec `chrome.storage.local` :** cela inclut les compteurs d’utilisation locaux et les métadonnées d’affichage des emojis utilisées pour créer la rangée d’emojis fréquents.

- **Les données d’utilisateurs favoris sont stockées avec `chrome.storage.local` :** cela inclut le handle de l’utilisateur favori, l’ID de chaîne lorsqu’il est disponible et l’heure de création du favori. Les utilisateurs favoris sont globaux entre les streams dans le profil de navigateur actuel et servent à afficher des anneaux d’avatar colorés.

- **Les brouillons de chat non envoyés sont stockés avec `chrome.storage.local` par stream :** ils sont restaurés après l’actualisation d’une page. Les brouillons sont supprimés lorsque le champ de chat est vidé, que le message est envoyé ou que les données de l’extension sont réinitialisées.

- **Les données d’identité Playground sont stockées avec `chrome.storage.local` si Playground est utilisé :** il s’agit d’une paire de clés publique/privée générée pour signer les défis de connexion Playground, afin que la même installation du navigateur puisse conserver la même identité Playground pseudonyme. Ce n’est pas votre identité YouTube.

- **Les messages de profil récents, l’état des commandes et les résultats de traduction sont conservés uniquement en mémoire pour la page actuelle de chat en direct. Ils sont effacés lorsque la page se ferme.**

## Données envoyées hors de votre navigateur

La traduction du chat et la traduction des brouillons sont désactivées par défaut.

Lorsque la traduction ou les fonctions Playground sont activées, des données peuvent être envoyées à ces services :

- **Google Translate à `https://translate.googleapis.com/translate_a/single`**

  La traduction du chat envoie le texte des messages de chat visibles et entrants éligibles. La traduction des brouillons envoie le texte du brouillon que vous choisissez de traduire depuis le champ de chat.

  Les requêtes de traduction incluent le texte à traduire et la langue cible. L’extension n’envoie pas vos cookies YouTube ni vos identifiants YouTube avec les requêtes de traduction.

  L’accès à Google Translate via `translate.googleapis.com` est non officiel et peut être limité, modifié ou indisponible.

- **Chat Enhancer Playground à `https://playground.chatenhancer.com`**

  Playground est désactivé par défaut. Si vous activez Playground et utilisez le panneau de jeux, l’extension se connecte au backend Playground afin que les utilisateurs opt-in du même stream puissent voir la disponibilité, échanger des invitations et jouer.

  Les messages Playground peuvent inclure la clé du stream/de la vidéo, votre clé publique et votre signature Playground générées, votre nom de joueur généré, votre liste de jeux disponibles, les invitations et réponses aux invitations, ainsi que des actions de jeu comme les coups d’échecs.

  La génération de questions HELP-A-FRIEND! Trivia peut envoyer des extraits sélectionnés de transcripts de replay YouTube et des identifiants de jeu au backend Playground. Le backend utilise OpenAI pour générer des questions de trivia à partir de ces extraits.

  La génération Replay Trivia peut nécessiter une vérification Cloudflare Turnstile sur `https://playground.chatenhancer.com`. Cloudflare peut recevoir des données normales de vérification telles que l’adresse IP, l’agent utilisateur et le résultat du défi.

  Playground n’envoie pas au backend Playground le texte du chat en direct, votre nom d’affichage YouTube, l’URL de votre avatar YouTube, vos cookies YouTube ni vos identifiants YouTube.

  Comme tout service web, le backend Playground peut recevoir des métadonnées normales de connexion telles que l’adresse IP et l’agent utilisateur depuis le navigateur ou le fournisseur réseau.

## Contrôles des données

Vous pouvez effacer les données de l’extension depuis le popup de l’extension avec le bouton de réinitialisation. Cela efface les données locales et les paramètres synchronisés de l’extension, puis restaure les paramètres par défaut.

Vous pouvez également supprimer l’extension de votre navigateur. Selon le navigateur, supprimer l’extension peut aussi supprimer son stockage local.

## Ce qui n’est pas collecté

L’extension n’exécute pas d’analyses.

L’extension ne collecte pas l’historique de navigation.

L’extension ne vend pas les données utilisateur.

Sauf pour les jeux Playground opt-in décrits ci-dessus, l’extension n’envoie pas de données à un serveur détenu par l’extension.

L’extension ne stocke pas les messages de profil récents ni les résultats de traduction après la fermeture de la page de chat en direct.

Chat Enhancer for YouTube n’est pas affilié à YouTube ni à Google.

Pour les questions de confidentialité, utilisez le lien e-mail sur https://www.chatenhancer.com.
