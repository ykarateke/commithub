# CommitHub — UI Flow

## Ana Akış: Commit Mesajı Oluşturma

```
Kullanıcı                VS Code Extension                AI Servisi
   │                           │                              │
   ├── 1. Stage'li değişiklikler                              │
   │                           │                              │
   ├── 2. "CommitHub AI"       │                              │
   │    (veya Ctrl+Shift+C) ──►│                              │
   │                           ├── 3. git diff --cached ──────│
   │                           │◄──── (raw diff) ────────────│
   │                           │                              │
   │                           ├── 4. Diff analizi            │
   │                           │    (dosyalar, fonksiyonlar,   │
   │                           │     language, scope/type)     │
   │                           │                              │
   │                           ├── 5. Prompt + API çağrısı ──►│
   │                           │                              │
   │                           │◄── 6. Stream response ───────│
   │                           │    (chunk by chunk)          │
   │                           │                              │
   ├── 7. InputBox'da mesaj ◄──┤                              │
   │    (düzenlenebilir)       │                              │
   │                           │                              │
   ├── 8. Düzenler / onaylar   │                              │
   │                           │                              │
   │                           ├── 9. git commit -m "..."     │
   │                           │    (opsiyonel: git push)     │
```

## Kullanıcı Arayüzü Öğeleri

| Öğe | Tip | Açıklama |
|-----|-----|----------|
| Source Control butonu | `sourceControl` | "CommitHub AI" — staged diff varsa gösterilir |
| InputBox | `InputBox` | AI mesajı düzenlenebilir şekilde sunar |
| Diff özet paneli | Webview | Hangi dosyalar, kaç satır, hangi fonksiyonlar |
| Kısayol | `Ctrl+Shift+C` / `Cmd+Shift+C` | Doğrudan commit mesajı oluşturma |

## Durum & Hata Yönetimi

| Durum | UI Davranışı |
|-------|-------------|
| Diff boş | "Staged değişiklik yok" bildirimi |
| API timeout (15sn) | Retry / Cancel seçenekli hata |
| API key yok | Ayarlar sayfasını açma teklifi |
| Network hatası | "Bağlantı hatası, tekrar dene" |
| Invalid response | "Mesaj oluşturulamadı" + fallback |
