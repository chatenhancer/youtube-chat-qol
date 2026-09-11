---
locale: id
title: "Kebijakan privasi"
description: "Cara Chat Enhancer for YouTube menangani penyimpanan lokal, terjemahan, data Playground, dan kontrol privasi."
---

# Privasi

Terakhir diperbarui: 11 September 2026

Chat Enhancer for YouTube adalah ekstensi browser untuk live chat YouTube. Ekstensi ini dirancang untuk menambahkan fitur chat kecil tanpa menggantikan chat YouTube atau mengumpulkan analitik.

Versi singkat:

- Sebagian besar fitur ekstensi berjalan secara lokal di browser Anda.
- Terjemahan nonaktif secara default.
- Saat terjemahan diaktifkan, teks yang diterjemahkan dikirim ke Google Translate.
- Game Playground nonaktif secara default. Jika Anda mengaktifkan dan menggunakan Playground, kehadiran game, undangan, dan aksi game dikirim ke server game Chat Enhancer Playground dengan nama pemain yang dibuat.
- Ekstensi tidak menjalankan analitik, menjual data, atau mengumpulkan riwayat browsing.

## Di mana ekstensi berjalan

Ekstensi berjalan di halaman live chat YouTube dan replay live chat. Ekstensi juga berjalan di halaman YouTube untuk mendukung picture-in-picture video dan chat.

Ekstensi menggunakan izin untuk menyimpan pengaturan dan datanya sendiri di browser Anda. Ekstensi juga menggunakan akses ke situs web tertentu yang diperlukan agar fiturnya berfungsi: halaman live chat YouTube, layanan terjemahan Google Translate, dan server game Chat Enhancer Playground opsional.

Di Chrome dan Edge, izin `scripting` menyambungkan kembali picture-in-picture video dan chat setelah ekstensi dimuat ulang atau diperbarui, tanpa memuat ulang tab YouTube. Ekstensi tidak meminta izin umum untuk riwayat browsing, membaca tab, atau navigasi web.

Izin ini juga memungkinkan ekstensi terhubung ke chat YouTube yang sudah terbuka saat Anda memasang atau mengaktifkannya.

## Data yang disimpan di browser Anda

Ekstensi menyimpan beberapa data agar fiturnya dapat bekerja di antara reload halaman.

Kecuali dinyatakan lain di bawah, data di bagian ini tetap berada di profil browser Anda dan tidak dikirim ke Chat Enhancer. Browser dapat menyinkronkan pengaturan ekstensi di antara instalasi browser Anda sendiri yang sudah login.

- **Pengaturan:** pilihan fitur dan preferensi Anda.

- **Data Inbox:** kata kunci yang dipantau dan hingga 100 catatan inbox per stream atau replay. Catatan Inbox dapat mencakup teks pesan, nama penulis, timestamp, detail dasar pesan YouTube yang diperlukan untuk menunjukkan dari mana pesan tersimpan berasal, detail kecocokan, serta informasi emoji atau gambar yang diperlukan untuk menampilkan pesan tersimpan dengan benar.

- **Data emoji yang sering digunakan:** hitungan penggunaan lokal dan informasi tampilan emoji yang digunakan untuk membuat baris emoji sering digunakan.

- **Data bookmark:** teks pesan tersimpan dan informasi tampilan emoji, nama penulis, URL avatar dan ID channel jika tersedia, waktu pesan dan penyimpanan, serta judul dan URL stream. Bookmark tetap tersedia di seluruh stream dalam profil browser saat ini.

- **Data cincin avatar:** nama penulis, waktu cincin ditambahkan, URL stream, serta URL avatar, ID channel, dan judul stream jika tersedia, untuk pengguna yang secara khusus Anda tambahi cincin dari profil pesan terbaru mereka. Pilihan tetap tersedia di seluruh stream dalam profil browser saat ini dan hanya digunakan untuk menghias avatar yang cocok.

- **Draft chat yang belum terkirim:** disimpan secara terpisah untuk setiap stream dan dipulihkan setelah refresh halaman. Draft dihapus saat input chat dikosongkan, pesan dikirim, atau data ekstensi direset.

- **Data identitas Playground:** identitas lokal acak yang dibuat jika Playground digunakan. Identitas ini mengenali instalasi browser yang sama saat terhubung kembali ke Playground. Ini bukan identitas YouTube Anda.

