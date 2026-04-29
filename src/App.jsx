import { useState, useRef, useCallback } from "react";

const RAPIDAPI_KEY  = "90bd11435amsh1151c74d53568d2p10f953jsn8d127ffa3148";
const RAPIDAPI_HOST = "deepfake-face-swap-ai.p.rapidapi.com";
const RAPIDAPI_URL  = `https://${RAPIDAPI_HOST}/swap-face`;
const IMGBB_KEY     = "0bb61baa964c3c1577a7e26924ca4379";

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

async function uploadToImgBB(base64) {
  const b64 = base64.replace(/^data:image\/[a-z]+;base64,/, "");
  const form = new FormData();
  form.append("image", b64);
  const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, {
    method: "POST",
    body: form
  });
  const data = await res.json();
  if (!data?.data?.url) throw new Error("Image upload failed");
  return data.data.url;
}

async function callFaceSwapAPI(srcB64, tgtB64, onProgress) {
  onProgress(10, "Uploading source...");
  const sourceUrl = await uploadToImgBB(srcB64);
  onProgress(30, "Uploading target...");
  const targetUrl = await uploadToImgBB(tgtB64);
  onProgress(55, "Running AI swap...");
  const res = await fetch(RAPIDAPI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-rapidapi-host": RAPIDAPI_HOST,
      "x-rapidapi-key": RAPIDAPI_KEY
    },
    body: JSON.stringify({
      source_url: sourceUrl,
      target_url: targetUrl
    }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.message || `API error ${res.status}`);
  }
  onProgress(85, "Processing...");
  const data = await res.json();
  const out = data?.image_url || data?.result_url || data?.output_url || data?.result || data?.output || data?.url;
  if (!out) throw new Error("No output image returned");
  onProgress(100, "Done!");
  return out;
}

function UploadZone({ label, icon, image, onUpload, onFileReady, accent }) {
  const ref = useRef();
  const [drag, setDrag] = useState(false);
  const handle = useCallback(async (file) => {
    if (!file?.type.startsWith("image/")) return;
    onUpload(URL.createObjectURL(file));
    onFileReady(await fileToBase64(file));
  }, [onUpload, onFileReady]);
  return (
    <div
      onClick={() => !image && ref.current.click()}
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]); }}
      style={{ position: "relative", width: 210, height: 250, borderRadius: 18, border: `2px dashed ${drag ? accent : image ? accent : "#2a2a2a"}`, background: image ? "transparent" : "#0e0e0e", cursor: image ? "default" : "pointer", overflow: "hidden", transition: "all 0.2s", boxShadow: image ? `0 0 28px ${accent}33` : "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}
    >
      {image ? (
        <>
          <img src={image} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <button onClick={e => { e.stopPropagation(); onUpload(null); onFileReady(null); }} style={{ position: "absolute", top: 8, right: 8, background: "#000b", color: "#fff", border: "none", borderRadius: "50%", width: 26, height: 26, cursor: "pointer", fontSize: 12 }}>✕</button>
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent,#000d)", padding: "16px 10px 8px", fontSize: 10, fontFamily: "'DM Mono',monospace", color: accent, letterSpacing: 2, textTransform: "uppercase" }}>{label}</div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 38 }}>{icon}</div>
          <div style={{ color: "#444", fontSize: 10, fontFamily: "'DM Mono',monospace", letterSpacing: 2, textTransform: "uppercase" }}>{label}</div>
          <div style={{ color: "#2a2a2a", fontSize: 9, fontFamily: "'DM Mono',monospace" }}>drop or click</div>
        </>
      )}
      <input ref={ref} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handle(e.target.files[0])} />
    </div>
  );
}

function ProcessingOverlay({ progress, statusText }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000e", zIndex: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
      <div style={{ width: 72, height: 72, borderRadius: "50%", border: "3px solid #1a1a1a", borderTop: "3px solid #ff4ecd", animation: "spin 0.8s linear infinite" }} />
      <div style={{ fontFamily: "'DM Mono',monospace", color: "#ff4ecd", letterSpacing: 4, fontSize: 11, textTransform: "uppercase" }}>Swapping Faces</div>
      <div style={{ width: 220, height: 2, background: "#1a1a1a", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", background: "linear-gradient(90deg,#ff4ecd,#ff8c00)", width: `${progress}%`, transition: "width 0.4s ease", borderRadius: 2 }} />
      </div>
      <div style={{ fontFamily: "'DM Mono',monospace", color: "#444", fontSize: 9, letterSpacing: 2 }}>{statusText}</div>
    </div>
  );
}

function ResultPanel({ result, onReset, onDownload }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, animation: "fadeIn 0.5s ease" }}>
      <div style={{ width: 280, height: 340, borderRadius: 20, overflow: "hidden", position: "relative", boxShadow: "0 0 50px #ff4ecd44,0 0 100px #ff8c0022", border: "2px solid #ff4ecd55" }}>
        <img src={result} alt="Result" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <div style={{ position: "absolute", top: 10, right: 10, background: "#ff4ecd1a", border: "1px solid #ff4ecd", borderRadius: 6, padding: "3px 8px", fontSize: 9, color: "#ff4ecd", fontFamily: "'DM Mono',monospace", letterSpacing: 2 }}>✓ SWAPPED</div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onReset} style={{ padding: "9px 20px", borderRadius: 9, border: "1px solid #2a2a2a", background: "transparent", color: "#666", cursor: "pointer", fontFamily: "'DM Mono',monospace", fontSize: 10, letterSpacing: 2, textTransform: "uppercase" }}>← New Swap</button>
        <button onClick={onDownload} style={{ padding: "9px 20px", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#ff4ecd,#ff8c00)", color: "#fff", cursor: "pointer", fontFamily: "'DM Mono',monospace", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", boxShadow: "0 0 20px #ff4ecd33" }}>↓ Download</button>
      </div>
    </div>
  );
}

