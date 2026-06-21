---
locale: pt
title: "Política de privacidade"
description: "Como o Chat Enhancer for YouTube lida com armazenamento local, tradução, dados do Playground e controles de privacidade."
---

# Privacidade

Última atualização: 21 de junho de 2026

Chat Enhancer for YouTube é uma extensão de navegador para o chat ao vivo do YouTube. Ela foi criada para adicionar pequenos recursos de chat sem substituir o chat do YouTube nem coletar análises.

Resumo:

- A maioria dos recursos da extensão roda localmente no seu navegador.
- A tradução fica desativada por padrão.
- Quando a tradução está ativada, o texto sendo traduzido é enviado ao Google Translate.
- Os jogos Playground ficam desativados por padrão. Se você ativar e usar o Playground, presença em jogo, convites e ações de jogo são enviados ao servidor de jogos Chat Enhancer Playground com um nome de jogador gerado.
- A extensão não executa análises, não vende dados e não coleta histórico de navegação.

## Onde a extensão roda

A extensão roda somente em páginas de chat ao vivo e replay de chat ao vivo do YouTube que a extensão tem permissão para acessar.

A extensão usa permissão para salvar suas próprias configurações e dados no seu navegador. Ela também usa acesso aos sites específicos necessários para seus recursos funcionarem: páginas de chat ao vivo do YouTube, o serviço de tradução do Google Translate e o servidor de jogos opcional Chat Enhancer Playground.

A extensão não solicita permissões gerais de histórico de navegação, leitura de abas, scripting ou navegação web.

## Dados armazenados no seu navegador

A extensão armazena alguns dados para que seus recursos funcionem entre recarregamentos de página.

Os dados listados nesta seção são armazenados pela extensão no seu próprio perfil do navegador. Eles não são enviados ao Chat Enhancer, a menos que também estejam listados na seção "Dados enviados para fora do seu navegador" abaixo.

- **Configurações:** salvas usando o armazenamento sincronizado da extensão do navegador (`chrome.storage.sync`). Dependendo das configurações do seu navegador, o navegador pode sincronizar essas configurações da extensão entre suas próprias instalações de navegador conectadas.

- **Dados do Inbox:** salvos usando o armazenamento local da extensão (`chrome.storage.local`). Isso inclui palavras-chave observadas e até 100 registros de inbox por stream ou replay. Os registros do Inbox podem incluir texto da mensagem, nome do autor, timestamp, detalhes básicos de mensagem do YouTube necessários para mostrar de onde veio a mensagem salva, detalhes de correspondência e informações de emoji ou imagem necessárias para exibir corretamente a mensagem salva.

- **Dados de emojis frequentes:** salvos usando o armazenamento local da extensão (`chrome.storage.local`). Isso inclui contagens locais de uso e informações de exibição de emoji usadas para montar a linha de emojis frequentes.

- **Dados de usuários marcados:** salvos usando o armazenamento local da extensão (`chrome.storage.local`). Isso inclui o handle do usuário marcado, ID do canal quando disponível e o horário em que a marcação foi criada. Usuários marcados são globais entre streams no perfil atual do navegador e são usados para mostrar anéis coloridos no avatar.

- **Rascunhos de chat não enviados:** salvos usando o armazenamento local da extensão (`chrome.storage.local`) por stream. Eles são restaurados após uma atualização da página. Rascunhos são removidos quando a entrada de chat é limpa, a mensagem é enviada ou os dados da extensão são redefinidos.

- **Dados de identidade do Playground:** salvos usando o armazenamento local da extensão (`chrome.storage.local`) se o Playground for usado. Esta é uma identidade local do Playground gerada aleatoriamente, usada para reconhecer a mesma instalação do navegador quando ela se reconecta ao Playground. Não é sua identidade do YouTube.

- **Mensagens recentes de perfil, estado de comandos e resultados de tradução:** mantidos apenas na memória da página atual de chat ao vivo. Eles são limpos quando você sai ou atualiza a página de chat.

## Dados enviados para fora do seu navegador

A tradução do chat, a tradução de rascunhos e os jogos Playground ficam desativados por padrão.

Quando recursos de tradução ou Playground estão ativados e são usados, dados podem ser enviados a estes serviços:

- **Google Translate em `https://translate.googleapis.com/translate_a/single`**

  A tradução do chat envia texto de mensagens de chat visíveis no chat ao vivo e elegíveis para tradução enquanto a tradução está ativada. A tradução de rascunhos envia o texto do rascunho que você escolhe traduzir a partir da caixa de chat.

  Solicitações de tradução incluem o texto a ser traduzido e o idioma de destino. A extensão não envia seus cookies do YouTube nem credenciais do YouTube com solicitações de tradução.

  O acesso ao Google Translate por meio de `translate.googleapis.com` não é oficial e pode ser limitado, alterado ou ficar indisponível.

- **Chat Enhancer Playground em `https://playground.chatenhancer.com`**

  Playground fica desativado por padrão. Se você ativar o Playground e usar o painel de jogos, a extensão se conecta ao servidor de jogos Chat Enhancer Playground para que usuários opt-in no mesmo stream possam ver disponibilidade, trocar convites e jogar.

  Mensagens do Playground podem incluir o identificador do stream ou vídeo do YouTube, sua identidade de jogador do Playground gerada, seu nome de jogador gerado, sua lista de jogos disponíveis, convites e respostas a convites, e ações de jogo como movimentos de xadrez.

  O Playground não envia texto do chat ao vivo, seu nome de exibição do YouTube, URL do seu avatar do YouTube, cookies do YouTube ou credenciais do YouTube ao servidor de jogos do Playground.

  Separadamente, a geração de perguntas do HELP-A-FRIEND! Trivia pode enviar trechos selecionados de transcrições públicas de vídeos do YouTube e identificadores de jogo ao servidor de jogos do Playground. Esses trechos vêm da transcrição do vídeo, não do chat ao vivo. O servidor usa OpenAI para gerar perguntas de trivia a partir desses trechos.

  A geração do Replay Trivia pode exigir verificação Cloudflare Turnstile em `https://playground.chatenhancer.com`. A Cloudflare pode receber dados normais de verificação, como endereço IP, informações do navegador e do dispositivo, e resultado do desafio.

  Como qualquer serviço web, o servidor de jogos do Playground pode receber informações normais de conexão, como endereço IP e informações do navegador/dispositivo, do navegador ou provedor de rede.

## Controles de dados

Você pode limpar os dados da extensão no popup da extensão usando o botão de redefinição. Isso limpa dados locais da extensão e configurações sincronizadas da extensão, depois restaura as configurações padrão.

Você também pode remover a extensão do seu navegador. Dependendo do navegador, remover a extensão também pode remover seu armazenamento local.

## O que o Chat Enhancer não faz

A extensão não executa análises.

A extensão não coleta histórico de navegação.

A extensão não vende dados de usuário.

Exceto pelos recursos Playground opt-in descritos acima, a extensão não envia dados a um servidor do Chat Enhancer.

A extensão não armazena mensagens recentes de perfil nem resultados de tradução depois que você sai ou atualiza a página de chat ao vivo.

Chat Enhancer for YouTube não é afiliado ao YouTube nem ao Google.

Para perguntas sobre privacidade, use o link de email em https://www.chatenhancer.com.
