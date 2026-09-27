use anyhow::{bail, Context, Result};
use serde::Deserialize;
use std::{env, fs, process::{Command, Stdio}};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Config {
    video: Video,
    #[serde(default)]
    audio: Audio,
    capture: Capture,
    recording: Recording,
    #[serde(default)]
    destinations: Vec<Destination>,
}
#[derive(Debug, Deserialize)] #[serde(rename_all="camelCase")]
struct Video { width:u32,height:u32,fps:u32,bitrate_kbps:u32,keyframe_seconds:u32,encoder:String,preset:String }
#[derive(Debug, Default, Deserialize)] #[serde(rename_all="camelCase")]
struct Audio { enabled:bool,device:String,bitrate_kbps:u32,sample_rate:u32 }
#[derive(Debug, Deserialize)] #[serde(rename_all="camelCase")]
struct Capture { kind:String,display:String,window_title:String,device:String }
#[derive(Debug, Deserialize)] #[serde(rename_all="camelCase")]
struct Recording { enabled:bool,directory:String,format:String }
#[derive(Debug, Deserialize)] #[serde(rename_all="camelCase")]
struct Destination { enabled:bool,url:String,stream_key:String }

fn main() -> Result<()> {
    let mut args=env::args().skip(1); let action=args.next().unwrap_or_else(||"help".into());
    if action=="help" { println!("litecast-engine run|print <config.json>\nRuns FFmpeg using a validated LiteCast config."); return Ok(()); }
    let file=args.next().context("config file path is required")?; let config:Config=serde_json::from_str(&fs::read_to_string(&file).with_context(||format!("read {file}"))?).context("parse config")?;
    validate(&config)?; let ffargs=build_args(&config)?;
    if action=="print" { println!("ffmpeg {}",ffargs.iter().map(|s|shell(s)).collect::<Vec<_>>().join(" ")); return Ok(()); }
    if action!="run" { bail!("unknown action: {action}"); }
    let ffmpeg=env::var("FFMPEG_PATH").unwrap_or_else(|_|"ffmpeg".into());
    let status=Command::new(ffmpeg).args(&ffargs).stdin(Stdio::inherit()).stdout(Stdio::inherit()).stderr(Stdio::inherit()).status().context("start FFmpeg")?;
    if !status.success(){bail!("FFmpeg exited with {status}");} Ok(())
}
fn validate(c:&Config)->Result<()> { if c.video.width<320||c.video.height<240||c.video.fps==0||c.video.bitrate_kbps<250{bail!("invalid video settings");} if !["nvenc","qsv","amf","software"].contains(&c.video.encoder.as_str()){bail!("unsupported encoder");} if !c.recording.enabled&&!c.destinations.iter().any(|d|d.enabled&&!d.url.is_empty()&&!d.stream_key.is_empty()){bail!("no output enabled");} Ok(()) }
fn capture(c:&Config)->Vec<String>{ let fps=c.video.fps.to_string(); if cfg!(target_os="windows"){if c.capture.kind=="window"&&!c.capture.window_title.is_empty(){vec!["-f","gdigrab","-framerate",&fps,"-i",&format!("title={}",c.capture.window_title)].into_iter().map(str::to_string).collect()}else if c.capture.kind=="device"&&!c.capture.device.is_empty(){vec!["-f","dshow","-framerate",&fps,"-i",&format!("video={}",c.capture.device)].into_iter().map(str::to_string).collect()}else{vec!["-f","gdigrab","-framerate",&fps,"-i","desktop"].into_iter().map(str::to_string).collect()}}else if cfg!(target_os="macos"){vec!["-f".into(),"avfoundation".into(),"-framerate".into(),fps,"-i".into(),if c.capture.device.is_empty(){"1:none".into()}else{c.capture.device.clone()}]}else{vec!["-f".into(),"x11grab".into(),"-framerate".into(),fps,"-video_size".into(),format!("{}x{}",c.video.width,c.video.height),"-i".into(),if c.capture.display.is_empty(){":0.0".into()}else{c.capture.display.clone()}]}}
fn build_args(c:&Config)->Result<Vec<String>>{let mut a=vec!["-hide_banner".into(),"-stats".into()];a.extend(capture(c));if c.audio.enabled&&!c.audio.device.is_empty(){if cfg!(target_os="windows"){a.extend(["-f","dshow","-i",&format!("audio={}",c.audio.device)].map(String::from));}else if cfg!(target_os="macos"){a.extend(["-f".into(),"avfoundation".into(),"-i".into(),format!("none:{}",c.audio.device)]);}else{a.extend(["-f".into(),"pulse".into(),"-i".into(),c.audio.device.clone()]);}}
 a.extend(["-vf".into(),format!("scale={}:{},format=yuv420p",c.video.width,c.video.height),"-r".into(),c.video.fps.to_string()]);
 match c.video.encoder.as_str(){"nvenc"=>a.extend(["-c:v".into(),"h264_nvenc".into(),"-preset".into(),if c.video.preset=="quality"{"p6".into()}else if c.video.preset=="performance"{"p1".into()}else{"p4".into()}]),"qsv"=>a.extend(["-c:v".into(),"h264_qsv".into()]),"amf"=>a.extend(["-c:v".into(),"h264_amf".into()]),_=>a.extend(["-c:v".into(),"libx264".into(),"-preset".into(),"veryfast".into()])};a.extend(["-b:v".into(),format!("{}k",c.video.bitrate_kbps),"-g".into(),(c.video.fps*c.video.keyframe_seconds).to_string()]);if c.audio.enabled&&!c.audio.device.is_empty(){a.extend(["-c:a".into(),"aac".into(),"-b:a".into(),format!("{}k",c.audio.bitrate_kbps),"-ar".into(),c.audio.sample_rate.to_string()]);}else{a.push("-an".into());}
 let mut sinks=Vec::new();for d in c.destinations.iter().filter(|d|d.enabled&&!d.url.is_empty()&&!d.stream_key.is_empty()){sinks.push(format!("[f=flv:onfail=ignore]{}/{}",d.url.trim_end_matches('/'),d.stream_key));}if c.recording.enabled{sinks.push(format!("[f={}:onfail=ignore]{}/litecast-recording.{}",if c.recording.format=="mkv"{"matroska"}else{"mp4"},c.recording.directory,c.recording.format));}a.extend(["-f".into(),"tee".into(),sinks.join("|")]);Ok(a)}
fn shell(s:&str)->String{if s.chars().all(|c|c.is_ascii_alphanumeric()||"_./:-=".contains(c)){s.into()}else{format!("{:?}",s)}}
