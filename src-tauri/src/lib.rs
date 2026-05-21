use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
    WebviewWindowBuilder,
};
use tauri_plugin_autostart::MacosLauncher;

#[tauri::command]
fn execute_applescript(script: String) -> Result<String, String> {
    let output = std::process::Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
fn execute_shell(command: String) -> Result<String, String> {
    let output = std::process::Command::new("sh")
        .arg("-c")
        .arg(&command)
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
fn record_audio(duration_secs: u64) -> Result<String, String> {
    let output = std::process::Command::new("sh")
        .arg("-c")
        .arg(format!(
            "sox -d -r 16000 -c 1 -t wav /tmp/jarvis_rec.wav trim 0 {} 2>/dev/null && base64 -i /tmp/jarvis_rec.wav",
            duration_secs
        ))
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![])))
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            execute_applescript,
            execute_shell,
            record_audio
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let current_dir = std::env::current_dir().unwrap();
            let python = current_dir.join("jarvis-wake/bin/python3");
            let wake_script = current_dir.join("wake.py");
            std::process::Command::new(python)
                .arg(wake_script)
                .spawn()
                .ok();

            let _win = WebviewWindowBuilder::new(
                app,
                "primary",
                tauri::WebviewUrl::External("http://localhost:3000".parse().unwrap()),
            )
            .title("JARVIS")
            .inner_size(1280.0, 800.0)
            .resizable(true)
            .devtools(true)
            .initialization_script(r#"
                Object.defineProperty(window, '__TAURI_INVOKE__', {
                    get: function() {
                        return function(cmd, args) {
                            return window.__TAURI_INTERNALS__.invoke(cmd, args);
                        };
                    }
                });

                if (!navigator.mediaDevices) {
                    Object.defineProperty(navigator, 'mediaDevices', {
                        value: {
                            getUserMedia: (c) => new Promise((res, rej) => {
                                if (navigator.webkitGetUserMedia) {
                                    navigator.webkitGetUserMedia(c, res, rej);
                                } else {
                                    rej(new Error('Media not supported'));
                                }
                            }),
                            enumerateDevices: () => Promise.resolve([])
                        }
                    });
                }

                // Request mic + camera permissions immediately on load
                setTimeout(() => {
                    navigator.mediaDevices?.getUserMedia({ audio: true, video: true })
                        .then(() => console.log('[JARVIS] Media permissions granted'))
                        .catch(e => console.log('[JARVIS] Media permission error:', e.message));
                }, 2000);
            "#)
            .build()?;

            let quit = MenuItem::with_id(app, "quit", "Quit JARVIS", true, None::<&str>)?;
            let show = MenuItem::with_id(app, "show", "Show JARVIS", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "show" => {
                        if let Some(win) = app.get_webview_window("primary") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}