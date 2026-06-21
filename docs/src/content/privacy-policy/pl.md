---
locale: pl
title: "Polityka prywatności"
description: "Jak Chat Enhancer for YouTube obsługuje lokalne przechowywanie, tłumaczenie, dane Playground i ustawienia prywatności."
---

# Prywatność

Ostatnia aktualizacja: 21 czerwca 2026

Chat Enhancer for YouTube to rozszerzenie przeglądarki dla czatu na żywo YouTube. Zostało zaprojektowane, aby dodawać drobne funkcje czatu bez zastępowania czatu YouTube ani zbierania analityki.

W skrócie:

- Większość funkcji rozszerzenia działa lokalnie w Twojej przeglądarce.
- Tłumaczenie jest domyślnie wyłączone.
- Gdy tłumaczenie jest włączone, tłumaczony tekst jest wysyłany do Google Translate.
- Gry Playground są domyślnie wyłączone. Jeśli włączysz i użyjesz Playground, obecność w grze, zaproszenia i akcje gry są wysyłane na serwer gier Chat Enhancer Playground pod wygenerowaną nazwą gracza.
- Rozszerzenie nie uruchamia analityki, nie sprzedaje danych i nie zbiera historii przeglądania.

## Gdzie działa rozszerzenie

Rozszerzenie działa tylko na stronach czatu na żywo YouTube i powtórek czatu na żywo, do których rozszerzenie ma pozwolenie na dostęp.

Rozszerzenie używa uprawnienia do zapisywania własnych ustawień i danych w Twojej przeglądarce. Używa też dostępu do konkretnych witryn potrzebnych do działania funkcji: stron czatu na żywo YouTube, usługi tłumaczenia Google Translate oraz opcjonalnego serwera gier Chat Enhancer Playground.

Rozszerzenie nie prosi o ogólne uprawnienia do historii przeglądania, czytania kart, skryptów ani nawigacji internetowej.

## Dane przechowywane w Twojej przeglądarce

Rozszerzenie przechowuje część danych, aby jego funkcje mogły działać między przeładowaniami strony.

Dane wymienione w tej sekcji są przechowywane przez rozszerzenie w Twoim własnym profilu przeglądarki. Nie są wysyłane do Chat Enhancer, chyba że są również wymienione w sekcji „Dane wysyłane poza Twoją przeglądarkę” poniżej.

- **Ustawienia:** zapisywane za pomocą synchronizowanego magazynu rozszerzeń przeglądarki (`chrome.storage.sync`). W zależności od ustawień przeglądarki, przeglądarka może synchronizować te ustawienia rozszerzenia między Twoimi zalogowanymi instalacjami przeglądarki.

- **Dane Inbox:** zapisywane za pomocą lokalnego magazynu rozszerzenia (`chrome.storage.local`). Obejmuje to obserwowane słowa kluczowe i do 100 rekordów inbox na stream lub powtórkę. Rekordy Inbox mogą zawierać tekst wiadomości, nazwę autora, znacznik czasu, podstawowe szczegóły wiadomości YouTube potrzebne do pokazania, skąd pochodzi zapisana wiadomość, szczegóły dopasowania oraz informacje o emoji lub obrazach potrzebne do poprawnego pokazania zapisanej wiadomości.

- **Dane częstych emoji:** zapisywane za pomocą lokalnego magazynu rozszerzenia (`chrome.storage.local`). Obejmuje to lokalne liczniki użycia i informacje wyświetlania emoji używane do budowy wiersza częstych emoji.

- **Dane zapisanych użytkowników:** zapisywane za pomocą lokalnego magazynu rozszerzenia (`chrome.storage.local`). Obejmuje to handle zapisanego użytkownika, ID kanału, jeśli jest dostępne, oraz czas utworzenia zakładki. Zapisani użytkownicy są globalni między streamami w bieżącym profilu przeglądarki i służą do wyświetlania kolorowych pierścieni awatarów.

- **Niewysłane szkice czatu:** zapisywane za pomocą lokalnego magazynu rozszerzenia (`chrome.storage.local`) dla każdego streamu. Są przywracane po odświeżeniu strony. Szkice są usuwane, gdy pole czatu zostanie wyczyszczone, wiadomość zostanie wysłana lub dane rozszerzenia zostaną zresetowane.

