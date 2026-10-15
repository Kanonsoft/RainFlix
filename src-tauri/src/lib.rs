#[cfg(not(target_os = "android"))]
mod native_torrent;
#[cfg(target_os = "android")]
#[path = "android_torrent.rs"]
mod native_torrent;

use std::sync::Mutex;
#[cfg(not(target_os = "android"))]
use tauri::Emitter;
use tauri::Manager;

#[derive(Default)]
struct AddonInstallLink(Mutex<Option<String>>);

fn install_link(args: impl Iterator<Item = String>) -> Option<String> {
    args.filter(|arg| arg.len() <= 16384).find(|arg| {
        let Ok(url) = url::Url::parse(arg) else {
            return false;
        };
        matches!(url.scheme(), "stremio" | "rainflix")
            && url.host_str().is_some()
            && url.username().is_empty()
            && url.password().is_none()
            && url.fragment().is_none()
            && url.path().ends_with("/manifest.json")
    })
}

#[tauri::command]
fn take_addon_install_link(state: tauri::State<'_, AddonInstallLink>) -> Option<String> {
    state.0.lock().ok()?.take()
}

fn auth_link(value: &str) -> bool {
    let Ok(url) = url::Url::parse(value) else {
        return false;
    };
    value.len() <= 4096
        && url.scheme() == "rainflix"
        && url.host_str() == Some("auth")
        && url.path() == "/callback"
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
        && url.fragment().is_none()
        && url
            .query_pairs()
            .any(|(key, _)| key == "code" || key == "error")
}

fn launch_link(mut args: impl Iterator<Item = String>) -> Option<String> {
    args.find(|arg| auth_link(arg) || install_link(std::iter::once(arg.clone())).is_some())
}

#[cfg(test)]
mod install_link_tests {
    use super::install_link;

    #[test]
    fn auth_callbacks_are_distinct_from_manifests() {
        let valid = "rainflix://auth/callback?code=test&attempt=abc";
        assert!(super::auth_link(valid));
        assert!(install_link([valid.to_string()].into_iter()).is_none());
        assert_eq!(
            super::launch_link([valid.to_string()].into_iter()),
            Some(valid.to_string())
        );
        for value in [
            "https://auth/callback?code=x",
            "rainflix://auth/other?code=x",
            "rainflix://user@auth/callback?code=x",
            "rainflix://auth/callback?code=x#token",
        ] {
            assert!(!super::auth_link(value));
        }
    }

    #[test]
    fn validates_provider_independent_manifest_arguments() {
        for link in [
            "stremio://addon.example/options/manifest.json",
            "rainflix://other.example/manifest.json?key=value",
        ] {
            assert_eq!(
                install_link([link.to_string()].into_iter()),
                Some(link.to_string())
            );
        }
        for link in [
            "https://addon.example/manifest.json",
            "stremio://addon.example/configure",
            "rainflix://user:pass@addon.example/manifest.json",
            "stremio://addon.example/manifest.json#secret",
        ] {
            assert!(install_link([link.to_string()].into_iter()).is_none());
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().manage(AddonInstallLink(Mutex::new(launch_link(
        std::env::args().skip(1),
    ))));
    #[cfg(not(target_os = "android"))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _| {
        if let Some(link) = launch_link(args.into_iter().skip(1)) {
            if let Ok(mut pending) = app.state::<AddonInstallLink>().0.lock() {
                *pending = Some(link);
            }
            let _ = app.emit("rainflix:addon-link", ());
        }
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }));
    #[cfg(target_os = "android")]
    let builder = builder.plugin(tauri_plugin_native_player::init());
    let builder = builder
        .plugin(tauri_plugin_opener::init())
        .manage(native_torrent::NativeTorrentState::default());
    #[cfg(not(target_os = "android"))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        take_addon_install_link,
        native_torrent::start_native_torrent,
        native_torrent::start_native_media,
        native_torrent::preload_native_torrent,
        native_torrent::update_native_preload_status,
        native_torrent::update_native_navigation_status,
        native_torrent::control_native_preload,
        native_torrent::play_native_torrent,
        native_torrent::update_native_player_episodes,
        native_torrent::update_native_player_streams,
        native_torrent::update_native_player_subtitles,
        native_torrent::load_native_subtitle,
        native_torrent::stop_native_torrent
    ]);
    #[cfg(target_os = "android")]
    let builder = builder.invoke_handler(tauri::generate_handler![
        take_addon_install_link,
        native_torrent::start_native_torrent,
        native_torrent::start_native_media,
        native_torrent::preload_native_torrent,
        native_torrent::control_native_preload,
        native_torrent::stop_native_torrent
    ]);
    let app = builder
        .setup(|app| {
            #[cfg(feature = "native-player-smoke")]
            if let Some(media) = std::env::var_os("RAINFLIX_NATIVE_SMOKE_MEDIA") {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(native_torrent::run_player_smoke(handle, media.into()));
            }
            #[cfg(not(feature = "native-player-smoke"))]
            let _ = app;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("RainFlix desktop failed to build");

    app.run(|app, event| {
        if let tauri::RunEvent::Exit = event {
            let state = app.state::<native_torrent::NativeTorrentState>();
            tauri::async_runtime::block_on(state.stop_all());
        }
    });
}
