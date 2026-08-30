use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

static CHILD: Mutex<Option<Child>> = Mutex::new(None);
static RUNNING: AtomicBool = AtomicBool::new(false);

#[cfg(target_os = "windows")]
static CHILD_JOB: Mutex<Option<win32job::Job>> = Mutex::new(None);

#[cfg(target_os = "windows")]
fn assign_child_to_job(child: &Child) -> Result<(), String> {
    use std::os::windows::io::AsRawHandle;
    let job = win32job::Job::create().map_err(|e| e.to_string())?;
    let mut info = job.query_extended_limit_info().map_err(|e| e.to_string())?;
    info.limit_kill_on_job_close();
    job.set_extended_limit_info(&info)
        .map_err(|e| e.to_string())?;
    job.assign_process(child.as_raw_handle() as isize)
        .map_err(|e| e.to_string())?;
    *CHILD_JOB.lock().unwrap_or_else(|e| e.into_inner()) = Some(job);
    Ok(())
}

#[cfg(target_os = "windows")]
fn release_child_job() {
    *CHILD_JOB.lock().unwrap_or_else(|e| e.into_inner()) = None;
}

pub fn is_busy() -> bool {
    RUNNING.load(Ordering::SeqCst)
}

/// Spawn sd-cli and wait, emitting console-line. Returns (ExitStatus, was_running).
pub fn spawn_sd_process(mut cmd: Command, app: &AppHandle) -> Result<(std::process::ExitStatus, bool), String> {
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd.spawn().map_err(|e| format!("No se pudo lanzar sd-cli: {}", e))?;

    #[cfg(target_os = "windows")]
    if let Err(e) = assign_child_to_job(&child) {
        let _ = child.kill();
        return Err(e);
    }

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    RUNNING.store(true, Ordering::SeqCst);
    *CHILD.lock().unwrap_or_else(|e| e.into_inner()) = Some(child);

    let app_stdout = app.clone();
    let app_stderr = app.clone();

    let t_stdout = std::thread::spawn(move || {
        if let Some(stdout) = stdout {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                if !RUNNING.load(Ordering::SeqCst) {
                    break;
                }
                match line {
                    Ok(l) => {
                        let _ = app_stdout.emit("console-line", &l);
                    }
                    Err(e) => {
                        let _ = app_stdout.emit("console-line", format!("[ERROR] pipe: {}", e));
                    }
                }
            }
        }
    });

    let t_stderr = std::thread::spawn(move || {
        if let Some(stderr) = stderr {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if !RUNNING.load(Ordering::SeqCst) {
                    break;
                }
                match line {
                    Ok(l) => {
                        let _ = app_stderr.emit("console-line", &l);
                    }
                    Err(e) => {
                        let _ = app_stderr.emit("console-line", format!("[ERROR] pipe: {}", e));
                    }
                }
            }
        }
    });

    // Poll with 10ms instead of 1s (near-blocking, allows abort)
    let status = loop {
        {
            let mut guard = CHILD.lock().unwrap_or_else(|e| e.into_inner());
            match guard.as_mut() {
                Some(child) => match child.try_wait() {
                    Ok(Some(exit)) => break Ok(exit),
                    Ok(None) => {}
                    Err(e) => break Err(e.to_string()),
                },
                None => break Err("No hay proceso hijo".to_string()),
            }
        }
        std::thread::sleep(Duration::from_millis(10));
    };

    let was_running = RUNNING.swap(false, Ordering::SeqCst);
    *CHILD.lock().unwrap_or_else(|e| e.into_inner()) = None;
    #[cfg(target_os = "windows")]
    release_child_job();

    let _ = t_stdout.join();
    let _ = t_stderr.join();

    match status {
        Ok(exit) => Ok((exit, was_running)),
        Err(e) => Err(e),
    }
}

pub fn abort_process(app: &AppHandle) -> Result<(), String> {
    RUNNING.store(false, Ordering::SeqCst);
    let mut guard = CHILD.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(child) = guard.as_mut() {
        let _ = child.kill();
        let _ = app.emit("console-line", "[ABORTADO] Terminando proceso...");
    }
    Ok(())
}
