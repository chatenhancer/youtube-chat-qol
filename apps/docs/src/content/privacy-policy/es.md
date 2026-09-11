---
locale: es
title: "Política de privacidad"
description: "Cómo Chat Enhancer for YouTube gestiona el almacenamiento local, la traducción, los datos de Playground y los controles de privacidad."
---

# Política de privacidad

Última actualización: 11 de septiembre de 2026

Chat Enhancer for YouTube es una extensión de navegador para el chat en directo de YouTube. Está diseñada para añadir pequeñas funciones al chat sin reemplazar el chat de YouTube ni recopilar analíticas.

Resumen:

- La mayoría de las funciones de la extensión se ejecutan localmente en tu navegador.
- La traducción está desactivada por defecto.
- Cuando la traducción está activada, el texto que se traduce se envía a Google Translate.
- Los juegos de Playground están desactivados por defecto. Si activas y usas Playground, la presencia de juego, las invitaciones y las acciones de juego se envían al servidor de juegos de Chat Enhancer Playground bajo un nombre de jugador generado.
- La extensión no ejecuta analíticas, no vende datos ni recopila historial de navegación.

## Dónde se ejecuta la extensión

La extensión se ejecuta en páginas de chat en directo y de repetición de chat de YouTube. También se ejecuta en páginas de YouTube para ofrecer el modo de imagen en imagen de vídeo y chat.

La extensión usa permisos para guardar sus propios ajustes y datos en tu navegador. También usa acceso a los sitios web específicos necesarios para que sus funciones funcionen: páginas de chat en directo de YouTube, el servicio de traducción de Google Translate y el servidor de juegos opcional de Chat Enhancer Playground.

En Chrome y Edge, el permiso `scripting` vuelve a conectar el modo de imagen en imagen de vídeo y chat después de recargar o actualizar la extensión, sin actualizar la pestaña de YouTube. La extensión no solicita permisos generales de historial de navegación, lectura de pestañas ni navegación web.

Este permiso también permite que la extensión se conecte a los chats de YouTube que ya están abiertos cuando la instalas o activas.

## Datos almacenados en tu navegador

La extensión almacena algunos datos para que sus funciones funcionen entre recargas de página.

Salvo que se indique a continuación, los datos de esta sección permanecen en tu perfil de navegador y no se envían a Chat Enhancer. Tu navegador puede sincronizar los ajustes de la extensión entre tus propias instalaciones con sesión iniciada.

- **Configuración:** tus preferencias y opciones de uso.

- **Datos de Inbox:** palabras clave vigiladas y hasta 100 registros de Inbox por stream o repetición. Los registros de Inbox pueden incluir texto del mensaje, nombre del autor, marca de tiempo, detalles básicos de mensajes de YouTube necesarios para mostrar de dónde vino el mensaje guardado, detalles de coincidencia e información de emojis o imágenes necesaria para mostrar correctamente el mensaje guardado.

- **Datos de emojis frecuentes:** contadores de uso locales e información de visualización de emojis usada para construir la fila de emojis frecuentes.

- **Datos de marcadores:** el texto del mensaje guardado y la información necesaria para mostrar emojis, el nombre, la URL del avatar y, cuando esté disponible, el ID del canal del autor, las horas del mensaje y del guardado, y el título y la URL del stream. Los marcadores siguen disponibles entre streams en el perfil actual del navegador.

- **Datos de aros de avatar:** el nombre del autor, la fecha y hora en que se añadió el aro, la URL del stream y, cuando están disponibles, la URL del avatar, el ID del canal y el título del stream de los usuarios a los que añades expresamente un aro desde su perfil de mensajes recientes. La selección sigue disponible entre streams en el perfil actual del navegador y solo se usa para decorar avatares coincidentes.

- **Borradores de chat no enviados:** se guardan por separado para cada stream y se restauran después de actualizar la página. Los borradores se eliminan cuando se limpia el cuadro de chat, se envía el mensaje o se restablecen los datos de la extensión.

- **Datos de identidad de Playground:** una identidad local generada aleatoriamente que se crea si usas Playground. Sirve para reconocer la misma instalación del navegador cuando vuelve a conectarse a Playground. No es tu identidad de YouTube.

