# CommitHub — Architecture

## Dizin Yapısı

```
src/
├── extension.ts              # VS Code entrypoint, activate/deactivate
├── commands/                 # VS Code command handlers
│   ├── generateCommit.ts     # Ana komut: commit mesajı üret
│   └── config.ts             # Ayarları düzenleme
├── services/                 # Business logic
│   ├── git.ts                # Git CLI wrapper (child_process)
│   ├── diffAnalyzer.ts       # Diff çözümleme ve özet çıkarma
│   └── commitGenerator.ts    # Prompt + AI çağrısı + response parsing
├── providers/                # AI sağlayıcı adaptörleri
│   ├── types.ts              # AiProvider interface
│   ├── openaiProvider.ts     # OpenAI API
│   ├── anthropicProvider.ts  # Anthropic API
│   └── ollamaProvider.ts     # Local Ollama
├── ui/                       # VS Code UI bileşenleri
│   ├── inputBox.ts           # İnteraktif InputBox
│   ├── sourceControlButton.ts
│   └── diffSummaryPanel.ts   # Webview tabanlı özet
├── config/
│   ├── projectConfig.ts      # .commithub.json okuyucu
│   └── userConfig.ts         # VS Code settings wrapper
├── storage/
│   └── secretStorage.ts      # API key yönetimi (SecretStorage)
├── utils/
│   ├── conventionalCommit.ts # Prefix/scope validation
│   └── language.ts           # Dil algılama
└── test/
    ├── extension.test.ts
    ├── services/
    └── providers/
```

---

## Bileşen Sorumlulukları

| Bileşen | Sorumluluk | Dış Bağımlılık |
|---------|-----------|----------------|
| `extension.ts` | Activation, command registration, DI wiring | vscode API |
| `git.ts` | `git diff --cached`, `git log`, `git status` | child_process |
| `diffAnalyzer.ts` | Diff tokenize et, özet çıkar, scope/type tahmini | — |
| `commitGenerator.ts` | Prompt oluştur, AI çağrısı, yanıt parse | providers/* |
| `openaiProvider.ts` | OpenAI API çağrısı (stream) | axios/openai |
| `anthropicProvider.ts` | Anthropic API (stream) | @anthropic-ai/sdk |
| `ollamaProvider.ts` | Local Ollama | fetch |
| `projectConfig.ts` | `.commithub.json` oku/doğrula | fs |
| `secretStorage.ts` | API key'leri şifrele/sakla/sil | vscode.SecretStorage |

---

## Teknoloji Haritası

| Katman | Teknoloji |
|--------|----------|
| İstemci | TypeScript, VS Code Extension API |
| Veri Toplama | `child_process` (git CLI) |
| AI Entegrasyonu | REST API (stream), axios |
| Güvenlik | `vscode.SecretStorage` |
| Derleme | webpack (`dist/`), tsc (`out/`) |
| Test | tsc + Mocha + @vscode/test-cli |
| Konfigürasyon | VS Code settings + `.commithub.json` |

---

## Kullanılmayan Kütüphaneler (ve neden)

| Kütüphane | Neden Yok |
|-----------|-----------|
| `simple-git` | child_process yeterli |
| `isomorphic-git` | Web worker gerekmiyor |
| `dotenv` | SecretStorage daha güvenli |
| `commander` / `yargs` | CLI değil, VS Code command API |
| `react` / `vue` | Webview için vanilla HTML/TS yeterli |

---

## Veri Akışı

```
Git CLI ──► Diff Analyzer ──► Commit Generator ──► AI Provider
  ▲                                                     │
  │                                                     ▼
  └──── VS Code Commands ◄────── InputBox ◄───── Stream Response
                                       │
                                       ▼
                                  Git Commit
```

### Akış Adımları

1. `git diff --cached` → raw diff
2. Diff analizi: dosyalar, satır sayısı, fonksiyon adları → yapılandırılmış özet
3. Prompt: diff özeti + dil + kurallar → AI prompt
4. AI API çağrısı → stream response
5. Parse: AI yanıtı → `{ type, scope, subject, body, footer }`
6. InputBox'da kullanıcıya göster
7. Kullanıcı düzenler / onaylar / iptal eder
8. `git commit -m "..."`

---

## ADR (Architecture Decision Records)

Detaylı ADR'ler için: [docs/ADR.md](./ADR.md)

**Özet:**
- **ADR-001:** Stratejik AI sağlayıcı OpenAI + Strategy pattern ile Anthropic/Ollama desteği
- **ADR-002:** API key'ler `vscode.SecretStorage`'da, settings.json'da değil
- **ADR-003:** Git işlemleri `child_process` ile, ek library yok
- **ADR-004:** AI yanıtı stream olarak alınır (batch değil)
- **ADR-005:** Lazy activation (`activationEvents: []`)
