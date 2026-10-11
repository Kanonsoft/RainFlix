//! Android transport only. Register `NativeTorrentState` and these commands on
//! Android; the JS adapter opens the native playback plugin AFTER receiving URL.
//! Player updates emit `rainflix:android-player-update` with existing camelCase
//! payloads. The parent adapter must forward these to its Android plugin. No
//! player is launched here and transport readiness never reports `playing`.

use std::{
    collections::{HashMap, HashSet, VecDeque},
    future::Future,
    io::{self, SeekFrom},
    net::Ipv4Addr,
    num::NonZeroU32,
    path::{Path, PathBuf},
    pin::Pin,
    sync::Arc,
    task::{Context, Poll},
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
use librqbit::{
    api::TorrentIdOrHash, limits::LimitsConfig, AddTorrent, AddTorrentOptions, DhtSessionConfig,
    Session, SessionOptions,
};
use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State as TauriState};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncSeekExt, ReadBuf},
    net::TcpListener,
    sync::Mutex,
    task::JoinHandle,
    time::timeout,
};
use tokio_util::{io::ReaderStream, sync::CancellationToken};
use uuid::Uuid;

const MAX_VIDEO_BYTES: u64 = 12 * 1024 * 1024 * 1024;
const METADATA_TIMEOUT: Duration = Duration::from_secs(75);
const STOPPED: &str = "Torrent playback was stopped.";

#[derive(Default, Clone)]
pub struct NativeTorrentState {
    inner: Arc<Mutex<Inner>>,
    warm: Arc<Mutex<Option<Warm>>>,
}

struct Warm {
    owner: String,
    id: String,
    magnet: String,
    file_idx: Option<usize>,
    cancel: CancellationToken,
    active: Option<Active>,
    claimed: bool,
    created: Instant,
}

#[derive(Default)]
struct Inner {
    pending: HashMap<String, Pending>,
    active: Option<Active>,
    closing: HashMap<String, CancellationToken>,
    // A stop may arrive before the corresponding start invoke is scheduled.
    stopped: VecDeque<String>,
}

struct Pending {
    cancel: CancellationToken,
    done: CancellationToken,
}

struct Active {
    id: String,
    cancel: CancellationToken,
    session: Option<Arc<Session>>,
    torrent_id: Option<usize>,
    server: Option<JoinHandle<()>>,
    root: PathBuf,
    directory: PathBuf,
    url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativePlayback {
    pub session_id: String,
    pub url: String,
}

impl Inner {
    fn remember_stop(&mut self, id: &str) {
        if !self.stopped.iter().any(|old| old == id) {
            self.stopped.push_back(id.to_owned());
            if self.stopped.len() > 256 {
                self.stopped.pop_front();
            }
        }
    }

    fn retire(&mut self, state: NativeTorrentState) -> Option<CancellationToken> {
        let active = self.active.take()?;
        active.cancel.cancel();
        let done = CancellationToken::new();
        self.closing.insert(active.id.clone(), done.clone());
        let completion = done.clone();
        // Own teardown independently of the stop/start command's lifetime.
        tokio::spawn(async move {
            let _finished = completion.drop_guard();
            let id = active.id.clone();
            cleanup(active).await;
            state.inner.lock().await.closing.remove(&id);
        });
        Some(done)
    }
}

impl NativeTorrentState {
    pub async fn stop_all(&self) {
        if let Some(warm) = self.warm.lock().await.take() {
            warm.cancel.cancel();
            if let Some(active) = warm.active {
                cleanup(active).await;
            }
        }
        let waits = {
            let mut inner = self.inner.lock().await;
            let ids = inner.pending.keys().cloned().collect::<Vec<_>>();
            for id in ids {
                inner.remember_stop(&id);
            }
            if let Some(id) = inner.active.as_ref().map(|active| active.id.clone()) {
                inner.remember_stop(&id);
            }
            for pending in inner.pending.values() {
                pending.cancel.cancel();
            }
            inner.retire(self.clone());
            inner
                .pending
                .values()
                .map(|p| p.done.clone())
                .chain(inner.closing.values().cloned())
                .collect::<Vec<_>>()
        };
        for done in waits {
            done.cancelled().await;
        }
    }
}

fn remove_owned_directory(root: &Path, directory: &Path) {
    let (Ok(root), Ok(directory)) = (root.canonicalize(), directory.canonicalize()) else {
        return;
    };
    if directory.parent() == Some(root.as_path())
        && directory.file_name().is_some_and(|name| {
            name.to_str()
                .and_then(|name| name.strip_prefix("playback-"))
                .is_some_and(|id| Uuid::parse_str(id).is_ok())
        })
    {
        let _ = std::fs::remove_dir_all(directory);
    }
}

async fn cleanup(mut active: Active) {
    active.cancel.cancel();
    if let Some(mut server) = active.server.take() {
        if timeout(Duration::from_secs(5), &mut server).await.is_err() {
            server.abort();
            let _ = server.await;
        }
    }
    if let Some(session) = active.session.take() {
        if let Some(id) = active.torrent_id {
            let _ = session.delete(TorrentIdOrHash::Id(id), true).await;
        }
        session.stop().await;
    }
    remove_owned_directory(&active.root, &active.directory);
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
        if matches!(address.scheme(), "http" | "https" | "udp" | "ws" | "wss") {
            magnet.query_pairs_mut().append_pair("tr", tracker);
        }
    }
    Ok(magnet.into())
}

