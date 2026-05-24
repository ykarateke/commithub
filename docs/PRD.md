# Ürün Gereksinim Dokümanı (PRD): CommitHub

| Meta                | Detay |
|---------------------|-------|
| **Doküman Durumu**  | Taslak |
| **Son Güncelleme**  | 2026-05-24 |
| **Hedef Platform**  | VS Code Extension (^1.120.0) |
| **Mevcut Sürüm**    | 0.0.1 (boilerplate) |

**İlgili Dökümanlar:**
- [ARCHITECTURE.md](./ARCHITECTURE.md) — dizin yapısı, bileşenler, veri akışı, teknoloji haritası
- [ADR.md](./ADR.md) — Architecture Decision Records
- [CODING_STANDARDS.md](./CODING_STANDARDS.md) — commit mesajı stili, TypeScript/ESLint/test kuralları
- [SECURITY.md](./SECURITY.md) — API key yönetimi, prompt injection, veri gizliliği
- [UI_FLOW.md](./UI_FLOW.md) — kullanıcı akışları, UI öğeleri, hata durumları
- [DEBUG_RECIPES.md](./DEBUG_RECIPES.md) — debug, test, yaygın hatalar

---

## 1. Yönetici Özeti

CommitHub, VS Code entegre bir AI asistanıdır. Geliştiricilerin git diff verilerini analiz ederek Conventional Commits standartlarına uygun, projenin bağlamını yansıtan ve geliştiricinin dil tercihine göre optimize edilmiş commit mesajlarını saniyeler içinde oluşturmasını sağlar.

### Neden CommitHub?

- Geliştiriciler commit yazmaya zaman harcamak istemez
- Takımlarda commit mesajı standardı tutmaz
- Conventional Commits prefix'leri ezberlenmez
- AI çağında diff'i manuel özetlemek anlamsız

---

## 2. Vizyon ve Hedef

**Vizyon:** Geliştiricinin zihinsel yükünü azaltarak "kodu yazmaya" odaklanmasını sağlamak ve commit geçmişini otomatik olarak standartlaştırmak.

**Hedef:** Diff çıktılarını okunabilir, anlamlı commit'lere dönüştüren en hızlı VS Code eklentisi.

**Success Metrics:**
- Commit başına süre < 5 saniye
- Kullanıcıların %90'ı mesajı düzenlemeden kabul ediyor
- Conventional Commits uyum oranı %100

---

## 3. Temel Özellikler (MVP Scope)

### 3.1. Akıllı Analiz Motoru

| Özellik | Açıklama |
|---------|----------|
| **Context-Aware Diffing** | Kod + dosya adı + fonksiyon bağlamı analizi |
| **Dil Algılama** | Proje dilini `package.json` / `.git` / manuel ayardan seçer |
| **Conventional Commit** | `feat`, `fix`, `refactor`, `chore`, `docs`, `perf`, `test`, `style`, `build`, `ci`, `revert` |
| **Scope Detection** | Değişikliğin etki alanını algılar (`feat(auth):`) |
| **Breaking Change** | API değişikliği tespiti + `!` işareti |

### 3.2. Kullanıcı Arayüzü

- Source Control panelinde "CommitHub AI" butonu
- InputBox ile düzenlenebilir AI mesajı
- Diff özet paneli (Webview)
- Kısayol: `Ctrl+Shift+C` (Mac: `Cmd+Shift+C`)

Detaylı UI akışı: [UI_FLOW.md](./UI_FLOW.md)

### 3.3. Ayarlar

| Ayar | Tip | Varsayılan |
|------|-----|-----------|
| `commithub.provider` | enum | `openai` |
| `commithub.model` | string | `gpt-4o` |
| `commithub.language` | enum | `auto` |
| `commithub.maxLength` | number | `72` |
| `commithub.conventionalCommit` | boolean | `true` |
| `commithub.emoji` | boolean | `false` |

### 3.4. Proje Bazlı Konfigürasyon (`.commithub.json`)

```json
{
  "language": "tr",
  "conventionalCommit": true,
  "maxLength": 100,
  "scope": ["auth", "api", "ui", "core"],
  "provider": "openai",
  "model": "gpt-4o"
}
```

---

## 4. Milestones

| Faz | Hedef | Süre |
|-----|-------|------|
| **P0 — MVP** | Git diff + OpenAI + InputBox | 2 hafta |
| **P1 — Çoklu Provider** | Anthropic + Ollama + abstraction | 1 hafta |
| **P2 — Konfigürasyon** | `.commithub.json` + settings | 1 hafta |
| **P3 — UI** | Diff panel, buton, emoji | 1 hafta |
| **P4 — Test** | Integration, edge case, perf | 1 hafta |
| **P5 — Yayın** | Marketplace publish + docs | 3 gün |

---

## 5. Gelecek (Post-MVP)

- Multi-line body (AI summary)
- Commit history / template learning
- PR description generation
- Conventional Commit lint (commit-msg hook)
- Workspace trust integration
- Custom prompt templates
- Batch commit (her staged değişiklik için ayrı commit)
