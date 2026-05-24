# CommitHub — Coding Standards

## Commit Mesajı Stili

AI tarafından üretilen commit mesajları şu formata uyar:

```
<type>(<scope>): <subject>

<body?>

<footer?>
```

| Bileşen | Zorunlu? | Açıklama |
|---------|----------|----------|
| **type** | evet | `feat | fix | refactor | chore | docs | perf | test | style | build | ci | revert` |
| **scope** | hayır | Değişikliğin etki alanı — dosya yolundan veya `.commithub.json` scope listesinden |
| **subject** | evet | 72 karakter. Büyük harfle başlamaz, sonunda nokta olmaz. İngilizce'de imperative mood, Türkçe'de geçmiş zaman ("eklendi") |
| **body** | hayır | Neden ve nasıl, ne değil. Boş satırla ayrılır. |
| **footer** | hayır | `BREAKING CHANGE:` veya `Closes #123` |

---

## TypeScript Kuralları

| Kural | Açıklama |
|-------|----------|
| `strict: true` | tsconfig'de zorunlu, kapatılamaz |
| `any` yasak | `unknown` tercih edilir |
| `as` yasak | Type guard veya `satisfies` kullanılır |
| `null` yasak | `undefined` tercih edilir |
| `import type` | Type-only import'lar ayrılır |
| `async/await` | `.then()` kullanılmaz |
| Error handling | Spesifik tipler, generic `catch` yok |
| Logging | `[CommitHub]` prefix ile `console.log`/`console.error` |

---

## ESLint (mevcut, `eslint.config.mjs`)

| Kural | Seviye |
|-------|--------|
| `@typescript-eslint/naming-convention` | warn |
| `curly` | warn |
| `eqeqeq` | warn |
| `no-throw-literal` | warn |
| `semi` | warn |

### Eklenmesi Planlanan

| Kural | Seviye |
|-------|--------|
| `@typescript-eslint/no-explicit-any` | error |
| `@typescript-eslint/explicit-function-return-type` | warn |
| `max-len` (100) | warn |

---

## Test Standartları

- Framework: **Mocha + assert**
- Dosya adı: `*.test.ts` — her service için ayrı dosya
- AI çağrıları **mock**lanır, gerçek API çağrısı yapılmaz
- `git diff` fixture string'ler ile mocklanır
- Integration test `.vscode-test` ile gerçek VS Code'da çalışır
- Birim test `tsc` ile standalone çalışır (VS Code gerekmez)
- `assert.strictEqual` tercih edilir

### Coverage Hedefi

```
services/git.ts           → %100
services/diffAnalyzer.ts  → %100
services/commitGenerator  → %100
providers/*               → %100
config/*                  → %90
ui/*                      → %70
utils/*                   → %100
```

### İsimlendirme

| öğe | kural |
|-----|-------|
| değişken/fonksiyon | `camelCase` |
| sınıf/interface | `PascalCase` |
| sabit | `UPPER_CASE` |
| test dosyası | `{bileşenAdı}.test.ts` |
