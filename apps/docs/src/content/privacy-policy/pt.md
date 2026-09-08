---
locale: pt
title: "Política de privacidade"
description: "Como o Chat Enhancer for YouTube lida com armazenamento local, tradução, dados do Playground e controles de privacidade."
---

# Privacidade

Última atualização: 24 de julho de 2026

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

Salvo indicação em contrário abaixo, os dados desta seção permanecem no seu perfil do navegador e não são enviados ao Chat Enhancer. Seu navegador pode sincronizar as configurações da extensão entre suas próprias instalações conectadas.

- **Configurações:** suas escolhas e preferências de recursos.

- **Dados do Inbox:** palavras-chave observadas e até 100 registros de inbox por stream ou replay. Os registros do Inbox podem incluir texto da mensagem, nome do autor, timestamp, detalhes básicos de mensagem do YouTube necessários para mostrar de onde veio a mensagem salva, detalhes de correspondência e informações de emoji ou imagem necessárias para exibir corretamente a mensagem salva.

- **Dados de emojis frequentes:** contagens locais de uso e informações de exibição de emoji usadas para montar a linha de emojis frequentes.

- **Dados dos marcadores:** o texto da mensagem salva e informações para exibir emojis, o nome, a URL do avatar e, quando disponível, o ID do canal do autor, os horários da mensagem e do salvamento, além do título e da URL da transmissão. Os marcadores continuam disponíveis entre streams no perfil atual do navegador.

- **Dados dos anéis de avatar:** o nome do autor, a data e hora em que o anel foi adicionado, a URL da transmissão e, quando disponíveis, a URL do avatar, o ID do canal e o título da transmissão para os usuários aos quais você adiciona explicitamente um anel pelo perfil de mensagens recentes. A seleção continua disponível entre streams no perfil atual do navegador e é usada apenas para decorar avatares correspondentes.

- **Rascunhos de chat não enviados:** salvos separadamente para cada stream e restaurados após uma atualização da página. Rascunhos são removidos quando a entrada de chat é limpa, a mensagem é enviada ou os dados da extensão são redefinidos.

- **Dados de identidade do Playground:** uma identidade local gerada aleatoriamente e criada se o Playground for usado. Ela reconhece a mesma instalação do navegador quando se reconecta ao Playground. Não é sua identidade do YouTube.

- **Dados temporários da página:** mensagens recentes de perfil, estado de comandos e resultados de tradução são mantidos apenas na memória da página atual de chat ao vivo. Eles são limpos quando você sai ou atualiza a página de chat.

## Dados enviados para fora do seu navegador

Os dados são enviados a estes serviços somente quando o recurso relacionado está ativado e é usado:

### Google Translate (`translate-pa.googleapis.com`)

A tradução do chat envia texto de mensagens de chat visíveis no chat ao vivo e elegíveis para tradução enquanto a tradução está ativada. A tradução de rascunhos envia o texto do rascunho que você escolhe traduzir a partir da caixa de chat.

Solicitações de tradução incluem o texto a ser traduzido e o idioma de destino. A extensão não envia seus cookies do YouTube nem credenciais do YouTube com solicitações de tradução.

O acesso ao Google Translate por meio de `translate-pa.googleapis.com` não é oficial e pode ser limitado, alterado ou ficar indisponível.

### <span id="playground"></span>Chat Enhancer Playground ([playground.chatenhancer.com](https://playground.chatenhancer.com))

Se você ativar o Playground e usar o painel de jogos, a extensão se conecta ao servidor de jogos Chat Enhancer Playground para que usuários opt-in no mesmo stream possam ver disponibilidade, trocar convites e jogar.

Mensagens do Playground podem incluir o identificador do stream ou vídeo do YouTube, sua identidade de jogador do Playground gerada, seu nome de jogador gerado, sua lista de jogos disponíveis, convites e respostas a convites, e ações de jogo como movimentos de xadrez.

O Playground armazena resultados compactos de partidas vinculados a identidades de jogador do Playground geradas para fornecer estatísticas de jogadores. Os resultados armazenados podem incluir a versão do jogo, horários de início e término, resultado e motivo do término, funções dos participantes e pequenas estatísticas específicas do jogo, como movimentos ou pontuações. Eles não incluem o conteúdo de perguntas de trivia nem o estado completo da partida.

A extensão não envia texto do chat ao vivo, seu nome de exibição do YouTube, URL do seu avatar do YouTube, cookies do YouTube ou credenciais do YouTube ao servidor de jogos do Playground.

Separadamente, a geração de perguntas do HELP-A-FRIEND! Trivia pode enviar trechos selecionados de transcrições públicas de vídeos do YouTube e identificadores de jogo ao servidor de jogos do Playground. Esses trechos vêm da transcrição do vídeo, não do chat ao vivo. O servidor usa OpenAI para gerar perguntas de trivia a partir desses trechos.

A geração do Replay Trivia pode exigir verificação Cloudflare Turnstile em [playground.chatenhancer.com](https://playground.chatenhancer.com). A Cloudflare pode receber dados normais de verificação, como endereço IP, informações do navegador e do dispositivo, e resultado do desafio.

Como qualquer serviço web, o servidor de jogos do Playground pode receber informações normais de conexão, como endereço IP e informações do navegador/dispositivo, do navegador ou provedor de rede.

## Controles de dados

Você pode limpar os dados da extensão no popup da extensão usando o botão de redefinição. Isso limpa dados locais da extensão e configurações sincronizadas da extensão, depois restaura as configurações padrão.

Você também pode remover a extensão do seu navegador. Dependendo do navegador, remover a extensão também pode remover seu armazenamento local.

Redefinir ou remover a extensão não exclui, por si só, resultados de partidas já armazenados pelo Playground.

## O que a extensão não faz

- Executar análises.
- Coletar histórico de navegação.
- Vender dados de usuário.
- Enviar dados a um servidor do Chat Enhancer, a menos que você use os recursos Playground opt-in descritos acima.

## Perguntas

Para perguntas sobre privacidade, [entre em contato com o suporte](https://www.chatenhancer.com/pt/support).

Chat Enhancer for YouTube não é afiliado ao YouTube nem ao Google.
