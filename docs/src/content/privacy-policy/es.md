---
locale: es
title: "Política de privacidad"
description: "Cómo Chat Enhancer for YouTube gestiona el almacenamiento local, la traducción, los datos de Playground y los controles de privacidad."
---

# Política de privacidad

Última actualización: 17 de junio de 2026

Esta traducción se ofrece para comodidad. La versión en inglés de /privacy/ es la referencia principal.

Chat Enhancer for YouTube es una extensión de navegador para el chat en directo de YouTube. Está diseñada para añadir pequeñas mejoras al chat sin reemplazarlo ni recopilar analíticas.

Resumen:

- La mayoría de funciones se ejecutan localmente en tu navegador.
- La traducción está desactivada por defecto.
- Cuando activas la traducción, el texto que se traduce se envía a Google Translate.
- Los juegos de Playground están desactivados por defecto. Si los activas y los usas, la presencia de juego, las invitaciones y las acciones de juego se envían al backend de Chat Enhancer Playground con un nombre de jugador generado.
- La extensión no ejecuta analíticas, no vende datos y no recopila historial de navegación.

## Dónde se ejecuta la extensión

La extensión se ejecuta solo en páginas de chat en directo y repetición de chat en directo de YouTube que coinciden con el manifiesto de la extensión.

La extensión usa el permiso de almacenamiento del navegador y acceso de host para páginas de chat en directo de YouTube, el endpoint de traducción de Google y el backend opcional de Playground. No solicita permisos generales de historial de navegación, lectura de pestañas, scripting ni navegación web.

## Datos almacenados en tu navegador

La extensión guarda algunos datos para que sus funciones sigan funcionando entre recargas.

- **La configuración se guarda con `chrome.storage.sync`:** según la configuración de tu navegador, el navegador puede sincronizar esos ajustes entre tus instalaciones iniciadas con sesión.
- **Los datos de Inbox se guardan con `chrome.storage.local`:** esto incluye palabras clave vigiladas y hasta 100 registros de Inbox por stream o repetición. Los registros pueden incluir texto del mensaje, nombre del autor, marca de tiempo, metadatos de YouTube, metadatos de coincidencia y datos de emoji/imagen necesarios para mostrar el mensaje guardado.
- **Los datos de emojis frecuentes se guardan con `chrome.storage.local`:** esto incluye contadores locales y metadatos de emoji usados para crear la fila de emojis frecuentes.
- **Los usuarios marcados se guardan con `chrome.storage.local`:** esto incluye el handle, el ID del canal cuando está disponible y la hora de creación. Los marcadores son globales entre streams dentro del perfil actual del navegador y se usan para mostrar anillos de avatar de color.
- **Los borradores no enviados se guardan con `chrome.storage.local` por stream:** se restauran tras recargar la página y se eliminan cuando se limpia el cuadro de chat, se envía el mensaje o se restablecen los datos de la extensión.
- **El estado de las pestañas de chat en directo se guarda con `chrome.storage.local`:** se limita a IDs de pestaña y marcas de tiempo recientes, y se usa para indicar si la extensión está conectada o desconectada. Estos registros caducan después de 12 horas.
- **Los datos de identidad de Playground se guardan con `chrome.storage.local` si usas Playground:** es un par de claves público/privado generado para firmar desafíos de conexión, de modo que la misma instalación conserve la misma identidad seudónima. No es tu identidad de YouTube.
- **Los mensajes recientes de perfil, el estado de comandos y los resultados de traducción se mantienen solo en memoria para la página actual de chat en directo. Se borran cuando la página se descarga.**

## Datos enviados fuera de tu navegador

La traducción del chat y de borradores está desactivada por defecto.

Cuando activas traducción o Playground, pueden enviarse datos a estos servicios:

- **Google Translate en `https://translate.googleapis.com/translate_a/single`**

  La traducción del chat envía texto de mensajes visibles y entrantes elegibles. La traducción de borradores envía el texto que eliges traducir desde el cuadro de chat.

  Las solicitudes incluyen el texto y el idioma de destino. La extensión no envía tus cookies ni credenciales de YouTube con estas solicitudes.

  El acceso a Google Translate mediante `translate.googleapis.com` no es oficial y puede tener límites, cambiar o dejar de estar disponible.

- **Chat Enhancer Playground en `https://playground.chatenhancer.com`**

  Playground está desactivado por defecto. Si lo activas y usas el panel de juegos, la extensión se conecta al backend de Playground para que usuarios que también hayan optado por participar en el mismo stream puedan ver disponibilidad, intercambiar invitaciones y jugar.

  Los mensajes de Playground pueden incluir la clave del stream o vídeo, tu clave pública y firma generadas, tu nombre de jugador generado, tu lista de juegos disponibles, invitaciones y respuestas, y acciones de juego como movimientos de ajedrez.

  La generación de preguntas de HELP-A-FRIEND! Trivia puede enviar fragmentos seleccionados de la transcripción de una repetición de YouTube e identificadores de juego al backend de Playground. El backend usa OpenAI para generar preguntas a partir de esos fragmentos.

  La generación de Replay Trivia puede requerir verificación de Cloudflare Turnstile en `https://playground.chatenhancer.com`. Cloudflare puede recibir datos normales de verificación, como dirección IP, agente de usuario y resultado del desafío.

  Playground no envía al backend texto del chat en directo, tu nombre visible de YouTube, la URL de tu avatar de YouTube, cookies de YouTube ni credenciales de YouTube.

  Como cualquier servicio web, el backend de Playground puede recibir metadatos normales de conexión, como dirección IP y agente de usuario, desde el navegador o proveedor de red.

## Controles de datos

Puedes borrar los datos de la extensión desde el popup usando el botón de restablecimiento. Esto borra los datos locales y los ajustes sincronizados de la extensión, y luego restaura la configuración predeterminada.

También puedes quitar la extensión de tu navegador. Según el navegador, al quitarla también puede eliminarse su almacenamiento local.

## Qué no se recopila

La extensión no ejecuta analíticas.

La extensión no recopila historial de navegación.

La extensión no vende datos de usuario.

Salvo los juegos opcionales de Playground descritos arriba, la extensión no envía datos a un servidor propiedad de la extensión.

La extensión no almacena mensajes recientes de perfil ni resultados de traducción después de descargar la página de chat en directo.

Chat Enhancer for YouTube no está afiliado a YouTube ni a Google.

Para preguntas de privacidad, usa el enlace de correo electrónico en https://www.chatenhancer.com.
