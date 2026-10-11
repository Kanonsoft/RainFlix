mod native_torrent;

use std::sync::Mutex;
use tauri::{Emitter, Manager};

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

#[cfg(test)]
mod install_link_tests {
    use super::install_link;

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

pub fn run() {
    let app = tauri::Builder::default()
        .manage(AddonInstallLink(Mutex::new(install_link(
            std::env::args().skip(1),
        ))))
        .plugin(tauri_plugin_single_instance::init(|app, args, _| {
            if let Some(link) = install_link(args.into_iter().skip(1)) {
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
        }))
        .plugin(tauri_plugin_opener::init())
        .manage(native_torrent::NativeTorrentState::default())
        .invoke_handler(tauri::generate_handler![
            take_addon_install_link,
            native_torrent::start_native_torrent,
            native_torrent::start_native_media,
            native_torrent::preload_native_torrent,
            native_torrent::update_native_preload_status,
            native_torrent::control_native_preload,
            native_torrent::play_native_torrent,
            native_torrent::update_native_player_episodes,
            native_torrent::update_native_player_streams,
            native_torrent::update_native_player_subtitles,
            native_torrent::load_native_subtitle,
            native_torrent::stop_native_torrent
        ])
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