fn media_url(value: &str) -> Result<String, String> {
    let url = url::Url::parse(value).map_err(|_| "Invalid media URL")?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("Unsupported media URL".into());
    }
    Ok(url.into())
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
    let selected = torrent
        .with_metadata(|metadata| {
            let files = &metadata.file_infos;
            let file = match requested {
                Some(idx) => files.get(idx).map(|file| (idx, file)),
                None => files
                    .iter()
                    .enumerate()
                    .filter(|(_, file)| video_type(&file.relative_filename).is_some())
                    .max_by_key(|(_, file)| file.len),
            };
            file.map(|(idx, file)| {
                (
                    idx,
                    file.len,
                    video_type(&file.relative_filename).unwrap_or("application/octet-stream"),
                )
            })
        })
        .map_err(|_| "Torrent metadata could not be read.")?
        .ok_or("The torrent has no selected playable video file.")?;
    if selected.1 == 0 || selected.1 > MAX_VIDEO_BYTES {
        return Err("This video is empty or exceeds RainFlix's 12 GB temporary limit.".into());
    }
    Ok(selected)
}

async fn prepare(
    app: &AppHandle,
    id: &str,
    magnet: &str,
    file_idx: Option<usize>,
    cancel: CancellationToken,
    warming: bool,
) -> Result<Active, String> {
    if cancel.is_cancelled() {
        return Err(STOPPED.into());
    }
    let root = app
        .path()
        .app_cache_dir()
        .map_err(|_| "Could not locate torrent cache")?
        .join("android-torrents");
    std::fs::create_dir_all(&root).map_err(|_| "Could not create torrent cache")?;
    let directory = root.join(format!("playback-{}", Uuid::new_v4()));
    std::fs::create_dir(&directory).map_err(|_| "Could not create temporary torrent folder")?;
    let mut active = Active {
        id: id.to_owned(),
        cancel: cancel.clone(),
        session: None,
        torrent_id: None,
        server: None,
        root,
        directory,
        url: String::new(),
    };
    let result = async {
        // Do not drop Session initialization mid-flight: retain its result and
        // stop it even if cancellation arrived during initialization.
        let session = Session::new_with_opts(
            active.directory.clone(),
            SessionOptions {
                dht: Some(DhtSessionConfig {
                    persistence: None,
                    ..Default::default()
                }),
                disable_local_service_discovery: true,
                peer_limit: Some(if warming { 12 } else { 40 }),
                ratelimits: LimitsConfig {
                    upload_bps: NonZeroU32::new(256 * 1024),
                    download_bps: if warming {
                        NonZeroU32::new(2 * 1024 * 1024)
                    } else {
                        None
                    },
                },
                ..Default::default()
            },
        )
        .await
        .map_err(|_| "Could not start the torrent engine")?;
        active.session = Some(session.clone());
        if cancel.is_cancelled() {
            return Err(STOPPED.to_owned());
        }
        let added = tokio::select! {
            biased;
            _ = cancel.cancelled() => return Err(STOPPED.to_owned()),
            result = timeout(METADATA_TIMEOUT, session.add_torrent(AddTorrent::from_url(magnet),
                Some(AddTorrentOptions { paused: true, only_files: Some(Vec::new()),
                    peer_limit: Some(40), ..Default::default() }))) =>
                result.map_err(|_| "No peers supplied torrent metadata in time.")?
                    .map_err(|_| "Torrent metadata could not be found. Try another source.")?,
        };
        let torrent = added.into_handle().ok_or("No playable torrent handle")?;
        active.torrent_id = Some(torrent.id());
        tokio::select! {
            biased;
            _ = cancel.cancelled() => return Err(STOPPED.to_owned()),
            result = timeout(METADATA_TIMEOUT, torrent.wait_until_initialized()) =>
                result.map_err(|_| "Torrent storage initialization timed out")?
                    .map_err(|_| "Torrent storage could not initialize")?,
        }
        let (file_idx, length, content_type) = choose_file(&torrent, file_idx)?;
        session
            .update_only_files(&torrent, &HashSet::from([file_idx]))
            .await
            .map_err(|_| "Could not select the video file")?;
        if cancel.is_cancelled() {
            return Err(STOPPED.to_owned());
        }
        session
            .unpause(&torrent)
            .await
            .map_err(|_| "Could not start downloading")?;
        if cancel.is_cancelled() {
            return Err(STOPPED.to_owned());
        }
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
            .await
            .map_err(|_| "Could not open the local video endpoint")?;
        let port = listener
            .local_addr()
            .map_err(|_| "Could not read local endpoint")?
            .port();
        let token = Uuid::new_v4().to_string();
        let router = Router::new()
            .route("/media/{token}", get(serve_media).head(serve_media))
            .with_state(Arc::new(Media {
                token: token.clone(),
                torrent,
                file_idx,
                length,
                content_type,
                cancel: cancel.clone(),
            }));
        let shutdown = cancel.clone();
        active.server = Some(tokio::spawn(async move {
            let _ = axum::serve(listener, router)
                .with_graceful_shutdown(shutdown.cancelled_owned())
                .await;
        }));
        active.url = format!("http://127.0.0.1:{port}/media/{token}");
        Ok::<(), String>(())
    }
    .await;
    if let Err(error) = result {
        cleanup(active).await;
        return Err(error);
    }
    Ok(active)
}

