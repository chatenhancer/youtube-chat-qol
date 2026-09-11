---
locale: pl
title: "Polityka prywatności"
description: "Jak Chat Enhancer for YouTube obsługuje lokalne przechowywanie, tłumaczenie, dane Playground i ustawienia prywatności."
---

# Prywatność

Ostatnia aktualizacja: 11 września 2026

Chat Enhancer for YouTube to rozszerzenie przeglądarki dla czatu na żywo YouTube. Zostało zaprojektowane, aby dodawać drobne funkcje czatu bez zastępowania czatu YouTube ani zbierania analityki.

W skrócie:

- Większość funkcji rozszerzenia działa lokalnie w Twojej przeglądarce.
- Tłumaczenie jest domyślnie wyłączone.
- Gdy tłumaczenie jest włączone, tłumaczony tekst jest wysyłany do Google Translate.
- Gry Playground są domyślnie wyłączone. Jeśli włączysz i użyjesz Playground, obecność w grze, zaproszenia i akcje gry są wysyłane na serwer gier Chat Enhancer Playground pod wygenerowaną nazwą gracza.
- Rozszerzenie nie uruchamia analityki, nie sprzedaje danych i nie zbiera historii przeglądania.

## Gdzie działa rozszerzenie

Rozszerzenie działa na stronach czatu na żywo YouTube i powtórek czatu na żywo. Działa też na stronach YouTube, aby obsługiwać tryb obrazu w obrazie z filmem i czatem.

Rozszerzenie używa uprawnienia do zapisywania własnych ustawień i danych w Twojej przeglądarce. Używa też dostępu do konkretnych witryn potrzebnych do działania funkcji: stron czatu na żywo YouTube, usługi tłumaczenia Google Translate oraz opcjonalnego serwera gier Chat Enhancer Playground.

W Chrome i Edge uprawnienie `scripting` przywraca połączenie trybu obrazu w obrazie z filmem i czatem po ponownym załadowaniu lub aktualizacji rozszerzenia, bez odświeżania karty YouTube. Rozszerzenie nie prosi o ogólne uprawnienia do historii przeglądania, czytania kart ani nawigacji internetowej.

To uprawnienie pozwala też rozszerzeniu łączyć się z czatami YouTube, które są już otwarte w chwili jego instalacji lub włączenia.

## Dane przechowywane w Twojej przeglądarce

Rozszerzenie przechowuje część danych, aby jego funkcje mogły działać między przeładowaniami strony.

O ile poniżej nie wskazano inaczej, dane z tej sekcji pozostają w Twoim profilu przeglądarki i nie są wysyłane do Chat Enhancer. Przeglądarka może synchronizować ustawienia rozszerzenia między Twoimi zalogowanymi instalacjami przeglądarki.

- **Ustawienia:** Twoje wybory funkcji i preferencje.

- **Dane Inbox:** obserwowane słowa kluczowe i do 100 rekordów inbox na stream lub powtórkę. Rekordy Inbox mogą zawierać tekst wiadomości, nazwę autora, znacznik czasu, podstawowe szczegóły wiadomości YouTube potrzebne do pokazania, skąd pochodzi zapisana wiadomość, szczegóły dopasowania oraz informacje o emoji lub obrazach potrzebne do poprawnego pokazania zapisanej wiadomości.

- **Dane częstych emoji:** lokalne liczniki użycia i informacje wyświetlania emoji używane do budowy wiersza częstych emoji.

- **Dane zakładek:** tekst zapisanej wiadomości i dane wyświetlania emoji, nazwa autora, adres awatara i dostępny identyfikator kanału, czas wiadomości i zapisu oraz tytuł i adres transmisji. Zakładki pozostają dostępne między transmisjami w bieżącym profilu przeglądarki.

- **Dane obwódek awatarów:** nazwa autora, czas dodania obwódki, adres URL transmisji oraz, jeśli są dostępne, adres URL awatara, identyfikator kanału i tytuł transmisji dla użytkowników, którym wyraźnie dodasz obwódkę z profilu ostatnich wiadomości. Wybór pozostaje dostępny między transmisjami w bieżącym profilu przeglądarki i służy wyłącznie do ozdabiania pasujących awatarów.

- **Niewysłane szkice czatu:** zapisywane oddzielnie dla każdego streamu i przywracane po odświeżeniu strony. Szkice są usuwane, gdy pole czatu zostanie wyczyszczone, wiadomość zostanie wysłana lub dane rozszerzenia zostaną zresetowane.

- **Dane tożsamości Playground:** losowo wygenerowana lokalna tożsamość tworzona, jeśli używany jest Playground. Służy do rozpoznania tej samej instalacji przeglądarki po ponownym połączeniu z Playground. To nie jest Twoja tożsamość YouTube.