export default function FaceSwapApp() {
  const [sourceImg, setSourceImg] = useState(null);
  const [targetImg, setTargetImg] = useState(null);
  const [sourceB64, setSourceB64] = useState(null);
  const [targetB64, setTargetB64] = useState(null);
  const [step, setStep] = useState("upload");
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);

  const bothUploaded = !!(sourceImg && targetImg);

  const doSwap = async () => {
    setError(null); setProcessing(true); setProgress(0); setStatusText("Preparing...");
    try {
      const url = await callFaceSwapAPI(sourceB64, targetB64, (p, m) => { setProgress(p); setStatusText(m); });
      setResult(url); setStep("result");
    } catch (e) {
      setError(e.message || "Something went wrong.");
    } finally {
      setProcessing(false);
    }
  };

  const handleReset = () => {
    setSourceImg(null); setTargetImg(null); setSourceB64(null); setTargetB64(null);
    setResult(null); setProgress(0); setStatusText(""); setError(null); setStep("upload");
  };

  const handleDownload = async () => {
    try {
      const res = await fetch(result); const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "faceswap.jpg"; a.click();
      URL.revokeObjectURL(url);
    } catch { window.open(result, "_blank"); }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#080808", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", position: "relative", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        * { box-sizing: border-box; }
      `}</style>
      <div style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "linear-gradient(#ffffff05 1px,transparent 1px),linear-gradient(90deg,#ffffff05 1px,transparent 1px)", backgroundSize: "40px 40px", pointerEvents: "none" }} />
      <div style={{ position: "fixed", top: "10%", left: "15%", width: 280, height: 280, borderRadius: "50%", background: "#ff4ecd14", filter: "blur(80px)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: "15%", right: "10%", width: 240, height: 240, borderRadius: "50%", background: "#ff8c0012", filter: "blur(80px)", pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 22, animation: "fadeIn 0.5s ease" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 9, letterSpacing: 6, color: "#ff4ecd", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", marginBottom: 6 }}>FREE · AI POWERED</div>
          <h1 style={{ margin: 0, fontSize: "clamp(34px,7vw,60px)", fontFamily: "'Syne',sans-serif", fontWeight: 800, background: "linear-gradient(135deg,#fff 30%,#ff4ecd 70%,#ff8c00)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", lineHeight: 1 }}>FACE SWAP</h1>
        </div>
        {error && (
          <div style={{ background: "#1a0008", border: "1.5px solid #ff204e44", borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, fontFamily: "'DM Mono',monospace", fontSize: 10, color: "#ff204e", maxWidth: 440 }}>
            <span>⚠</span><span style={{ flex: 1 }}>{error}</span>
            <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: "#ff204e", cursor: "pointer" }}>✕</button>
          </div>
        )}
        {step === "upload" && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", justifyContent: "center" }}>
              <UploadZone label="Source Face" icon="🙂" image={sourceImg} onUpload={setSourceImg} onFileReady={setSourceB64} accent="#ff4ecd" />
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg,#ff4ecd,#ff8c00)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>⇄</div>
              <UploadZone label="Target Photo" icon="🖼️" image={targetImg} onUpload={setTargetImg} onFileReady={setTargetB64} accent="#ff8c00" />
            </div>
            <button onClick={doSwap} disabled={!bothUploaded} style={{ padding: "13px 44px", borderRadius: 12, border: "none", background: !bothUploaded ? "#111" : "linear-gradient(135deg,#ff4ecd,#ff8c00)", color: !bothUploaded ? "#2a2a2a" : "#fff", fontSize: 12, fontFamily: "'DM Mono',monospace", letterSpacing: 3, textTransform: "uppercase", cursor: !bothUploaded ? "not-allowed" : "pointer", boxShadow: bothUploaded ? "0 0 32px #ff4ecd33" : "none", transition: "all 0.3s" }}>
              {bothUploaded ? "✦ Swap Faces" : "Upload Both Photos"}
            </button>
          </>
        )}
        {step === "result" && result && <ResultPanel result={result} onReset={handleReset} onDownload={handleDownload} />}
      </div>
      {processing && <ProcessingOverlay progress={progress} statusText={statusText} />}
    </div>
  );
                       }
