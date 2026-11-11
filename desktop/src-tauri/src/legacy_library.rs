//! Preserve Chromium's old local library without opening it in a browser or
//! database runtime. A raw snapshot is NOT a successful document migration.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::os::fd::AsRawFd;
use std::os::unix::fs::{MetadataExt, OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const STORES: [&str; 2] = ["IndexedDB", "Local Storage"];
const MAX_FILES: usize = 20_000;
const MAX_BYTES: u64 = 1024 * 1024 * 1024;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotFile {
    pub path: String,
    pub bytes: u64,
    pub sha256: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub id: String,
    pub created_at: u64,
    pub source_kind: String,
    pub directory: PathBuf,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub indexed_db_directory: Option<PathBuf>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub local_storage_directory: Option<PathBuf>,
    pub file_count: usize,
    pub logical_bytes: u64,
    pub files: Vec<SnapshotFile>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub export_file: Option<PathBuf>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub schema_version: u8,
    pub status: String,
    pub snapshots: Vec<Snapshot>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

fn empty() -> Manifest {
    Manifest { schema_version: 1, status: "not_found".into(), snapshots: vec![], message: Some("No legacy library was found in this app's sandbox. You can choose an older ZenUML folder.".into()) }
}

fn private_directory(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|_| "Could not create the private legacy backup folder.")?;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700))
        .map_err(|_| "Could not protect the legacy backup folder.".into())
}

pub fn manifest_path(data: &Path) -> PathBuf {
    data.join("legacy-library.json")
}

fn load(data: &Path) -> Result<Manifest, String> {
    let path = manifest_path(data);
    if !path.exists() {
        return Ok(empty());
    }
    let manifest: Manifest = serde_json::from_slice(
        &fs::read(path).map_err(|_| "Could not read the legacy backup manifest.")?,
    )
    .map_err(|_| "The legacy backup manifest is invalid; existing backups were not changed.")?;
    if manifest.schema_version != 1 {
        return Err(
            "Unsupported legacy backup manifest; existing backups were not changed.".into(),
        );
    }
    let backups = fs::canonicalize(data.join("legacy-library-backups"))
        .map_err(|_| "Legacy backup directory is unavailable.")?;
    for snapshot in &manifest.snapshots {
        let directory = fs::canonicalize(&snapshot.directory)
            .map_err(|_| "A preserved legacy backup is unavailable.")?;
        if directory == backups || !directory.starts_with(&backups) {
            return Err("Legacy backup path is outside the private backup directory.".into());
        }
        for path in snapshot
            .indexed_db_directory
            .iter()
            .chain(snapshot.local_storage_directory.iter())
            .chain(snapshot.export_file.iter())
        {
            let child =
                fs::canonicalize(path).map_err(|_| "A legacy backup member is unavailable.")?;
            if child == directory || !child.starts_with(&directory) {
                return Err("Legacy backup member is outside its snapshot.".into());
            }
        }
    }
    Ok(manifest)
}