- **Tymczasowe dane strony:** ostatnie wiadomości profilu, stan komend i wyniki tłumaczeń są przechowywane tylko w pamięci dla bieżącej strony czatu na żywo. Są czyszczone, gdy opuszczasz lub odświeżasz stronę czatu.

## Dane wysyłane poza Twoją przeglądarkę

Dane są wysyłane do tych usług tylko wtedy, gdy powiązana funkcja jest włączona i używana:

### Google Translate (`translate-pa.googleapis.com`)

Tłumaczenie czatu wysyła tekst wiadomości czatu widoczny w czacie na żywo i kwalifikujący się do tłumaczenia, gdy tłumaczenie jest włączone. Tłumaczenie szkiców wysyła tekst szkicu, który wybierzesz do tłumaczenia z pola czatu.

Żądania tłumaczenia zawierają tekst do przetłumaczenia i język docelowy. Rozszerzenie nie wysyła Twoich plików cookie YouTube ani danych logowania YouTube z żądaniami tłumaczenia.

Dostęp do Google Translate przez `translate-pa.googleapis.com` jest nieoficjalny i może być limitowany, zmieniony lub niedostępny.

### <span id="playground"></span>Chat Enhancer Playground ([playground.chatenhancer.com](https://playground.chatenhancer.com))

Jeśli włączysz Playground i użyjesz panelu gier, rozszerzenie połączy się z serwerem gier Chat Enhancer Playground, aby użytkownicy opt-in w tym samym streamie mogli widzieć dostępność, wymieniać zaproszenia i grać.

Wiadomości Playground mogą zawierać identyfikator streamu lub wideo YouTube, wygenerowaną tożsamość gracza Playground, wygenerowaną nazwę gracza, listę dostępnych gier, zaproszenia i odpowiedzi na zaproszenia oraz akcje gry, takie jak ruchy szachowe.

Playground przechowuje zwięzłe wyniki meczów powiązane z wygenerowanymi tożsamościami graczy Playground, aby udostępniać statystyki graczy. Zapisane wyniki mogą obejmować wersję gry, czas rozpoczęcia i zakończenia, wynik i powód zakończenia, role uczestników oraz niewielkie statystyki specyficzne dla gry, takie jak ruchy lub punkty. Nie obejmują treści pytań trivia ani pełnego stanu gry.

Rozszerzenie nie wysyła tekstu czatu na żywo, Twojej nazwy wyświetlanej YouTube, URL awatara YouTube, plików cookie YouTube ani danych logowania YouTube na serwer gier Playground.

Oddzielnie generowanie pytań HELP-A-FRIEND! Trivia może wysyłać wybrane fragmenty publicznych transkrypcji wideo YouTube i identyfikatory gry na serwer gier Playground. Te fragmenty pochodzą z transkrypcji wideo, a nie z czatu na żywo. Serwer używa OpenAI do generowania pytań trivia z tych fragmentów.

Generowanie Replay Trivia może wymagać weryfikacji Cloudflare Turnstile na [playground.chatenhancer.com](https://playground.chatenhancer.com). Cloudflare może otrzymać normalne dane weryfikacyjne, takie jak adres IP, informacje o przeglądarce i urządzeniu oraz wynik wyzwania.

Jak każda usługa webowa, serwer gier Playground może otrzymać normalne informacje o połączeniu, takie jak adres IP oraz informacje o przeglądarce/urządzeniu, od przeglądarki lub dostawcy sieci.

## Kontrola danych

Możesz wyczyścić dane rozszerzenia z popupu rozszerzenia, używając przycisku resetowania. Czyści to lokalne dane rozszerzenia i zsynchronizowane ustawienia rozszerzenia, a następnie przywraca ustawienia domyślne.

Możesz także usunąć rozszerzenie z przeglądarki. W zależności od przeglądarki usunięcie rozszerzenia może też usunąć jego lokalną pamięć.

Zresetowanie lub usunięcie rozszerzenia samo w sobie nie usuwa wyników meczów zapisanych wcześniej przez Playground.

## Czego rozszerzenie nie robi

- Nie uruchamia analityki.
- Nie zbiera historii przeglądania.
- Nie sprzedaje danych użytkowników.
- Nie wysyła danych do serwera Chat Enhancer, chyba że używasz opisanych wyżej opcjonalnych funkcji Playground.

## Pytania

W sprawach prywatności [skontaktuj się z pomocą techniczną](https://www.chatenhancer.com/pl/support).

Chat Enhancer for YouTube nie jest powiązany z YouTube ani Google.
