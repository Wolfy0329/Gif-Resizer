import os
import uuid
import tempfile
from flask import Flask, render_template, request, jsonify, send_file, make_response
from werkzeug.utils import secure_filename
from PIL import Image, ImageSequence

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50 MB limit

MAX_SIZE_KB = 500
TARGET_WIDTH = 240
TARGET_HEIGHT = 320

def get_file_size_kb(filepath):
    if os.path.exists(filepath):
        return os.path.getsize(filepath) / 1024
    return float('inf')

def save_and_check(frames, durations, output_path, optimize, colors):
    if len(frames) == 0:
        return
        
    quantized_frames = []
    for f in frames:
        # Handle transparency by converting to RGB, which drops it cleanly for Pillow to save without crashing
        rgb_frame = f.convert('RGB')
        q_frame = rgb_frame.quantize(colors=colors, method=Image.Quantize.MEDIANCUT)
        # Clean any bad info
        if 'transparency' in q_frame.info:
            del q_frame.info['transparency']
        quantized_frames.append(q_frame)

    quantized_frames[0].save(
        output_path,
        save_all=True,
        append_images=quantized_frames[1:],
        duration=durations,
        loop=0,
        optimize=optimize
    )

def process_gif(input_path, output_path):
    with Image.open(input_path) as img:
        frames = []
        durations = []
        
        for frame in ImageSequence.Iterator(img):
            # Resize the frame to EXACTLY 170x320
            # Ensure frame is converted to RGBA before resize to handle transparency safely
            rgba_frame = frame.convert('RGBA')
            resized_frame = rgba_frame.resize((TARGET_WIDTH, TARGET_HEIGHT), Image.Resampling.LANCZOS)
            
            # Remove problematic transparency info
            if 'transparency' in resized_frame.info:
                del resized_frame.info['transparency']
                
            frames.append(resized_frame.copy())
            durations.append(frame.info.get('duration', 100))
        
    # Attempt 1: Just resize
    save_and_check(frames, durations, output_path, optimize=False, colors=256)
    if get_file_size_kb(output_path) <= MAX_SIZE_KB:
        return True
        
    # Attempt 2: Reduce colors
    for colors in [128, 64, 32, 16]:
        save_and_check(frames, durations, output_path, optimize=True, colors=colors)
        if get_file_size_kb(output_path) <= MAX_SIZE_KB:
            return True
            
    # Attempt 3: Drop frames
    current_frames = frames
    current_durations = durations
    
    while get_file_size_kb(output_path) > MAX_SIZE_KB and len(current_frames) > 2:
        current_frames = current_frames[::2]
        current_durations = [d * 2 for d in current_durations[::2]]
        save_and_check(current_frames, current_durations, output_path, optimize=True, colors=16)
        
    if get_file_size_kb(output_path) <= MAX_SIZE_KB:
        return True
        
    # Even if it failed to be under 500KB, it's the best we can do
    return False

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/process', methods=['POST'])
def process_endpoint():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
        
    if file and file.filename.lower().endswith('.gif'):
        filename = secure_filename(file.filename)
        unique_id = str(uuid.uuid4())
        
        # Use system temporary directory (compatible with Vercel)
        temp_dir = tempfile.gettempdir()
        
        input_filename = f"{unique_id}_{filename}"
        output_filename = f"resized_{input_filename}"
        
        input_path = os.path.join(temp_dir, input_filename)
        output_path = os.path.join(temp_dir, output_filename)
        
        file.save(input_path)
        
        try:
            process_gif(input_path, output_path)
            
            # Clean up input file
            if os.path.exists(input_path):
                os.remove(input_path)
                
            final_size = get_file_size_kb(output_path)
            
            # Send file directly
            response = make_response(send_file(
                output_path,
                mimetype='image/gif',
                as_attachment=True,
                download_name=f"resized_{filename}"
            ))
            # Attach the final size in custom headers so the UI can read it
            response.headers['X-Final-Size-KB'] = str(round(final_size, 2))
            return response
            
        except Exception as e:
            if os.path.exists(input_path):
                os.remove(input_path)
            return jsonify({'error': str(e)}), 500
            
    return jsonify({'error': 'Invalid file format. Please upload a GIF.'}), 400

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
