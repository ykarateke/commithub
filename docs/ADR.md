# CommitHub — Architecture Decision Records

### ADR-001: AI Sağlayıcı Seçimi

**Karar:** Stratejik sağlayıcı OpenAI, çoklu sağlayıcı desteği (Anthropic, Ollama).

**Gerekçe:**
- OpenAI en geniş model yelpazesi ve en düşük latency
- Anthropic güvenlik/açıklanabilirlik avantajı
- Ollama offline ve ücretsiz
- Strategy pattern ile tüm sağlayıcılar aynı `AiProvider` interface'i altında

---

### ADR-002: API Key Yönetimi

**Karar:** `vscode.SecretStorage` kullanılacak, `settings.json` kullanılmayacak.

**Gerekçe:**
- SecretStorage OS-level encryption kullanır (macOS Keychain, Windows Credential Vault, Linux libsecret)
- `settings.json` repo'ya yanlışlıkla push edilebilir
- SecretStorage extension scope'ludur, diğer extension'lar erişemez

---

### ADR-003: Git İşlemleri

**Karar:** `simple-git` veya `isomorphic-git` kullanılmayacak, `child_process` ile git CLI çağrılacak.

**Gerekçe:**
- child_process her ortamda çalışır, ek bağımlılık gerektirmez
- Kullanıcının kendi git konfigürasyonu aynen kullanılır
- VS Code built-in git API'si (`vscode.git`) kararlı değil
- Sadece `git diff --cached` ve `git commit -m` yeterli

---

### ADR-004: Stream vs Batch

**Karar:** AI yanıtı stream olarak alınacak.

**Gerekçe:**
- Uzun mesajlarda kullanıcı beklemez
- Loading indicator'da kısmi metin gösterilebilir
- Kullanıcı deneyimi batch'e göre belirgin şekilde iyi

---

### ADR-005: Activation Strategy

**Karar:** Lazy activation (`activationEvents: []`).

**Gerekçe:**
- Extension sadece komut çağrıldığında aktive olur
- VS Code başlangıç süresini etkilemez
- Otomatik diff analizi eklenmezse `"*"` gerekmez