- **Dane tożsamości Playground:** zapisywane za pomocą lokalnego magazynu rozszerzenia (`chrome.storage.local`), jeśli używany jest Playground. Jest to losowo wygenerowana lokalna tożsamość Playground używana do rozpoznania tej samej instalacji przeglądarki po ponownym połączeniu z Playground. To nie jest Twoja tożsamość YouTube.

- **Ostatnie wiadomości profilu, stan komend i wyniki tłumaczeń:** przechowywane tylko w pamięci dla bieżącej strony czatu na żywo. Są czyszczone, gdy opuszczasz lub odświeżasz stronę czatu.

## Dane wysyłane poza Twoją przeglądarkę

Tłumaczenie czatu, tłumaczenie szkiców i gry Playground są domyślnie wyłączone.

Gdy funkcje tłumaczenia lub Playground są włączone i używane, dane mogą być wysyłane do tych usług:

- **Google Translate pod `https://translate.googleapis.com/translate_a/single`**

  Tłumaczenie czatu wysyła tekst wiadomości czatu widoczny w czacie na żywo i kwalifikujący się do tłumaczenia, gdy tłumaczenie jest włączone. Tłumaczenie szkiców wysyła tekst szkicu, który wybierzesz do tłumaczenia z pola czatu.

  Żądania tłumaczenia zawierają tekst do przetłumaczenia i język docelowy. Rozszerzenie nie wysyła Twoich plików cookie YouTube ani danych logowania YouTube z żądaniami tłumaczenia.

  Dostęp do Google Translate przez `translate.googleapis.com` jest nieoficjalny i może być limitowany, zmieniony lub niedostępny.

- **Chat Enhancer Playground pod `https://playground.chatenhancer.com`**

  Playground jest domyślnie wyłączony. Jeśli włączysz Playground i użyjesz panelu gier, rozszerzenie połączy się z serwerem gier Chat Enhancer Playground, aby użytkownicy opt-in w tym samym streamie mogli widzieć dostępność, wymieniać zaproszenia i grać.

  Wiadomości Playground mogą zawierać identyfikator streamu lub wideo YouTube, wygenerowaną tożsamość gracza Playground, wygenerowaną nazwę gracza, listę dostępnych gier, zaproszenia i odpowiedzi na zaproszenia oraz akcje gry, takie jak ruchy szachowe.

  Playground nie wysyła tekstu czatu na żywo, Twojej nazwy wyświetlanej YouTube, URL awatara YouTube, plików cookie YouTube ani danych logowania YouTube na serwer gier Playground.

  Oddzielnie generowanie pytań HELP-A-FRIEND! Trivia może wysyłać wybrane fragmenty publicznych transkrypcji wideo YouTube i identyfikatory gry na serwer gier Playground. Te fragmenty pochodzą z transkrypcji wideo, a nie z czatu na żywo. Serwer używa OpenAI do generowania pytań trivia z tych fragmentów.

  Generowanie Replay Trivia może wymagać weryfikacji Cloudflare Turnstile na `https://playground.chatenhancer.com`. Cloudflare może otrzymać normalne dane weryfikacyjne, takie jak adres IP, informacje o przeglądarce i urządzeniu oraz wynik wyzwania.

  Jak każda usługa webowa, serwer gier Playground może otrzymać normalne informacje o połączeniu, takie jak adres IP oraz informacje o przeglądarce/urządzeniu, od przeglądarki lub dostawcy sieci.

## Kontrola danych

Możesz wyczyścić dane rozszerzenia z popupu rozszerzenia, używając przycisku resetowania. Czyści to lokalne dane rozszerzenia i zsynchronizowane ustawienia rozszerzenia, a następnie przywraca ustawienia domyślne.

Możesz także usunąć rozszerzenie z przeglądarki. W zależności od przeglądarki usunięcie rozszerzenia może też usunąć jego lokalną pamięć.

## Czego Chat Enhancer nie robi

Rozszerzenie nie uruchamia analityki.

Rozszerzenie nie zbiera historii przeglądania.

Rozszerzenie nie sprzedaje danych użytkowników.

Poza opisanymi wyżej opcjonalnymi funkcjami Playground, rozszerzenie nie wysyła danych do serwera Chat Enhancer.

Rozszerzenie nie przechowuje ostatnich wiadomości profilu ani wyników tłumaczeń po opuszczeniu lub odświeżeniu strony czatu na żywo.

Chat Enhancer for YouTube nie jest powiązany z YouTube ani Google.

W sprawach prywatności użyj linku e-mail na https://www.chatenhancer.com.
