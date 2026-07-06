---
locale: id
title: "Kebijakan privasi"
description: "Cara Chat Enhancer for YouTube menangani penyimpanan lokal, terjemahan, data Playground, dan kontrol privasi."
---

# Privasi

Terakhir diperbarui: 21 Juni 2026

Chat Enhancer for YouTube adalah ekstensi browser untuk live chat YouTube. Ekstensi ini dirancang untuk menambahkan fitur chat kecil tanpa menggantikan chat YouTube atau mengumpulkan analitik.

Versi singkat:

- Sebagian besar fitur ekstensi berjalan secara lokal di browser Anda.
- Terjemahan nonaktif secara default.
- Saat terjemahan diaktifkan, teks yang diterjemahkan dikirim ke Google Translate.
- Game Playground nonaktif secara default. Jika Anda mengaktifkan dan menggunakan Playground, kehadiran game, undangan, dan aksi game dikirim ke server game Chat Enhancer Playground dengan nama pemain yang dibuat.
- Ekstensi tidak menjalankan analitik, menjual data, atau mengumpulkan riwayat browsing.

## Di mana ekstensi berjalan

Ekstensi hanya berjalan di halaman live chat YouTube dan replay live chat yang diizinkan untuk diakses oleh ekstensi.

Ekstensi menggunakan izin untuk menyimpan pengaturan dan datanya sendiri di browser Anda. Ekstensi juga menggunakan akses ke situs web tertentu yang diperlukan agar fiturnya berfungsi: halaman live chat YouTube, layanan terjemahan Google Translate, dan server game Chat Enhancer Playground opsional.

Ekstensi tidak meminta izin umum untuk riwayat browsing, membaca tab, scripting, atau navigasi web.

## Data yang disimpan di browser Anda

Ekstensi menyimpan beberapa data agar fiturnya dapat bekerja di antara reload halaman.

Data yang tercantum di bagian ini disimpan oleh ekstensi di profil browser Anda sendiri. Data ini tidak dikirim ke Chat Enhancer kecuali juga tercantum di bagian "Data yang dikirim ke luar browser Anda" di bawah.

- **Pengaturan:** disimpan menggunakan penyimpanan ekstensi browser yang disinkronkan (`chrome.storage.sync`). Tergantung pengaturan browser Anda, browser dapat menyinkronkan pengaturan ekstensi tersebut di antara instalasi browser Anda yang sudah login.

- **Data Inbox:** disimpan menggunakan penyimpanan ekstensi lokal (`chrome.storage.local`). Ini mencakup kata kunci yang dipantau dan hingga 100 catatan inbox per stream atau replay. Catatan Inbox dapat mencakup teks pesan, nama penulis, timestamp, detail dasar pesan YouTube yang diperlukan untuk menunjukkan dari mana pesan tersimpan berasal, detail kecocokan, serta informasi emoji atau gambar yang diperlukan untuk menampilkan pesan tersimpan dengan benar.

- **Data emoji yang sering digunakan:** disimpan menggunakan penyimpanan ekstensi lokal (`chrome.storage.local`). Ini mencakup hitungan penggunaan lokal dan informasi tampilan emoji yang digunakan untuk membuat baris emoji sering digunakan.

- **Data pengguna yang dibookmark:** disimpan menggunakan penyimpanan ekstensi lokal (`chrome.storage.local`). Ini mencakup handle pengguna yang dibookmark, ID channel jika tersedia, dan waktu bookmark dibuat. Pengguna yang dibookmark bersifat global di seluruh stream dalam profil browser saat ini dan digunakan untuk menampilkan cincin avatar berwarna.

- **Draft chat yang belum terkirim:** disimpan menggunakan penyimpanan ekstensi lokal (`chrome.storage.local`) per stream. Draft dipulihkan setelah refresh halaman. Draft dihapus saat input chat dikosongkan, pesan dikirim, atau data ekstensi direset.

