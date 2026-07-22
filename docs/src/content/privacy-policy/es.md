---
locale: es
title: "Política de privacidad"
description: "Cómo Chat Enhancer for YouTube gestiona el almacenamiento local, la traducción, los datos de Playground y los controles de privacidad."
---

# Política de privacidad

Última actualización: 21 de junio de 2026

Chat Enhancer for YouTube es una extensión de navegador para el chat en directo de YouTube. Está diseñada para añadir pequeñas funciones al chat sin reemplazar el chat de YouTube ni recopilar analíticas.

Resumen:

- La mayoría de las funciones de la extensión se ejecutan localmente en tu navegador.
- La traducción está desactivada por defecto.
- Cuando la traducción está activada, el texto que se traduce se envía a Google Translate.
- Los juegos de Playground están desactivados por defecto. Si activas y usas Playground, la presencia de juego, las invitaciones y las acciones de juego se envían al servidor de juegos de Chat Enhancer Playground bajo un nombre de jugador generado.
- La extensión no ejecuta analíticas, no vende datos ni recopila historial de navegación.

## Dónde se ejecuta la extensión

La extensión se ejecuta solo en páginas de chat en directo y de repetición de chat en directo de YouTube a las que la extensión tiene permiso para acceder.

La extensión usa permisos para guardar sus propios ajustes y datos en tu navegador. También usa acceso a los sitios web específicos necesarios para que sus funciones funcionen: páginas de chat en directo de YouTube, el servicio de traducción de Google Translate y el servidor de juegos opcional de Chat Enhancer Playground.

La extensión no solicita permisos generales de historial de navegación, lectura de pestañas, scripting ni navegación web.

## Datos almacenados en tu navegador

La extensión almacena algunos datos para que sus funciones funcionen entre recargas de página.

Los datos indicados en esta sección se almacenan por la extensión en tu propio perfil de navegador. No se envían a Chat Enhancer salvo que también aparezcan en la sección "Datos enviados fuera de tu navegador" más abajo.

- **Configuración:** se guarda usando el almacenamiento sincronizado de la extensión del navegador (`chrome.storage.sync`). Según la configuración de tu navegador, el navegador puede sincronizar estos ajustes de la extensión entre tus propias instalaciones del navegador con sesión iniciada.

- **Datos de Inbox:** se guardan usando el almacenamiento local de la extensión (`chrome.storage.local`). Esto incluye palabras clave vigiladas y hasta 100 registros de Inbox por stream o repetición. Los registros de Inbox pueden incluir texto del mensaje, nombre del autor, marca de tiempo, detalles básicos de mensajes de YouTube necesarios para mostrar de dónde vino el mensaje guardado, detalles de coincidencia e información de emojis o imágenes necesaria para mostrar correctamente el mensaje guardado.

- **Datos de emojis frecuentes:** se guardan usando el almacenamiento local de la extensión (`chrome.storage.local`). Esto incluye contadores de uso locales e información de visualización de emojis usada para construir la fila de emojis frecuentes.

- **Datos de marcadores:** se guardan usando el almacenamiento local de la extensión (`chrome.storage.local`). Pueden incluir el texto del mensaje guardado y la información necesaria para mostrar emojis, el nombre, la URL del avatar y, cuando esté disponible, el ID del canal del autor, las horas del mensaje y del guardado, y el título y la URL del stream. Los marcadores siguen disponibles entre streams en el perfil actual del navegador.

- **Datos de aros de avatar:** se guardan usando el almacenamiento local de la extensión (`chrome.storage.local`). Incluyen el nombre del autor, el ID del canal cuando está disponible y la fecha y hora en que se añadió el aro de los usuarios a los que añades expresamente un aro desde su perfil de mensajes recientes. La selección sigue disponible entre streams en el perfil actual del navegador y solo se usa para decorar avatares coincidentes; no comprueba si un usuario está conectado.

- **Borradores de chat no enviados:** se guardan usando el almacenamiento local de la extensión (`chrome.storage.local`) por stream. Se restauran después de actualizar la página. Los borradores se eliminan cuando se limpia el cuadro de chat, se envía el mensaje o se restablecen los datos de la extensión.