async fn start(
    app: AppHandle,
    state: NativeTorrentState,
    id: String,
    magnet: Option<String>,
    direct_url: Option<String>,
    file_idx: Option<usize>,
    preload_id: Option<String>,
) -> Result<NativePlayback, String> {
    if !(16..=64).contains(&id.len())
        || !id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err("Invalid playback session.".into());
    }
    let cancel = CancellationToken::new();
    let done = CancellationToken::new();
    let waits = {
        let mut inner = state.inner.lock().await;
        if inner.stopped.contains(&id) {
            return Err(STOPPED.into());
        }
        if inner.pending.contains_key(&id)
            || inner.closing.contains_key(&id)
            || inner.active.as_ref().is_some_and(|a| a.id == id)
        {
            return Err("This playback session already exists.".into());
        }
        for pending in inner.pending.values() {
            pending.cancel.cancel();
        }
        inner.retire(state.clone());
        let waits = inner
            .pending
            .values()
            .map(|p| p.done.clone())
            .chain(inner.closing.values().cloned())
            .collect::<Vec<_>>();
        inner.pending.insert(
            id.clone(),
            Pending {
                cancel: cancel.clone(),
                done: done.clone(),
            },
        );
        waits
    };
    let caller_guard = cancel.clone().drop_guard();
    let worker = tokio::spawn(async move {
        let _finished = done.drop_guard();
        let result = async {
            for wait in waits {
                tokio::select! {
                    biased;
                    _ = cancel.cancelled() => return Err(STOPPED.to_owned()),
                    _ = wait.cancelled() => {},
                }
            }
            if cancel.is_cancelled() {
                return Err(STOPPED.to_owned());
            }
            if let Some(magnet) = magnet {
                let warmed = {
                    let mut slot = state.warm.lock().await;
                    if slot.as_ref().is_some_and(|warm| {
                        preload_id.as_ref() == Some(&warm.id)
                            && warm.claimed
                            && warm.magnet == magnet
                            && warm.file_idx == file_idx
                            && warm.created.elapsed() < Duration::from_secs(90)
                    }) {
                        slot.take().and_then(|warm| warm.active)
                    } else {
                        None
                    }
                };
                if let Some(mut active) = warmed {
                    active.id = id.clone();
                    let resumed = if let (Some(session), Some(torrent_id)) =
                        (&active.session, active.torrent_id)
                    {
                        session.ratelimits.set_download_bps(None);
                        if let Some(torrent) = session.get(TorrentIdOrHash::Id(torrent_id)) {
                            session.unpause(&torrent).await.is_ok()
                        } else {
                            false
                        }
                    } else {
                        false
                    };
                    if resumed {
                        Ok(active)
                    } else {
                        cleanup(active).await;
                        prepare(&app, &id, &magnet, file_idx, cancel.clone(), false).await
                    }
                } else {
                    prepare(&app, &id, &magnet, file_idx, cancel.clone(), false).await
                }
            } else {
                Ok(Active {
                    id: id.clone(),
                    cancel: cancel.clone(),
                    session: None,
                    torrent_id: None,
                    server: None,
                    root: PathBuf::new(),
                    directory: PathBuf::new(),
                    url: direct_url.ok_or("No media URL")?,
                })
            }
        }
        .await;
        let mut inner = state.inner.lock().await;
        match result {
            Ok(active) if !cancel.is_cancelled() => {
                let playback = NativePlayback {
                    session_id: id.clone(),
                    url: active.url.clone(),
                };
                inner.active = Some(active);
                inner.pending.remove(&id);
                Ok(playback)
            }
            Ok(active) => {
                drop(inner);
                cleanup(active).await;
                state.inner.lock().await.pending.remove(&id);
                Err(STOPPED.into())
            }
            Err(error) => {
                inner.pending.remove(&id);
                Err(error)
            }
        }
    });
    let result = worker
        .await
        .map_err(|_| "Torrent startup task failed".to_string())?;
    // If the invoke was dropped, its guard cancels the owned startup task.
    // Successful sessions retain the same token for subsequent stop commands.
    caller_guard.disarm();
    result
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
    if Uuid::parse_str(&preload_id).is_err() {
        return Err("Invalid prefetch session".into());
    }
    let inner = state.inner.lock().await;
    if !inner
        .active
        .as_ref()
        .is_some_and(|active| active.id == session_id && !active.cancel.is_cancelled())
    {
        return Err("Playback closed".into());
    }
    let magnet = magnet_url(&info_hash, &sources)?;
    let cancel = CancellationToken::new();
    let previous = state.warm.lock().await.replace(Warm {
        owner: session_id.clone(),
        id: preload_id.clone(),
        magnet: magnet.clone(),
        file_idx,
        cancel: cancel.clone(),
        active: None,
        claimed: false,
        created: Instant::now(),
    });
    drop(inner);
    if let Some(previous) = previous {
        previous.cancel.cancel();
        if let Some(active) = previous.active {
            cleanup(active).await;
        }
    }
    let active = match prepare(&app, &preload_id, &magnet, file_idx, cancel.clone(), true).await {
        Ok(active) => active,
        Err(error) => {
            let mut slot = state.warm.lock().await;
            if slot.as_ref().is_some_and(|warm| warm.id == preload_id) {
                slot.take();
            }
            return Err(error);
        }
    };
    let warmup = async {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(45))
            .build()
            .map_err(|e| e.to_string())?;
        for range in ["bytes=0-4194303", "bytes=-524288"] {
            let mut response = client
                .get(&active.url)
                .header("Range", range)
                .send()
                .await
                .map_err(|_| "Prefetch could not read media")?
                .error_for_status()
                .map_err(|_| "Prefetch failed")?;
            let mut bytes = 0;
            while let Some(chunk) = response.chunk().await.map_err(|_| "Prefetch interrupted")? {
                bytes += chunk.len();
                if bytes >= 4194304 {
                    break;
                }
            }
        }
        if let (Some(session), Some(id)) = (&active.session, active.torrent_id) {
            if let Some(torrent) = session.get(TorrentIdOrHash::Id(id)) {
                session
                    .pause(&torrent)
                    .await
                    .map_err(|_| "Could not pause prefetch")?;
            }
        }
        Ok::<(), String>(())
    };
    let result = tokio::select! { _ = cancel.cancelled() => Err(STOPPED.to_string()), result = timeout(Duration::from_secs(60), warmup) => result.map_err(|_| "Prefetch timed out".to_string()).and_then(|result| result) };
    let mut slot = state.warm.lock().await;
    if result.is_err()
        || cancel.is_cancelled()
        || !slot.as_ref().is_some_and(|warm| warm.id == preload_id)
    {
        if slot.as_ref().is_some_and(|warm| warm.id == preload_id) {
            slot.take();
        }
        drop(slot);
        cleanup(active).await;
        return result.and(Err(STOPPED.into()));
    }
    if let Some(warm) = slot.as_mut() {
        warm.active = Some(active);
        warm.created = Instant::now();
    }
    drop(slot);
    let state = state.inner().clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(30)).await;
            let mut slot = state.warm.lock().await;
            let Some(warm) = slot.as_ref().filter(|warm| warm.id == preload_id) else {
                return;
            };
            if warm.created.elapsed() < Duration::from_secs(if warm.claimed { 90 } else { 7200 }) {
                continue;
            }
            let warm = slot.take().unwrap();
            drop(slot);
            warm.cancel.cancel();
            if let Some(active) = warm.active {
                cleanup(active).await;
            }
            return;
        }
    });
    Ok(())
}

