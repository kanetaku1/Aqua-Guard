# Bahasa Indonesia — glossary and style (id.json)

Decided 2026-10-06: business terms are translated into the words used on the farm; abbreviations and Role names stay in English.
Keep this list when adding strings so the same English term always gets the same Indonesian word.

## Style

- Short, plain sentences; address the user as **Anda** only when needed. Buttons are imperative verbs (Simpan, Kirim, Batal).
- Sentence case like the English; never ALL CAPS (07 §UI text).
- Keep every `{{placeholder}}`, `<b>…</b>` tag, number, unit and symbol (`·`, `→`, `–`, `≥`, `±`) exactly as in English.
- Plural keys (`_one` / `_other`): Indonesian has no plural form — give both the same text.
- Names that come from data (Pond 02, Farm A, Sari Wijaya, device IDs) are not in id.json and stay as they are.
- Numbers keep the English format (4.1, 15,000) on every language: the threshold inputs read that format.

## Keep in English

DO, pH, TDS, ABW, ADG, FCR, SR, DOC, PL, TAN, NO2, Vibrio, mg/L, NTU, °C, cm, ha, kg, pcs, t, g, HP, WIB / WITA / WIT,
Farms Manager, Technical Manager, System Administrator, Online, Offline, Sensor, AquaGuard, Live (data freshness) → see below.

## Terms

| English | Indonesian |
| --- | --- |
| Farm / Farms | Tambak |
| Pond / Ponds | Kolam |
| Company | Perusahaan |
| Dashboard | Dasbor |
| Alert / Alerts | Peringatan |
| Issue / Risk / Issue | Isu / Risiko / Isu |
| Report · Daily Report · Weekly Report | Laporan · Laporan Harian · Laporan Mingguan |
| Critical · Warning · Attention · Normal (status) | Kritis · Waspada · Perhatian · Normal |
| Unacknowledged · Acknowledged · In Progress · Resolved | Belum dikonfirmasi · Dikonfirmasi · Sedang ditangani · Selesai |
| Acknowledge · Resolve (verbs) | Konfirmasi · Selesaikan |
| Not started · Draft · Submitted · Overdue | Belum dimulai · Draf · Terkirim · Terlambat |
| Live · Delayed · Offline · No data | Live · Tertunda · Offline · Tidak ada data |
| Water quality | Kualitas air |
| Temperature · Turbidity · Water level | Suhu · Kekeruhan · Tinggi air |
| Threshold | Ambang batas |
| Feeding / Feed | Pakan (pemberian pakan) |
| Feeding round | Putaran pakan |
| Tray (feeding tray) | Anco |
| Appetite: Good · Reduced · Poor | Nafsu makan: Baik · Menurun · Buruk |
| Tray: Clean · Leftover · Much leftover | Bersih · Ada sisa · Banyak sisa |
| Mortality | Kematian |
| Sampling | Sampling |
| Health | Kesehatan |
| Laboratory | Laboratorium |
| Actuator · Aerator · Water pump · Generator · Device | Aktuator · Kincir · Pompa air · Genset · Perangkat |
| Manual · Auto · Manual override | Manual · Otomatis · Override manual |
| Growth · Growth vs Target | Pertumbuhan · Pertumbuhan vs Target |
| On track · Behind · Ahead | Sesuai target · Tertinggal · Di atas target |
| Biomass | Biomassa |
| Survival Rate | Survival Rate (SR) |
| Stocked / stocking | Ditebar / penebaran |
| In operation · Fallow | Beroperasi · Istirahat |
| Actual · Estimated · Forecast | Aktual · Perkiraan · Prakiraan |
| Weather: Sunny · Cloudy · Rain · Heavy rain | Cerah · Berawan · Hujan · Hujan lebat |
| Increased aeration · Water exchange · Water treatment · Equipment inspection | Penambahan aerasi · Ganti air · Perlakuan air · Pemeriksaan peralatan |
| Equipment | Peralatan |
| User · Invite · Invited | Pengguna · Undang · Diundang |
| Active · Inactive · Deactivate · Reactivate | Aktif · Nonaktif · Nonaktifkan · Aktifkan kembali |
| Settings · Rules · Growth Targets · Thresholds | Pengaturan · Aturan · Target Pertumbuhan · Ambang Batas |
| Not used | Tidak dipakai |
| Save · Save Draft · Save changes · Discard changes · Submit · Cancel | Simpan · Simpan Draf · Simpan perubahan · Buang perubahan · Kirim · Batal |
| View · Edit · Add · Remove | Lihat · Ubah · Tambah · Hapus |
| Search | Cari |
| All (filter) | Semua |
| Sign in · Sign out · Password | Masuk · Keluar · Kata sandi |
| today · tomorrow · since | hari ini · besok · sejak |
| min · h · day(s) | menit · jam · hari |

## Terms chosen while translating (keep consistent)

| English | Indonesian |
| --- | --- |
| Not used (threshold side) | Tidak ada (short enough for the boundary inputs) |
| Due / deadline | Tenggat |
| Role (field label) | Peran |
| Default (thresholds) | Default · Override (per-Farm) → pengaturan khusus |
| Operations · Operational Status · Production Status | Operasional · Status Operasional · Status Produksi |
| Main reason · out of range · Major Issues · open (issues) · Ongoing | Alasan utama · di luar rentang · Isu utama · terbuka · Berlangsung |
| Running · Standby · Fault | Menyala · Siaga · Gangguan |
| Turn on / off · Switch to Manual · Return to Auto | Nyalakan / Matikan · Alihkan ke Manual · Kembali ke Otomatis |
| Safety Layer | Safety Layer (kept) |
| History · Control History | Riwayat · Riwayat Kontrol |
| Action(s) · Actions Taken · Record action · Outcome / Result · Cause | Tindakan · Tindakan yang Dilakukan · Catat tindakan · Hasil · Penyebab |
| Record (noun / verb) · Summary · Observation · Optional | Catatan / Catat · Ringkasan · Pengamatan · Opsional |
| Time series · Anomalies · Severity (column) | Grafik waktu · Anomali · Tingkat |
| Pending (lab results) · Not sampled | Menunggu · Tidak disampling |
| Feed type · Amount · Rainfall · Equipment event · Failure | Jenis pakan · Jumlah · Curah hujan · Kejadian peralatan · Kerusakan |
| Previous / Next · Showing {{from}}–{{to}} of {{total}} | Sebelumnya / Berikutnya · Menampilkan {{from}}–{{to}} dari {{total}} |
| Last sign-in · Failed sign-ins · Invitation · expires | Terakhir masuk · Gagal masuk · Undangan · berakhir |
| Location · Area · Time zone · Master data | Lokasi · Luas · Zona waktu · Data master |
| Connection · Last seen · Specification · Assigned users | Koneksi · Terakhir aktif · Spesifikasi · Pengguna yang ditugaskan |
| Low side / High side · Boundary · Tolerance · Curve points | Sisi bawah / Sisi atas · Batas · Toleransi · Titik kurva |
| Data freshness · Alkalinity · e.g. | Kebaruan data · Alkalinitas · mis. |

## Text that comes from the API

Alert titles, the Farm summary facts and main reason, action texts, actuator scopes and other sentences built by the
backend are data, not keys in id.json. The client sends `Accept-Language: en | id`; the backend is asked to return those
strings in that language (listed in api/OPENAPI_CHANGES.md).
