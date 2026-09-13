#!/usr/bin/env bash
set -euo pipefail

OUTPUT_ROOT="${DEMO_VIDEO_OUTPUT:-demo-video-v2}"
CINEMATIC_VIDEO="${CINEMATIC_VIDEO:-$OUTPUT_ROOT/nimcarry-cinematic-v2.webm}"
RAW_VIDEO="${1:-$OUTPUT_ROOT/nimcarry-demo-v2-raw.webm}"
FINAL_VIDEO="${2:-$OUTPUT_ROOT/nimcarry-demo-v2.mp4}"
AUDIO_DIR="$OUTPUT_ROOT/audio"
CINEMATIC_TRIM_START="0.18"
RAW_TRIM_START="0.45"
CROSSFADE="0.55"
mkdir -p "$AUDIO_DIR"

: "${VOICE_SEGMENT_1:?VOICE_SEGMENT_1 is required}"
: "${VOICE_SEGMENT_2:?VOICE_SEGMENT_2 is required}"
: "${VOICE_SEGMENT_3:?VOICE_SEGMENT_3 is required}"
: "${VOICE_SEGMENT_4:?VOICE_SEGMENT_4 is required}"
: "${VOICE_SEGMENT_5:?VOICE_SEGMENT_5 is required}"

for index in 1 2 3 4 5; do
  var="VOICE_SEGMENT_${index}"
  url="${!var}"
  echo "Downloading narration segment ${index}..."
  curl --fail --location --retry 3 --retry-delay 2 "$url" -o "$AUDIO_DIR/segment-${index}.mp3"
done

cat > "$AUDIO_DIR/concat.txt" <<EOF
file 'segment-1.mp3'
file 'segment-2.mp3'
file 'segment-3.mp3'
file 'segment-4.mp3'
file 'segment-5.mp3'
EOF

ffmpeg -hide_banner -loglevel error -y \
  -f concat -safe 0 -i "$AUDIO_DIR/concat.txt" \
  -af "loudnorm=I=-16:LRA=11:TP=-1.5" \
  -ar 48000 -ac 2 "$AUDIO_DIR/narration.wav"

CINEMATIC_DURATION="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$CINEMATIC_VIDEO")"
RAW_DURATION="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$RAW_VIDEO")"
AUDIO_DURATION="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$AUDIO_DIR/narration.wav")"
read -r CINEMATIC_EFFECTIVE RAW_EFFECTIVE XFADE_OFFSET VIDEO_DURATION EXTRA_VIDEO <<EOF
$(python3 - <<PY
cin=float("$CINEMATIC_DURATION")
raw=float("$RAW_DURATION")
cin_trim=float("$CINEMATIC_TRIM_START")
raw_trim=float("$RAW_TRIM_START")
xfade=float("$CROSSFADE")
audio=float("$AUDIO_DURATION")
cin_eff=max(0.0,cin-cin_trim)
raw_eff=max(0.0,raw-raw_trim)
offset=max(0.0,cin_eff-xfade)
video=max(0.0,cin_eff+raw_eff-xfade)
extra=max(0.0,audio+2.0-video)
print(cin_eff,raw_eff,offset,video,extra)
PY
)
EOF

cat > "$OUTPUT_ROOT/render-metadata.json" <<EOF
{
  "cinematic_source_seconds": $CINEMATIC_DURATION,
  "cinematic_trim_start_seconds": $CINEMATIC_TRIM_START,
  "cinematic_effective_seconds": $CINEMATIC_EFFECTIVE,
  "raw_video_seconds": $RAW_DURATION,
  "raw_trim_start_seconds": $RAW_TRIM_START,
  "raw_effective_seconds": $RAW_EFFECTIVE,
  "crossfade_seconds": $CROSSFADE,
  "effective_video_seconds": $VIDEO_DURATION,
  "narration_seconds": $AUDIO_DURATION,
  "video_tail_extension_seconds": $EXTRA_VIDEO,
  "output": "$FINAL_VIDEO",
  "cinematic_method": "authored tactile motion design rendered in Chromium; no generative-video dependency",
  "truth_boundary": "Guided demo uses simulated route state. No wallet or network writes. Real custody advances only after independently verified FINAL."
}
EOF

ffmpeg -hide_banner -loglevel error -y \
  -ss "$CINEMATIC_TRIM_START" -i "$CINEMATIC_VIDEO" \
  -ss "$RAW_TRIM_START" -i "$RAW_VIDEO" \
  -i "$AUDIO_DIR/narration.wav" \
  -filter_complex "[0:v]scale=1920:1080:flags=lanczos,fps=30,format=yuv420p[c];[1:v]scale=1920:1080:flags=lanczos,fps=30,format=yuv420p[r];[c][r]xfade=transition=fade:duration=${CROSSFADE}:offset=${XFADE_OFFSET},tpad=stop_mode=clone:stop_duration=${EXTRA_VIDEO}[v];[2:a]apad=pad_dur=12[a]" \
  -map "[v]" -map "[a]" \
  -c:v libx264 -preset medium -crf 18 \
  -c:a aac -b:a 192k \
  -movflags +faststart \
  -shortest "$FINAL_VIDEO"

ffprobe -v error -show_entries format=duration,size,bit_rate -of json "$FINAL_VIDEO" > "$OUTPUT_ROOT/final-probe.json"
echo "Rendered $FINAL_VIDEO with authored cinematic opener"
