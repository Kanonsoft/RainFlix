use std::{
    collections::{HashMap, HashSet},
    io::SeekFrom,
    net::Ipv4Addr,
    num::NonZeroU32,
    path::{Path, PathBuf},
    sync::Arc,
    time::{Duration, Instant},
};

use axum::{
    body::Body,
    extract::{Path as RoutePath, State},
    http::{header, HeaderMap, HeaderValue, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use base64::Engine;
use librqbit::{
    api::TorrentIdOrHash, limits::LimitsConfig, AddTorrent, AddTorrentOptions, DhtSessionConfig,
    Session, SessionOptions,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{path::BaseDirectory, AppHandle, Emitter, Manager, State as TauriState};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncSeekExt, AsyncWriteExt, BufReader},
    net::{windows::named_pipe::ClientOptions, TcpListener},
    process::Command,
    sync::Mutex,
    task::JoinHandle,
    time::timeout,
};
use tokio_util::{io::ReaderStream, sync::CancellationToken};
use uuid::Uuid;

const MAX_VIDEO_BYTES: u64 = 12 * 1024 * 1024 * 1024;
const METADATA_TIMEOUT: Duration = Duration::from_secs(75);
const UPLOAD_LIMIT_BYTES_PER_SECOND: u32 = 256 * 1024;

#[derive(Default)]
pub struct NativeTorrentState {
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    pending: Option<String>,
    in_flight: HashMap<String, Pending>,
    active: Option<Active>,
    preload: Option<Preload>,
    closing: HashMap<String, CancellationToken>,
}

impl Inner {
    // Register teardown before releasing the state lock so a replacement cannot
    // hide WebView2 before the previous surface restores it.
    fn retire_active(&mut self) -> Option<(Active, CancellationToken)> {
        let active = self.active.take()?;
        let done = CancellationToken::new();
        self.closing.insert(active.id.clone(), done.clone());
        Some((active, done))
    }
}

async fn wait_for_player_teardown(
    waits: Vec<CancellationToken>,
    cancel: &CancellationToken,
) -> Result<(), String> {
    for done in waits {
        tokio::select! {
            _ = cancel.cancelled() => return Err("Playback stopped".into()),
            result = timeout(Duration::from_secs(15), done.cancelled()) => {
                result.map_err(|_| "The previous player is still closing. Try again.".to_string())?;
            }
        }
    }
    Ok(())
}

struct Preload {
    id: String,
    owner: String,
    magnet: String,
    file_idx: Option<usize>,
    cancel: CancellationToken,
    done: CancellationToken,
    active: Option<Active>,
    claimed: bool,
}

async fn discard_preload(preload: Preload) {
    preload.cancel.cancel();
    if let Some(active) = preload.active {
        stop_active(active).await;
    } else {
        let _ = timeout(Duration::from_secs(15), preload.done.cancelled()).await;
    }
}

struct Pending {
    cancel: CancellationToken,
    done: CancellationToken,
    ui_path: Option<PathBuf>,
}

fn player_ui_path(inner: &Inner, session_id: &str) -> Option<PathBuf> {
    inner
        .active
        .as_ref()
        .filter(|active| active.id == session_id)
        .and_then(|active| active.player.as_ref())
        .filter(|player| !player.cancel.is_cancelled())
        .map(|player| player.ui_path.clone())
        .or_else(|| {
            inner
                .in_flight
                .get(session_id)
                .filter(|pending| !pending.cancel.is_cancelled())
                .and_then(|pending| pending.ui_path.clone())
        })
}

struct Active {
    id: String,
    session: Option<Arc<Session>>,
    torrent_id: Option<usize>,
    server: Option<JoinHandle<()>>,
    root: PathBuf,
    directory: PathBuf,
    media_url: String,
    player: Option<Player>,
}

struct Player {
    cancel: CancellationToken,
    task: JoinHandle<()>,
    ui_path: PathBuf,
    pipe: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativePlayback {
    session_id: String,
    url: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerUi {
    title: String,
    logo: Option<PlayerLogo>,
    current_video_id: Option<String>,
    season: Option<u32>,
    episodes: Vec<PlayerEpisode>,
    #[serde(default)]
    seasons: Vec<u32>,
    #[serde(default)]
    logo_url: Option<String>,
    #[serde(default)]
    backdrop_url: Option<String>,
    #[serde(default)]
    backdrop: Option<PlayerLogo>,
    #[serde(default)]
    tracks: Option<Value>,
}

#[derive(Deserialize, Serialize)]
pub struct PlayerLogo {
    width: usize,
    height: usize,
    data: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerEpisode {
    id: String,
    season: Option<u32>,
    episode: Option<u32>,
    title: String,
    date: Option<String>,
    #[serde(default)]
    image_url: Option<String>,
    #[serde(default)]
    image: Option<PlayerLogo>,
}

async fn artwork(url: Option<&str>, width: u32, height: u32) -> Option<PlayerLogo> {
    let url = url::Url::parse(url?).ok()?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return None;
    }
    let work = async {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(3))
            .build()
            .ok()?;
        let mut response = client.get(url).send().await.ok()?.error_for_status().ok()?;
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.ok()? {
            if bytes.len() + chunk.len() > 8 * 1024 * 1024 {
                return None;
            }
            bytes.extend_from_slice(&chunk);
        }
        let mut reader = image::ImageReader::new(std::io::Cursor::new(bytes))
            .with_guessed_format()
            .ok()?;
        let mut limits = image::Limits::default();
        limits.max_image_width = Some(8192);
        limits.max_image_height = Some(8192);
        limits.max_alloc = Some(128 * 1024 * 1024);
        reader.limits(limits);
        let pixels = reader.decode().ok()?.thumbnail(width, height).to_rgba8();
        Some(PlayerLogo {
            width: pixels.width() as usize,
            height: pixels.height() as usize,
            data: base64::engine::general_purpose::STANDARD.encode(pixels.as_raw()),
        })
    };
    timeout(Duration::from_secs(4), work).await.ok().flatten()
}

fn write_artwork(art: &PlayerLogo, path: &Path, dim: bool) -> Option<Value> {
    if art.width == 0
        || art.height == 0
        || art.width > 1280
        || art.height > 720
        || art.data.len() > 1280 * 720 * 6
    {
        return None;
    }
    let pixels = base64::engine::general_purpose::STANDARD
        .decode(&art.data)
        .ok()?;
    if pixels.len() != art.width * art.height * 4 {
        return None;
    }
    let mut full = Vec::with_capacity(pixels.len());
    for pixel in pixels.chunks_exact(4) {
        let alpha = pixel[3] as u16;
        full.extend([2, 1, 0].map(|channel| (pixel[channel] as u16 * alpha / 255) as u8));
        full.push(pixel[3]);
    }
    std::fs::write(path, &full).ok()?;
    let dim_path = path.with_extension("dim.bgra");
    if dim {
        std::fs::write(
            &dim_path,
            full.iter().map(|value| *value / 4).collect::<Vec<_>>(),
        )
        .ok()?;
    }
    Some(json!({ "width": art.width, "height": art.height, "path": path, "dimPath": dim_path }))
}

struct Media {
    token: String,
    torrent: Arc<librqbit::ManagedTorrent>,
    file_idx: usize,
    length: u64,
    content_type: &'static str,
}

fn cache_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_cache_dir()
        .map(|path| path.join("native-torrents"))
        .map_err(|_| "RainFlix could not locate its temporary cache.".to_string())
}

fn remove_owned_directory(root: &Path, directory: &Path) {
    let (Ok(root), Ok(directory)) = (root.canonicalize(), directory.canonicalize()) else {
        return;
    };
    if directory.parent() == Some(root.as_path())
        && directory
            .file_name()
            .is_some_and(|name| name.to_string_lossy().starts_with("playback-"))
    {
        let _ = std::fs::remove_dir_all(directory);
    }
}

fn magnet_url(info_hash: &str, sources: &[String]) -> Result<String, String> {
    if info_hash.len() != 40 || !info_hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("The add-on returned an invalid torrent identifier.".into());
    }
    let mut magnet = url::Url::parse("magnet:?").expect("static magnet URL");
    magnet.query_pairs_mut().append_pair(
        "xt",
        &format!("urn:btih:{}", info_hash.to_ascii_lowercase()),
    );
    for source in sources.iter().take(32) {
        let Some(tracker) = source.strip_prefix("tracker:") else {
            continue;
        };
        if tracker.len() > 2048 {
            continue;
        }
        let Ok(address) = url::Url::parse(tracker) else {
            continue;
        };
        if ["http", "https", "udp", "ws", "wss"].contains(&address.scheme()) {
            magnet.query_pairs_mut().append_pair("tr", address.as_str());
        }
    }
    Ok(magnet.into())
}

fn video_type(path: &Path) -> Option<&'static str> {
    match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "mp4" | "m4v" => Some("video/mp4"),
        "webm" => Some("video/webm"),
        "ogv" | "ogg" => Some("video/ogg"),
        "mkv" | "mk3d" => Some("video/x-matroska"),
        "avi" => Some("video/x-msvideo"),
        "mov" => Some("video/quicktime"),
        "mpeg" | "mpg" | "m2v" | "vob" => Some("video/mpeg"),
        "ts" | "m2ts" | "mts" => Some("video/mp2t"),
        "wmv" | "asf" | "flv" | "3gp" | "3g2" => Some("application/octet-stream"),
        _ => None,
    }
}