fn save(data: &Path, manifest: &Manifest) -> Result<(), String> {
    private_directory(data)?;
    let mut file = tempfile::NamedTempFile::new_in(data)
        .map_err(|_| "Could not stage the legacy backup manifest.")?;
    file.as_file()
        .set_permissions(fs::Permissions::from_mode(0o600))
        .map_err(|_| "Could not protect the legacy backup manifest.")?;
    serde_json::to_writer_pretty(&mut file, manifest)
        .map_err(|_| "Could not write the legacy backup manifest.")?;
    file.as_file()
        .sync_all()
        .map_err(|_| "Could not flush the legacy backup manifest.")?;
    file.persist(manifest_path(data))
        .map_err(|_| "Could not publish the legacy backup manifest.")?;
    Ok(())
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct Stamp {
    bytes: u64,
    modified: u128,
    inode: u64,
    device: u64,
    directory: bool,
}

fn inventory(root: &Path) -> Result<BTreeMap<PathBuf, Stamp>, String> {
    let canonical_root = fs::canonicalize(root).map_err(|_| "Could not resolve legacy storage.")?;
    let root = canonical_root.as_path();
    fn walk(
        root: &Path,
        directory: &Path,
        out: &mut BTreeMap<PathBuf, Stamp>,
        bytes: &mut u64,
    ) -> Result<(), String> {
        for item in
            fs::read_dir(directory).map_err(|_| "Could not read the selected legacy folder.")?
        {
            let path = item.map_err(|_| "Could not inspect a legacy file.")?.path();
            let meta =
                fs::symlink_metadata(&path).map_err(|_| "Could not inspect a legacy file.")?;
            if meta.file_type().is_symlink() || (!meta.is_dir() && !meta.is_file()) {
                return Err("Legacy storage contains a link or unsupported file; no snapshot was published.".into());
            }
            let resolved =
                fs::canonicalize(&path).map_err(|_| "A legacy file became unavailable.")?;
            if !resolved.starts_with(root) {
                return Err("A legacy file resolves outside the selected folder.".into());
            }
            *bytes = bytes
                .checked_add(if meta.is_file() { meta.len() } else { 0 })
                .ok_or("Legacy library size overflow.")?;
            if out.len() >= MAX_FILES || *bytes > MAX_BYTES {
                return Err("The legacy library exceeds the safe snapshot limit. Original files are unchanged.".into());
            }
            out.insert(
                path.strip_prefix(root)
                    .map_err(|_| "Invalid legacy storage path.")?
                    .to_path_buf(),
                Stamp {
                    bytes: meta.len(),
                    modified: meta
                        .modified()
                        .map_err(|_| "Could not read legacy file timestamps.")?
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_nanos(),
                    inode: meta.ino(),
                    device: meta.dev(),
                    directory: meta.is_dir(),
                },
            );
            if meta.is_dir() {
                walk(root, &path, out, bytes)?;
            }
        }
        Ok(())
    }
    let mut out = BTreeMap::new();
    let mut bytes = 0;
    for name in STORES {
        let path = root.join(name);
        if path.exists() {
            if fs::symlink_metadata(&path)
                .map_err(|_| "Could not inspect legacy storage.")?
                .file_type()
                .is_symlink()
            {
                return Err("Legacy storage directory is a symlink.".into());
            }
            walk(root, &path, &mut out, &mut bytes)?;
        }
    }
    Ok(out)
}

// LevelDB's POSIX writer takes an exclusive fcntl lock. Shared read locks on
// the existing LOCK files prevent a writer from opening during the snapshot.
// Do not create LOCK in the original, and never open it again while copying:
// POSIX closing another descriptor for that inode would release our lock.
fn lock_stores(root: &Path) -> Result<Vec<File>, String> {
    let mut locks = vec![];
    for path in [
        root.join("IndexedDB/file__0.indexeddb.leveldb/LOCK"),
        root.join("Local Storage/leveldb/LOCK"),
    ] {
        if !path.parent().is_some_and(Path::is_dir) {
            continue;
        }
        let file = OpenOptions::new().read(true).custom_flags(libc::O_NOFOLLOW).open(&path).map_err(|_| "Legacy storage lock is unavailable. Quit the old app and choose its original ZenUML folder.")?;
        let mut lock: libc::flock = unsafe { std::mem::zeroed() };
        lock.l_type = libc::F_RDLCK as _;
        lock.l_whence = libc::SEEK_SET as _;
        if unsafe { libc::fcntl(file.as_raw_fd(), libc::F_SETLK, &lock) } == -1 {
            return Err(
                "Legacy storage is busy. Quit the old ZenUML app before preserving its library."
                    .into(),
            );
        }
        locks.push(file);
    }
    if locks.is_empty() {
        return Err("No supported legacy LevelDB storage was found in that folder.".into());
    }
    Ok(locks)
}

pub fn snapshot(data: &Path, source: &Path, source_kind: &str) -> Result<Manifest, String> {
    private_directory(data)?;
    let backups = data.join("legacy-library-backups");
    private_directory(&backups)?;
    let backups =
        fs::canonicalize(backups).map_err(|_| "Could not resolve private backup storage.")?;
    let source =
        fs::canonicalize(source).map_err(|_| "Could not access the selected legacy folder.")?;
    if source.starts_with(&backups) || backups.starts_with(&source) {
        return Err("Choose the original ZenUML folder, not a backup or its parent.".into());
    }
    let _locks = lock_stores(&source)?;
    let before = inventory(&source)?;
    let pending = tempfile::Builder::new()
        .prefix("legacy-")
        .tempdir_in(&backups)
        .map_err(|_| "Could not stage a private legacy snapshot.")?;
    let mut files = vec![];
    for (relative, stamp) in &before {
        let destination = pending.path().join(relative);
        if stamp.directory {
            private_directory(&destination)?;
            continue;
        }
        private_directory(destination.parent().ok_or("Invalid backup path.")?)?;
        let mut output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&destination)
            .map_err(|_| "Could not create a legacy backup file.")?;
        let mut digest = Sha256::new();
        let mut copied = 0;
        if relative.file_name().is_some_and(|name| name == "LOCK") {
            if stamp.bytes != 0 {
                return Err(
                    "Unexpected legacy lock-file contents; no snapshot was published.".into(),
                );
            }
        } else {
            let mut input = OpenOptions::new()
                .read(true)
                .custom_flags(libc::O_NOFOLLOW)
                .open(source.join(relative))
                .map_err(|_| "Could not read a legacy file without following links.")?;
            let mut buffer = [0u8; 64 * 1024];
            loop {
                let count = input
                    .read(&mut buffer)
                    .map_err(|_| "Could not read a legacy file.")?;
                if count == 0 {
                    break;
                }
                copied += count as u64;
                if copied > stamp.bytes {
                    return Err("Legacy files changed during preservation; retry after quitting the old app.".into());
                }
                digest.update(&buffer[..count]);
                output
                    .write_all(&buffer[..count])
                    .map_err(|_| "Could not write a legacy backup file.")?;
            }
        }
        if copied != stamp.bytes {
            return Err(
                "Legacy files changed during preservation; no snapshot was published.".into(),
            );
        }
        output
            .sync_all()
            .map_err(|_| "Could not flush a legacy backup file.")?;
        files.push(SnapshotFile {
            path: relative
                .to_str()
                .ok_or("Unsupported legacy file name.")?
                .into(),
            bytes: copied,
            sha256: format!("{:x}", digest.finalize()),
        });
    }
    if before != inventory(&source)? {
        return Err(
            "Legacy files changed during preservation; retry after quitting the old app.".into(),
        );
    }
    let directory = pending.keep();
    let mut manifest = load(data)?;
    manifest.snapshots.push(Snapshot {
        id: directory
            .file_name()
            .ok_or("Invalid snapshot identifier.")?
            .to_string_lossy()
            .into(),
        created_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64,
        source_kind: source_kind.into(),
        indexed_db_directory: directory
            .join("IndexedDB/file__0.indexeddb.leveldb")
            .is_dir()
            .then(|| directory.join("IndexedDB/file__0.indexeddb.leveldb")),
        local_storage_directory: directory
            .join("Local Storage/leveldb")
            .is_dir()
            .then(|| directory.join("Local Storage/leveldb")),
        file_count: files.len(),
        logical_bytes: files.iter().map(|file| file.bytes).sum(),
        files,
        directory,
        export_file: None,
    });
    manifest.status = "preserved_needs_export".into();
    manifest.message = Some("The old local library is preserved. It has not been imported or marked migrated; a validated export is still required.".into());
    save(data, &manifest)?;
    Ok(manifest)
}