#[tauri::command]
pub async fn control_native_preload(
    state: TauriState<'_, NativeTorrentState>,
    session_id: String,
    preload_id: String,
    claim: bool,
) -> Result<bool, String> {
    let mut slot = state.warm.lock().await;
    if !slot
        .as_ref()
        .is_some_and(|warm| warm.owner == session_id && warm.id == preload_id)
    {
        return Ok(false);
    }
    if claim {
        let warm = slot.as_mut().unwrap();
        if warm.claimed
            || warm.active.is_none()
            || warm.cancel.is_cancelled()
            || warm.created.elapsed() > Duration::from_secs(7200)
        {
            return Ok(false);
        }
        warm.claimed = true;
        warm.created = Instant::now();
        return Ok(true);
    }
    if slot.as_ref().is_some_and(|warm| warm.claimed) {
        return Ok(false);
    }
    let warm = slot.take().unwrap();
    drop(slot);
    warm.cancel.cancel();
    if let Some(active) = warm.active {
        cleanup(active).await;
    }
    Ok(true)
}

#[tauri::command]
pub async fn start_native_torrent(
    app: AppHandle,
    state: TauriState<'_, NativeTorrentState>,
    session_id: String,
    info_hash: String,
    file_idx: Option<usize>,
    sources: Vec<String>,
    ui: Option<Value>,
    start_at: Option<f64>,
    preload_id: Option<String>,
) -> Result<NativePlayback, String> {
    // Accepted for frontend compatibility; the Android plugin owns UI/resume.
    let _ = (ui, start_at);
    let magnet = magnet_url(&info_hash, &sources)?;
    start(
        app,
        state.inner().clone(),
        session_id,
        Some(magnet),
        None,
        file_idx,
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
    ui: Option<Value>,
    start_at: Option<f64>,
) -> Result<NativePlayback, String> {
    let _ = (ui, start_at);
    start(
        app,
        state.inner().clone(),
        session_id,
        None,
        Some(media_url(&url)?),
        None,
        None,
    )
    .await
}

#[tauri::command]
pub async fn stop_native_torrent(
    state: TauriState<'_, NativeTorrentState>,
    session_id: String,
) -> Result<(), String> {
    // Retire the owner before removing warmup so no new prefetch can race teardown.
    let waits = {
        let mut inner = state.inner.lock().await;
        inner.remember_stop(&session_id);
        let mut waits = Vec::new();
        if let Some(pending) = inner.pending.get(&session_id) {
            pending.cancel.cancel();
            waits.push(pending.done.clone());
        }
        if inner.active.as_ref().is_some_and(|a| a.id == session_id) {
            inner.retire(state.inner().clone());
        }
        if let Some(done) = inner.closing.get(&session_id) {
            waits.push(done.clone());
        }
        waits
    };
    let warm = {
        let mut slot = state.warm.lock().await;
        if slot
            .as_ref()
            .is_some_and(|warm| warm.owner == session_id && !warm.claimed)
        {
            slot.take()
        } else {
            None
        }
    };
    if let Some(warm) = warm {
        warm.cancel.cancel();
        if let Some(active) = warm.active {
            cleanup(active).await;
        }
    }
    for done in waits {
        done.cancelled().await;
    }
    Ok(())
}

#[tauri::command]
pub async fn play_native_torrent(
    state: TauriState<'_, NativeTorrentState>,
    session_id: String,
    start_at: f64,
    ui: Value,
) -> Result<NativePlayback, String> {
    let _ = (start_at, ui);
    let inner = state.inner.lock().await;
    let active = inner
        .active
        .as_ref()
        .filter(|a| a.id == session_id && !a.cancel.is_cancelled())
        .ok_or("Playback is no longer active")?;
    Ok(NativePlayback {
        session_id,
        url: active.url.clone(),
    })
}

async fn player_update(
    app: AppHandle,
    state: &NativeTorrentState,
    id: &str,
    mut payload: Value,
) -> Result<(), String> {
    let inner = state.inner.lock().await;
    let live = inner
        .active
        .as_ref()
        .is_some_and(|a| a.id == id && !a.cancel.is_cancelled())
        || inner
            .pending
            .get(id)
            .is_some_and(|p| !p.cancel.is_cancelled());
    if !live {
        return Err("Playback closed".into());
    }
    payload["sessionId"] = json!(id);
    app.emit("rainflix:android-player-update", payload)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_native_player_episodes(
    app: AppHandle,
    state: TauriState<'_, NativeTorrentState>,
    session_id: String,
    episodes: Vec<Value>,
    revision: u64,
    season: Option<u32>,
    status: Option<String>,
) -> Result<(), String> {
    player_update(
        app,
        state.inner(),
        &session_id,
        json!({ "kind":"episodes", "episodes":episodes,
        "revision":revision, "season":season, "status":status }),
    )
    .await
}

#[tauri::command]
pub async fn update_native_player_streams(
    app: AppHandle,
    state: TauriState<'_, NativeTorrentState>,
    session_id: String,
    video_id: String,
    request_id: String,
    streams: Vec<Value>,
) -> Result<(), String> {
    player_update(
        app,
        state.inner(),
        &session_id,
        json!({ "kind":"streams", "videoId":video_id,
        "requestId":request_id, "streams":streams }),
    )
    .await
}

#[tauri::command]
pub async fn update_native_player_subtitles(
    app: AppHandle,
    state: TauriState<'_, NativeTorrentState>,
    session_id: String,
    subtitles: Vec<Value>,
    failed: bool,
) -> Result<(), String> {
    player_update(
        app,
        state.inner(),
        &session_id,
        json!({ "kind":"subtitles", "subtitles":subtitles,
        "failed":failed }),
    )
    .await
}

#[tauri::command]
pub async fn load_native_subtitle(
    app: AppHandle,
    state: TauriState<'_, NativeTorrentState>,
    session_id: String,
    id: String,
    url: String,
    label: String,
    lang: String,
) -> Result<(), String> {
    let url = media_url(&url)?;
    player_update(
        app,
        state.inner(),
        &session_id,
        json!({ "kind":"loadSubtitle", "id":id,
        "url":url, "label":label, "lang":lang }),
    )
    .await
}

struct Media {
    token: String,
    torrent: Arc<librqbit::ManagedTorrent>,
    file_idx: usize,
    length: u64,
    content_type: &'static str,
    cancel: CancellationToken,
}

// Graceful HTTP shutdown must also interrupt bodies waiting for absent peers.
struct CancelReader<R> {
    reader: R,
    stopped: Pin<Box<dyn Future<Output = ()> + Send>>,
}

impl<R: AsyncRead + Unpin> AsyncRead for CancelReader<R> {
    fn poll_read(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        let this = self.get_mut();
        if this.stopped.as_mut().poll(cx).is_ready() {
            return Poll::Ready(Err(io::Error::new(io::ErrorKind::Interrupted, STOPPED)));
        }
        Pin::new(&mut this.reader).poll_read(cx, buf)
    }
}

fn requested_range(headers: &HeaderMap, length: u64) -> Result<Option<(u64, u64)>, ()> {
    let mut values = headers.get_all(header::RANGE).iter();
    let Some(value) = values.next() else {
        return Ok(None);
    };
    if values.next().is_some() || length == 0 {
        return Err(());
    }
    let text = value.to_str().map_err(|_| ())?;
    let bytes = text.strip_prefix("bytes=").ok_or(())?;
    let (start, end) = bytes.split_once('-').ok_or(())?;
    let number = |value: &str| -> Result<u64, ()> {
        if value.is_empty() || !value.bytes().all(|b| b.is_ascii_digit()) {
            return Err(());
        }
        value.parse().map_err(|_| ())
    };
    let (start, end) = if start.is_empty() {
        let suffix = number(end)?;
        if suffix == 0 {
            return Err(());
        }
        (length.saturating_sub(suffix), length - 1)
    } else {
        (
            number(start)?,
            if end.is_empty() {
                length - 1
            } else {
                number(end)?.min(length - 1)
            },
        )
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
    if token != media.token || media.cancel.is_cancelled() {
        return StatusCode::NOT_FOUND.into_response();
    }
    let range = match requested_range(&headers, media.length) {
        Ok(range) => range,
        Err(()) => {
            let mut response = StatusCode::RANGE_NOT_SATISFIABLE.into_response();
            response.headers_mut().insert(
                header::CONTENT_RANGE,
                HeaderValue::from_str(&format!("bytes */{}", media.length)).expect("numeric range"),
            );
            response
                .headers_mut()
                .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
            return response;
        }
    };
    let (start, end) = range.unwrap_or((0, media.length - 1));
    let mut response = if method == Method::HEAD {
        Body::empty().into_response()
    } else {
        let mut stream = tokio::select! {
            biased;
            _ = media.cancel.cancelled() => return StatusCode::NOT_FOUND.into_response(),
            result = media.torrent.clone().stream(media.file_idx) => match result {
                Ok(stream) => stream,
                Err(_) => return StatusCode::SERVICE_UNAVAILABLE.into_response(),
            },
        };
        tokio::select! {
            biased;
            _ = media.cancel.cancelled() => return StatusCode::NOT_FOUND.into_response(),
            result = stream.seek(SeekFrom::Start(start)) => if result.is_err() {
                return StatusCode::SERVICE_UNAVAILABLE.into_response();
            },
        }
        let reader = CancelReader {
            reader: stream.take(end - start + 1),
            stopped: Box::pin(media.cancel.clone().cancelled_owned()),
        };
        Body::from_stream(ReaderStream::with_capacity(reader, 65536)).into_response()
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
        HeaderValue::from_str(&(end - start + 1).to_string()).expect("numeric length"),
    );
    if range.is_some() {
        output.insert(
            header::CONTENT_RANGE,
            HeaderValue::from_str(&format!("bytes {start}-{end}/{}", media.length))
                .expect("numeric range"),
        );
    }
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn magnet_validates_hash_and_preserves_tracker_values() {
        assert!(magnet_url("bad", &[]).is_err());
        let tracker = "udp://tracker.example:80/announce?key=A%2FB";
        let magnet = magnet_url(
            &"AB".repeat(20),
            &[format!("tracker:{tracker}"), "dht:ignored".into()],
        )
        .unwrap();
        let parsed = url::Url::parse(&magnet).unwrap();
        let pairs = parsed.query_pairs().collect::<Vec<_>>();
        assert_eq!(pairs[0].1, format!("urn:btih:{}", "ab".repeat(20)));
        assert_eq!(pairs[1].1, tracker);
        assert_eq!(pairs.len(), 2);
    }

    #[test]
    fn single_ranges_and_invalid_ranges() {
        for (text, expected) in [
            ("bytes=0-0", Some((0, 0))),
            ("bytes=5-", Some((5, 9))),
            ("bytes=-3", Some((7, 9))),
            ("bytes=-99", Some((0, 9))),
            ("bytes=2-99", Some((2, 9))),
        ] {
            let mut headers = HeaderMap::new();
            headers.insert(header::RANGE, text.parse().unwrap());
            assert_eq!(requested_range(&headers, 10), Ok(expected));
        }
        for text in [
            "bytes=10-",
            "bytes=4-2",
            "bytes=-0",
            "bytes=0-1,3-4",
            "bytes=+1-2",
            "items=0-1",
        ] {
            let mut headers = HeaderMap::new();
            headers.insert(header::RANGE, text.parse().unwrap());
            assert!(requested_range(&headers, 10).is_err(), "{text}");
        }
    }

    #[test]
    fn stop_before_start_is_bounded_and_remembered() {
        let mut inner = Inner::default();
        inner.remember_stop("before-start");
        inner.remember_stop("before-start");
        assert_eq!(inner.stopped.len(), 1);
        for n in 0..300 {
            inner.remember_stop(&format!("session-{n}"));
        }
        assert_eq!(inner.stopped.len(), 256);
        assert!(inner.stopped.contains(&"session-299".into()));
    }
}
