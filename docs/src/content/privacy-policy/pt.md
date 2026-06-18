---
locale: pt
title: "Política de privacidade"
description: "Como o Chat Enhancer for YouTube lida com armazenamento local, tradução, dados do Playground e controles de privacidade."
---

# Privacidade

Última atualização: 17 de junho de 2026

Chat Enhancer for YouTube é uma extensão de navegador para o chat ao vivo do YouTube. Ela foi criada para adicionar pequenos recursos de chat sem substituir o chat do YouTube nem coletar análises.

Resumo:

- A maioria dos recursos da extensão roda localmente no seu navegador.
- A tradução fica desativada por padrão.
- Quando a tradução está ativada, o texto sendo traduzido é enviado ao Google Translate.
- Os jogos Playground ficam desativados por padrão. Se você ativar e usar o Playground, presença em jogo, convites e ações de jogo são enviados ao backend Chat Enhancer Playground com um nome de jogador gerado.
- A extensão não executa análises, não vende dados e não coleta histórico de navegação.

## Onde a extensão roda

A extensão roda somente em páginas de chat ao vivo e replay de chat ao vivo do YouTube correspondentes ao manifesto da extensão.

A extensão usa a permissão `storage` do navegador, além de acesso de host para páginas de chat ao vivo do YouTube, o endpoint de tradução do Google e o backend opcional do Playground. Ela não solicita permissões gerais de histórico de navegação, leitura de abas, scripting ou navegação web.

## Dados armazenados no seu navegador

A extensão armazena alguns dados para que seus recursos funcionem entre recarregamentos de página.

- **As configurações são armazenadas com `chrome.storage.sync`:** dependendo das configurações do seu navegador, o navegador pode sincronizar essas configurações da extensão entre suas próprias instalações de navegador conectadas.

- **Os dados do Inbox são armazenados com `chrome.storage.local`:** isso inclui palavras-chave observadas e até 100 registros de inbox por stream ou replay. Os registros do Inbox podem incluir texto da mensagem, nome do autor, timestamp, metadados de mensagem/fonte do YouTube, metadados de correspondência e dados de exibição de emoji/imagem necessários para mostrar a mensagem salva.

- **Os dados de emojis frequentes são armazenados com `chrome.storage.local`:** isso inclui contagens locais de uso e metadados de exibição de emoji usados para montar a linha de emojis frequentes.

- **Os dados de usuários marcados são armazenados com `chrome.storage.local`:** isso inclui o handle do usuário marcado, ID do canal quando disponível e o horário em que a marcação foi criada. Usuários marcados são globais entre streams no perfil atual do navegador e são usados para mostrar anéis coloridos no avatar.

- **Rascunhos de chat não enviados são armazenados com `chrome.storage.local` por stream:** eles são restaurados após uma atualização da página. Rascunhos são removidos quando a entrada de chat é limpa, a mensagem é enviada ou os dados da extensão são redefinidos.

- **O status da aba de chat ao vivo é armazenado com `chrome.storage.local`:** isso se limita a IDs de abas do navegador e timestamps de última atividade para abas de chat ao vivo do YouTube recentemente ativas, e é usado para mostrar se a extensão está conectada ou desconectada no momento. Esses registros expiram após 12 horas.

- **Os dados de identidade do Playground são armazenados com `chrome.storage.local` se o Playground for usado:** trata-se de um par de chaves pública/privada gerado para assinar desafios de conexão do Playground, para que a mesma instalação do navegador possa manter a mesma identidade pseudônima do Playground. Não é sua identidade do YouTube.

- **Mensagens recentes de perfil, estado de comandos e resultados de tradução são mantidos apenas na memória da página atual de chat ao vivo. Eles são limpos quando a página é descarregada.**

## Dados enviados para fora do seu navegador

A tradução do chat e a tradução de rascunhos ficam desativadas por padrão.

Quando recursos de tradução ou Playground estão ativados, dados podem ser enviados a estes serviços:

- **Google Translate em `https://translate.googleapis.com/translate_a/single`**

  A tradução do chat envia texto de mensagens de chat visíveis e recebidas que sejam elegíveis. A tradução de rascunhos envia o texto do rascunho que você escolhe traduzir a partir da caixa de chat.

  Solicitações de tradução incluem o texto a ser traduzido e o idioma de destino. A extensão não envia seus cookies do YouTube nem credenciais do YouTube com solicitações de tradução.

  O acesso ao Google Translate por meio de `translate.googleapis.com` não é oficial e pode ser limitado, alterado ou ficar indisponível.

- **Chat Enhancer Playground em `https://playground.chatenhancer.com`**

  Playground fica desativado por padrão. Se você ativar o Playground e usar o painel de jogos, a extensão se conecta ao backend do Playground para que usuários opt-in no mesmo stream possam ver disponibilidade, trocar convites e jogar.

  Mensagens do Playground podem incluir a chave do stream/vídeo, sua chave pública e assinatura geradas do Playground, seu nome de jogador gerado, sua lista de jogos disponíveis, convites e respostas a convites, e ações de jogo como movimentos de xadrez.

  A geração de perguntas do HELP-A-FRIEND! Trivia pode enviar trechos selecionados de transcrições de replay do YouTube e identificadores de jogo ao backend do Playground. O backend usa OpenAI para gerar perguntas de trivia a partir desses trechos.

  A geração do Replay Trivia pode exigir verificação Cloudflare Turnstile em `https://playground.chatenhancer.com`. A Cloudflare pode receber dados normais de verificação, como endereço IP, user agent e resultado do desafio.

  O Playground não envia texto do chat ao vivo, seu nome de exibição do YouTube, URL do seu avatar do YouTube, cookies do YouTube ou credenciais do YouTube ao backend do Playground.

  Como qualquer serviço web, o backend do Playground pode receber metadados normais de conexão, como endereço IP e user agent, do navegador ou provedor de rede.

## Controles de dados

Você pode limpar os dados da extensão no popup da extensão usando o botão de redefinição. Isso limpa dados locais da extensão e configurações sincronizadas da extensão, depois restaura as configurações padrão.

Você também pode remover a extensão do seu navegador. Dependendo do navegador, remover a extensão também pode remover seu armazenamento local.

## O que não é coletado

A extensão não executa análises.

A extensão não coleta histórico de navegação.

A extensão não vende dados de usuário.

Exceto pelos jogos Playground opt-in descritos acima, a extensão não envia dados a um servidor pertencente à extensão.

A extensão não armazena mensagens recentes de perfil nem resultados de tradução depois que a página de chat ao vivo é descarregada.

Chat Enhancer for YouTube não é afiliado ao YouTube nem ao Google.

Para perguntas sobre privacidade, use o link de email em https://www.chatenhancer.com.