fn choose_file(
    torrent: &librqbit::ManagedTorrent,
    requested: Option<usize>,
) -> Result<(usize, u64, &'static str), String> {
    let result = torrent
        .with_metadata(|metadata| {
            let files = &metadata.file_infos;
            let selected = match requested {
                Some(idx) => files.get(idx).map(|file| (idx, file)),
                None => files
                    .iter()
                    .enumerate()
                    .filter(|(_, file)| video_type(&file.relative_filename).is_some())
                    .max_by_key(|(_, file)| file.len),
            };
            selected.map(|(idx, file)| {
                (
                    idx,
                    file.len,
                    video_type(&file.relative_filename)
                        .or_else(|| requested.map(|_| "application/octet-stream")),
                )
            })
        })
        .map_err(|_| "Torrent metadata could not be read.".to_string())?;
    let (idx, length, content_type) = result
        .ok_or_else(|| "The selected torrent has no browser-compatible video file.".to_string())?;
    let content_type = content_type.ok_or_else(|| {
        "This torrent has no recognizable video file. Select a different source.".to_string()
    })?;
    if length == 0 || length > MAX_VIDEO_BYTES {
        return Err("This video is empty or exceeds RainFlix's 12 GB temporary limit.".into());
    }
    Ok((idx, length, content_type))
}

async fn stop_active(mut active: Active) {
    if let Some(mut player) = active.player.take() {
        player.cancel.cancel();
        if timeout(Duration::from_secs(5), &mut player.task)
            .await
            .is_err()
        {
            player.task.abort();
            let _ = player.task.await;
        }
    }
    if let Some(server) = active.server {
        server.abort();
        let _ = server.await;
    }
    if let Some(session) = active.session {
        if let Some(id) = active.torrent_id {
            let _ = session.delete(TorrentIdOrHash::Id(id), true).await;
        }
        session.stop().await;
    }
    remove_owned_directory(&active.root, &active.directory);
}

impl NativeTorrentState {
    async fn stop_retired(&self, active: Active, done: CancellationToken) {
        let id = active.id.clone();
        let _completion = done.clone().drop_guard();
        stop_active(active).await;
        done.cancel();
        self.inner.lock().await.closing.remove(&id);
    }

    pub async fn stop_all(&self) {
        let (active, preload, waits) = {
            let mut inner = self.inner.lock().await;
            let mut waits = inner
                .in_flight
                .values()
                .map(|pending| {
                    pending.cancel.cancel();
                    pending.done.clone()
                })
                .collect::<Vec<_>>();
            waits.extend(inner.closing.values().cloned());
            inner.pending = None;
            (inner.retire_active(), inner.preload.take(), waits)
        };
        if let Some(preload) = preload {
            discard_preload(preload).await;
        }
        if let Some((active, done)) = active {
            self.stop_retired(active, done).await;
        }
        for done in waits {
            let _ = timeout(Duration::from_secs(15), done.cancelled()).await;
        }
    }
}

struct PlayerSurface {
    app: AppHandle,
    was_fullscreen: bool,
    artwork_files: Vec<PathBuf>,
}

mod player_input {
    use std::ffi::c_void;
    type Hwnd = *mut c_void;
    #[repr(C)]
    #[derive(Default)]
    struct Rect {
        left: i32,
        top: i32,
        right: i32,
        bottom: i32,
    }
    #[repr(C)]
    struct GuiThreadInfo {
        size: u32,
        flags: u32,
        active: Hwnd,
        focus: Hwnd,
        capture: Hwnd,
        menu_owner: Hwnd,
        move_size: Hwnd,
        caret: Hwnd,
        caret_rect: Rect,
    }
    #[link(name = "user32")]
    extern "system" {
        fn EnumChildWindows(
            parent: Hwnd,
            callback: unsafe extern "system" fn(Hwnd, isize) -> i32,
            data: isize,
        ) -> i32;
        fn GetWindowThreadProcessId(window: Hwnd, process: *mut u32) -> u32;
        fn EnableWindow(window: Hwnd, enabled: i32) -> i32;
        fn IsWindowEnabled(window: Hwnd) -> i32;
        fn GetForegroundWindow() -> Hwnd;
        fn GetGUIThreadInfo(thread: u32, info: *mut GuiThreadInfo) -> i32;
        fn IsChild(parent: Hwnd, child: Hwnd) -> i32;
        fn GetAsyncKeyState(key: i32) -> i16;
        fn AttachThreadInput(from: u32, to: u32, attach: i32) -> i32;
        fn SetFocus(window: Hwnd) -> Hwnd;
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn GetCurrentThreadId() -> u32;
    }

    struct Search {
        process: u32,
        window: Hwnd,
    }
    unsafe extern "system" fn find(window: Hwnd, data: isize) -> i32 {
        let search = &mut *(data as *mut Search);
        let mut process = 0;
        GetWindowThreadProcessId(window, &mut process);
        if process == search.process {
            search.window = window;
            return 0;
        }
        1
    }
    pub fn enable(parent: usize, process: u32) -> bool {
        // mpv deliberately disables embedded windows; RainFlix owns their input UI.
        unsafe {
            let mut search = Search {
                process,
                window: std::ptr::null_mut(),
            };
            EnumChildWindows(parent as Hwnd, find, &mut search as *mut Search as isize);
            if search.window.is_null() {
                return false;
            }
            if IsWindowEnabled(search.window) == 0 {
                EnableWindow(search.window, 1);
            }
            if GetForegroundWindow() != parent as Hwnd {
                return true;
            }
            let foreground_thread = GetWindowThreadProcessId(parent as Hwnd, std::ptr::null_mut());
            let mut info = GuiThreadInfo {
                size: std::mem::size_of::<GuiThreadInfo>() as u32,
                flags: 0,
                active: std::ptr::null_mut(),
                focus: std::ptr::null_mut(),
                capture: std::ptr::null_mut(),
                menu_owner: std::ptr::null_mut(),
                move_size: std::ptr::null_mut(),
                caret: std::ptr::null_mut(),
                caret_rect: Rect::default(),
            };
            if GetGUIThreadInfo(foreground_thread, &mut info) != 0
                && (info.focus == search.window || IsChild(search.window, info.focus) != 0)
            {
                return true;
            }
            let thread = GetWindowThreadProcessId(search.window, std::ptr::null_mut());
            let current = GetCurrentThreadId();
            // The worker, foreground app and mpv have separate input queues.
            let foreground_attached = current != foreground_thread
                && AttachThreadInput(current, foreground_thread, 1) != 0;
            let attached = current != thread && AttachThreadInput(current, thread, 1) != 0;
            SetFocus(search.window);
            if attached {
                AttachThreadInput(current, thread, 0);
            }
            if foreground_attached {
                AttachThreadInput(current, foreground_thread, 0);
            }
            true
        }
    }

    pub fn exit_requested(parent: usize) -> bool {
        unsafe {
            GetForegroundWindow() == parent as Hwnd
                && GetAsyncKeyState(0x11) < 0
                && GetAsyncKeyState(0x08) < 0
        }
    }
}

impl Drop for PlayerSurface {
    fn drop(&mut self) {
        if let Some(window) = self.app.get_webview_window("main") {
            let webview: &tauri::Webview = window.as_ref();
            let _ = webview.show();
            let _ = webview.set_focus();
            let _ = window.set_fullscreen(self.was_fullscreen);
        }
        for path in &self.artwork_files {
            let _ = std::fs::remove_file(path);
        }
        if let (Ok(root), Some(directory)) = (
            cache_root(&self.app),
            self.artwork_files.first().and_then(|path| path.parent()),
        ) {
            remove_owned_directory(&root, directory);
        }
    }
}

