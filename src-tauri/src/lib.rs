/// Avvio dell'app desktop. Tutta la logica dell'applicazione vive nel frontend web (cartella `src/`):
/// questo guscio fornisce solo la finestra e le finestre di dialogo native per salvare i file.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("errore durante l'avvio di Quattrino");
}
