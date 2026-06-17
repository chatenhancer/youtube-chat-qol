---
locale: fr
title: "Politique de confidentialité"
description: "Comment Chat Enhancer for YouTube gère le stockage local, la traduction, les données Playground et les contrôles de confidentialité."
---

# Politique de confidentialité

Dernière mise à jour : 17 juin 2026

Cette traduction est fournie pour faciliter la lecture. La version anglaise sur /privacy/ reste la référence principale.

Chat Enhancer for YouTube est une extension de navigateur pour le chat en direct YouTube. Elle ajoute de petites améliorations au chat sans remplacer le chat YouTube ni collecter d’analyses.

En bref :

- La plupart des fonctions s’exécutent localement dans votre navigateur.
- La traduction est désactivée par défaut.
- Lorsque la traduction est activée, le texte à traduire est envoyé à Google Translate.
- Les jeux Playground sont désactivés par défaut. Si vous les activez et les utilisez, la présence de jeu, les invitations et les actions de jeu sont envoyées au backend Chat Enhancer Playground sous un nom de joueur généré.
- L’extension n’exécute pas d’analyses, ne vend pas de données et ne collecte pas l’historique de navigation.

## Où l’extension s’exécute

L’extension s’exécute uniquement sur les pages de chat en direct YouTube et de replay de chat en direct correspondant au manifeste de l’extension.

Elle utilise l’autorisation de stockage du navigateur, ainsi qu’un accès hôte aux pages de chat en direct YouTube, au point de terminaison de traduction de Google et au backend Playground facultatif. Elle ne demande pas d’autorisations générales pour l’historique de navigation, la lecture des onglets, le scripting ou la navigation web.

## Données stockées dans votre navigateur

L’extension stocke certaines données pour que ses fonctionnalités fonctionnent entre les rechargements de page.

- **Les paramètres sont stockés avec `chrome.storage.sync` :** selon les réglages de votre navigateur, celui-ci peut synchroniser ces paramètres entre vos installations connectées.
- **Les données Inbox sont stockées avec `chrome.storage.local` :** cela inclut les mots-clés surveillés et jusqu’à 100 enregistrements Inbox par stream ou replay. Ces enregistrements peuvent inclure le texte du message, le nom de l’auteur, l’horodatage, des métadonnées YouTube, des métadonnées de correspondance et les données d’emoji/image nécessaires à l’affichage.
- **Les données d’emojis fréquents sont stockées avec `chrome.storage.local` :** cela inclut les compteurs locaux et les métadonnées utilisées pour créer la rangée d’emojis fréquents.
- **Les utilisateurs favoris sont stockés avec `chrome.storage.local` :** cela inclut le pseudo, l’ID de chaîne lorsqu’il est disponible et l’heure de création. Ces favoris sont globaux entre les streams dans le profil de navigateur actuel et servent à afficher des anneaux colorés autour des avatars.
- **Les brouillons non envoyés sont stockés avec `chrome.storage.local` par stream :** ils sont restaurés après actualisation et supprimés lorsque le champ de chat est vidé, le message est envoyé ou les données de l’extension sont réinitialisées.
- **L’état des onglets de chat en direct est stocké avec `chrome.storage.local` :** il se limite aux IDs d’onglets et aux derniers horodatages de pages YouTube live chat récemment actives, afin d’indiquer si l’extension est connectée ou déconnectée. Ces enregistrements expirent après 12 heures.
- **Les données d’identité Playground sont stockées avec `chrome.storage.local` si Playground est utilisé :** il s’agit d’une paire de clés publique/privée générée pour signer les défis de connexion, afin que la même installation conserve la même identité pseudonyme. Ce n’est pas votre identité YouTube.
- **Les messages de profil récents, l’état des commandes et les résultats de traduction restent uniquement en mémoire pour la page actuelle de chat en direct. Ils sont effacés lorsque la page se ferme.**

## Données envoyées hors de votre navigateur

La traduction du chat et des brouillons est désactivée par défaut.

Lorsque la traduction ou Playground est activé, des données peuvent être envoyées aux services suivants :

- **Google Translate sur `https://translate.googleapis.com/translate_a/single`**

  La traduction du chat envoie le texte des messages visibles et entrants éligibles. La traduction des brouillons envoie le texte que vous choisissez de traduire depuis le champ de chat.

  Les requêtes incluent le texte à traduire et la langue cible. L’extension n’envoie pas vos cookies ni vos identifiants YouTube avec ces requêtes.

  L’accès à Google Translate via `translate.googleapis.com` n’est pas officiel et peut être limité, modifié ou indisponible.

- **Chat Enhancer Playground sur `https://playground.chatenhancer.com`**

  Playground est désactivé par défaut. Si vous l’activez et utilisez le panneau de jeux, l’extension se connecte au backend Playground afin que les utilisateurs opt-in du même stream puissent voir la disponibilité, échanger des invitations et jouer.

  Les messages Playground peuvent inclure la clé du stream/vidéo, votre clé publique et votre signature générées, votre nom de joueur généré, la liste de jeux disponibles, les invitations et réponses, ainsi que des actions de jeu comme les coups d’échecs.

  La génération de questions HELP-A-FRIEND! Trivia peut envoyer des extraits sélectionnés de transcript de replay YouTube et des identifiants de jeu au backend Playground. Le backend utilise OpenAI pour générer des questions à partir de ces extraits.

  La génération Replay Trivia peut nécessiter une vérification Cloudflare Turnstile sur `https://playground.chatenhancer.com`. Cloudflare peut recevoir des données normales de vérification telles que l’adresse IP, l’agent utilisateur et le résultat du défi.

  Playground n’envoie pas au backend le texte du chat en direct, votre nom d’affichage YouTube, l’URL de votre avatar YouTube, vos cookies YouTube ni vos identifiants YouTube.

  Comme tout service web, le backend Playground peut recevoir des métadonnées normales de connexion telles que l’adresse IP et l’agent utilisateur depuis le navigateur ou le fournisseur réseau.

## Contrôles des données

Vous pouvez effacer les données de l’extension depuis le popup avec le bouton de réinitialisation. Cela efface les données locales et les paramètres synchronisés de l’extension, puis restaure les paramètres par défaut.

Vous pouvez aussi supprimer l’extension de votre navigateur. Selon le navigateur, cela peut également supprimer son stockage local.

## Ce qui n’est pas collecté

L’extension n’exécute pas d’analyses.

L’extension ne collecte pas l’historique de navigation.

L’extension ne vend pas les données utilisateur.

Sauf pour les jeux Playground opt-in décrits ci-dessus, l’extension n’envoie pas de données à un serveur détenu par l’extension.

L’extension ne conserve pas les messages de profil récents ni les résultats de traduction après la fermeture de la page de chat en direct.

Chat Enhancer for YouTube n’est pas affilié à YouTube ni à Google.

Pour les questions de confidentialité, utilisez le lien e-mail sur https://www.chatenhancer.com.
