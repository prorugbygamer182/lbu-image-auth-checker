import React, { useState } from "react";
import axios from "axios";
import "bootstrap/dist/css/bootstrap.min.css";

const ImageUpload = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [knownSHA, setKnownSHA] = useState("");
  const [knownMD5, setKnownMD5] = useState("");
  const [shaHash, setShaHash] = useState("");
  const [md5Hash, setMd5Hash] = useState("");
  const [shaMatch, setShaMatch] = useState(null);
  const [md5Match, setMd5Match] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [elaImage, setElaImage] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadCompleted, setUploadCompleted] = useState(false); // To track if upload is completed

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
    setMetadata(null);
    setShaHash("");
    setMd5Hash("");
    setShaMatch(null);
    setMd5Match(null);
    setElaImage(null);
    setError("");
    setUploadCompleted(false); // Reset the completed status
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError("⚠️ Please select a file first.");
      return;
    }

    setLoading(true);
    setUploadCompleted(false); // Reset before starting the upload process

    const formData = new FormData();
    formData.append("file", selectedFile);
    if (knownSHA.trim()) formData.append("known_sha256", knownSHA.trim());
    if (knownMD5.trim()) formData.append("known_md5", knownMD5.trim());

    try {
      const response = await axios.post("http://127.0.0.1:5000/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setMetadata(response.data.metadata);
      setElaImage(`http://127.0.0.1:5000/uploads/${response.data.ela_filename}`);
      setShaHash(response.data.sha256);
      setMd5Hash(response.data.md5);
      setShaMatch(response.data.sha_match);
      setMd5Match(response.data.md5_match);
      setError("");
      setUploadCompleted(true); // Set upload as completed
    } catch (error) {
      setError("❌ Error uploading file. Ensure the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-light min-vh-100">
      <nav className="navbar navbar-dark" style={{ backgroundColor: "#6a1b9a" }}>
        <div className="container">
          <a className="navbar-brand fw-bold d-flex align-items-center" href="#">
            <img src="/LBU-LOGO.jpg" alt="LBU Logo" width="50" height="50" className="me-2" />
            LBU Image Authenticity Checker
          </a>
        </div>
      </nav>

      <div className="container mt-5">
        <div className="card p-4 shadow" style={{ backgroundColor: "#ede7f6" }}>
          <h3 className="fw-bold text-center">Upload an Image</h3>
          <input type="file" onChange={handleFileChange} className="form-control my-3" />
          <input
            type="text"
            placeholder="Optional known SHA-256 hash"
            className="form-control mb-2"
            value={knownSHA}
            onChange={(e) => setKnownSHA(e.target.value)}
          />
          <input
            type="text"
            placeholder="Optional known MD5 hash"
            className="form-control mb-3"
            value={knownMD5}
            onChange={(e) => setKnownMD5(e.target.value)}
          />
          <button
            className="btn btn-primary w-100"
            onClick={handleUpload}
            disabled={loading}
          >
            {loading ? "Processing..." : "Upload & Analyse"}
          </button>
          {error && <div className="alert alert-danger mt-3">{error}</div>}
        </div>

        {uploadCompleted && (shaHash || md5Hash) && (
          <div className="alert alert-secondary mt-4">
            {shaHash && (
              <>
                <strong>SHA-256 Hash:</strong>
                <div className="text-monospace small">{shaHash}</div>
                {shaMatch !== null && knownSHA.trim() && (
                  <div className={`mt-2 alert ${shaMatch ? "alert-success" : "alert-danger"}`}>
                    {shaMatch ? "✅ SHA-256 hash matches." : "❌ SHA-256 mismatch."}
                  </div>
                )}
              </>
            )}
            {md5Hash && (
              <>
                <strong className="mt-3 d-block">MD5 Hash:</strong>
                <div className="text-monospace small">{md5Hash}</div>
                {md5Match !== null && knownMD5.trim() && (
                  <div className={`mt-2 alert ${md5Match ? "alert-success" : "alert-danger"}`}>
                    {md5Match ? "✅ MD5 hash matches." : "❌ MD5 mismatch."}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {metadata && (
          <div className="card shadow mt-4 p-4">
            <h4 className="fw-bold text-center mb-3">Extracted Metadata</h4>
            <table className="table table-bordered table-hover">
              <tbody>
                {Object.entries(metadata).map(([key, value]) => {
                  if (key === "Flags") return null;
                  return (
                    <tr key={key}>
                      <th>{key}</th>
                      <td>{value}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {metadata?.Flags?.length > 0 && (
          <div className="alert alert-warning mt-3">
            <strong>Metadata Consistency Warnings:</strong>
            <ul className="mb-0">
              {metadata.Flags.map((flag, idx) => (
                <li key={idx}>{flag}</li>
              ))}
            </ul>
          </div>
        )}

        {elaImage && (
          <div className="text-center mt-5">
            <h4 className="fw-bold">Error Level Analysis (ELA)</h4>
            <img src={elaImage} alt="ELA" className="img-fluid rounded shadow mt-2" />
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageUpload;
