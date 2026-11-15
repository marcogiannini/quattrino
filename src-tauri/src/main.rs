// Evita la finestra di console aggiuntiva su Windows nella versione di rilascio.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    quattrino_lib::run()
}
