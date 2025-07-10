// Copyright 2025 wyzdwdz <wyzdwdz@gmail.com>
//
// Licensed under the MIT license <LICENSE or https://opensource.org/licenses/MIT>.
// This file may not be copied, modified, or distributed except according to
// those terms.

use std::{
    fs::File,
    io::Write,
    path::PathBuf,
    sync::Mutex,
    thread::sleep,
    time::{Duration, SystemTime},
};

use anyhow::{Context, Error, Result};
use ini::Ini;
use marvelmind as mm;
use tauri::{async_runtime::spawn, AppHandle, Emitter, Manager};

const LOG_PATH: &str = "log.csv";

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

#[derive(Debug, Default, Clone, serde::Serialize, serde::Deserialize)]
struct TRDevice {
    address: u8,
    is_hedge: bool,
    x: f64,
    y: f64,
    q: u8,
}

#[derive(Debug, Default, serde::Serialize, serde::Deserialize)]
struct TRPlan {
    x: f64,
    y: f64,
    scale_pixels_per_m: f64,
    data: Vec<u8>,
    ext: String,
}

#[derive(Debug)]
struct AppState {
    is_mmrunning: bool,
    devices: Vec<TRDevice>,
    savefile: Option<File>,
}

fn mmrun(app: AppHandle) {
    let state = app.state::<Mutex<AppState>>();

    unwrap_or_return!(mm::open_port(5), app.clone());
    let mut device_list = unwrap_or_return!(mm::get_device_list(), app.clone());

    let mut state_lock = state.lock().unwrap();

    for device in device_list.devices() {
        let tr_device = TRDevice {
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
        };

        state_lock.devices.push(tr_device);
    }

    drop(state_lock);

    let mut prev_time = SystemTime::UNIX_EPOCH;

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

                if let Some(savefile) = &mut state_lock.savefile {
                    if !matches!(
                        device.dtype(),
                        mm::DeviceType::SuperBeaconHedgedog
                            | mm::DeviceType::BeaconHwV45Hedgehog
                            | mm::DeviceType::BeaconHwV49Hedgehog
                            | mm::DeviceType::IndustrialSuperBeaconHedgedog
                    ) {
                        continue;
                    }

                    if device.update_time() <= prev_time {
                        continue;
                    }

                    savefile
                        .write(
                            format!(
                                "{},{},{},{},{},{}\n",
                                device.address(),
                                device.x(),
                                device.y(),
                                device.z(),
                                device.q(),
                                device
                                    .update_time()
                                    .duration_since(SystemTime::UNIX_EPOCH)
                                    .unwrap()
                                    .as_millis(),
                            )
                            .as_bytes(),
                        )
                        .unwrap();

                    prev_time = device.update_time();
                }
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

#[tauri::command]
fn parse_map(app: AppHandle, path: String) -> (Vec<TRDevice>, Option<TRPlan>) {
    let Ok((devices, plan)) = parse_ini(path) else {
        send_log(app, "failed to parse ini map file".into());
        return (Vec::<TRDevice>::new(), None);
    };

    (devices, Some(plan))
}

#[tauri::command]
fn start_record(app: AppHandle) {
    let state = app.state::<Mutex<AppState>>();
    let mut state = state.lock().unwrap();

    state.savefile = Some(File::create(LOG_PATH).unwrap());
    if let Some(savefile) = &mut state.savefile {
        savefile.write("address,x,y,z,q,t\n".as_bytes()).unwrap();
    }
}

#[tauri::command]
fn stop_record(app: AppHandle) {
    let state = app.state::<Mutex<AppState>>();
    let mut state = state.lock().unwrap();

    state.savefile = None;
}

fn parse_ini(path: String) -> Result<(Vec<TRDevice>, TRPlan), Error> {
    let mut plan = TRPlan::default();
    let ini = Ini::load_from_file_noescape(path)?;

    let floorplan = ini
        .section(Some("floorplan"))
        .context("no section: [floorplan]")?;

    plan.x = floorplan
        .get("shift_x_m")
        .context("no value: shift_x_m")?
        .parse::<f64>()?;
    plan.y = floorplan
        .get("shift_y_m")
        .context("no value: shift_y_m")?
        .parse::<f64>()?;
    plan.scale_pixels_per_m = floorplan
        .get("scale_pixels_per_m")
        .context("no value: scale_pixels_per_m")?
        .parse::<f64>()?;

    for (key, value) in floorplan {
        if key.starts_with("Floor") {
            plan.data = std::fs::read(value)?;
            plan.ext = PathBuf::from(value)
                .extension()
                .context("failed to read extension")?
                .to_str()
                .context("failed to convert extension")?
                .into();

            break;
        }
    }
    if plan.data.is_empty() {
        return Err(Error::msg("no value: FloorX_FILE"));
    }

    let mut devices = Vec::<TRDevice>::new();

    let tr_devices = ini
        .section(Some("devices"))
        .context("no section: [devices]")?;

    for (key, value) in tr_devices {
        if !key.starts_with("beacon") {
            continue;
        }

        if value.parse::<u32>()? != 1 {
            continue;
        }

        let index = &key[6..];

        let beacon = ini
            .section(Some(format!("beacon {}", index)))
            .context(format!("no section: [beacon {}]", index))?;

        if beacon
            .get("Hedgehog_mode")
            .context("no value: Hedgehog_mode")?
            != "0"
        {
            continue;
        }

        let device = TRDevice {
            x: beacon
                .get("Position_X")
                .context("no value: Position_X")?
                .parse::<f64>()?,
            y: beacon
                .get("Position_Y")
                .context("no value: Position_Y")?
                .parse::<f64>()?,
            address: index.parse::<u8>()?,
            is_hedge: false,
            q: 0,
        };

        devices.push(device);
    }

    Ok((devices, plan))
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
            savefile: None,
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

    builder = builder.invoke_handler(tauri::generate_handler![
        mmstart,
        send_log,
        read_devices,
        start_record,
        stop_record,
        parse_map
    ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