- **Datos de identidad de Playground:** se guardan usando el almacenamiento local de la extensión (`chrome.storage.local`) si se usa Playground. Es una identidad local de Playground generada aleatoriamente que se usa para reconocer la misma instalación del navegador cuando vuelve a conectarse a Playground. No es tu identidad de YouTube.

- **Los mensajes recientes de perfil, el estado de comandos y los resultados de traducción:** se mantienen solo en memoria para la página actual de chat en directo. Se borran cuando sales o actualizas la página de chat.

## Datos enviados fuera de tu navegador

La traducción del chat, la traducción de borradores y los juegos de Playground están desactivados por defecto.

Cuando las funciones de traducción o Playground están activadas y se usan, pueden enviarse datos a estos servicios:

- **Google Translate en `https://translate.googleapis.com/translate_a/single`**

  La traducción del chat envía el texto de mensajes de chat que está visible en el chat en directo y es elegible para traducción mientras la traducción está activada. La traducción de borradores envía el texto del borrador que eliges traducir desde el cuadro de chat.

  Las solicitudes de traducción incluyen el texto que se va a traducir y el idioma de destino. La extensión no envía tus cookies de YouTube ni tus credenciales de YouTube con las solicitudes de traducción.

  El acceso a Google Translate mediante `translate.googleapis.com` no es oficial y puede estar sujeto a límites de uso, cambiar o dejar de estar disponible.

- <span id="playground"></span>**Chat Enhancer Playground en `https://playground.chatenhancer.com`**

  Playground está desactivado por defecto. Si activas Playground y usas el panel de juegos, la extensión se conecta al servidor de juegos de Chat Enhancer Playground para que los usuarios que hayan optado por participar en el mismo stream puedan ver disponibilidad, intercambiar invitaciones y jugar.

  Los mensajes de Playground pueden incluir el identificador del stream o vídeo de YouTube, tu identidad de jugador de Playground generada, tu nombre de jugador generado, tu lista de juegos disponibles, invitaciones y respuestas a invitaciones, y acciones de juego como movimientos de ajedrez.

  Playground no envía al servidor de juegos de Playground texto del chat en directo, tu nombre visible de YouTube, la URL de tu avatar de YouTube, cookies de YouTube ni credenciales de YouTube.

  Por separado, la generación de preguntas de HELP-A-FRIEND! Trivia puede enviar fragmentos seleccionados de transcripciones públicas de vídeos de YouTube e identificadores de juego al servidor de juegos de Playground. Estos fragmentos provienen de la transcripción del vídeo, no del chat en directo. El servidor usa OpenAI para generar preguntas de trivia a partir de esos fragmentos.

  La generación de Replay Trivia puede requerir verificación de Cloudflare Turnstile en `https://playground.chatenhancer.com`. Cloudflare puede recibir datos normales de verificación, como dirección IP, información del navegador y del dispositivo, y el resultado del desafío.

  Como cualquier servicio web, el servidor de juegos de Playground puede recibir información normal de conexión, como dirección IP e información del navegador/dispositivo, desde el navegador o el proveedor de red.

## Controles de datos

Puedes borrar los datos de la extensión desde el popup de la extensión usando el botón de restablecimiento. Esto borra los datos locales de la extensión y los ajustes sincronizados de la extensión, y luego restaura la configuración predeterminada.

También puedes quitar la extensión de tu navegador. Según el navegador, al quitar la extensión también puede eliminarse su almacenamiento local.

## Lo que Chat Enhancer no hace

La extensión no ejecuta analíticas.

La extensión no recopila historial de navegación.

La extensión no vende datos de usuario.

Salvo las funciones opcionales de Playground descritas arriba, la extensión no envía datos a un servidor de Chat Enhancer.

La extensión no almacena mensajes recientes de perfil ni resultados de traducción después de que sales o actualizas la página de chat en directo.

Chat Enhancer for YouTube no está afiliado a YouTube ni a Google.

Para preguntas de privacidad, usa el enlace de correo electrónico en https://www.chatenhancer.com.
