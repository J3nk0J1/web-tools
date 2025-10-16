# Browser Video Compression Tool

This document outlines the design of the browser-native video compression workflow that runs entirely offline on Windows 10/11 thin clients using Chromium-based browsers.

## Goals

- Keep outputs under 100&nbsp;MB by automatically tuning bitrate, resolution, and audio presence.
- Prefer patent-unencumbered delivery (WebM/VP9) while still allowing MP4/H.264 when the browser exposes an encoder.
- Avoid bundling binary assets such as WebAssembly encoders so the tool works within repository constraints.
- Warn users when jobs will tie up the device for several minutes and prevent overloading thin clients.

## Architecture Overview

1. **MediaRecorder-first encoding**
   - The tool relies on the `MediaRecorder` API, capturing a `<canvas>` stream for video frames and adding the source video's audio track when available.
   - Chromium on Windows exposes VP9/VP8 encoders without extra licensing baggage. H.264/MP4 is surfaced only when `MediaRecorder.isTypeSupported("video/mp4;codecs=avc1.42E01E,mp4a.40.2")` returns true.
2. **Dynamic scaling planner**
   - After inspecting the source clip, the planner computes a target bitrate and evaluates bits-per-pixel. When the bitrate would fall below quality thresholds, the tool progressively downscales until the output can stay within the 100&nbsp;MB budget.
   - The pipeline reserves 2–15% headroom depending on the user's "Quality bias" slider to avoid overshooting the size cap.
3. **Real-time capture loop**
   - A hidden `<video>` element plays the original file. Each frame is drawn onto a `<canvas>` and fed into the recording stream at the detected frame rate (clamped between 12 and 60 fps).
   - Progress is estimated from `video.currentTime / video.duration`, so users see the encode advance even though MediaRecorder does not expose granular progress callbacks.
4. **User experience safeguards**
   - The interface surfaces estimated encode time (roughly `max(duration × 1.4, size × 25 seconds)`), warns that the tab will be busy, and requires a confirmation prompt before starting.
   - Logs note capability fallbacks (e.g., when MP4 is unavailable or audio capture fails) and highlight the final space savings once recording completes.

## Format Strategy

| Priority | Container | Codec | When Used | Notes |
| --- | --- | --- | --- | --- |
| 1 | WebM | VP9/Opus | Default when supported | Patent-free, suitable for web delivery, widely supported in modern Chromium browsers. |
| 2 | WebM | VP8/Opus | Fallback when VP9 encoder is missing | Keeps the workflow patent-free; quality is slightly lower than VP9 at the same bitrate. |
| 3 | MP4 | H.264/AAC | Optional when MediaRecorder advertises support | Provides maximum compatibility but depends on OS codecs; some Windows builds may disable it. |

If the requested format is unsupported, the planner automatically falls back to the next available option and records a notice in the recommendations panel.

## Limitations

- **No Safari/Firefox support:** The tool targets Microsoft Edge and Chrome on Windows. Other browsers may lack MediaRecorder implementations or expose different codec sets.
- **Real-time requirement:** MediaRecorder works in near real-time. Very large clips can take as long as their playback duration to process, and the tab must remain in the foreground.
- **Audio capture quirks:** Some GPU/driver combinations block `HTMLVideoElement.captureStream()`. When this happens the tool proceeds with a muted output and alerts the user in the log.
- **Bitrate variance:** MediaRecorder performs its own rate control, so final files may land slightly above or below the requested size. The headroom slider mitigates most variance but cannot guarantee an exact byte ceiling.

## Future Enhancements

- Offer preset buttons (e.g., 480p/720p) for faster user choices when bitrate-based planning is unnecessary.
- Allow manual bitrate overrides for advanced users.
- Persist previous choices in `localStorage` so thin clients retain preferred targets across sessions.
- Investigate automatic pausing when the tab loses focus to further protect constrained CPUs.
