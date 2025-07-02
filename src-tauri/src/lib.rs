use std::{sync::Mutex, thread::sleep, time::Duration};

use marvelmind as mm;
use tauri::{async_runtime::spawn, AppHandle, Emitter, Manager};

macro_rules! unwrap_or_return {
    ( $e:expr, $app:expr ) => {
        match $e {
            Ok(x) => x,
            Err(err) => {
                send_log($app, err.to_string());
                return;
            }
        }
    };
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct TRDevice {
    address: u8,
    is_hedge: bool,
    x: f64,
    y: f64,
    q: u8,
}

#[derive(Debug)]
struct AppState {
    is_mmrunning: bool,
    devices: Vec<TRDevice>,
}

fn mmrun(app: AppHandle) {
    let state = app.state::<Mutex<AppState>>();

    unwrap_or_return!(mm::open_port(5), app.clone());
    let mut device_list = unwrap_or_return!(mm::get_device_list(), app.clone());

    let mut state_lock = state.lock().unwrap();

    for device in device_list.devices() {
        state_lock.devices.push(TRDevice {
            address: device.address(),
            is_hedge: matches!(
                device.dtype(),
                mm::DeviceType::SuperBeaconHedgedog
                    | mm::DeviceType::BeaconHwV45Hedgehog
                    | mm::DeviceType::BeaconHwV49Hedgehog
                    | mm::DeviceType::IndustrialSuperBeaconHedgedog
            ),
            x: device.x() as f64 / 1000.0,
            y: device.y() as f64 / 1000.0,
            q: device.q(),
        });
    }

    drop(state_lock);

    loop {
        unwrap_or_return!(device_list.update_last_locations(), app.clone());

        let mut state_lock = state.lock().unwrap();

        for device in device_list.devices() {
            if device.q() > 0 {
                if let Some(tr_device) = state_lock
                    .devices
                    .iter_mut()
                    .find(|d| d.address == device.address())
                {
                    tr_device.x = device.x() as f64 / 1000.0;
                    tr_device.y = device.y() as f64 / 1000.0;
                    tr_device.q = device.q();
                };
            }
        }

        sleep(Duration::from_millis(1));
    }
}

#[tauri::command]
fn mmstart(app: AppHandle) {
    let state = app.state::<Mutex<AppState>>();
    let mut state = state.lock().unwrap();

    if state.is_mmrunning {
        return;
    }
    state.is_mmrunning = true;

    spawn({
        let app = app.clone();
        async move {
            mmrun(app);
        }
    });
}

#[tauri::command]
fn send_log(app: AppHandle, msg: String) {
    app.emit("log-message", &msg).unwrap();
}

#[tauri::command]
fn read_devices(app: AppHandle) -> Vec<TRDevice> {
    let state = app.state::<Mutex<AppState>>();
    let state = state.lock().unwrap();

    state.devices.clone()
}

pub fn run() {
    let mut builder = tauri::Builder::default();

    builder = builder.plugin(tauri_plugin_single_instance::init(|_, _, _| {}));
    #[cfg(not(debug_assertions))]
    {
        builder = builder.plugin(tauri_plugin_prevent_default::init());
    }

    builder = builder.setup(|app| {
        #[cfg(debug_assertions)]
        {
            let window = app.get_webview_window("main").unwrap();
            window.open_devtools();
        }

        app.manage(Mutex::new(AppState {
            is_mmrunning: false,
            devices: Vec::<TRDevice>::new(),
        }));

        // prevent pinch zoom by touchpad
        #[cfg(target_os = "linux")]
        {
            use gtk::glib::ObjectExt;
            use gtk::GestureZoom;
            use webkit2gtk::glib::gobject_ffi;

            let window = app.get_webview_window("main").unwrap();
            window
                .with_webview(|webview| unsafe {
                    if let Some(data) = webview.inner().data::<GestureZoom>("wk-view-zoom-gesture")
                    {
                        gobject_ffi::g_signal_handlers_destroy(data.as_ptr().cast());
                    }
                })
                .unwrap();
        }

        Ok(())
    });

    builder = builder.invoke_handler(tauri::generate_handler![mmstart, send_log, read_devices]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
