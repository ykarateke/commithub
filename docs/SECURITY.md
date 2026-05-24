# CommitHub — Security

## API Key Yönetimi

- API key'ler **asla** `settings.json` veya `.env` dosyasına yazılmaz
- `vscode.SecretStorage` (OS-level encryption: macOS Keychain, Windows Credential Vault, Linux libsecret)
- Key'ler extension scope'ludur — diğer extension'lar erişemez
- Silme/güncelleme sadece kullanıcı komutu ile yapılır

## Prompt Injection Koruması

- Diff içeriği delimiter ile sistem prompt'tan ayrılır
- Kullanıcının diff'te yazdığı yorumlar sistem prompt'u ezemez
- Output validation: beklenen formatta değilse mesaj reddedilir

## Veri Gizliliği

- Diff verisi **asla** loglanmaz veya diske yazılmaz
- AI sağlayıcı politikaları:
  - OpenAI API: veri training için kullanılmaz
  - Anthropic API: veri training için kullanılmaz
  - Ollama: tüm veri lokal kalır
- Kullanıcı `.commithub.json` ile sağlayıcı seçer

## Proxy / Güvenlik Duvarı

- `https_proxy` / `http_proxy` env variable desteği
- Self-signed sertifika bypass opsiyonu (ayar ile)
