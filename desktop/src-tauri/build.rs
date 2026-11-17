// Shared by both shells: ../src-tauri-chromium builds these same sources on
// Tauri 3's CEF runtime. tauri-runtime-cef declares `links`, so its presence
// shows up here as DEP_TAURI_RUNTIME_CEF_RUNTIME; the sources branch on the
// `chromium` cfg set from it, and read the capabilities kept in this crate.
fn main() {
    if std::env::var_os("CARGO_FEATURE_APP_STORE").is_some() {
        assert!(
            std::env::var_os("CARGO_FEATURE_SELF_UPDATER").is_none(),
            "App Store builds require --no-default-features"
        );
        assert_eq!(
            std::env::var("CARGO_CFG_TARGET_OS").unwrap(),
            "macos",
            "App Store profile requires macOS"
        );
        assert!(
            std::env::var_os("DEP_TAURI_RUNTIME_CEF_RUNTIME").is_none(),
            "App Store profile uses system WebKit"
        );
        let out = std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap());
        let arch = match std::env::var("CARGO_CFG_TARGET_ARCH").unwrap().as_str() {
            "aarch64" => "arm64",
            "x86_64" => "x86_64",
            _ => panic!("Unsupported App Store architecture"),
        };
        let sources = [
            "../commerce/CommercePolicy.swift",
            "../commerce/StoreKitBridge.swift",
        ];
        for source in sources {
            println!("cargo:rerun-if-changed={source}");
        }
        let status = std::process::Command::new("xcrun")
            .args([
                "swiftc",
                "-O",
                "-parse-as-library",
                "-emit-library",
                "-static",
                "-module-name",
                "DiagramlyCommerce",
                "-target",
                &format!("{arch}-apple-macosx13.0"),
            ])
            .args(sources)
            .arg("-o")
            .arg(out.join("libdiagramly_commerce.a"))
            .status()
            .expect("Xcode Swift compiler required");
        assert!(status.success(), "StoreKit bridge compilation failed");
        let info = std::process::Command::new("xcrun")
            .args(["swiftc", "-print-target-info"])
            .output()
            .unwrap();
        let info: serde_json::Value = serde_json::from_slice(&info.stdout).unwrap();
        for path in info["paths"]["runtimeLibraryPaths"].as_array().unwrap() {
            println!("cargo:rustc-link-search=native={}", path.as_str().unwrap());
        }
        println!("cargo:rustc-link-search=native={}", out.display());
        println!("cargo:rustc-link-lib=static=diagramly_commerce");
        println!("cargo:rustc-link-lib=framework=StoreKit");
        println!("cargo:rustc-link-lib=framework=WebKit");
        println!("cargo:rustc-link-lib=framework=AppKit");
        println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
    }
    println!("cargo::rustc-check-cfg=cfg(chromium)");
    let chromium = std::env::var_os("DEP_TAURI_RUNTIME_CEF_RUNTIME").is_some();
    if chromium {
        println!("cargo::rustc-cfg=chromium");
    }
    let attributes =
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "claude_status",
            "claude_connect",
            "claude_login",
            "claude_install",
            "claude_choose_cli",
            "claude_reset_cli",
            "claude_run",
            "claude_stop",
            "claude_add_extension",
            "claude_save_bundled_extension",
            "codex_add_mcp",
            "fonts_choose_local",
            "fonts_read_local",
            "server_status",
            "server_choose",
            "view_menu_state",
            "app_menu_set",
            "app_menu_state",
            "update_card_ready",
            "update_restart",
            "legacy_library_choose",
        ]));
    let attributes = if chromium {
        // tauri-build watches only its default capabilities path, so a
        // capability removed here would otherwise survive an incremental build
        println!("cargo:rerun-if-changed=../src-tauri/capabilities");
        attributes.capabilities_path_pattern("../src-tauri/capabilities/**/*")
    } else {
        attributes
    };
    tauri_build::try_build(attributes).expect("failed to build desktop permissions");
}
