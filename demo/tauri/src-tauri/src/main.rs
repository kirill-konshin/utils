// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Builder, Manager, Url};

fn main() {

    let context = tauri::generate_context!();

//     let url = (&format!("http://localhost:{}", 5555));
//     context.config_mut().build.frontend_dist = Option::Some(url.clone());

    Builder::default()
        .plugin(tauri_plugin_localhost::Builder::new(5555).build()) // Updated plugin syntax
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(move |app| {
            {
//                 app.ipc_scope().configure_remote_access(
//                   RemoteDomainAccessScope::new("localhost")
//                     .add_window("main")
//                 );

                let main_window = app.get_webview_window("main").unwrap();

                let url = Url::parse(&format!("http://localhost:{}", 5555)).expect("Invalid URL");
                // let url = format!("http://localhost:{}", port).parse().unwrap();

//                 main_window.navigate(url.clone()).expect("Failed to navigate");
                main_window
                    .eval(&format!("window.location.replace('{}'); alert('1')", url))
                    .expect("Failed to set URL");

                main_window.open_devtools();
            }
            Ok(())
        })
        .run(context)
        .expect("error while running Tauri application");
}