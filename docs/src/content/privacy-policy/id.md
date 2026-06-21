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
- Game Playground nonaktif secara default. Jika Anda mengaktifkan dan menggunakan Playground, kehadiran game, undangan, dan aksi game dikirim ke backend Chat Enhancer Playground dengan nama pemain yang dibuat.
- Ekstensi tidak menjalankan analitik, menjual data, atau mengumpulkan riwayat browsing.

## Di mana ekstensi berjalan

Ekstensi hanya berjalan di halaman live chat YouTube dan replay live chat yang cocok dengan manifest ekstensi.

Ekstensi menggunakan izin `storage` browser, ditambah akses host untuk halaman live chat YouTube, endpoint terjemahan Google, dan backend Playground opsional. Ekstensi tidak meminta izin umum untuk riwayat browsing, membaca tab, scripting, atau navigasi web.

## Data yang disimpan di browser Anda

Ekstensi menyimpan beberapa data agar fiturnya dapat bekerja di antara reload halaman.

- **Pengaturan disimpan dengan `chrome.storage.sync`:** tergantung pengaturan browser Anda, browser dapat menyinkronkan pengaturan ekstensi tersebut di antara instalasi browser Anda yang sudah login.

- **Data Inbox disimpan dengan `chrome.storage.local`:** ini mencakup kata kunci yang dipantau dan hingga 100 catatan inbox per stream atau replay. Catatan Inbox dapat mencakup teks pesan, nama penulis, timestamp, metadata pesan/sumber YouTube, metadata kecocokan, dan data tampilan emoji/gambar yang diperlukan untuk menampilkan pesan tersimpan.

- **Data emoji yang sering digunakan disimpan dengan `chrome.storage.local`:** ini mencakup hitungan penggunaan lokal dan metadata tampilan emoji yang digunakan untuk membuat baris emoji sering digunakan.

- **Data pengguna yang dibookmark disimpan dengan `chrome.storage.local`:** ini mencakup handle pengguna yang dibookmark, ID channel jika tersedia, dan waktu bookmark dibuat. Pengguna yang dibookmark bersifat global di seluruh stream dalam profil browser saat ini dan digunakan untuk menampilkan cincin avatar berwarna.

- **Draft chat yang belum terkirim disimpan dengan `chrome.storage.local` per stream:** draft dipulihkan setelah refresh halaman. Draft dihapus saat input chat dikosongkan, pesan dikirim, atau data ekstensi direset.

- **Data identitas Playground disimpan dengan `chrome.storage.local` jika Playground digunakan:** ini adalah pasangan kunci publik/privat yang dibuat untuk menandatangani tantangan koneksi Playground, sehingga instalasi browser yang sama dapat mempertahankan identitas Playground pseudonim yang sama. Ini bukan identitas YouTube Anda.

- **Pesan profil terbaru, status perintah, dan hasil terjemahan hanya disimpan di memori untuk halaman live chat saat ini. Semuanya dihapus saat halaman dibongkar.**

## Data yang dikirim ke luar browser Anda

Terjemahan chat dan terjemahan draft nonaktif secara default.

Saat fitur terjemahan atau Playground diaktifkan, data dapat dikirim ke layanan berikut:

- **Google Translate di `https://translate.googleapis.com/translate_a/single`**

  Terjemahan chat mengirim teks pesan chat yang terlihat dan masuk yang memenuhi syarat. Terjemahan draft mengirim teks draft yang Anda pilih untuk diterjemahkan dari kotak chat.

  Permintaan terjemahan mencakup teks yang akan diterjemahkan dan bahasa target. Ekstensi tidak mengirim cookie YouTube atau kredensial YouTube Anda bersama permintaan terjemahan.

  Akses Google Translate melalui `translate.googleapis.com` tidak resmi dan dapat dibatasi, berubah, atau tidak tersedia.

- **Chat Enhancer Playground di `https://playground.chatenhancer.com`**

  Playground nonaktif secara default. Jika Anda mengaktifkan Playground dan menggunakan panel game, ekstensi terhubung ke backend Playground agar pengguna opt-in di stream yang sama dapat melihat ketersediaan, bertukar undangan, dan bermain game.

  Pesan Playground dapat mencakup kunci stream/video, kunci publik dan tanda tangan Playground yang dibuat untuk Anda, nama pemain yang dibuat untuk Anda, daftar game yang tersedia, undangan dan respons undangan, serta aksi game seperti langkah catur.

  Pembuatan pertanyaan HELP-A-FRIEND! Trivia dapat mengirim cuplikan transkrip replay YouTube yang dipilih dan pengenal game ke backend Playground. Backend menggunakan OpenAI untuk membuat pertanyaan trivia dari cuplikan tersebut.

  Pembuatan Replay Trivia dapat memerlukan verifikasi Cloudflare Turnstile di `https://playground.chatenhancer.com`. Cloudflare dapat menerima data verifikasi normal seperti alamat IP, user agent, dan hasil tantangan.

  Playground tidak mengirim teks live chat, nama tampilan YouTube Anda, URL avatar YouTube Anda, cookie YouTube, atau kredensial YouTube ke backend Playground.

  Seperti layanan web lainnya, backend Playground dapat menerima metadata koneksi normal seperti alamat IP dan user agent dari browser atau penyedia jaringan.

## Kontrol data

Anda dapat menghapus data ekstensi dari popup ekstensi dengan menggunakan tombol reset. Ini menghapus data ekstensi lokal dan pengaturan ekstensi yang disinkronkan, lalu memulihkan pengaturan default.

Anda juga dapat menghapus ekstensi dari browser Anda. Tergantung browser, menghapus ekstensi juga dapat menghapus penyimpanan lokal ekstensi tersebut.

## Yang tidak dikumpulkan

Ekstensi tidak menjalankan analitik.

Ekstensi tidak mengumpulkan riwayat browsing.

Ekstensi tidak menjual data pengguna.

Kecuali game Playground opt-in yang dijelaskan di atas, ekstensi tidak mengirim data ke server milik ekstensi.

Ekstensi tidak menyimpan pesan profil terbaru atau hasil terjemahan setelah halaman live chat dibongkar.

Chat Enhancer for YouTube tidak berafiliasi dengan YouTube atau Google.

Untuk pertanyaan privasi, gunakan tautan email di https://www.chatenhancer.com.