fn spawn_player(
    app: &AppHandle,
    media_url: &str,
    start_at: f64,
    ui: &PlayerUi,
    ui_path: &Path,
    pipe: &str,
) -> Result<(tokio::process::Child, PlayerSurface), String> {
    let binary = app
        .path()
        .resolve("mpv/mpv.exe", BaseDirectory::Resource)
        .map_err(|_| "RainFlix could not locate its video decoder.".to_string())?;
    if !binary.is_file() {
        return Err("The RainFlix video decoder is missing. Reinstall the desktop app.".into());
    }
    let script = app
        .path()
        .resolve("mpv/rainflix_ui.lua", BaseDirectory::Resource)
        .map_err(|_| "RainFlix could not locate its player controls.".to_string())?;
    if !script.is_file() {
        return Err("The RainFlix player controls are missing. Reinstall the desktop app.".into());
    }
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "RainFlix could not locate its main window.".to_string())?;
    let hwnd = window
        .hwnd()
        .map_err(|_| "RainFlix could not attach its player window.".to_string())?
        .0 as usize as u32;
    if hwnd == 0 {
        return Err("RainFlix could not attach its player window.".into());
    }
    let mut metadata = serde_json::to_value(ui)
        .map_err(|_| "RainFlix could not prepare the player controls.".to_string())?;
    let mut artwork_files = vec![
        ui_path.to_path_buf(),
        ui_path.with_extension("loading-logo.bgra"),
        ui_path.with_extension("loading-logo.dim.bgra"),
        ui_path.with_extension("loading-backdrop.bgra"),
        ui_path.with_extension("loading-backdrop.dim.bgra"),
    ];
    metadata["backdrop"] = Value::Null;
    if let Some(backdrop) = &ui.backdrop {
        let path = ui_path.with_extension("backdrop.bgra");
        artwork_files.push(path.clone());
        if let Some(mut art) = write_artwork(backdrop, &path, true) {
            artwork_files.push(path.with_extension("dim.bgra"));
            art["path"] = art["dimPath"].clone();
            metadata["backdrop"] = art;
        }
    }
    for (index, episode) in ui.episodes.iter().enumerate() {
        metadata["episodes"][index]["image"] = Value::Null;
        if let Some(image) = &episode.image {
            let path = ui_path.with_extension(format!("episode-{index}.bgra"));
            artwork_files.push(path.clone());
            metadata["episodes"][index]["image"] =
                write_artwork(image, &path, false).unwrap_or(Value::Null);
        }
    }
    metadata["logo"] = Value::Null;
    let fallback_logo = image::load_from_memory(include_bytes!("../../public/rainflix-r.png"))
        .ok()
        .map(|image| {
            let pixels = image.thumbnail(144, 144).to_rgba8();
            PlayerLogo {
                width: pixels.width() as usize,
                height: pixels.height() as usize,
                data: base64::engine::general_purpose::STANDARD.encode(pixels.as_raw()),
            }
        });
    if let Some(logo) = ui.logo.as_ref().or(fallback_logo.as_ref()) {
        if (1..=384).contains(&logo.width)
            && (1..=144).contains(&logo.height)
            && logo.data.len() <= 384 * 144 * 6
        {
            if let Ok(pixels) = base64::engine::general_purpose::STANDARD.decode(&logo.data) {
                if pixels.len() == logo.width * logo.height * 4 {
                    let mut full = Vec::with_capacity(pixels.len());
                    for pixel in pixels.chunks_exact(4) {
                        let alpha = pixel[3] as u16;
                        full.extend(
                            [2, 1, 0].map(|channel| (pixel[channel] as u16 * alpha / 255) as u8),
                        );
                        full.push(pixel[3]);
                    }
                    let dim: Vec<u8> = full.iter().map(|value| (*value as u16 / 4) as u8).collect();
                    let path = ui_path.with_extension("logo.bgra");
                    let dim_path = ui_path.with_extension("logo-dim.bgra");
                    artwork_files.extend([path.clone(), dim_path.clone()]);
                    if std::fs::write(&path, full).is_ok() && std::fs::write(&dim_path, dim).is_ok()
                    {
                        metadata["logo"] = json!({ "width": logo.width, "height": logo.height,
                            "path": path, "dimPath": dim_path });
                    }
                }
            }
        }
    }
    let metadata = serde_json::to_vec(&metadata)
        .map_err(|_| "RainFlix could not prepare the player controls.".to_string())?;
    std::fs::write(ui_path, metadata)
        .map_err(|_| "RainFlix could not prepare the player controls.".to_string())?;
    let mut command = Command::new(binary);
    command
        .arg("--no-config")
        .arg("--no-ytdl")
        .arg("--terminal=no")
        .arg("--force-window=immediate")
        .arg("--cache=yes")
        .arg("--cache-pause=yes")
        .arg("--cache-pause-initial=yes")
        .arg("--cache-pause-wait=5")
        .arg("--osc=no")
        .arg("--osd-bar=no")
        .arg("--osd-level=0")
        .arg("--input-vo-keyboard=yes")
        .arg("--input-cursor=yes")
        .arg("--window-dragging=no")
        .arg("--input-builtin-dragging=no")
        .arg(format!("--wid={hwnd}"))
        .arg(format!("--script={}", script.display()))
        .arg("--title=RainFlix")
        .arg(format!("--input-ipc-server={pipe}"))
        .env("RAINFLIX_PLAYER_METADATA", ui_path)
        .kill_on_drop(true);
    #[cfg(feature = "native-player-smoke")]
    if std::env::var_os("RAINFLIX_NATIVE_SMOKE_MEDIA").is_some() {
        command.arg("--pause=yes");
        command.arg(format!(
            "--log-file={}",
            std::env::temp_dir()
                .join("rainflix-mpv-smoke.log")
                .display()
        ));
    }
    if start_at.is_finite() && (1.0..604800.0).contains(&start_at) {
        command.arg(format!("--start={start_at:.2}"));
    }
    if media_url.is_empty() {
        command.arg("--idle=yes");
    } else {
        command.arg("--").arg(media_url);
    }
    let child = command
        .spawn()
        .map_err(|_| "RainFlix could not start its video decoder.".to_string())?;
    let surface = PlayerSurface {
        app: app.clone(),
        was_fullscreen: window.is_fullscreen().unwrap_or(false),
        artwork_files,
    };
    // Hide WebView2's sibling surface so it cannot obscure mpv's child window.
    let webview: &tauri::Webview = window.as_ref();
    webview
        .hide()
        .map_err(|error| format!("RainFlix could not display its native player: {error}"))?;
    Ok((child, surface))
}

#[tauri::command]
pub async fn play_native_torrent(
    app: AppHandle,
    state: TauriState<'_, NativeTorrentState>,
    session_id: String,
    start_at: f64,
    mut ui: PlayerUi,
) -> Result<(), String> {
    let (logo, backdrop) = tokio::join!(
        artwork(ui.logo_url.as_deref(), 384, 144),
        artwork(ui.backdrop_url.as_deref(), 960, 540)
    );
    if logo.is_some() {
        ui.logo = logo;
    }
    ui.backdrop = backdrop;
    let mut inner = state.inner.lock().await;
    let active = inner
        .active
        .as_mut()
        .filter(|active| active.id == session_id)
        .ok_or_else(|| "Torrent playback is no longer active.".to_string())?;
    if active.player.is_some() {
        return Err("This torrent is already playing.".into());
    }
    let pipe = format!(r"\\.\pipe\rainflix-{}", Uuid::new_v4());
    let (child, surface) = spawn_player(
        &app,
        &active.media_url,
        start_at,
        &ui,
        &active.directory.join("player-ui.json"),
        &pipe,
    )?;
    let cancel = CancellationToken::new();
    let task = tokio::spawn(monitor_player(
        app,
        session_id,
        pipe.clone(),
        child,
        cancel.clone(),
        surface,
    ));
    active.player = Some(Player {
        cancel,
        task,
        ui_path: active.directory.join("player-ui.json"),
        pipe,
    });
    Ok(())
}

fn bound_player_episodes(episodes: &mut Vec<PlayerEpisode>, selected_season: Option<u32>) {
    if episodes.len() > 10000 {
        episodes.sort_by_key(|item| item.season != selected_season);
        episodes.truncate(10000);
    }
    episodes.sort_by_key(|item| (item.season.unwrap_or(0), item.episode.unwrap_or(0)));
}

#[cfg(test)]
mod episode_tests {
    use super::*;
    #[test]
    fn late_seasons_survive_native_episode_limits() {
        let mut episodes = (1..=10050)
            .map(|number| PlayerEpisode {
                id: format!("first:{number}"),
                season: Some(1),
                episode: Some(number),
                title: String::new(),
                date: None,
                image_url: None,
                image: None,
            })
            .collect::<Vec<_>>();
        episodes.push(PlayerEpisode {
            id: "late:1".into(),
            season: Some(23),
            episode: Some(1),
            title: String::new(),
            date: None,
            image_url: None,
            image: None,
        });
        bound_player_episodes(&mut episodes, Some(23));
        assert_eq!(episodes.len(), 10000);
        assert_eq!(episodes.last().unwrap().id, "late:1");
        let mut normal = episodes.drain(..1002).collect::<Vec<_>>();
        bound_player_episodes(&mut normal, Some(1));
        assert_eq!(normal.len(), 1002);
    }
}

