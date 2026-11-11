//! Spike: a packaged app that carries its own server.
//!
//! When the bundle holds `Resources/local-server/node` and
//! `Resources/local-server/app/server/index.ts`, the shell starts that server
//! on a free loopback port before the window opens and loads the app from it,
//! so the app works with no remote server. Without those files this module
//! does nothing and the shell behaves as before.
//!
//! The server keeps its database and uploads under the app's data directory,
//! which is inside the container when the app runs in the macOS App Sandbox.
//! A child process inherits the sandbox of the app that starts it.

use std::fs::File;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Url};

/// How long the server gets to start listening: it compiles its TypeScript
/// and opens the embedded database first.
const START_TIMEOUT: Duration = Duration::from_secs(60);

// The server gives pending frame writes up to 1.5 seconds to flush on SIGTERM.
const STOP_TIMEOUT: Duration = Duration::from_secs(2);

static SERVER: Mutex<Option<Child>> = Mutex::new(None);

/// Starts the bundled server, if the app carries one, and returns its origin.
pub fn start(app: &AppHandle) -> Option<String> {
    let resources = resources()?;
    let bundled = resources.join("local-server");
    let node = bundled.join("node");
    let root = bundled.join("app");
    let entry = root.join("server").join("index.ts");
    let shutdown = root.join("server").join("desktopShutdown.mjs");
    if !node.is_file() || !entry.is_file() || !shutdown.is_file() {
        return None;
    }
    let data = data_dir(app)?;
    std::fs::create_dir_all(&data).ok()?;
    let port = free_port(&data)?;
    let origin = format!("http://127.0.0.1:{port}");
    let loader = Url::from_file_path(root.join("node_modules/tsx/dist/loader.mjs")).ok()?;
    let shutdown = Url::from_file_path(shutdown).ok()?;
    let log = File::create(data.join("server.log")).ok()?;
    let mut command = Command::new(&node);
    let snapshot_helper = resources.parent()?.join("Helpers/DoopFrameSnapshot");
    if snapshot_helper.is_file() {
        command.env("DOOP_FRAME_SNAPSHOT_HELPER", snapshot_helper);
    }
    let child = command
        .arg("--import")
        .arg(shutdown.as_str())
        .arg("--import")
        .arg(loader.as_str())
        .arg(&entry)
        .env("NODE_ENV", "production")
        .env("PORT", port.to_string())
        .env("HOST", "127.0.0.1")
        .env("BETTER_AUTH_URL", &origin)
        .env("BETTER_AUTH_SECRET", secret(&data)?)
        .env("DOOP_DATA_DIR", &data)
        .stdin(Stdio::piped())
        .stdout(log.try_clone().ok()?)
        .stderr(log)
        .spawn()
        .ok()?;
    *SERVER.lock().ok()? = Some(child);
    if !listening(port) {
        stop();
        return None;
    }
    Some(origin)
}

/// The bundle's `Contents/Resources`, found from the executable. The first
/// call comes while the menu is built, before the app's path resolver exists,
/// so `app.path()` cannot be used here.
fn resources() -> Option<PathBuf> {
    let executable = std::env::current_exe().ok()?;
    Some(executable.parent()?.parent()?.join("Resources"))
}

/// `~/Library/Application Support/<identifier>/local-server`. In the App
/// Sandbox `HOME` is the app's container, so this lands inside it.
fn data_dir(app: &AppHandle) -> Option<PathBuf> {
    let home = PathBuf::from(std::env::var_os("HOME")?);
    Some(
        home.join("Library/Application Support")
            .join(&app.config().identifier)
            .join("local-server"),
    )
}

/// True while this launch runs on the bundled server.
pub fn running() -> bool {
    SERVER
        .lock()
        .map(|server| server.is_some())
        .unwrap_or(false)
}

pub fn stop() {
    let Some(mut child) = SERVER.lock().ok().and_then(|mut server| server.take()) else {
        return;
    };

    // Closing the pipe tells Node to run its graceful shutdown. The OS also
    // closes it if the shell is killed before this callback runs.
    drop(child.stdin.take());
    let started = Instant::now();
    while started.elapsed() < STOP_TIMEOUT {
        match child.try_wait() {
            Ok(Some(_)) => return,
            Ok(None) => std::thread::sleep(Duration::from_millis(25)),
            Err(_) => break,
        }
    }
    let _ = child.kill();
    let _ = child.wait();
}

/// Reuse this installation's loopback port so MCP clients keep their saved
/// address and OAuth origin across launches. Pick a new port if it is occupied.
fn free_port(data: &Path) -> Option<u16> {
    let file = data.join("port");
    let previous = std::fs::read_to_string(&file)
        .ok()
        .and_then(|value| value.trim().parse::<u16>().ok())
        .unwrap_or(0);
    let listener = TcpListener::bind(("127.0.0.1", previous))
        .or_else(|_| TcpListener::bind("127.0.0.1:0"))
        .ok()?;
    let port = listener.local_addr().ok()?.port();
    std::fs::write(file, port.to_string()).ok()?;
    Some(port)
}

fn listening(port: u16) -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let started = Instant::now();
    while started.elapsed() < START_TIMEOUT {
        if TcpStream::connect_timeout(&address, Duration::from_millis(250)).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(150));
    }
    false
}

/// The session-signing secret, made once and kept with the data it protects.
fn secret(data: &Path) -> Option<String> {
    let file = data.join("auth-secret");
    if let Ok(saved) = std::fs::read_to_string(&file) {
        if saved.len() >= 64 {
            return Some(saved);
        }
    }
    let mut bytes = [0u8; 32];
    File::open("/dev/urandom")
        .ok()?
        .read_exact(&mut bytes)
        .ok()?;
    let made: String = bytes.iter().map(|byte| format!("{byte:02x}")).collect();
    File::create(&file).ok()?.write_all(made.as_bytes()).ok()?;
    Some(made)
}
