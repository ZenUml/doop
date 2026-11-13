//! Explicit read-only snapshot utility. Never opens Chromium/LevelDB, and never
//! prints document contents. Use only private destinations outside the checkout.
#[path = "../src/legacy_library.rs"]
mod legacy_library;
fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 3 {
        eprintln!("Usage: legacy_snapshot <old-ZenUML-folder> <new-private-destination>");
        std::process::exit(2);
    }
    match legacy_library::snapshot(
        std::path::Path::new(&args[2]),
        std::path::Path::new(&args[1]),
        "user_selected",
    ) {
        Ok(manifest) => println!(
            "status={} snapshots={} files={}",
            manifest.status,
            manifest.snapshots.len(),
            manifest
                .snapshots
                .last()
                .map(|snapshot| snapshot.file_count)
                .unwrap_or(0)
        ),
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}
