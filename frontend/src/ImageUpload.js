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
  const [uploadCompleted, setUploadCompleted] = useState(false);

  const [simulateMode, setSimulateMode] = useState(false);
  const [simulatedEdits, setSimulatedEdits] = useState({});
  const [simulatedResults, setSimulatedResults] = useState(null);
  const [simError, setSimError] = useState("");

  const [authScore, setAuthScore] = useState(null);
  const [authFlags, setAuthFlags] = useState([]);
  const [authLevel, setAuthLevel] = useState("");
  const [authRecommendation, setAuthRecommendation] = useState("");
  const [authError, setAuthError] = useState("");

  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState("");

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
    setMetadata(null);
    setShaHash("");
    setMd5Hash("");
    setShaMatch(null);
    setMd5Match(null);
    setElaImage(null);
    setError("");
    setUploadCompleted(false);
    setSimulatedResults(null);
    setAuthScore(null);
    setAuthFlags([]);
    setAuthLevel("");
    setAuthRecommendation("");
    setAiResult(null);
    setAiError("");
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError("⚠️ Please select a file first.");
      return;
    }

    setLoading(true);
    setUploadCompleted(false);

    const formData = new FormData();
    formData.append("file", selectedFile);
    if (knownSHA.trim()) formData.append("known_sha256", knownSHA.trim());
    if (knownMD5.trim()) formData.append("known_md5", knownMD5.trim());

    try {
      const response = await axios.post("/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setMetadata(response.data.metadata);
      setElaImage(`/uploads/${response.data.ela_filename}`);
      setShaHash(response.data.sha256);
      setMd5Hash(response.data.md5);
      setShaMatch(response.data.sha_match);
      setMd5Match(response.data.md5_match);
      setError("");
      setUploadCompleted(true);
    } catch (error) {
      setError("❌ Error uploading file. Ensure the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  const handleAIAnalysis = async () => {
    setAiError("");
    try {
      const response = await axios.post("/ai-analyze-metadata", {
        metadata: metadata,
      });
      setAiResult(response.data);
    } catch (err) {
      setAiError("❌ Failed to run AI metadata analysis.");
    }
  };

  return (
    <div className="bg-light min-vh-100">
      <nav className="navbar navbar-dark" style={{ backgroundColor: "#6a1b9a" }}>
        <div className="container">
          <button
            onClick={() => window.location.href = "/"}
            className="navbar-brand fw-bold d-flex align-items-center btn btn-link border-0 p-0 text-decoration-none"
            style={{ background: "none" }}
          >
            <img src="/LBU-LOGO.jpg" alt="LBU Logo" width="50" height="50" className="me-2" />
            LBU Image Authenticity Checker
          </button>
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
          <>
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

            <div className="d-flex flex-wrap gap-2 mt-3">
              <button
                className="btn btn-outline-secondary"
                onClick={() => {
                  setSimulateMode(!simulateMode);
                  setSimulatedEdits(metadata);
                  setSimulatedResults(null);
                }}
              >
                {simulateMode ? "Cancel Simulation" : "Simulate Metadata Manipulation"}
              </button>

              <button
                className="btn btn-outline-success"
                onClick={async () => {
                  setAuthError("");
                  try {
                    const response = await axios.post("/verify-authenticity", {
                      file_name: selectedFile.name,
                    });
                    setAuthScore(response.data.authenticity_score);
                    setAuthFlags(response.data.flags);
                    setAuthLevel(response.data.risk_level);
                    setAuthRecommendation(response.data.recommendation);
                  } catch (err) {
                    setAuthError("❌ Failed to verify authenticity.");
                  }
                }}
              >
                Verify Image Authenticity
              </button>

              <button
                className="btn btn-outline-dark"
                onClick={handleAIAnalysis}
              >
                Run AI Forgery Analysis
              </button>
            </div>
          </>
        )}

        {aiResult && (
          <div className="card shadow mt-4 p-4 bg-white">
            <h5 className="fw-bold text-center mb-3">AI Metadata Forgery Analysis</h5>
            <p><strong>Confidence Score:</strong> {aiResult.confidence_score} / 100</p>
            <p><strong>Verdict:</strong> {aiResult.verdict}</p>
            {aiResult.evidence?.length > 0 && (
              <>
                <p><strong>Detected Issues:</strong></p>
                <ul>
                  {aiResult.evidence.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        {aiError && <div className="alert alert-danger mt-3">{aiError}</div>}

        {simulateMode && (
          <div className="card shadow mt-4 p-4 bg-white">
            <h5 className="fw-bold mb-3 text-center">Simulate Metadata Changes</h5>
            {Object.entries(metadata).map(([key, value]) => {
              if (key === "Flags") return null;
              return (
                <div className="mb-2" key={key}>
                  <label className="form-label fw-semibold">{key}</label>
                  <input
                    type="text"
                    className="form-control"
                    value={simulatedEdits[key] || ""}
                    onChange={(e) =>
                      setSimulatedEdits((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                  />
                </div>
              );
            })}
            <button
              className="btn btn-danger w-100 mt-3"
              onClick={async () => {
                setSimError("");
                try {
                  const response = await axios.post("/simulate-metadata", {
                    file_name: selectedFile.name,
                    edits: simulatedEdits,
                  });
                  setSimulatedResults(response.data);
                } catch (err) {
                  setSimError("❌ Failed to simulate manipulation.");
                }
              }}
            >
              Run Simulation
            </button>
            {simError && <div className="alert alert-danger mt-3">{simError}</div>}
          </div>
        )}

        {simulatedResults && (
          <div className="card shadow mt-4 p-4 bg-light">
            <h5 className="fw-bold text-center mb-3">Simulation Results</h5>
            <table className="table table-bordered">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Original</th>
                  <th>Simulated</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(simulatedResults.simulated_metadata).map(([key, newVal]) => {
                  if (key === "Simulated Flags") return null;
                  const originalVal = simulatedResults.original_metadata[key];
                  const changed = originalVal !== newVal;
                  return (
                    <tr key={key} className={changed ? "table-warning" : ""}>
                      <td>{key}</td>
                      <td>{originalVal}</td>
                      <td>{newVal}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {simulatedResults.simulated_flags.length > 0 && (
              <div className="alert alert-warning">
                <strong>Detected Manipulation Warnings:</strong>
                <ul className="mb-0">
                  {simulatedResults.simulated_flags.map((flag, idx) => (
                    <li key={idx}>{flag}</li>
                  ))}
                </ul>
              </div>
            )}

            {simulatedResults.simulated_flags.length === 0 && (
              <div className="alert alert-success text-center">✅ No suspicious metadata detected.</div>
            )}
          </div>
        )}

        {authScore !== null && (
          <div className="card shadow mt-4 p-4 bg-white">
            <h5 className="fw-bold text-center mb-3">Authenticity Verification Results</h5>
            <p><strong>Authenticity Score:</strong> {authScore} / 100</p>
            <p><strong>Risk Level:</strong> {authLevel}</p>
            {authFlags.length > 0 && (
              <>
                <p><strong>Red Flags:</strong></p>
                <ul>
                  {authFlags.map((flag, idx) => <li key={idx}>{flag}</li>)}
                </ul>
              </>
            )}
            <div className={`alert mt-3 ${authLevel === "High" ? "alert-danger" : authLevel === "Medium" ? "alert-warning" : "alert-success"}`}>
              <strong>{authRecommendation}</strong>
            </div>
          </div>
        )}
        {authError && <div className="alert alert-danger mt-3">{authError}</div>}

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
