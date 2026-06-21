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
- Los juegos de Playground están desactivados por defecto. Si activas y usas Playground, la presencia de juego, las invitaciones y las acciones de juego se envían al backend de Chat Enhancer Playground bajo un nombre de jugador generado.
- La extensión no ejecuta analíticas, no vende datos ni recopila historial de navegación.

## Dónde se ejecuta la extensión

La extensión se ejecuta solo en páginas de chat en directo y de repetición de chat en directo de YouTube que coinciden con el manifiesto de la extensión.

La extensión usa el permiso de almacenamiento del navegador, además de acceso de host para páginas de chat en directo de YouTube, el endpoint de traducción de Google y el backend opcional de Playground. No solicita permisos generales de historial de navegación, lectura de pestañas, scripting ni navegación web.

## Datos almacenados en tu navegador

La extensión almacena algunos datos para que sus funciones funcionen entre recargas de página.

- **La configuración se almacena con `chrome.storage.sync`:** según la configuración de tu navegador, el navegador puede sincronizar esos ajustes de la extensión entre tus propias instalaciones del navegador con sesión iniciada.

- **Los datos de Inbox se almacenan con `chrome.storage.local`:** esto incluye palabras clave vigiladas y hasta 100 registros de Inbox por stream o repetición. Los registros de Inbox pueden incluir texto del mensaje, nombre del autor, marca de tiempo, metadatos de mensaje/fuente de YouTube, metadatos de coincidencia y datos de visualización de emoji/imagen necesarios para mostrar el mensaje guardado.

- **Los datos de emojis frecuentes se almacenan con `chrome.storage.local`:** esto incluye contadores de uso locales y metadatos de visualización de emojis usados para construir la fila de emojis frecuentes.

- **Los datos de usuarios marcados se almacenan con `chrome.storage.local`:** esto incluye el handle del usuario marcado, el ID del canal cuando está disponible y la hora en que se creó el marcador. Los usuarios marcados son globales entre streams en el perfil actual del navegador y se usan para mostrar anillos de avatar de color.

- **Los borradores de chat no enviados se almacenan con `chrome.storage.local` por stream:** se restauran después de actualizar la página. Los borradores se eliminan cuando se limpia el cuadro de chat, se envía el mensaje o se restablecen los datos de la extensión.

- **Los datos de identidad de Playground se almacenan con `chrome.storage.local` si se usa Playground:** es un par de claves pública/privada generado para firmar desafíos de conexión de Playground, de modo que la misma instalación del navegador pueda conservar la misma identidad seudónima de Playground. No es tu identidad de YouTube.

- **Los mensajes recientes de perfil, el estado de comandos y los resultados de traducción se mantienen solo en memoria para la página actual de chat en directo. Se borran cuando la página se descarga.**

## Datos enviados fuera de tu navegador

La traducción del chat y la traducción de borradores están desactivadas por defecto.

Cuando las funciones de traducción o Playground están activadas, pueden enviarse datos a estos servicios:

- **Google Translate en `https://translate.googleapis.com/translate_a/single`**

  La traducción del chat envía el texto de mensajes de chat visibles y entrantes elegibles. La traducción de borradores envía el texto del borrador que eliges traducir desde el cuadro de chat.

  Las solicitudes de traducción incluyen el texto que se va a traducir y el idioma de destino. La extensión no envía tus cookies de YouTube ni tus credenciales de YouTube con las solicitudes de traducción.

  El acceso a Google Translate mediante `translate.googleapis.com` no es oficial y puede estar sujeto a límites de uso, cambiar o dejar de estar disponible.

- **Chat Enhancer Playground en `https://playground.chatenhancer.com`**

  Playground está desactivado por defecto. Si activas Playground y usas el panel de juegos, la extensión se conecta al backend de Playground para que los usuarios que hayan optado por participar en el mismo stream puedan ver disponibilidad, intercambiar invitaciones y jugar.

  Los mensajes de Playground pueden incluir la clave del stream/vídeo, tu clave pública y firma de Playground generadas, tu nombre de jugador generado, tu lista de juegos disponibles, invitaciones y respuestas a invitaciones, y acciones de juego como movimientos de ajedrez.

  La generación de preguntas de HELP-A-FRIEND! Trivia puede enviar fragmentos seleccionados de transcripciones de repeticiones de YouTube e identificadores de juego al backend de Playground. El backend usa OpenAI para generar preguntas de trivia a partir de esos fragmentos.

  La generación de Replay Trivia puede requerir verificación de Cloudflare Turnstile en `https://playground.chatenhancer.com`. Cloudflare puede recibir datos normales de verificación, como dirección IP, agente de usuario y resultado del desafío.

  Playground no envía al backend de Playground texto del chat en directo, tu nombre visible de YouTube, la URL de tu avatar de YouTube, cookies de YouTube ni credenciales de YouTube.

  Como cualquier servicio web, el backend de Playground puede recibir metadatos normales de conexión, como dirección IP y agente de usuario, desde el navegador o el proveedor de red.

## Controles de datos

Puedes borrar los datos de la extensión desde el popup de la extensión usando el botón de restablecimiento. Esto borra los datos locales de la extensión y los ajustes sincronizados de la extensión, y luego restaura la configuración predeterminada.

También puedes quitar la extensión de tu navegador. Según el navegador, al quitar la extensión también puede eliminarse su almacenamiento local.

## Qué no se recopila

La extensión no ejecuta analíticas.

La extensión no recopila historial de navegación.

La extensión no vende datos de usuario.

Salvo los juegos opcionales de Playground descritos arriba, la extensión no envía datos a un servidor propiedad de la extensión.

La extensión no almacena mensajes recientes de perfil ni resultados de traducción después de que la página de chat en directo se descarga.

Chat Enhancer for YouTube no está afiliado a YouTube ni a Google.

Para preguntas de privacidad, usa el enlace de correo electrónico en https://www.chatenhancer.com.
