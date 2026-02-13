#!/usr/bin/env python3
"""
GIF Frame Extractor for Claude Code

Extracts frames from an animated GIF file and saves them as individual PNG images
with metadata for temporal analysis.

Usage:
    python extract_gif_frames.py <gif_path> [--output-dir <dir>] [--max-frames <n>] [--skip <n>]

Arguments:
    gif_path        Path to the GIF file
    --output-dir    Output directory for frames (default: ./gif_frames_<timestamp>)
    --max-frames    Maximum number of frames to extract (default: 50)
    --skip          Extract every Nth frame for long GIFs (default: 1 = all frames)

Output:
    - Individual PNG frames: frame_001.png, frame_002.png, ...
    - Metadata JSON: gif_metadata.json with timing information

Example:
    python extract_gif_frames.py animation.gif --output-dir ./my_frames --max-frames 30
"""

import sys
import json
import argparse
from pathlib import Path
from datetime import datetime

try:
    from PIL import Image
except ImportError:
    print("Error: Pillow is required. Install with: pip install Pillow")
    sys.exit(1)


def extract_frames(
    gif_path: str,
    output_dir: str = None,
    max_frames: int = 50,
    skip: int = 1
) -> dict:
    """
    Extract frames from a GIF file.
    
    Args:
        gif_path: Path to the GIF file
        output_dir: Directory to save extracted frames
        max_frames: Maximum number of frames to extract
        skip: Extract every Nth frame (1 = all frames)
    
    Returns:
        Dictionary containing metadata about the extraction
    """
    gif_path = Path(gif_path)
    
    if not gif_path.exists():
        raise FileNotFoundError(f"GIF file not found: {gif_path}")
    
    if not gif_path.suffix.lower() in ['.gif']:
        raise ValueError(f"File is not a GIF: {gif_path}")
    
    # Create output directory
    if output_dir is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_dir = Path.cwd() / f"gif_frames_{timestamp}"
    else:
        output_dir = Path(output_dir)
    
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Open GIF and extract frames
    with Image.open(gif_path) as gif:
        # Get basic info
        width, height = gif.size
        total_frames = getattr(gif, 'n_frames', 1)
        
        # Calculate frames to extract
        frame_indices = list(range(0, total_frames, skip))[:max_frames]
        
        frames_metadata = []
        extracted_count = 0
        cumulative_time_ms = 0
        
        print(f"📹 Analyzing GIF: {gif_path.name}")
        print(f"   Resolution: {width}x{height}")
        print(f"   Total frames: {total_frames}")
        print(f"   Extracting {len(frame_indices)} frames (skip={skip})...")
        print()
        
        for idx, frame_num in enumerate(frame_indices):
            try:
                gif.seek(frame_num)
                
                # Get frame duration (in milliseconds)
                duration_ms = gif.info.get('duration', 100)  # Default 100ms
                
                # Convert to RGBA for consistent output
                frame = gif.convert('RGBA')
                
                # Save frame
                frame_filename = f"frame_{idx + 1:03d}.png"
                frame_path = output_dir / frame_filename
                frame.save(frame_path, 'PNG')
                
                # Store metadata
                frame_meta = {
                    "frame_number": idx + 1,
                    "original_frame_index": frame_num,
                    "filename": frame_filename,
                    "duration_ms": duration_ms,
                    "cumulative_time_ms": cumulative_time_ms,
                    "timestamp_display": f"{cumulative_time_ms / 1000:.2f}s"
                }
                frames_metadata.append(frame_meta)
                
                cumulative_time_ms += duration_ms
                extracted_count += 1
                
                print(f"   ✅ Frame {idx + 1}/{len(frame_indices)}: {frame_filename} (t={frame_meta['timestamp_display']})")
                
            except EOFError:
                break
            except Exception as e:
                print(f"   ⚠️ Error extracting frame {frame_num}: {e}")
        
        # Calculate total duration
        total_duration_ms = cumulative_time_ms
        total_duration_s = total_duration_ms / 1000
        
        # Check for loop info
        loop_count = gif.info.get('loop', 0)  # 0 = infinite loop
        
        # Build metadata
        metadata = {
            "source_file": str(gif_path.absolute()),
            "source_filename": gif_path.name,
            "resolution": {
                "width": width,
                "height": height
            },
            "total_frames_in_gif": total_frames,
            "extracted_frames_count": extracted_count,
            "skip_factor": skip,
            "total_duration_ms": total_duration_ms,
            "total_duration_s": round(total_duration_s, 2),
            "average_frame_duration_ms": round(total_duration_ms / extracted_count, 2) if extracted_count > 0 else 0,
            "loop_count": loop_count,
            "loop_info": "infinite" if loop_count == 0 else f"{loop_count} times",
            "output_directory": str(output_dir.absolute()),
            "frames": frames_metadata,
            "temporal_order_note": "Frames are numbered sequentially in chronological order. Frame 1 is the beginning, and the last frame is the end of the animation.",
            "analysis_guidance": """
When analyzing these frames as a video sequence:
1. Frame 001 is the START of the animation
2. Frame numbers increase in CHRONOLOGICAL ORDER
3. The 'timestamp_display' shows when each frame appears
4. Consider motion, changes, and transitions between consecutive frames
5. Look for patterns, loops, and key moments in the sequence
"""
        }
        
        # Save metadata
        metadata_path = output_dir / "gif_metadata.json"
        with open(metadata_path, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)
        
        print()
        print(f"✅ Extraction complete!")
        print(f"   Output directory: {output_dir}")
        print(f"   Frames extracted: {extracted_count}")
        print(f"   Total duration: {total_duration_s:.2f}s")
        print(f"   Metadata saved: {metadata_path}")
        
        return metadata


def main():
    parser = argparse.ArgumentParser(
        description='Extract frames from animated GIF for temporal analysis',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Example usage:
  python extract_gif_frames.py animation.gif
  python extract_gif_frames.py demo.gif --output-dir ./frames --max-frames 20
  python extract_gif_frames.py long_video.gif --skip 3  # Every 3rd frame
        """
    )
    
    parser.add_argument('gif_path', help='Path to the GIF file')
    parser.add_argument('--output-dir', '-o', help='Output directory for frames')
    parser.add_argument('--max-frames', '-m', type=int, default=50,
                        help='Maximum frames to extract (default: 50)')
    parser.add_argument('--skip', '-s', type=int, default=1,
                        help='Extract every Nth frame (default: 1 = all)')
    
    args = parser.parse_args()
    
    try:
        metadata = extract_frames(
            args.gif_path,
            args.output_dir,
            args.max_frames,
            args.skip
        )
        
        # Print frame list for Claude Code to see
        print("\n" + "="*60)
        print("📋 FRAME LIST (Chronological Order):")
        print("="*60)
        for frame in metadata['frames']:
            print(f"   [{frame['frame_number']:03d}] {frame['filename']} @ {frame['timestamp_display']}")
        print("="*60)
        
        return 0
        
    except FileNotFoundError as e:
        print(f"❌ Error: {e}")
        return 1
    except ValueError as e:
        print(f"❌ Error: {e}")
        return 1
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
