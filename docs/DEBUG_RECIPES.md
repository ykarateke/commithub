# CommitHub — Debug Recipes

## F5 ile Debug

1. Terminal: `npm run watch` (veya F5 otomatik başlatır)
2. VS Code'da `F5` → Extension Development Host
3. Extension output Debug Console'da
4. `src/extension.ts`'de breakpoint konabilir

## Test Debug

```bash
# Tüm testler
npm run pretest && npm test

# Tek test dosyası
npx tsx src/test/services/git.test.ts

# VS Code Extension Test Runner: Testing view → Run Test (Cmd+; A)
```

## Yaygın Hatalar

| Sorun | Çözüm |
|-------|-------|
| `module 'vscode' not found` | `npm run compile` (webpack) gerekli, tsc tek başına yetmez |
| Testler `out/test/` altında yok | `npm run compile-tests` |
| "command not found" VS Code'da | `activationEvents: []` — komut ilk çağrıda aktive olur |
| API key hatası | `Developer: Toggle Developer Tools` → Console |
| Git diff boş | `git diff --cached` staged değişiklik gerektirir → önce `git add` |
| Debug console boş | `commithub.outputLevel` → `"debug"` |
| Webpack build yavaş | `npm run compile -- --stats=minimal` |

## Log Seviyeleri

```
commithub.outputLevel: "silent" | "error" | "warn" | "info" | "debug"
```

Varsayılan: `"info"`. Debug modunda raw diff, AI prompt ve response loglanır.

## Quick Diagnostics

```typescript
const channel = vscode.window.createOutputChannel('CommitHub');
channel.appendLine('[CommitHub] ...');
```
