//! Android-only player. Torrent ownership and URL resolution stay in the app.
#![allow(non_snake_case)]

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime, State,
};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartPayload {
    pub session_id: String,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub start_at: f64,
    #[serde(default)]
    pub ui: Value,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourcePayload {
    pub session_id: String,
    pub url: String,
    #[serde(default)]
    pub start_at: Option<f64>,
}

pub struct NativePlayer<R: Runtime> {
    #[cfg(target_os = "android")]
    handle: tauri::plugin::PluginHandle<R>,
    #[cfg(not(target_os = "android"))]
    _runtime: std::marker::PhantomData<R>,
}

impl<R: Runtime> NativePlayer<R> {
    pub fn call(&self, command: &str, args: Value) -> Result<Value, String> {
        #[cfg(target_os = "android")]
        {
            self.handle
                .run_mobile_plugin(command, args)
                .map_err(|e| e.to_string())
        }
        #[cfg(not(target_os = "android"))]
        {
            let _ = (command, args);
            Err("Native player is available only on Android".into())
        }
    }

    pub fn set_source(&self, payload: SourcePayload) -> Result<Value, String> {
        validate_session(&payload.session_id)?;
        validate_url(&payload.url)?;
        if let Some(position) = payload.start_at {
            validate_position(position)?;
        }
        self.call(
            "setSource",
            serde_json::to_value(payload).map_err(|e| e.to_string())?,
        )
    }
}

pub trait NativePlayerExt<R: Runtime> {
    fn native_player(&self) -> &NativePlayer<R>;
}
impl<R: Runtime, T: Manager<R>> NativePlayerExt<R> for T {
    fn native_player(&self) -> &NativePlayer<R> {
        self.state::<NativePlayer<R>>().inner()
    }
}

fn validate_session(session: &str) -> Result<(), String> {
    if session.is_empty() || session.len() > 256 {
        return Err("Invalid player session".into());
    }
    Ok(())
}
fn validate_position(position: f64) -> Result<(), String> {
    if !position.is_finite() || position < 0.0 || position > 31_536_000.0 {
        return Err("Invalid resume position".into());
    }
    Ok(())
}
fn validate_url(value: &str) -> Result<(), String> {
    let parsed = url::Url::parse(value).map_err(|_| "Invalid media URL")?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        return Err("Media URL must use HTTP or HTTPS".into());
    }
    Ok(())
}

#[tauri::command]
async fn start<R: Runtime>(
    _app: tauri::AppHandle<R>,
    player: State<'_, NativePlayer<R>>,
    payload: StartPayload,
) -> Result<Value, String> {
    validate_session(&payload.session_id)?;
    validate_position(payload.start_at)?;
    if let Some(url) = &payload.url {
        validate_url(url)?;
    }
    player.call(
        "start",
        serde_json::to_value(payload).map_err(|e| e.to_string())?,
    )
}

#[tauri::command]
async fn stop<R: Runtime>(
    _app: tauri::AppHandle<R>,
    player: State<'_, NativePlayer<R>>,
    session_id: String,
) -> Result<Value, String> {
    validate_session(&session_id)?;
    player.call("stop", serde_json::json!({"sessionId": session_id}))
}

// Updates deliberately retain the frontend's top-level argument shape.
fn request_args(request: tauri::ipc::Request<'_>) -> Result<Value, String> {
    match request.body() {
        tauri::ipc::InvokeBody::Json(value) => Ok(value.clone()),
        _ => Err("Expected JSON arguments".into()),
    }
}
macro_rules! forward {
    ($name:ident, $mobile:literal) => {
        #[tauri::command]
        async fn $name<R: Runtime>(
            _app: tauri::AppHandle<R>,
            player: State<'_, NativePlayer<R>>,
            request: tauri::ipc::Request<'_>,
        ) -> Result<Value, String> {
            let args = request_args(request)?;
            player.call($mobile, args)
        }
    };
}
forward!(update_episodes, "updateEpisodes");
forward!(update_streams, "updateStreams");
forward!(update_subtitles, "updateSubtitles");
forward!(load_subtitle, "loadSubtitle");
// Tauri's mobile listener commands are provided by the Kotlin Plugin base class.
#[tauri::command]
async fn register_listener<R: Runtime>(
    _app: tauri::AppHandle<R>,
    player: State<'_, NativePlayer<R>>,
    event: String,
    handler: tauri::ipc::Channel<Value>,
) -> Result<Value, String> {
    // A typed Channel registers the callback with Tauri's mobile dispatcher.
    // Forwarding its raw JSON string skips that registration and drops events.
    player.call(
        "registerListener",
        serde_json::json!({ "event": event, "handler": handler }),
    )
}
forward!(remove_listener, "removeListener");
forward!(take_install_link, "takeInstallLink");
forward!(set_orientation, "setOrientation");
forward!(update_preload, "updatePreload");
forward!(update_navigation, "updateNavigation");

#[tauri::command]
async fn set_source<R: Runtime>(
    _app: tauri::AppHandle<R>,
    player: State<'_, NativePlayer<R>>,
    request: tauri::ipc::Request<'_>,
) -> Result<Value, String> {
    let payload = serde_json::from_value(request_args(request)?).map_err(|e| e.to_string())?;
    player.set_source(payload)
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("native-player")
        .invoke_handler(tauri::generate_handler![
            start,
            stop,
            set_source,
            update_episodes,
            update_streams,
            update_subtitles,
            load_subtitle,
            register_listener,
            remove_listener,
            take_install_link,
            set_orientation,
            update_preload,
            update_navigation
        ])
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            let player = NativePlayer {
                handle: api
                    .register_android_plugin("com.rainflix.nativeplayer", "NativePlayerPlugin")?,
            };
            #[cfg(not(target_os = "android"))]
            let player = {
                let _ = api;
                NativePlayer {
                    _runtime: std::marker::PhantomData::<R>,
                }
            };
            app.manage(player);
            Ok(())
        })
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pending_start_and_wire_shape() {
        let pending: StartPayload =
            serde_json::from_value(serde_json::json!({"sessionId":"test", "ui":{}})).unwrap();
        assert!(pending.url.is_none());
        assert_eq!(serde_json::to_value(pending).unwrap()["startAt"], 0.0);
    }
    #[test]
    fn rejects_invalid_urls_and_samples() {
        for url in [
            "file:///tmp/video",
            "intent://x",
            "magnet:?xt=x",
            "not a URL",
        ] {
            assert!(validate_url(url).is_err());
        }
        assert!(validate_url("http://127.0.0.1:1234/stream").is_ok());
        assert!(validate_url("https://example.com/movie.m3u8?token=x").is_ok());
        assert!(validate_position(f64::NAN).is_err());
        assert!(validate_position(-1.0).is_err());
        assert!(validate_session("").is_err());
    }
}