- **Data halaman sementara:** pesan profil terbaru, status perintah, dan hasil terjemahan hanya disimpan di memori untuk halaman live chat saat ini. Semuanya dihapus saat Anda meninggalkan atau merefresh halaman chat.

## Data yang dikirim ke luar browser Anda

Data hanya dikirim ke layanan berikut saat fitur terkait diaktifkan dan digunakan:

### Google Translate (`translate-pa.googleapis.com`)

Terjemahan chat mengirim teks pesan chat yang terlihat di live chat dan memenuhi syarat untuk diterjemahkan saat terjemahan diaktifkan. Terjemahan draft mengirim teks draft yang Anda pilih untuk diterjemahkan dari kotak chat.

Permintaan terjemahan mencakup teks yang akan diterjemahkan dan bahasa target. Ekstensi tidak mengirim cookie YouTube atau kredensial YouTube Anda bersama permintaan terjemahan.

Akses Google Translate melalui `translate-pa.googleapis.com` tidak resmi dan dapat dibatasi, berubah, atau tidak tersedia.

### <span id="playground"></span>Chat Enhancer Playground ([playground.chatenhancer.com](https://playground.chatenhancer.com))

Jika Anda mengaktifkan Playground dan menggunakan panel game, ekstensi terhubung ke server game Chat Enhancer Playground agar pengguna opt-in di stream yang sama dapat melihat ketersediaan, bertukar undangan, dan bermain game.

Pesan Playground dapat mencakup pengenal stream atau video YouTube, identitas pemain Playground yang dibuat, nama pemain yang dibuat, daftar game yang tersedia, undangan dan respons undangan, serta aksi game seperti langkah catur.

Playground menyimpan hasil pertandingan ringkas yang ditautkan ke identitas pemain Playground yang dibuat agar dapat menyediakan statistik pemain. Hasil yang disimpan dapat mencakup versi game, waktu mulai dan selesai, hasil dan alasan berakhir, peran peserta, serta statistik kecil khusus game seperti langkah atau skor. Hasil tersebut tidak mencakup isi pertanyaan trivia atau status game lengkap.

Ekstensi tidak mengirim teks live chat, nama tampilan YouTube Anda, URL avatar YouTube Anda, cookie YouTube, atau kredensial YouTube ke server game Playground.

Secara terpisah, pembuatan pertanyaan HELP-A-FRIEND! Trivia dapat mengirim cuplikan transkrip video YouTube publik yang dipilih dan pengenal game ke server game Playground. Cuplikan ini berasal dari transkrip video, bukan dari live chat. Server menggunakan OpenAI untuk membuat pertanyaan trivia dari cuplikan tersebut.

Pembuatan Replay Trivia dapat memerlukan verifikasi Cloudflare Turnstile di [playground.chatenhancer.com](https://playground.chatenhancer.com). Cloudflare dapat menerima data verifikasi normal seperti alamat IP, informasi browser dan perangkat, serta hasil tantangan.

Seperti layanan web lainnya, server game Playground dapat menerima informasi koneksi normal seperti alamat IP dan informasi browser/perangkat dari browser atau penyedia jaringan.

## Kontrol data

Anda dapat menghapus data ekstensi dari popup ekstensi dengan menggunakan tombol reset. Ini menghapus data ekstensi lokal dan pengaturan ekstensi yang disinkronkan, lalu memulihkan pengaturan default.

Anda juga dapat menghapus ekstensi dari browser Anda. Tergantung browser, menghapus ekstensi juga dapat menghapus penyimpanan lokal ekstensi tersebut.

Mereset atau menghapus ekstensi tidak dengan sendirinya menghapus hasil pertandingan yang sudah disimpan oleh Playground.

## Yang tidak dilakukan ekstensi

- Menjalankan analitik.
- Mengumpulkan riwayat browsing.
- Menjual data pengguna.
- Mengirim data ke server Chat Enhancer kecuali Anda menggunakan fitur Playground opt-in yang dijelaskan di atas.

## Pertanyaan

Untuk pertanyaan privasi, [hubungi dukungan](https://www.chatenhancer.com/id/support).

Chat Enhancer for YouTube tidak berafiliasi dengan YouTube atau Google.
