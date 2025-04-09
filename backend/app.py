from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import exifread
import mimetypes
import time
import hashlib
from PIL import Image, ImageChops, ImageEnhance
from datetime import datetime

# Dynamically get the current directory (for compatibility across environments)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Absolute path to 'uploads' folder
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Optional: Path to React build (if you're serving frontend from Flask)
REACT_BUILD_FOLDER = os.path.join(BASE_DIR, "build")  # Adjust if needed

app = Flask(__name__, static_folder=REACT_BUILD_FOLDER, static_url_path="/")
CORS(app)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

def calculate_hashes(file_path):
    sha256 = hashlib.sha256()
    md5 = hashlib.md5()
    with open(file_path, "rb") as f:
        while chunk := f.read(8192):
            sha256.update(chunk)
            md5.update(chunk)
    return sha256.hexdigest(), md5.hexdigest()

def extract_metadata(file_path):
    file_size_kb = round(os.path.getsize(file_path) / 1024, 2)
    file_type, _ = mimetypes.guess_type(file_path)
    last_modified = time.ctime(os.path.getmtime(file_path))

    with open(file_path, "rb") as image_file:
        tags = exifread.process_file(image_file)

    def get_tag(tag_name):
        return str(tags.get(tag_name, "Could not retrieve"))

    metadata = {
        "File Name": os.path.basename(file_path),
        "File Size": f"{file_size_kb} KB",
        "File Type": file_type or "Unknown",
        "Last Modified": last_modified,
        "Camera Make": get_tag("Image Make"),
        "Camera Model": get_tag("Image Model"),
        "Date Taken": get_tag("EXIF DateTimeOriginal"),
        "Exposure Time": get_tag("EXIF ExposureTime"),
        "F-Stop": get_tag("EXIF FNumber"),
        "ISO Speed": get_tag("EXIF ISOSpeedRatings"),
        "Focal Length": get_tag("EXIF FocalLength"),
        "GPS Latitude": get_tag("GPS GPSLatitude"),
        "GPS Longitude": get_tag("GPS GPSLongitude"),
    }

    # Consistency checks
    flags = []
    try:
        if metadata["Date Taken"] != "Could not retrieve":
            dt_obj = datetime.strptime(metadata["Date Taken"], "%Y:%m:%d %H:%M:%S")
            mod_time = datetime.strptime(last_modified, "%a %b %d %H:%M:%S %Y")
            if dt_obj > mod_time:
                flags.append("⚠️ 'Date Taken' is after 'Last Modified' time.")
    except:
        pass

    if metadata["Camera Make"] == "Could not retrieve" or metadata["Camera Model"] == "Could not retrieve":
        flags.append("⚠️ Camera make/model missing — may indicate editing or stripped metadata.")

    metadata["Flags"] = flags
    return metadata

def generate_ela_image(image_path, output_path, quality=90):
    original = Image.open(image_path).convert("RGB")
    temp_path = output_path.replace("ela_", "temp_")
    original.save(temp_path, "JPEG", quality=quality)
    compressed = Image.open(temp_path)
    ela_image = ImageChops.difference(original, compressed)
    extrema = ela_image.getextrema()
    max_diff = max([ex[1] for ex in extrema])
    scale = 255.0 / max_diff if max_diff != 0 else 1
    ela_image = ImageEnhance.Brightness(ela_image).enhance(scale)
    ela_image.save(output_path)
    os.remove(temp_path)

@app.route("/upload", methods=["POST"])
def upload_file():
    if "file" not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files["file"]
    known_sha = request.form.get("known_sha256", "").strip().lower()
    known_md5 = request.form.get("known_md5", "").strip().lower()

    if file.filename == "":
        return jsonify({"error": "No selected file"}), 400

    file_path = os.path.join(app.config["UPLOAD_FOLDER"], file.filename)
    file.save(file_path)

    sha256_hash, md5_hash = calculate_hashes(file_path)
    metadata = extract_metadata(file_path)

    ela_filename = f"ela_{file.filename}"
    ela_path = os.path.join(app.config["UPLOAD_FOLDER"], ela_filename)
    generate_ela_image(file_path, ela_path)

    result = {
        "message": "File uploaded successfully",
        "sha256": sha256_hash,
        "md5": md5_hash,
        "metadata": metadata,
        "ela_filename": ela_filename
    }

    if known_sha:
        result["sha_match"] = (known_sha == sha256_hash)
    if known_md5:
        result["md5_match"] = (known_md5 == md5_hash)

    return jsonify(result)

@app.route("/uploads/<filename>")
def uploaded_file(filename):
    return send_from_directory(app.config["UPLOAD_FOLDER"], filename)

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_react(path):
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, "index.html")

if __name__ == "__main__":
    app.run(debug=True)
