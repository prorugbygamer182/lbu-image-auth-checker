from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import exifread
import mimetypes
import time
import hashlib
from PIL import Image, ImageChops, ImageEnhance
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app = Flask(__name__, static_folder="build", static_url_path="/")
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

@app.route("/simulate-metadata", methods=["POST"])
def simulate_metadata_edit():
    try:
        data = request.get_json(force=True)
        file_name = data.get("file_name")
        edits = data.get("edits", {})

        if not file_name or not isinstance(edits, dict):
            return jsonify({"error": "Invalid input"}), 400

        file_path = os.path.join(app.config["UPLOAD_FOLDER"], file_name)
        if not os.path.exists(file_path):
            return jsonify({"error": "File not found"}), 404

        original_metadata = extract_metadata(file_path)
        simulated_metadata = original_metadata.copy()
        simulated_flags = []

        for key, new_value in edits.items():
            if key in simulated_metadata:
                original_value = simulated_metadata[key]
                simulated_metadata[key] = new_value

                new_value_str = str(new_value)
                original_value_str = str(original_value)

                if new_value_str.strip() == "" or new_value_str == "Could not retrieve":
                    simulated_flags.append(f"⚠️ '{key}' is missing or was removed.")

                if new_value_str != original_value_str and original_value_str != "Could not retrieve":
                    simulated_flags.append(f"⚠️ '{key}' changed from '{original_value_str}' to '{new_value_str}'.")

                if key == "Date Taken":
                    try:
                        dt_obj = datetime.strptime(new_value_str, "%Y:%m:%d %H:%M:%S")
                        mod_time = datetime.strptime(original_metadata["Last Modified"], "%a %b %d %H:%M:%S %Y")
                        if dt_obj > mod_time:
                            simulated_flags.append("⚠️ 'Date Taken' is after 'Last Modified' (simulated).")
                    except:
                        simulated_flags.append("⚠️ Invalid 'Date Taken' format.")

                if key in ["Camera Make", "Camera Model"] and new_value_str.lower() in ["", "unknown", "generic"]:
                    simulated_flags.append(f"⚠️ '{key}' appears fake or tampered.")

                if key.startswith("GPS") and (new_value_str.strip() == "" or new_value_str == "Could not retrieve"):
                    simulated_flags.append(f"⚠️ {key} missing — possible metadata stripping.")

        simulated_metadata["Simulated Flags"] = simulated_flags

        return jsonify({
            "simulated_metadata": simulated_metadata,
            "original_metadata": original_metadata,
            "simulated_flags": simulated_flags
        })
    except Exception as e:
        print("Simulation Error:", e)
        return jsonify({"error": "Simulation failed", "details": str(e)}), 500

@app.route("/verify-authenticity", methods=["POST"])
def verify_authenticity():
    try:
        data = request.get_json(force=True)
        file_name = data.get("file_name")

        if not file_name:
            return jsonify({"error": "Missing file name"}), 400

        file_path = os.path.join(app.config["UPLOAD_FOLDER"], file_name)
        if not os.path.exists(file_path):
            return jsonify({"error": "File not found"}), 404

        metadata = extract_metadata(file_path)
        score = 100
        flags = []

        if metadata["Camera Make"] in ["", "Could not retrieve", "unknown", "generic"]:
            score -= 15
            flags.append("⚠️ Missing or generic camera make.")

        if metadata["Camera Model"] in ["", "Could not retrieve", "unknown", "generic"]:
            score -= 15
            flags.append("⚠️ Missing or generic camera model.")

        if metadata["GPS Latitude"] in ["", "Could not retrieve"] or metadata["GPS Longitude"] in ["", "Could not retrieve"]:
            score -= 10
            flags.append("⚠️ GPS data missing — may indicate metadata was stripped.")

        try:
            if metadata["Date Taken"] != "Could not retrieve":
                dt = datetime.strptime(metadata["Date Taken"], "%Y:%m:%d %H:%M:%S")
                mod = datetime.strptime(metadata["Last Modified"], "%a %b %d %H:%M:%S %Y")
                if dt > mod:
                    score -= 20
                    flags.append("⚠️ 'Date Taken' is after file modification time.")
        except:
            flags.append("⚠️ Invalid or unreadable 'Date Taken' format.")

        software_tags = ["Photoshop", "GIMP", "Paint", "Lightroom"]
        for tag in software_tags:
            if tag.lower() in str(metadata.get("Software", "")).lower():
                score -= 25
                flags.append(f"⚠️ File edited using {tag}.")

        if score >= 85:
            risk = "Low"
        elif score >= 60:
            risk = "Medium"
        else:
            risk = "High"

        recommendation = {
            "Low": "✅ No strong indicators of tampering.",
            "Medium": "⚠️ Image shows some metadata anomalies — review advised.",
            "High": "❌ High chance of tampering — forensic analysis recommended."
        }

        return jsonify({
            "authenticity_score": score,
            "risk_level": risk,
            "flags": flags,
            "recommendation": recommendation[risk],
            "metadata": metadata
        })

    except Exception as e:
        print("Auth Score Error:", e)
        return jsonify({"error": "Verification failed", "details": str(e)}), 500

@app.route("/ai-analyze-metadata", methods=["POST"])
def ai_analyze_metadata():
    try:
        data = request.get_json(force=True)
        metadata = data.get("metadata", {})

        score = 100
        evidence = []

        if "iPhone" in metadata.get("Camera Model", ""):
            try:
                year = int(metadata.get("Date Taken", "")[:4])
                if year < 2007:
                    score -= 30
                    evidence.append("Camera model suggests iPhone, but 'Date Taken' is before iPhones existed.")
            except:
                pass

        if "Photoshop" in metadata.get("Software", "") or "GIMP" in metadata.get("Software", ""):
            score -= 25
            evidence.append("Image edited with known photo manipulation software.")

        camera = metadata.get("Camera Make", "").lower()
        if any(device in camera for device in ["iphone", "samsung", "pixel"]) and (
            metadata.get("GPS Latitude", "") == "Could not retrieve" or metadata.get("GPS Longitude", "") == "Could not retrieve"
        ):
            score -= 15
            evidence.append("Modern mobile camera detected but GPS data is missing — may indicate metadata stripping.")

        try:
            file_size_kb = float(metadata.get("File Size", "0").replace(" KB", ""))
            if metadata.get("File Type") == "image/jpeg" and file_size_kb > 10000:
                score -= 10
                evidence.append("Unusually large JPEG file — could be inflated or suspicious.")
        except:
            pass

        if metadata.get("Camera Make", "").lower() in ["", "unknown", "generic", "could not retrieve"]:
            score -= 10
            evidence.append("Camera make is missing or too generic.")

        score = max(0, min(score, 100))

        if score >= 85:
            verdict = "Likely Authentic"
        elif score >= 60:
            verdict = "Possibly Tampered"
        else:
            verdict = "Likely Tampered"

        return jsonify({
            "confidence_score": score,
            "verdict": verdict,
            "evidence": evidence
        })

    except Exception as e:
        print("AI Analysis Error:", e)
        return jsonify({"error": "AI analysis failed", "details": str(e)}), 500

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


