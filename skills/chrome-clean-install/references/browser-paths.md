# Browser Paths

Use these macOS defaults. If a path does not exist, inspect the browser's current profile path from its internal version/about page or ask for an explicit custom path.

| Prompt names | App | User data dir | Cache dir |
| --- | --- | --- | --- |
| `Chrome`, `Google Chrome` | `/Applications/Google Chrome.app` | `~/Library/Application Support/Google/Chrome` | `~/Library/Caches/Google/Chrome` |
| `Chrome Canary`, `Canary` | `/Applications/Google Chrome Canary.app` | `~/Library/Application Support/Google/Chrome Canary` | `~/Library/Caches/Google/Chrome Canary` |
| `Chrome Beta`, `Beta` | `/Applications/Google Chrome Beta.app` | `~/Library/Application Support/Google/Chrome Beta` | `~/Library/Caches/Google/Chrome Beta` |
| `Chrome Dev`, `Dev` | `/Applications/Google Chrome Dev.app` | `~/Library/Application Support/Google/Chrome Dev` | `~/Library/Caches/Google/Chrome Dev` |
| `Chrome for Testing`, `CfT` | `/Applications/Google Chrome for Testing.app` | `~/Library/Application Support/Google/Chrome for Testing` | `~/Library/Caches/Google/Chrome for Testing` |
| `Chromium` | `/Applications/Chromium.app` | `~/Library/Application Support/Chromium` | `~/Library/Caches/Chromium` |
| `Brave`, `Brave Browser` | `/Applications/Brave Browser.app` | `~/Library/Application Support/BraveSoftware/Brave-Browser` | `~/Library/Caches/BraveSoftware/Brave-Browser` |
| `Edge`, `Microsoft Edge` | `/Applications/Microsoft Edge.app` | `~/Library/Application Support/Microsoft Edge` | `~/Library/Caches/Microsoft Edge` |
| `Arc` | `/Applications/Arc.app` | `~/Library/Application Support/Arc` | `~/Library/Caches/Arc` |
| `Dia` | `/Applications/Dia.app` | `~/Library/Application Support/Dia` | `~/Library/Caches/Dia` |
| `Vivaldi` | `/Applications/Vivaldi.app` | `~/Library/Application Support/Vivaldi` | `~/Library/Caches/Vivaldi` |
| `Opera` | `/Applications/Opera.app` | `~/Library/Application Support/com.operasoftware.Opera` | `~/Library/Caches/com.operasoftware.Opera` |

## Custom Browser

Use explicit paths when the browser is Chromium-based but not listed:

```bash
node scripts/chromium-clean-install.mjs backup \
  --browser "Custom Browser" \
  --app-name "Custom Browser" \
  --process-name "Custom Browser" \
  --support-dir "$HOME/Library/Application Support/Custom Browser" \
  --cache-dir "$HOME/Library/Caches/Custom Browser"
```

For Chrome-family browsers, `chrome://version` shows `Profile Path`; the user data dir is its parent. Many non-Chrome Chromium browsers have equivalent `about:version` or `browser://version` pages.