/// Runs before Node starts. Existing successful snapshots are retained rather
/// than repeatedly copying data or treating a fresh database as a migration.
pub fn prepare(data: &Path, home: &Path) -> Result<PathBuf, String> {
    private_directory(data)?;
    private_directory(&data.join("legacy-library-backups"))?;
    let existing = load(data)?;
    if !existing.snapshots.is_empty() {
        return Ok(manifest_path(data));
    }
    let source = home.join("Library/Application Support/ZenUML");
    // A review build outside App Sandbox must not silently copy the user's
    // unsandboxed library. That folder requires the explicit native picker.
    if home.ends_with("Library/Containers/com.zenuml.app/Data") && source.is_dir() {
        if let Err(error) = snapshot(data, &source, "sandbox") {
            let mut manifest = existing;
            manifest.status = if error.contains("busy") {
                "busy"
            } else {
                "error"
            }
            .into();
            manifest.message = Some(error);
            save(data, &manifest)?;
        }
    } else {
        save(data, &existing)?;
    }
    Ok(manifest_path(data))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(root: &Path) {
        for store in [
            "IndexedDB/file__0.indexeddb.leveldb",
            "Local Storage/leveldb",
        ] {
            let path = root.join(store);
            fs::create_dir_all(&path).unwrap();
            fs::write(path.join("LOCK"), []).unwrap();
            fs::write(path.join("CURRENT"), b"MANIFEST-000001\n").unwrap();
            fs::write(path.join("000003.log"), b"synthetic fixture bytes").unwrap();
        }
    }
    #[test]
    fn preserves_bytes_privately_without_marking_migrated() {
        let temp = tempfile::tempdir().unwrap();
        let old = temp.path().join("old");
        fixture(&old);
        let before = inventory(&old).unwrap();
        let data = temp.path().join("new");
        let manifest = snapshot(&data, &old, "user_selected").unwrap();
        assert_eq!(manifest.status, "preserved_needs_export");
        let snap = &manifest.snapshots[0];
        assert!(snap.export_file.is_none());
        assert_eq!(snap.file_count, 6);
        for file in &snap.files {
            assert_eq!(
                fs::read(old.join(&file.path)).unwrap(),
                fs::read(snap.directory.join(&file.path)).unwrap()
            );
            assert_eq!(
                fs::metadata(snap.directory.join(&file.path))
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
        }
        assert_eq!(inventory(&old).unwrap(), before);
        assert_eq!(
            fs::metadata(manifest_path(&data))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
    }
    #[test]
    fn refuses_symlink_exfiltration_and_publishes_no_snapshot() {
        let temp = tempfile::tempdir().unwrap();
        let old = temp.path().join("old");
        fixture(&old);
        let private = temp.path().join("private");
        fs::write(&private, "secret").unwrap();
        std::os::unix::fs::symlink(private, old.join("IndexedDB/private-link")).unwrap();
        let data = temp.path().join("new");
        assert!(snapshot(&data, &old, "user_selected").is_err());
        assert!(!manifest_path(&data).exists());
    }
    #[test]
    fn refuses_manifest_paths_outside_private_backups() {
        let temp = tempfile::tempdir().unwrap();
        let old = temp.path().join("old");
        fixture(&old);
        let data = temp.path().join("new");
        let mut manifest = snapshot(&data, &old, "user_selected").unwrap();
        manifest.snapshots[0].directory = old;
        save(&data, &manifest).unwrap();
        assert!(load(&data).is_err());
    }
    #[test]
    fn refuses_a_live_writer_without_publishing_or_mutating_source() {
        use std::io::{BufRead, BufReader};
        use std::process::{Command, Stdio};
        let temp = tempfile::tempdir().unwrap();
        let old = temp.path().join("old");
        fixture(&old);
        let before = inventory(&old).unwrap();
        let mut writer = Command::new("python3").args(["-c", "import fcntl,sys; f=open(sys.argv[1], 'r+b'); fcntl.lockf(f, fcntl.LOCK_EX); print('locked', flush=True); sys.stdin.read()"])
            .arg(old.join("IndexedDB/file__0.indexeddb.leveldb/LOCK"))
            .stdin(Stdio::piped()).stdout(Stdio::piped()).spawn().unwrap();
        let mut ready = String::new();
        BufReader::new(writer.stdout.take().unwrap())
            .read_line(&mut ready)
            .unwrap();
        assert_eq!(ready.trim(), "locked");
        let data = temp.path().join("new");
        let result = snapshot(&data, &old, "user_selected");
        drop(writer.stdin.take());
        assert!(writer.wait().unwrap().success());
        assert!(result.unwrap_err().contains("busy"));
        assert!(!manifest_path(&data).exists());
        assert_eq!(inventory(&old).unwrap(), before);
    }
    #[test]
    fn refuses_an_export_file_that_escapes_its_snapshot() {
        let temp = tempfile::tempdir().unwrap();
        let old = temp.path().join("old");
        fixture(&old);
        let data = temp.path().join("new");
        let mut manifest = snapshot(&data, &old, "user_selected").unwrap();
        manifest.snapshots[0].export_file =
            Some(old.join("IndexedDB/file__0.indexeddb.leveldb/CURRENT"));
        save(&data, &manifest).unwrap();
        assert!(load(&data).unwrap_err().contains("outside its snapshot"));
    }
    #[test]
    fn corrupt_manifest_is_retained_without_replacing_recovery_evidence() {
        let temp = tempfile::tempdir().unwrap();
        fs::write(manifest_path(temp.path()), b"corrupt existing manifest").unwrap();
        assert!(prepare(temp.path(), temp.path()).is_err());
        assert_eq!(
            fs::read(manifest_path(temp.path())).unwrap(),
            b"corrupt existing manifest"
        );
    }
    #[test]
    fn unsigned_review_does_not_automatically_copy_unsandboxed_library() {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        fixture(&home.join("Library/Application Support/ZenUML"));
        let data = home.join("Library/Application Support/com.zenuml.app/local-server");
        prepare(&data, &home).unwrap();
        let manifest = load(&data).unwrap();
        assert!(manifest.snapshots.is_empty());
        assert_eq!(manifest.status, "not_found");
    }
    #[test]
    fn startup_preserves_existing_container_once() {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("Library/Containers/com.zenuml.app/Data");
        fixture(&home.join("Library/Application Support/ZenUML"));
        let data = home.join("Library/Application Support/com.zenuml.app/local-server");
        prepare(&data, &home).unwrap();
        prepare(&data, &home).unwrap();
        assert_eq!(load(&data).unwrap().snapshots.len(), 1);
    }
}