- **Datos temporales de la página:** los mensajes recientes de perfil, el estado de comandos y los resultados de traducción se mantienen solo en memoria para la página actual de chat en directo. Se borran cuando sales o actualizas la página de chat.

## Datos enviados fuera de tu navegador

Los datos solo se envían a estos servicios cuando la función correspondiente está activada y se usa:

### Google Translate (`translate-pa.googleapis.com`)

La traducción del chat envía el texto de mensajes de chat que está visible en el chat en directo y es elegible para traducción mientras la traducción está activada. La traducción de borradores envía el texto del borrador que eliges traducir desde el cuadro de chat.

Las solicitudes de traducción incluyen el texto que se va a traducir y el idioma de destino. La extensión no envía tus cookies de YouTube ni tus credenciales de YouTube con las solicitudes de traducción.

El acceso a Google Translate mediante `translate-pa.googleapis.com` no es oficial y puede estar sujeto a límites de uso, cambiar o dejar de estar disponible.

### <span id="playground"></span>Chat Enhancer Playground ([playground.chatenhancer.com](https://playground.chatenhancer.com))

Si activas Playground y usas el panel de juegos, la extensión se conecta al servidor de juegos de Chat Enhancer Playground para que los usuarios que hayan optado por participar en el mismo stream puedan ver disponibilidad, intercambiar invitaciones y jugar.

Los mensajes de Playground pueden incluir el identificador del stream o vídeo de YouTube, tu identidad de jugador de Playground generada, tu nombre de jugador generado, tu lista de juegos disponibles, invitaciones y respuestas a invitaciones, y acciones de juego como movimientos de ajedrez.

Playground almacena resultados compactos de partidas vinculados a identidades de jugador de Playground generadas para poder ofrecer estadísticas de jugadores. Los resultados almacenados pueden incluir la versión del juego, las horas de inicio y finalización, el resultado y el motivo de finalización, los roles de los participantes y pequeñas estadísticas específicas del juego, como movimientos o puntuaciones. No incluyen el contenido de preguntas de trivia ni el estado completo de la partida.

La extensión no envía al servidor de juegos de Playground texto del chat en directo, tu nombre visible de YouTube, la URL de tu avatar de YouTube, cookies de YouTube ni credenciales de YouTube.

Por separado, la generación de preguntas de HELP-A-FRIEND! Trivia puede enviar fragmentos seleccionados de transcripciones públicas de vídeos de YouTube e identificadores de juego al servidor de juegos de Playground. Estos fragmentos provienen de la transcripción del vídeo, no del chat en directo. El servidor usa OpenAI para generar preguntas de trivia a partir de esos fragmentos.

La generación de Replay Trivia puede requerir verificación de Cloudflare Turnstile en [playground.chatenhancer.com](https://playground.chatenhancer.com). Cloudflare puede recibir datos normales de verificación, como dirección IP, información del navegador y del dispositivo, y el resultado del desafío.

Como cualquier servicio web, el servidor de juegos de Playground puede recibir información normal de conexión, como dirección IP e información del navegador/dispositivo, desde el navegador o el proveedor de red.

## Controles de datos

Puedes borrar los datos de la extensión desde el popup de la extensión usando el botón de restablecimiento. Esto borra los datos locales de la extensión y los ajustes sincronizados de la extensión, y luego restaura la configuración predeterminada.

También puedes quitar la extensión de tu navegador. Según el navegador, al quitar la extensión también puede eliminarse su almacenamiento local.

Restablecer o quitar la extensión no elimina por sí solo los resultados de partidas que Playground ya haya almacenado.

## Lo que la extensión no hace

- Ejecutar analíticas.
- Recopilar historial de navegación.
- Vender datos de usuario.
- Enviar datos a un servidor de Chat Enhancer, salvo que uses las funciones opcionales de Playground descritas arriba.

## Preguntas

Para preguntas de privacidad, [contacta con soporte](https://www.chatenhancer.com/es/support).

Chat Enhancer for YouTube no está afiliado a YouTube ni a Google.
