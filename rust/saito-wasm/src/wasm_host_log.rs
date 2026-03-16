use log::{Level, Log, Metadata, Record};

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::JsValue;

#[cfg(target_arch = "wasm32")]
use web_sys::console;

pub struct WasmLogger;

impl Log for WasmLogger {
    fn enabled(&self, metadata: &Metadata) -> bool {
        metadata.level() <= log::max_level()
    }

    fn log(&self, record: &Record) {
        if self.enabled(record.metadata()) {
            emit_log(record);
        }
    }

    fn flush(&self) {}
}

#[cfg(target_arch = "wasm32")]
pub(crate) struct Style<'s> {
    pub trace: &'s str,
    pub debug: &'s str,
    pub info: &'s str,
    pub warn: &'s str,
    pub error: &'s str,
    pub file_line: &'s str,
    pub text: &'s str,
}

#[cfg(target_arch = "wasm32")]
impl Style<'static> {
    pub const fn default() -> Self {
        macro_rules! bg_color {
            ($color:expr) => {
                concat!("color: white; padding: 0 3px; background: ", $color, ";")
            };
        }

        Style {
            trace: bg_color!("gray"),
            debug: bg_color!("blue"),
            info: bg_color!("green"),
            warn: bg_color!("orange"),
            error: bg_color!("darkred"),
            file_line: "font-weight: bold; color: inherit",
            text: "background: inherit; color: inherit",
        }
    }
}

#[cfg(target_arch = "wasm32")]
const STYLE: Style<'static> = Style::default();

pub fn init_logging(level: Level) {
    log::set_logger(&WasmLogger).unwrap();
    log::set_max_level(level.to_level_filter());
}

#[cfg(target_arch = "wasm32")]
pub fn emit_log(record: &Record) {
    let console_log = match record.level() {
        Level::Error => console::error_4,
        Level::Warn => console::warn_4,
        Level::Info => console::info_4,
        Level::Debug => console::debug_4,
        Level::Trace => console::debug_4,
    };

    let message = JsValue::from(format!("%c{}\t|%c%c{}", record.level(), record.args()));
    let level_style = JsValue::from(match record.level() {
        Level::Trace => STYLE.trace,
        Level::Debug => STYLE.debug,
        Level::Info => STYLE.info,
        Level::Warn => STYLE.warn,
        Level::Error => STYLE.error,
    });
    let file_line_style = JsValue::from_str(STYLE.file_line);
    let text_style = JsValue::from_str(STYLE.text);

    console_log(&message, &level_style, &file_line_style, &text_style);
}

#[cfg(not(target_arch = "wasm32"))]
pub fn emit_log(record: &Record) {
    eprintln!("{}\t|{}", record.level(), record.args());
}