#[tauri::command]
pub async fn update_native_player_episodes(
    state: TauriState<'_, NativeTorrentState>,
    session_id: String,
    mut episodes: Vec<PlayerEpisode>,
    revision: u64,
    season: Option<u32>,
    status: Option<String>,
) -> Result<(), String> {
    let (path, selected_season, cached) = {
        let inner = state.inner.lock().await;
        let path = player_ui_path(&inner, &session_id).ok_or("Playback closed")?;
        let mut metadata: Value =
            serde_json::from_slice(&std::fs::read(&path).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
        if metadata["episodeRevision"]
            .as_u64()
            .is_some_and(|old| old > revision)
        {
            return Ok(());
        }
        let selected_season = season.or_else(|| metadata["season"].as_u64().map(|n| n as u32));
        bound_player_episodes(&mut episodes, selected_season);
        let old = metadata["episodes"].as_array().cloned().unwrap_or_default();
        let previous: HashMap<String, Value> = old
            .into_iter()
            .filter_map(|item| item["id"].as_str().map(|id| (id.to_string(), item.clone())))
            .collect();
        let mut cached = std::collections::HashSet::new();
        let mut values = serde_json::to_value(&episodes).map_err(|e| e.to_string())?;
        for (index, item) in episodes.iter().enumerate() {
            values[index]["image"] = Value::Null;
            if let Some(old) = previous.get(&item.id) {
                if old["imageUrl"] == values[index]["imageUrl"] && old["image"]["path"].is_string()
                {
                    values[index]["image"] = old["image"].clone();
                    cached.insert(item.id.clone());
                }
            }
        }
        metadata["episodes"] = values;
        if let Some(status) = status {
            metadata["episodeStatus"] = json!({"season":selected_season,"status":status});
        }
        metadata["episodeRevision"] = json!(revision);
        std::fs::write(
            &path,
            serde_json::to_vec(&metadata).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        (path, selected_season, cached)
    };
    let semaphore = Arc::new(tokio::sync::Semaphore::new(6));
    let mut pending = Vec::new();
    for (index, episode) in episodes
        .iter()
        .enumerate()
        .filter(|(_, item)| item.season == selected_season && !cached.contains(&item.id))
        .take(200)
    {
        let url = episode.image_url.clone();
        let semaphore = semaphore.clone();
        pending.push((
            index,
            tokio::spawn(async move {
                let _permit = semaphore.acquire().await.ok()?;
                artwork(url.as_deref(), 160, 90).await
            }),
        ));
    }
    // A slow image host cannot hold up the player or its episode drawer.
    let deadline = Instant::now() + Duration::from_secs(8);
    for (index, mut task) in pending {
        let remaining = deadline.saturating_duration_since(Instant::now());
        match timeout(remaining, &mut task).await {
            Ok(result) => episodes[index].image = result.ok().flatten(),
            Err(_) => {
                task.abort();
            }
        }
    }
    let inner = state.inner.lock().await;
    if player_ui_path(&inner, &session_id).as_ref() != Some(&path) {
        return Ok(());
    }
    let mut metadata: Value =
        serde_json::from_slice(&std::fs::read(&path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    if metadata["episodeRevision"].as_u64() != Some(revision) {
        return Ok(());
    }
    let mut values = metadata["episodes"].clone();
    for (index, item) in episodes.iter().enumerate() {
        if let Some(image) = &item.image {
            values[index]["image"] = write_artwork(
                image,
                &path.with_extension(format!("extra-episode-{revision}-{index}.bgra")),
                false,
            )
            .unwrap_or(Value::Null);
        }
    }
    metadata["episodes"] = values;
    std::fs::write(
        path,
        serde_json::to_vec(&metadata).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

async fn send_player_command(
    pipe: &str,
    command: Value,
    cancel: &CancellationToken,
) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        if cancel.is_cancelled() {
            return Err("Playback closed".into());
        }
        if let Ok(mut connection) = ClientOptions::new().open(pipe) {
            let mut bytes = serde_json::to_vec(&json!({ "command":command, "request_id":77 }))
                .map_err(|e| e.to_string())?;
            bytes.push(b'\n');
            connection
                .write_all(&bytes)
                .await
                .map_err(|e| e.to_string())?;
            return timeout(Duration::from_secs(5), async {
                let mut reader = BufReader::new(connection);
                let mut line = String::new();
                loop {
                    line.clear();
                    if reader
                        .read_line(&mut line)
                        .await
                        .map_err(|e| e.to_string())?
                        == 0
                    {
                        return Err("Player disconnected".into());
                    }
                    let Ok(reply) = serde_json::from_str::<Value>(&line) else {
                        continue;
                    };
                    if reply["request_id"].as_u64() == Some(77) {
                        return if reply["error"] == "success" {
                            Ok(())
                        } else {
                            Err("The player could not load this resource.".into())
                        };
                    }
                }
            })
            .await
            .map_err(|_| "Player response timed out".to_string())?;
        }
        if Instant::now() >= deadline {
            return Err("The native player did not respond.".into());
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

#[tauri::command]
pub async fn update_native_player_streams(
    state: TauriState<'_, NativeTorrentState>,
    session_id: String,
    video_id: String,
    request_id: String,
    streams: Vec<Value>,
) -> Result<(), String> {
    let streams = streams.into_iter().take(250).collect::<Vec<_>>();
    let mut providers = HashMap::new();
    for item in &streams {
        if let (Some(id), Some(url)) = (item["providerId"].as_str(), item["providerLogo"].as_str())
        {
            if providers.len() < 12 {
                providers.entry(id.to_string()).or_insert(url.to_string());
            }
        }
    }
    let inner = state.inner.lock().await;
    let path = player_ui_path(&inner, &session_id).ok_or("Playback closed")?;
    let mut metadata: Value =
        serde_json::from_slice(&std::fs::read(&path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    metadata["streamChoices"] =
        json!({ "videoId":video_id, "requestId":request_id, "items":streams });
    std::fs::write(
        &path,
        serde_json::to_vec(&metadata).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    drop(inner);
    let tasks = providers
        .into_iter()
        .map(|(id, url)| tokio::spawn(async move { (id, artwork(Some(&url), 48, 48).await) }))
        .collect::<Vec<_>>();
    let mut images = HashMap::new();
    for task in tasks {
        if let Ok((id, Some(image))) = task.await {
            images.insert(id, image);
        }
    }
    let inner = state.inner.lock().await;
    if player_ui_path(&inner, &session_id).as_ref() != Some(&path) {
        return Ok(());
    }
    let mut metadata: Value =
        serde_json::from_slice(&std::fs::read(&path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    if metadata["streamChoices"]["requestId"].as_str() != Some(&request_id)
        || metadata["streamChoices"]["videoId"].as_str() != Some(&video_id)
    {
        return Ok(());
    }
    let mut prepared = HashMap::new();
    for (id, image) in images {
        let image_path = path.with_file_name(format!("provider-{}.bgra", Uuid::new_v4()));
        if let Some(value) = write_artwork(&image, &image_path, false) {
            prepared.insert(id, value);
        }
    }
    if let Some(items) = metadata["streamChoices"]["items"].as_array_mut() {
        for item in items {
            if let Some(image) = item["providerId"].as_str().and_then(|id| prepared.get(id)) {
                item["providerImage"] = image.clone();
            }
        }
    }
    std::fs::write(
        &path,
        serde_json::to_vec(&metadata).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

#[derive(Deserialize, Serialize)]
pub struct SubtitleOption {
    id: String,
    label: String,
    lang: String,
}

#[tauri::command]
pub async fn update_native_player_subtitles(
    state: TauriState<'_, NativeTorrentState>,
    session_id: String,
    subtitles: Vec<SubtitleOption>,
    failed: bool,
) -> Result<(), String> {
    let inner = state.inner.lock().await;
    let path = player_ui_path(&inner, &session_id).ok_or("Playback closed")?;
    let mut metadata: Value =
        serde_json::from_slice(&std::fs::read(&path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    metadata["addonSubtitles"] = json!(subtitles.into_iter().take(250).collect::<Vec<_>>());
    metadata["subtitleLookupFailed"] = json!(failed);
    std::fs::write(
        path,
        serde_json::to_vec(&metadata).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn load_native_subtitle(
    state: TauriState<'_, NativeTorrentState>,
    session_id: String,
    id: String,
    url: String,
    label: String,
    lang: String,
) -> Result<(), String> {
    let url = url::Url::parse(&url).map_err(|_| "Invalid subtitle URL")?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("Unsupported subtitle URL".into());
    }
    let request = Uuid::new_v4().to_string();
    let (path, pipe, cancel) = {
        let inner = state.inner.lock().await;
        let player = inner
            .active
            .as_ref()
            .filter(|active| active.id == session_id)
            .and_then(|active| active.player.as_ref())
            .ok_or("Playback is not ready")?;
        let path = player.ui_path.clone();
        let mut metadata: Value =
            serde_json::from_slice(&std::fs::read(&path).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
        metadata["subtitleRequest"] = json!(request);
        metadata["subtitleStatus"] = json!("Loading subtitles...");
        std::fs::write(
            &path,
            serde_json::to_vec(&metadata).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        (path, player.pipe.clone(), player.cancel.clone())
    };
    let result = async {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| e.to_string())?;
        let mut response = client
            .get(url.clone())
            .send()
            .await
            .map_err(|_| "Subtitle download failed")?
            .error_for_status()
            .map_err(|_| "Subtitle download failed")?;
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| "Subtitle download failed")?
        {
            if cancel.is_cancelled() {
                return Err("Playback closed".to_string());
            }
            if bytes.len() + chunk.len() > 4 * 1024 * 1024 {
                return Err("Subtitle file is too large".to_string());
            }
            bytes.extend_from_slice(&chunk);
        }
        if bytes.is_empty() || bytes.starts_with(b"PK\x03\x04") {
            return Err("Use an uncompressed SRT, VTT or ASS subtitle file".to_string());
        }
        let extension = url
            .path()
            .rsplit('.')
            .next()
            .unwrap_or("srt")
            .to_ascii_lowercase();
        let extension = if matches!(
            extension.as_str(),
            "srt" | "vtt" | "ass" | "ssa" | "sub" | "txt"
        ) {
            extension.as_str()
        } else {
            "srt"
        };
        let subtitle_path = path.with_extension(format!("subtitle-{request}.{extension}"));
        {
            let inner = state.inner.lock().await;
            if cancel.is_cancelled() || player_ui_path(&inner, &session_id).as_ref() != Some(&path)
            {
                return Err("Playback closed".into());
            }
            let metadata: Value =
                serde_json::from_slice(&std::fs::read(&path).map_err(|e| e.to_string())?)
                    .map_err(|e| e.to_string())?;
            if metadata["subtitleRequest"] != request {
                return Ok(());
            }
            std::fs::write(&subtitle_path, bytes).map_err(|e| e.to_string())?;
            // Serialize final selection against a newer subtitle click.
            send_player_command(
                &pipe,
                json!([
                    "sub-add",
                    subtitle_path.to_string_lossy(),
                    "select",
                    label,
                    lang
                ]),
                &cancel,
            )
            .await?;
        }
        Ok(())
    }
    .await;
    let inner = state.inner.lock().await;
    if !cancel.is_cancelled() && player_ui_path(&inner, &session_id).as_ref() == Some(&path) {
        let mut metadata: Value =
            serde_json::from_slice(&std::fs::read(&path).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
        if metadata["subtitleRequest"] == request {
            metadata["subtitleStatus"] =
                json!(result.as_ref().err().map(String::as_str).unwrap_or(""));
            if result.is_ok() {
                if !metadata["loadedAddonSubtitles"].is_array() {
                    metadata["loadedAddonSubtitles"] = json!([]);
                }
                metadata["loadedAddonSubtitles"]
                    .as_array_mut()
                    .unwrap()
                    .push(json!(id));
            }
            std::fs::write(
                path,
                serde_json::to_vec(&metadata).map_err(|e| e.to_string())?,
            )
            .map_err(|e| e.to_string())?;
        }
    }
    result
}

async fn monitor_player(
    app: AppHandle,
    session_id: String,
    pipe: String,
    mut child: tokio::process::Child,
    cancel: CancellationToken,
    surface: PlayerSurface,
) {
    let input_target = child.id().zip(
        app.get_webview_window("main")
            .and_then(|window| window.hwnd().ok().map(|hwnd| hwnd.0 as usize)),
    );
    let observer = tokio::spawn(observe_player(
        app.clone(),
        session_id.clone(),
        pipe,
        cancel.clone(),
    ));
    let status = loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                let _ = child.kill().await;
                let _ = child.wait().await;
                break None;
            }
            _ = tokio::time::sleep(Duration::from_millis(250)) => {
                if let Some((process, parent)) = input_target {
                    // mpv can disable its child after it first becomes visible.
                    // Repair input/focus only while our parent is foreground.
                    player_input::enable(parent, process);
                    if player_input::exit_requested(parent) {
                        let _ = child.kill().await;
                        let _ = child.wait().await;
                        break Some(true);
                    }
                }
                match child.try_wait() {
                    Ok(Some(status)) => break Some(status.success()),
                    Ok(None) => {}
                    Err(_) => break Some(false),
                }
            }
        }
    };
    cancel.cancel();
    observer.abort();
    let _ = observer.await;
    drop(surface);
    if let Some(success) = status {
        let _ = app.emit(
            "rainflix:native-torrent",
            json!({
                "sessionId": session_id,
                "kind": if success { "closed" } else { "error" },
            }),
        );
    }
}

#[cfg(feature = "native-player-smoke")]
pub async fn run_player_smoke(app: AppHandle, media_path: PathBuf) {
    let preload_app = app.clone();
    let preload_media = media_path.to_string_lossy().to_string();
    tokio::spawn(async move {
        let cancel = CancellationToken::new();
        let warmed = warm_preload(&preload_app, &preload_media, &cancel, None).await;
        cancel.cancel();
        let cancelled = warm_preload(&preload_app, &preload_media, &cancel, None).await;
        let result =
            json!({"warmed":warmed.is_ok(),"error":warmed.err(),"cancelled":cancelled.is_err()});
        let _ = std::fs::write(
            std::env::temp_dir().join("rainflix-native-player-smoke/preload.json"),
            result.to_string(),
        );
    });
    let ui = PlayerUi {
        title: "RainFlix embedded player smoke test".into(),
        logo: Some(PlayerLogo {
            width: 160,
            height: 60,
            data: base64::engine::general_purpose::STANDARD
                .encode([80, 210, 255, 255].repeat(160 * 60)),
        }),
        current_video_id: None,
        season: None,
        episodes: Vec::new(),
        seasons: Vec::new(),
        logo_url: None,
        backdrop_url: None,
        backdrop: Some(PlayerLogo {
            width: 16,
            height: 9,
            data: base64::engine::general_purpose::STANDARD
                .encode([35, 45, 55, 255].repeat(16 * 9)),
        }),
        tracks: None,
    };
    let ui_path = std::env::temp_dir().join(format!("rainflix-smoke-{}.json", Uuid::new_v4()));
    let pipe = r"\\.\pipe\rainflix-native-smoke".to_string();
    let result = spawn_player(&app, "", 0.0, &ui, &ui_path, &pipe);
    match result {
        Ok((child, surface)) => {
            let cancel = CancellationToken::new();
            let load_cancel = cancel.clone();
            let load_pipe = pipe.clone();
            tokio::spawn(async move {
                tokio::time::sleep(Duration::from_millis(500)).await;
                if let Err(error) = send_player_command(
                    &load_pipe,
                    json!(["loadfile", media_path.to_string_lossy(), "replace", -1, ""]),
                    &load_cancel,
                )
                .await
                {
                    eprintln!("Native idle playback handoff failed: {error}");
                    load_cancel.cancel();
                }
            });
            let timeout_cancel = cancel.clone();
            tokio::spawn(async move {
                tokio::time::sleep(Duration::from_secs(45)).await;
                timeout_cancel.cancel();
            });
            monitor_player(
                app.clone(),
                "native-player-smoke".into(),
                pipe,
                child,
                cancel,
                surface,
            )
            .await;
        }
        Err(error) => eprintln!("Native player smoke test failed: {error}"),
    }
    let _ = std::fs::remove_file(ui_path);
}

async fn observe_player(
    app: AppHandle,
    session_id: String,
    pipe: String,
    cancel: CancellationToken,
) {
    let started_at = Instant::now();
    let mut connection = loop {
        if cancel.is_cancelled() || started_at.elapsed() > Duration::from_secs(15) {
            return;
        }
        match ClientOptions::new().open(&pipe) {
            Ok(connection) => break connection,
            Err(_) => tokio::select! {
                _ = cancel.cancelled() => return,
                _ = tokio::time::sleep(Duration::from_millis(100)) => {}
            },
        }
    };
    for (id, property) in [(1, "time-pos"), (2, "duration")] {
        let request = format!(r#"{{"command":["observe_property",{id},"{property}"]}}"#);
        if connection.write_all(request.as_bytes()).await.is_err()
            || connection.write_all(b"\n").await.is_err()
        {
            return;
        }
    }
    let mut reader = BufReader::new(connection);
    let mut line = String::new();
    let mut position: Option<f64> = None;
    let mut duration: Option<f64> = None;
    let mut playing = false;
    loop {
        line.clear();
        let count = tokio::select! {
            _ = cancel.cancelled() => return,
            result = reader.read_line(&mut line) => match result { Ok(count) => count, Err(_) => return },
        };
        if count == 0 {
            return;
        }
        let Ok(value) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        match value.get("event").and_then(Value::as_str) {
            Some("client-message") => {
                let Some(args) = value.get("args").and_then(Value::as_array) else {
                    continue;
                };
                match args.first().and_then(Value::as_str) {
                    Some("rainflix-close") => {
                        let _ = app.emit(
                            "rainflix:native-torrent",
                            json!({ "sessionId": session_id, "kind": "close" }),
                        );
                    }
                    Some("rainflix-episode") => {
                        if let Some(video_id) = args.get(1).and_then(Value::as_str) {
                            let _ = app.emit(
                                "rainflix:native-torrent",
                                json!({ "sessionId": session_id, "kind": "episode", "videoId": video_id,
                                    "mode": args.get(2).and_then(Value::as_str).unwrap_or("next"),
                                    "choiceId": args.get(3).and_then(Value::as_str) }),
                            );
                        }
                    }
                    Some("rainflix-preferences") => {
                        if let Some(tracks) = args
                            .get(1)
                            .and_then(Value::as_str)
                            .and_then(|text| serde_json::from_str::<Value>(text).ok())
                        {
                            let _ = app.emit("rainflix:native-torrent", json!({ "sessionId": session_id, "kind": "preferences", "tracks": tracks }));
                        }
                    }
                    Some("rainflix-subtitle") => {
                        if let Some(id) = args.get(1).and_then(Value::as_str) {
                            let _ = app.emit(
                                "rainflix:native-torrent",
                                json!({ "sessionId":session_id,"kind":"subtitle","subtitleId":id }),
                            );
                        }
                    }
                    Some("rainflix-fullscreen") => {
                        if let Some(window) = app.get_webview_window("main") {
                            let fullscreen = window.is_fullscreen().unwrap_or(false);
                            let _ = window.set_fullscreen(!fullscreen);
                        }
                    }
                    _ => {}
                }
            }
            Some("end-file") if value.get("reason").and_then(Value::as_str) == Some("eof") => {
                let _ = app.emit(
                    "rainflix:native-torrent",
                    json!({ "sessionId": session_id, "kind": "complete" }),
                );
            }
            Some("end-file") if value.get("reason").and_then(Value::as_str) == Some("error") => {
                let _ = app.emit(
                    "rainflix:native-torrent",
                    json!({ "sessionId": session_id, "kind": "error" }),
                );
                cancel.cancel();
                return;
            }
            Some("playback-restart") if !playing => {
                playing = true;
                let _ = app.emit(
                    "rainflix:native-torrent",
                    json!({ "sessionId": session_id, "kind": "playing" }),
                );
            }
            Some("property-change") => {
                let data = value.get("data").and_then(Value::as_f64);
                match value.get("id").and_then(Value::as_u64) {
                    Some(1) => {
                        if let (Some(previous), Some(current)) = (position, data) {
                            if !playing && current > previous + 0.05 {
                                playing = true;
                                let _ = app.emit(
                                    "rainflix:native-torrent",
                                    json!({ "sessionId": session_id, "kind": "playing" }),
                                );
                            }
                        }
                        position = data;
                    }
                    Some(2) => duration = data,
                    _ => {}
                }
                if playing {
                    if let (Some(position), Some(duration)) = (position, duration) {
                        if position.is_finite() && duration.is_finite() && duration > 0.0 {
                            let _ = app.emit(
                                "rainflix:native-torrent",
                                json!({
                                    "sessionId": session_id,
                                    "kind": "progress",
                                    "position": position,
                                    "duration": duration,
                                }),
                            );
                        }
                    }
                }
            }
            _ => {}
        }
    }
}

#[tauri::command]
pub async fn stop_native_torrent(
    state: TauriState<'_, NativeTorrentState>,
    session_id: String,
) -> Result<(), String> {
    let preload = {
        let mut inner = state.inner.lock().await;
        if inner
            .preload
            .as_ref()
            .is_some_and(|p| p.owner == session_id && !p.claimed)
        {
            inner.preload.take()
        } else {
            None
        }
    };
    if let Some(preload) = preload {
        discard_preload(preload).await;
    }
    let (active, done) = {
        let mut inner = state.inner.lock().await;
        let done = inner.in_flight.get(&session_id).map(|pending| {
            pending.cancel.cancel();
            pending.done.clone()
        });
        if inner.pending.as_deref() == Some(session_id.as_str()) {
            inner.pending = None;
        }
        if inner
            .active
            .as_ref()
            .is_some_and(|active| active.id == session_id)
        {
            (inner.retire_active(), done)
        } else {
            (None, done)
        }
    };
    if let Some((active, closed)) = active {
        state.stop_retired(active, closed).await;
    }
    if let Some(done) = done {
        let _ = timeout(Duration::from_secs(15), done.cancelled()).await;
    }
    Ok(())
}

#[tauri::command]
pub async fn update_native_preload_status(
    state: TauriState<'_, NativeTorrentState>,
    session_id: String,
    preload_id: String,
    status: String,
    percent: f64,
) -> Result<(), String> {
    if !matches!(
        status.as_str(),
        "lookup"
            | "metadata"
            | "buffering"
            | "ready"
            | "failed"
            | "unavailable"
            | "cancelled"
            | "unsupported"
    ) {
        return Err("Invalid preload status".into());
    }
    let inner = state.inner.lock().await;
    let path = player_ui_path(&inner, &session_id).ok_or("Playback closed")?;
    let mut metadata: Value =
        serde_json::from_slice(&std::fs::read(&path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    if status != "lookup" && metadata["preloadStatus"]["id"].as_str() != Some(preload_id.as_str()) {
        return Ok(());
    }
    metadata["preloadStatus"] = json!({"id":preload_id,"status":status,"percent":if percent.is_finite() { percent.clamp(0.0,100.0) } else {0.0}});
    std::fs::write(
        path,
        serde_json::to_vec(&metadata).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn preload_native_torrent(
    app: AppHandle,
    state: TauriState<'_, NativeTorrentState>,
    session_id: String,
    preload_id: String,
    info_hash: String,
    file_idx: Option<usize>,
    sources: Vec<String>,
) -> Result<(), String> {
    if preload_id.len() < 16 || preload_id.len() > 64 {
        return Err("Invalid preload session.".into());
    }
    let magnet = magnet_url(&info_hash, &sources)?;
    let cancel = CancellationToken::new();
    let done = CancellationToken::new();
    let _completion = done.clone().drop_guard();
    let previous = {
        let mut inner = state.inner.lock().await;
        if !inner
            .active
            .as_ref()
            .is_some_and(|active| active.id == session_id)
        {
            return Err("The playback session has closed.".into());
        }
        let previous = inner.preload.take();
        inner.preload = Some(Preload {
            id: preload_id.clone(),
            owner: session_id.clone(),
            magnet: magnet.clone(),
            file_idx,
            cancel: cancel.clone(),
            done,
            active: None,
            claimed: false,
        });
        previous
    };
    if let Some(previous) = previous {
        discard_preload(previous).await;
    }
    let result = prepare(&app, &preload_id, &magnet, file_idx, &cancel, true).await;
    let (active, url) = match result {
        Ok(value) => value,
        Err(error) => {
            let mut inner = state.inner.lock().await;
            if inner.preload.as_ref().is_some_and(|p| p.id == preload_id) {
                inner.preload = None;
            }
            return Err(error);
        }
    };
    let session = active.session.clone();
    let torrent_id = active.torrent_id;
    let mut inner = state.inner.lock().await;
    if cancel.is_cancelled() || !inner.preload.as_ref().is_some_and(|p| p.id == preload_id) {
        drop(inner);
        stop_active(active).await;
        return Err("Preloading cancelled.".into());
    }
    inner.preload.as_mut().unwrap().active = Some(active);
    drop(inner);
    let _=app.emit("rainflix:native-torrent",json!({"sessionId":session_id,"kind":"preload-status","preloadId":preload_id,"status":"buffering","percent":0}));
    let mut warmed = warm_preload(&app, &url, &cancel, Some((&session_id, &preload_id))).await;
    let mut inner = state.inner.lock().await;
    let Some(slot) = inner.preload.as_ref().filter(|p| p.id == preload_id) else {
        // A claimed stream may already belong to the new playback session.
        return Err("Preload handed off or cancelled.".into());
    };
    if slot.claimed {
        return Ok(());
    }
    if warmed.is_ok() && !cancel.is_cancelled() {
        if let (Some(session), Some(id)) = (session, torrent_id) {
            if let Some(torrent) = session.get(TorrentIdOrHash::Id(id)) {
                if session.pause(&torrent).await.is_err() {
                    warmed = Err("Could not pause the preload torrent.".into());
                }
            }
        }
        if warmed.is_ok() {
            return Ok(());
        }
    }
    let failed = inner.preload.take().unwrap();
    drop(inner);
    discard_preload(failed).await;
    Err(warmed
        .err()
        .unwrap_or_else(|| "Preloading cancelled.".into()))
}

async fn warm_preload(
    app: &AppHandle,
    url: &str,
    cancel: &CancellationToken,
    progress: Option<(&str, &str)>,
) -> Result<(), String> {
    let binary = app
        .path()
        .resolve("mpv/mpv.exe", BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    let pipe = format!(r"\\.\pipe\rainflix-preload-{}", Uuid::new_v4());
    // A headless paused demuxer measures actual playable seconds; disk pieces survive its exit.
    let mut child = Command::new(binary)
        .args([
            "--no-config",
            "--no-ytdl",
            "--terminal=no",
            "--force-window=no",
            "--vo=null",
            "--ao=null",
            "--pause=yes",
            "--cache=yes",
            "--demuxer-readahead-secs=12",
            "--cache-secs=12",
            "--demuxer-max-bytes=32MiB",
            "--demuxer-max-back-bytes=0",
        ])
        .arg(format!("--input-ipc-server={pipe}"))
        .arg(url)
        .creation_flags(0x08000000)
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| e.to_string())?;
    let read = async {
        let mut connection = loop {
            match ClientOptions::new().open(&pipe) {
                Ok(connection) => break connection,
                Err(_) => tokio::time::sleep(Duration::from_millis(100)).await,
            }
        };
        for (id, property) in [
            (1, "demuxer-cache-duration"),
            (2, "duration"),
            (3, "demuxer-cache-state"),
        ] {
            let request =
                serde_json::to_string(&json!({"command":["observe_property",id,property]}))
                    .unwrap()
                    + "\n";
            connection
                .write_all(request.as_bytes())
                .await
                .map_err(|e| e.to_string())?;
        }
        let mut reader = BufReader::new(connection);
        let mut line = String::new();
        let mut duration = 5.0_f64;
        let mut buffered = 0.0_f64;
        let mut last_report = Instant::now() - Duration::from_secs(1);
        loop {
            line.clear();
            if reader
                .read_line(&mut line)
                .await
                .map_err(|e| e.to_string())?
                == 0
            {
                return Err("Preload decoder closed.".into());
            }
            let Ok(value) = serde_json::from_str::<Value>(&line) else {
                continue;
            };
            if value["event"] == "property-change" {
                if value["id"] == 3
                    && value["data"]["eof"] == true
                    && value["data"]["cache-end"]
                        .as_f64()
                        .is_some_and(|end| end > 0.0)
                    && value["data"]["underrun"] != true
                {
                    return Ok(());
                }
                if let Some(data) = value["data"].as_f64().filter(|v| v.is_finite() && *v > 0.0) {
                    match value["id"].as_u64() {
                        Some(1) => buffered = data,
                        Some(2) => duration = data,
                        _ => {}
                    }
                }
                let target = 5.0_f64.min((duration - 0.2).max(0.1));
                if last_report.elapsed() >= Duration::from_millis(500) {
                    if let Some((owner, id)) = progress {
                        let _=app.emit("rainflix:native-torrent",json!({"sessionId":owner,"kind":"preload-status","preloadId":id,"status":"buffering","percent":(buffered/target*100.0).clamp(0.0,100.0)}));
                    }
                    last_report = Instant::now();
                }
                if buffered >= target {
                    return Ok(());
                }
            }
            if value["event"] == "end-file" && value["reason"] == "error" {
                return Err("Could not preload this source.".into());
            }
        }
    };
    let result = tokio::select! {
        _=cancel.cancelled()=>Err("Preloading cancelled.".into()),
        result=timeout(Duration::from_secs(90),read)=>result.unwrap_or_else(|_|Err("Preloading timed out.".into())),
    };
    let _ = child.kill().await;
    let _ = child.wait().await;
    result
}

#[tauri::command]
pub async fn control_native_preload(
    app: AppHandle,
    state: TauriState<'_, NativeTorrentState>,
    session_id: String,
    preload_id: String,
    claim: bool,
) -> Result<bool, String> {
    let mut inner = state.inner.lock().await;
    let Some(slot) = inner
        .preload
        .as_mut()
        .filter(|p| p.id == preload_id && p.owner == session_id)
    else {
        return Ok(false);
    };
    if claim {
        if slot.active.is_none() || slot.cancel.is_cancelled() {
            return Ok(false);
        }
        slot.claimed = true;
        slot.cancel.cancel();
        drop(inner);
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_secs(30)).await;
            let state = app.state::<NativeTorrentState>();
            let expired = {
                let mut inner = state.inner.lock().await;
                if inner
                    .preload
                    .as_ref()
                    .is_some_and(|p| p.id == preload_id && p.claimed)
                {
                    inner.preload.take()
                } else {
                    None
                }
            };
            if let Some(expired) = expired {
                discard_preload(expired).await;
            }
        });
        Ok(true)
    } else {
        let slot = inner.preload.take().unwrap();
        drop(inner);
        discard_preload(slot).await;
        Ok(true)
    }
}

#[tauri::command]
pub async fn start_native_torrent(
    app: AppHandle,
    state: TauriState<'_, NativeTorrentState>,
    session_id: String,
    info_hash: String,
    file_idx: Option<usize>,
    sources: Vec<String>,
    ui: Option<PlayerUi>,
    start_at: Option<f64>,
    preload_id: Option<String>,
) -> Result<NativePlayback, String> {
    let magnet = magnet_url(&info_hash, &sources)?;
    start_native_playback(
        app,
        state,
        session_id,
        Some(magnet),
        None,
        file_idx,
        ui,
        start_at,
        preload_id,
    )
    .await
}

#[tauri::command]
pub async fn start_native_media(
    app: AppHandle,
    state: TauriState<'_, NativeTorrentState>,
    session_id: String,
    url: String,
    ui: Option<PlayerUi>,
    start_at: Option<f64>,
) -> Result<NativePlayback, String> {
    let url = url::Url::parse(&url).map_err(|_| "Invalid media URL")?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("Unsupported media URL".into());
    }
    start_native_playback(
        app,
        state,
        session_id,
        None,
        Some(url.to_string()),
        None,
        ui,
        start_at,
        None,
    )
    .await
}

async fn start_native_playback(
    app: AppHandle,
    state: TauriState<'_, NativeTorrentState>,
    session_id: String,
    magnet: Option<String>,
    media_url: Option<String>,
    file_idx: Option<usize>,
    ui: Option<PlayerUi>,
    start_at: Option<f64>,
    preload_id: Option<String>,
) -> Result<NativePlayback, String> {
    if session_id.len() < 16 || session_id.len() > 64 {
        return Err("Invalid playback session.".into());
    }
    let cancel = CancellationToken::new();
    let done = CancellationToken::new();
    let (old, previous_done, prepared) = {
        let mut inner = state.inner.lock().await;
        if inner.in_flight.contains_key(&session_id)
            || inner
                .active
                .as_ref()
                .is_some_and(|active| active.id == session_id)
        {
            return Err("This playback session already exists.".into());
        }
        let mut previous_done = Vec::new();
        for pending in inner.in_flight.values() {
            pending.cancel.cancel();
            previous_done.push(pending.done.clone());
        }
        let old = inner.retire_active();
        previous_done.extend(inner.closing.values().cloned());
        inner.in_flight.insert(
            session_id.clone(),
            Pending {
                cancel: cancel.clone(),
                done: done.clone(),
                ui_path: None,
            },
        );
        inner.pending = Some(session_id.clone());
        let prepared = inner.preload.take();
        (old, previous_done, prepared)
    };
    let mut prepared = match prepared {
        Some(mut preload)
            if preload.claimed
                && Some(&preload.id) == preload_id.as_ref()
                && Some(&preload.magnet) == magnet.as_ref()
                && preload.file_idx == file_idx =>
        {
            preload.active.take()
        }
        Some(preload) => {
            discard_preload(preload).await;
            None
        }
        None => None,
    };
    if let Some((old, closed)) = old {
        state.stop_retired(old, closed).await;
    }
    let mut early_player = None;
    let mut pipe = None;
    let result = async {
        wait_for_player_teardown(previous_done, &cancel).await?;
        if cancel.is_cancelled() {
            return Err("Playback stopped".into());
        }
        if let Some(ui) = ui {
            let root = cache_root(&app)?;
            std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
            let directory = root.join(format!("playback-{}", Uuid::new_v4()));
            std::fs::create_dir(&directory).map_err(|e| e.to_string())?;
            let path = directory.join("player-ui.json");
            let player_pipe = format!(r"\\.\pipe\rainflix-{}", Uuid::new_v4());
            let (child, surface) = match spawn_player(&app, "", 0.0, &ui, &path, &player_pipe) {
                Ok(player) => player,
                Err(error) => {
                    remove_owned_directory(&root, &directory);
                    return Err(error);
                }
            };
            let task = tokio::spawn(monitor_player(
                app.clone(),
                session_id.clone(),
                player_pipe.clone(),
                child,
                cancel.clone(),
                surface,
            ));
            early_player = Some(Player {
                cancel: cancel.clone(),
                task,
                ui_path: path.clone(),
                pipe: player_pipe.clone(),
            });
            {
                let mut inner = state.inner.lock().await;
                if cancel.is_cancelled() {
                    return Err("Playback stopped".into());
                }
                if let Some(pending) = inner.in_flight.get_mut(&session_id) {
                    pending.ui_path = Some(path.clone());
                }
            }
            let _ = app.emit(
                "rainflix:native-torrent",
                json!({ "sessionId":session_id, "kind":"opened" }),
            );
            pipe = Some(player_pipe);
            let artwork_cancel = cancel.clone();
            let artwork_app = app.clone();
            tokio::spawn(async move {
                let (logo, backdrop) = tokio::join!(
                    artwork(ui.logo_url.as_deref(), 384, 144),
                    artwork(ui.backdrop_url.as_deref(), 960, 540)
                );
                if artwork_cancel.is_cancelled() {
                    return;
                }
                let state = artwork_app.state::<NativeTorrentState>();
                let _guard = state.inner.lock().await;
                if artwork_cancel.is_cancelled() {
                    return;
                }
                let Ok(bytes) = std::fs::read(&path) else {
                    return;
                };
                let Ok(mut metadata) = serde_json::from_slice::<Value>(&bytes) else {
                    return;
                };
                if let Some(logo) = logo {
                    metadata["logo"] =
                        write_artwork(&logo, &path.with_extension("loading-logo.bgra"), true)
                            .unwrap_or(Value::Null);
                }
                if let Some(backdrop) = backdrop {
                    if let Some(mut art) = write_artwork(
                        &backdrop,
                        &path.with_extension("loading-backdrop.bgra"),
                        true,
                    ) {
                        art["path"] = art["dimPath"].clone();
                        metadata["backdrop"] = art;
                    }
                }
                if !artwork_cancel.is_cancelled() {
                    let _ =
                        std::fs::write(&path, serde_json::to_vec(&metadata).unwrap_or_default());
                }
            });
        }
        let (mut active, url) = if let Some(mut warmed) = prepared.take() {
            warmed.id = session_id.clone();
            if let (Some(session), Some(id)) = (&warmed.session, warmed.torrent_id) {
                session.ratelimits.set_download_bps(None);
                if let Some(torrent) = session.get(TorrentIdOrHash::Id(id)) {
                    if torrent.is_paused() && session.unpause(&torrent).await.is_err() {
                        stop_active(warmed).await;
                        return Err("Could not resume the preloaded torrent.".into());
                    }
                }
            }
            let url = warmed.media_url.clone();
            (warmed, url)
        } else if let Some(magnet) = magnet {
            prepare(&app, &session_id, &magnet, file_idx, &cancel, false).await?
        } else {
            let url = media_url.ok_or("No media URL")?;
            let root = cache_root(&app)?;
            std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
            let directory = root.join(format!("playback-{}", Uuid::new_v4()));
            std::fs::create_dir(&directory).map_err(|e| e.to_string())?;
            (
                Active {
                    id: session_id.clone(),
                    session: None,
                    torrent_id: None,
                    server: None,
                    root,
                    directory,
                    media_url: url.clone(),
                    player: None,
                },
                url,
            )
        };
        if let Some(pipe) = &pipe {
            let start = start_at.unwrap_or(0.0);
            let options = if start.is_finite() && (1.0..604800.0).contains(&start) {
                format!("start={start:.2}")
            } else {
                String::new()
            };
            if let Err(error) = send_player_command(
                pipe,
                json!(["loadfile", url, "replace", -1, options]),
                &cancel,
            )
            .await
            {
                stop_active(active).await;
                return Err(error);
            }
            active.player = early_player.take();
        }
        Ok((active, url))
    }
    .await;
    if let Some(prepared) = prepared {
        stop_active(prepared).await;
    }
    if let Some(player) = early_player {
        player.cancel.cancel();
        let _ = player.task.await;
    }
    let mut inner = state.inner.lock().await;
    let still_current =
        inner.pending.as_deref() == Some(session_id.as_str()) && !cancel.is_cancelled();
    if still_current {
        inner.pending = None;
    }
    inner.in_flight.remove(&session_id);
    let outcome = match result {
        Ok((active, url)) if still_current => {
            inner.active = Some(active);
            Ok(NativePlayback { session_id, url })
        }
        Ok((active, _)) => {
            drop(inner);
            stop_active(active).await;
            Err("Torrent playback was stopped.".into())
        }
        Err(error) => Err(error),
    };
    done.cancel();
    outcome
}

async fn prepare(
    app: &AppHandle,
    session_id: &str,
    magnet: &str,
    requested_file: Option<usize>,
    cancel: &CancellationToken,
    preloading: bool,
) -> Result<(Active, String), String> {
    if cancel.is_cancelled() {
        return Err("Torrent playback was stopped.".into());
    }
    let root = cache_root(app)?;
    std::fs::create_dir_all(&root)
        .map_err(|_| "RainFlix could not create its torrent cache.".to_string())?;
    let directory = root.join(format!("playback-{}", Uuid::new_v4()));
    std::fs::create_dir(&directory)
        .map_err(|_| "RainFlix could not create a temporary playback folder.".to_string())?;
    let options = SessionOptions {
        dht: Some(DhtSessionConfig {
            persistence: None,
            ..DhtSessionConfig::default()
        }),
        disable_local_service_discovery: true,
        peer_limit: Some(40),
        ratelimits: LimitsConfig {
            upload_bps: NonZeroU32::new(UPLOAD_LIMIT_BYTES_PER_SECOND),
            download_bps: if preloading {
                NonZeroU32::new(512 * 1024)
            } else {
                None
            },
        },
        ..SessionOptions::default()
    };
    let session = match Session::new_with_opts(directory.clone(), options).await {
        Ok(session) => session,
        Err(_) => {
            remove_owned_directory(&root, &directory);
            return Err("RainFlix could not start its torrent engine.".into());
        }
    };

    let outcome = async {
        let add = tokio::select! {
            _ = cancel.cancelled() => return Err("Torrent playback was stopped.".to_string()),
            result = timeout(METADATA_TIMEOUT, session.add_torrent(
                AddTorrent::from_url(magnet),
                Some(AddTorrentOptions {
                    paused: true,
                    only_files: Some(Vec::new()),
                    peer_limit: Some(40),
                    ..AddTorrentOptions::default()
                }),
            )) => result.map_err(|_| "No peers supplied torrent metadata in time.".to_string())?
                .map_err(|_| "Torrent metadata could not be found. Try another source.".to_string())?,
        };
        let torrent = add
            .into_handle()
            .ok_or_else(|| "Torrent metadata did not return a playable file.".to_string())?;
        tokio::select! {
            _ = cancel.cancelled() => return Err("Torrent playback was stopped.".into()),
            result = torrent.wait_until_initialized() => result.map_err(|_| "Torrent storage could not initialize.".to_string())?,
        }
        let (file_idx, length, content_type) = choose_file(&torrent, requested_file)?;
        session
            .update_only_files(&torrent, &HashSet::from([file_idx]))
            .await
            .map_err(|_| "RainFlix could not select the video file.".to_string())?;
        if cancel.is_cancelled() {
            return Err("Torrent playback was stopped.".into());
        }
        session
            .unpause(&torrent)
            .await
            .map_err(|_| "The torrent could not start downloading.".to_string())?;
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
            .await
            .map_err(|_| "RainFlix could not open its local video endpoint.".to_string())?;
        let port = listener
            .local_addr()
            .map_err(|_| "RainFlix could not read its video endpoint.".to_string())?
            .port();
        let token = Uuid::new_v4().to_string();
        let media = Arc::new(Media {
            token: token.clone(),
            torrent: torrent.clone(),
            file_idx,
            length,
            content_type,
        });
        let router = Router::new()
            .route("/media/{token}", get(serve_media).head(serve_media))
            .with_state(media);
        let server = tokio::spawn(async move {
            let _ = axum::serve(listener, router).await;
        });
        let url = format!("http://127.0.0.1:{port}/media/{token}");
        Ok((
            Active {
                id: session_id.to_string(),
                session: Some(session.clone()),
                torrent_id: Some(torrent.id()),
                server: Some(server),
                root: root.clone(),
                directory: directory.clone(),
                media_url: url.clone(),
                player: None,
            },
            url,
        ))
    }
    .await;

    if outcome.is_err() {
        session.stop().await;
        remove_owned_directory(&root, &directory);
    }
    outcome
}

fn requested_range(headers: &HeaderMap, length: u64) -> Result<Option<(u64, u64)>, ()> {
    let Some(value) = headers.get(header::RANGE) else {
        return Ok(None);
    };
    let text = value.to_str().map_err(|_| ())?;
    let bytes = text.strip_prefix("bytes=").ok_or(())?;
    let (start, end) = bytes.split_once('-').ok_or(())?;
    if end.contains(',') || length == 0 {
        return Err(());
    }
    let (start, end) = if start.is_empty() {
        let suffix = end.parse::<u64>().map_err(|_| ())?;
        if suffix == 0 {
            return Err(());
        }
        (length.saturating_sub(suffix), length - 1)
    } else {
        let start = start.parse::<u64>().map_err(|_| ())?;
        let end = if end.is_empty() {
            length - 1
        } else {
            end.parse::<u64>().map_err(|_| ())?.min(length - 1)
        };
        (start, end)
    };
    if start > end || start >= length {
        return Err(());
    }
    Ok(Some((start, end)))
}

async fn serve_media(
    RoutePath(token): RoutePath<String>,
    State(media): State<Arc<Media>>,
    method: Method,
    headers: HeaderMap,
) -> Response {
    if token != media.token {
        return StatusCode::NOT_FOUND.into_response();
    }
    let range = match requested_range(&headers, media.length) {
        Ok(range) => range,
        Err(()) => {
            let mut response = StatusCode::RANGE_NOT_SATISFIABLE.into_response();
            response.headers_mut().insert(
                header::CONTENT_RANGE,
                HeaderValue::from_str(&format!("bytes */{}", media.length))
                    .expect("numeric content range"),
            );
            return response;
        }
    };
    let (start, end) = range.unwrap_or((0, media.length - 1));
    let mut response = if method == Method::HEAD {
        Body::empty().into_response()
    } else {
        let mut stream = match media.torrent.clone().stream(media.file_idx).await {
            Ok(stream) => stream,
            Err(_) => return StatusCode::SERVICE_UNAVAILABLE.into_response(),
        };
        if stream.seek(SeekFrom::Start(start)).await.is_err() {
            return StatusCode::SERVICE_UNAVAILABLE.into_response();
        }
        Body::from_stream(ReaderStream::with_capacity(
            stream.take(end - start + 1),
            65536,
        ))
        .into_response()
    };
    *response.status_mut() = if range.is_some() {
        StatusCode::PARTIAL_CONTENT
    } else {
        StatusCode::OK
    };
    let output = response.headers_mut();
    output.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    output.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    output.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static(media.content_type),
    );
    output.insert(
        header::CONTENT_LENGTH,
        HeaderValue::from_str(&(end - start + 1).to_string()).expect("numeric content length"),
    );
    if range.is_some() {
        output.insert(
            header::CONTENT_RANGE,
            HeaderValue::from_str(&format!("bytes {start}-{end}/{}", media.length))
                .expect("numeric content range"),
        );
    }
    response
}

#[cfg(test)]
mod transition_tests {
    use super::*;

    #[test]
    fn replacing_player_waits_for_a_session_already_removed_by_stop() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async {
            let mut inner = Inner::default();
            inner.active = Some(Active {
                id: "previous-episode".into(),
                session: None,
                torrent_id: None,
                server: None,
                root: PathBuf::new(),
                directory: PathBuf::new(),
                media_url: String::new(),
                player: None,
            });
            let (_active, closed) = inner.retire_active().unwrap();
            assert!(inner.active.is_none());
            let cancel = CancellationToken::new();
            let wait = wait_for_player_teardown(inner.closing.values().cloned().collect(), &cancel);
            tokio::pin!(wait);
            assert!(timeout(Duration::from_millis(20), &mut wait).await.is_err());
            closed.cancel();
            assert!(wait.await.is_ok());
        });
    }

    #[test]
    fn cancelling_next_episode_interrupts_teardown_wait() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async {
            let closed = CancellationToken::new();
            let cancel = CancellationToken::new();
            cancel.cancel();
            let result = wait_for_player_teardown(vec![closed], &cancel).await;
            assert_eq!(result.unwrap_err(), "Playback stopped");
        });
    }
}
