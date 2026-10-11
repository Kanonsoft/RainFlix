const COMMANDS: &[&str] = &[
    "start",
    "stop",
    "set_source",
    "update_episodes",
    "update_streams",
    "update_subtitles",
    "load_subtitle",
    "register_listener",
    "remove_listener",
    "take_install_link",
    "set_orientation",
    "update_preload",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
