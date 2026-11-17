# Diagramly Desktop

The macOS App Store build embeds the local server and frontend in a sandboxed Tauri app. It reuses the existing ZenUML App Store identity (`com.zenuml.app`); changing the visible name must not change that identity or the legacy import source.

To build an unsigned review candidate from a clean checkout:

```sh
bash scripts/desktop-app-store.sh --unsigned
```

The script builds the local server, native shell, snapshot helper and Claude extension. An unsigned review candidate is not an App Store submission. A release requires the matching Apple signing identities and provisioning profile, followed by purchase, restore, migration and clean-machine checks tracked in [the launch issue](https://github.com/ZenUml/doop/issues/26).

Non-App-Store development shells currently default to a local server at `http://127.0.0.1:4300`; they require a running server or an explicitly configured build URL. No Diagramly desktop update feed has been established, so automatic updater checks are disabled. Apple delivers updates for the App Store build.

The [upstream desktop reference](../docs/upstream-desktop-reference.md) is retained as historical context for the original web shell. Its hosted service, release instructions, URLs and relative links do not describe this product's current deployment.