- **Data identitas Playground:** disimpan menggunakan penyimpanan ekstensi lokal (`chrome.storage.local`) jika Playground digunakan. Ini adalah identitas lokal Playground yang dibuat secara acak dan digunakan untuk mengenali instalasi browser yang sama saat terhubung kembali ke Playground. Ini bukan identitas YouTube Anda.

- **Pesan profil terbaru, status perintah, dan hasil terjemahan:** hanya disimpan di memori untuk halaman live chat saat ini. Semuanya dihapus saat Anda meninggalkan atau merefresh halaman chat.

## Data yang dikirim ke luar browser Anda

Terjemahan chat, terjemahan draft, dan game Playground nonaktif secara default.

Saat fitur terjemahan atau Playground diaktifkan dan digunakan, data dapat dikirim ke layanan berikut:

- **Google Translate di `https://translate.googleapis.com/translate_a/single`**

  Terjemahan chat mengirim teks pesan chat yang terlihat di live chat dan memenuhi syarat untuk diterjemahkan saat terjemahan diaktifkan. Terjemahan draft mengirim teks draft yang Anda pilih untuk diterjemahkan dari kotak chat.

  Permintaan terjemahan mencakup teks yang akan diterjemahkan dan bahasa target. Ekstensi tidak mengirim cookie YouTube atau kredensial YouTube Anda bersama permintaan terjemahan.

  Akses Google Translate melalui `translate.googleapis.com` tidak resmi dan dapat dibatasi, berubah, atau tidak tersedia.

- <span id="playground"></span>**Chat Enhancer Playground di `https://playground.chatenhancer.com`**

  Playground nonaktif secara default. Jika Anda mengaktifkan Playground dan menggunakan panel game, ekstensi terhubung ke server game Chat Enhancer Playground agar pengguna opt-in di stream yang sama dapat melihat ketersediaan, bertukar undangan, dan bermain game.

  Pesan Playground dapat mencakup pengenal stream atau video YouTube, identitas pemain Playground yang dibuat, nama pemain yang dibuat, daftar game yang tersedia, undangan dan respons undangan, serta aksi game seperti langkah catur.

  Playground tidak mengirim teks live chat, nama tampilan YouTube Anda, URL avatar YouTube Anda, cookie YouTube, atau kredensial YouTube ke server game Playground.

  Secara terpisah, pembuatan pertanyaan HELP-A-FRIEND! Trivia dapat mengirim cuplikan transkrip video YouTube publik yang dipilih dan pengenal game ke server game Playground. Cuplikan ini berasal dari transkrip video, bukan dari live chat. Server menggunakan OpenAI untuk membuat pertanyaan trivia dari cuplikan tersebut.

  Pembuatan Replay Trivia dapat memerlukan verifikasi Cloudflare Turnstile di `https://playground.chatenhancer.com`. Cloudflare dapat menerima data verifikasi normal seperti alamat IP, informasi browser dan perangkat, serta hasil tantangan.

  Seperti layanan web lainnya, server game Playground dapat menerima informasi koneksi normal seperti alamat IP dan informasi browser/perangkat dari browser atau penyedia jaringan.

## Kontrol data

Anda dapat menghapus data ekstensi dari popup ekstensi dengan menggunakan tombol reset. Ini menghapus data ekstensi lokal dan pengaturan ekstensi yang disinkronkan, lalu memulihkan pengaturan default.

Anda juga dapat menghapus ekstensi dari browser Anda. Tergantung browser, menghapus ekstensi juga dapat menghapus penyimpanan lokal ekstensi tersebut.

## Yang tidak dilakukan Chat Enhancer

Ekstensi tidak menjalankan analitik.

Ekstensi tidak mengumpulkan riwayat browsing.

Ekstensi tidak menjual data pengguna.

Kecuali fitur Playground opt-in yang dijelaskan di atas, ekstensi tidak mengirim data ke server Chat Enhancer.

Ekstensi tidak menyimpan pesan profil terbaru atau hasil terjemahan setelah Anda meninggalkan atau merefresh halaman live chat.

Chat Enhancer for YouTube tidak berafiliasi dengan YouTube atau Google.

Untuk pertanyaan privasi, gunakan tautan email di https://www.chatenhancer.com.
