//! Compatibility FFmpeg launcher for the native-engine migration boundary.
//! The production media path is the Node control plane in `server/ffmpeg.ts`.
//! This binary does not compose scenes and accepts only one audio input.
use anyhow::{bail, Context, Result};
use serde::Deserialize;
use std::{env, fs, process::{Command, Stdio}};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Config {
    video: Video,
    #[serde(default)] audio: Audio,
    capture: Capture,
    recording: Recording,
    #[serde(default)] destinations: Vec<Destination>,
}
#[derive(Debug, Deserialize)] #[serde(rename_all="camelCase")]
struct Video { width:u32,height:u32,fps:u32,bitrate_kbps:u32,keyframe_seconds:u32,encoder:String,preset:String }
fn default_volume() -> f32 { 1.0 }
fn default_bitrate() -> u32 { 160 }
fn default_rate() -> u32 { 48_000 }
#[derive(Debug, Deserialize)] #[serde(rename_all="camelCase")]
struct AudioSource { #[serde(default)] enabled: bool, #[serde(default)] muted: bool, #[serde(default="default_volume")] volume: f32, #[serde(default)] device: String, #[serde(default)] kind: String }
#[derive(Debug, Deserialize)] #[serde(rename_all="camelCase")]
struct Audio { #[serde(default)] enabled: bool, #[serde(default)] device: String, #[serde(default="default_bitrate")] bitrate_kbps: u32, #[serde(default="default_rate")] sample_rate: u32, #[serde(default="default_volume")] volume: f32, #[serde(default)] sources: Vec<AudioSource> }
impl Default for Audio { fn default() -> Self { Self { enabled: false, device: String::new(), bitrate_kbps: 160, sample_rate: 48_000, volume: 1.0, sources: Vec::new() } } }
struct ChosenAudio { kind: String, device: String, volume: f32 }
#[derive(Debug, Deserialize)] #[serde(rename_all="camelCase")]
struct Capture { kind:String,display:String,window_title:String,device:String }
#[derive(Debug, Deserialize)] #[serde(rename_all="camelCase")]
struct Recording { enabled:bool,directory:String,format:String }
#[derive(Debug, Deserialize)] #[serde(rename_all="camelCase")]
struct Destination { enabled:bool,url:String,stream_key:String }

fn main() -> Result<()> {
    let mut args = env::args().skip(1);
    let action = args.next().unwrap_or_else(|| "help".into());
    if action == "help" {
        println!("litecast-engine run|print <config.json>\nLaunches one FFmpeg process. Scene composition and multi-source mixing stay in the Node control plane.");
        return Ok(());
    }
    let file = args.next().context("config file path is required")?;
    let config: Config = serde_json::from_str(&fs::read_to_string(&file).with_context(|| format!("read {file}"))?).context("parse config")?;
    validate(&config)?;
    let ffargs = build_args(&config)?;
    if action == "print" {
        println!("ffmpeg {}", ffargs.iter().map(|s| shell(s)).collect::<Vec<_>>().join(" "));
        return Ok(());
    }
    if action != "run" { bail!("unknown action: {action}"); }
    let ffmpeg = env::var("FFMPEG_PATH").unwrap_or_else(|_| "ffmpeg".into());
    let status = Command::new(ffmpeg).args(&ffargs).stdin(Stdio::inherit()).stdout(Stdio::inherit()).stderr(Stdio::inherit()).status().context("start FFmpeg")?;
    if !status.success() { bail!("FFmpeg exited with {status}"); }
    Ok(())
}

fn validate(c: &Config) -> Result<()> {
    if c.video.width < 320 || c.video.height < 240 || c.video.fps == 0 || c.video.bitrate_kbps < 250 { bail!("invalid video settings"); }
    if !["nvenc", "qsv", "amf", "software"].contains(&c.video.encoder.as_str()) { bail!("unsupported encoder"); }
    if !c.recording.enabled && !c.destinations.iter().any(|d| d.enabled && !d.url.is_empty() && !d.stream_key.is_empty()) { bail!("no output enabled"); }
    Ok(())
}

fn capture(c: &Config) -> Vec<String> {
    let mut a = Vec::new();
    if cfg!(target_os = "windows") {
        a.extend(["-f", if c.capture.kind == "device" { "dshow" } else { "gdigrab" }, "-framerate", &c.video.fps.to_string()].into_iter().map(String::from));
        a.push("-i".into());
        if c.capture.kind == "window" && !c.capture.window_title.is_empty() { a.push(format!("title={}", c.capture.window_title)); }
        else if c.capture.kind == "device" && !c.capture.device.is_empty() { a.push(format!("video={}", c.capture.device)); }
        else { a.push("desktop".into()); }
    } else if cfg!(target_os = "macos") {
        a.extend(["-f".into(), "avfoundation".into(), "-framerate".into(), c.video.fps.to_string(), "-i".into(), if c.capture.device.is_empty() { "1:none".into() } else { c.capture.device.clone() }]);
    } else {
        a.extend(["-f".into(), "x11grab".into(), "-framerate".into(), c.video.fps.to_string(), "-video_size".into(), format!("{}x{}", c.video.width, c.video.height), "-i".into(), if c.capture.display.is_empty() { ":0.0".into() } else { c.capture.display.clone() }]);
    }
    a
}

fn choose_audio(c: &Config) -> Result<Option<ChosenAudio>> {
    if !c.audio.sources.is_empty() {
        let active: Vec<&AudioSource> = c.audio.sources.iter().filter(|s| s.enabled && !s.muted && !s.device.is_empty() && (s.kind == "microphone" || s.kind == "desktop")).collect();
        if active.len() > 1 { bail!("litecast-engine accepts one audio input. The Node control plane mixes multiple sources."); }
        if let Some(s) = active.first() {
            if s.kind == "desktop" && !(cfg!(target_os = "windows") || cfg!(target_os = "linux")) { bail!("desktop audio is not available in litecast-engine on this platform"); }
            return Ok(Some(ChosenAudio { kind: s.kind.clone(), device: s.device.clone(), volume: s.volume }));
        }
        return Ok(None);
    }
    if c.audio.enabled && !c.audio.device.is_empty() { return Ok(Some(ChosenAudio { kind: "microphone".into(), device: c.audio.device.clone(), volume: c.audio.volume })); }
    Ok(None)
}
fn push_audio(a: &mut Vec<String>, audio: &ChosenAudio) {
    if audio.kind == "desktop" && cfg!(target_os = "windows") { a.extend(["-f".into(), "wasapi".into(), "-loopback".into(), "1".into(), "-i".into(), audio.device.clone()]); return; }
    if cfg!(target_os = "windows") { a.extend(["-f".into(), "dshow".into(), "-i".into(), format!("audio={}", audio.device)]); }
    else if cfg!(target_os = "macos") { a.extend(["-f".into(), "avfoundation".into(), "-i".into(), format!("none:{}", audio.device)]); }
    else { a.extend(["-f".into(), "pulse".into(), "-i".into(), audio.device.clone()]); }
}
fn build_args(c: &Config) -> Result<Vec<String>> {
    let mut a = vec!["-hide_banner".into(), "-stats".into()];
    a.extend(capture(c));
    let audio = choose_audio(c)?;
    if let Some(audio) = &audio { push_audio(&mut a, audio); }
    a.extend(["-vf".into(), format!("scale={}:{},format=yuv420p", c.video.width, c.video.height), "-r".into(), c.video.fps.to_string()]);
    match c.video.encoder.as_str() {
        "nvenc" => a.extend(["-c:v".into(), "h264_nvenc".into(), "-preset".into(), if c.video.preset == "quality" { "p6".into() } else if c.video.preset == "performance" { "p1".into() } else { "p4".into() }]),
        "qsv" => a.extend(["-c:v".into(), "h264_qsv".into()]),
        "amf" => a.extend(["-c:v".into(), "h264_amf".into()]),
        _ => a.extend(["-c:v".into(), "libx264".into(), "-preset".into(), "veryfast".into()]),
    }
    a.extend(["-b:v".into(), format!("{}k", c.video.bitrate_kbps), "-g".into(), (c.video.fps * c.video.keyframe_seconds).to_string()]);
    if let Some(audio) = &audio { a.extend(["-af".into(), format!("volume={:.3}", audio.volume), "-c:a".into(), "aac".into(), "-b:a".into(), format!("{}k", c.audio.bitrate_kbps), "-ar".into(), c.audio.sample_rate.to_string()]); }
    else { a.push("-an".into()); }
    let mut sinks = Vec::new();
    for d in c.destinations.iter().filter(|d| d.enabled && !d.url.is_empty() && !d.stream_key.is_empty()) { sinks.push(format!("[f=flv:onfail=ignore]{}/{}", d.url.trim_end_matches('/'), d.stream_key)); }
    if c.recording.enabled { sinks.push(format!("[f={}:onfail=ignore]{}/litecast-recording.{}", if c.recording.format == "mkv" { "matroska" } else { "mp4" }, c.recording.directory, c.recording.format)); }
    a.extend(["-f".into(), "tee".into(), sinks.join("|")]);
    Ok(a)
}

fn shell(s: &str) -> String { if s.chars().all(|c| c.is_ascii_alphanumeric() || "_./:-=".contains(c)) { s.into() } else { format!("{:?}", s) } }
