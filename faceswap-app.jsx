import { useState, useRef, useCallback, useEffect } from "react";

// ════════════════════════════════════════════════════════
//  🔑 REVENUECAT + API CONFIG
//  Setup steps:
//  1. Create a RevenueCat account at app.revenuecat.com
//  2. Connect your Stripe account in RC dashboard
//  3. Create a Web Billing app → copy the public web key
//  4. Create products: "pair_monthly" and "pro_monthly"
//  5. Create an entitlement called "premium"
//  6. Paste your RC Web Billing public key below
// ════════════════════════════════════════════════════════
const RC_WEB_KEY      = "YOUR_RC_WEB_BILLING_PUBLIC_KEY";  // from RC dashboard → API Keys
const RC_ENTITLEMENT  = "premium";                          // entitlement ID in RC dashboard

// Your RapidAPI face swap key
const RAPIDAPI_KEY    = "90bd11435amsh1151c74d53568d2p10f953jsn8d127ffa3148";
const RAPIDAPI_HOST   = "deepfake-face-swap-ai.p.rapidapi.com";
const RAPIDAPI_URL    = `https://${RAPIDAPI_HOST}/target-face`;

const FREE_SWAP_LIMIT = 2;

// ════════════════════════════════════════════════════════
//  RevenueCat Web SDK loader
//  Loads purchases-js from CDN, initialises with anon user
// ════════════════════════════════════════════════════════
let rcInstance = null;

async function loadRC() {
  if (rcInstance) return rcInstance;
  if (RC_WEB_KEY === "YOUR_RC_WEB_BILLING_PUBLIC_KEY") return null;

  // Load the RevenueCat Web SDK from CDN
  if (!window.Purchases) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://unpkg.com/@revenuecat/purchases-js@latest/dist/index.js";
      s.onload = res;
      s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  // Use anonymous ID (stored in localStorage for persistence)
  let appUserId = localStorage.getItem("rc_user_id");
  if (!appUserId) {
    appUserId = window.Purchases.Purchases.generateRevenueCatAnonymousAppUserId();
    localStorage.setItem("rc_user_id", appUserId);
  }

  rcInstance = window.Purchases.Purchases.configure({
    apiKey: RC_WEB_KEY,
    appUserId,
  });

  return rcInstance;
}

async function checkEntitlement() {
  try {
    const rc = await loadRC();
    if (!rc) return null;
    const info = await rc.getCustomerInfo();
    return info.entitlements.active[RC_ENTITLEMENT] ?? null;
  } catch { return null; }
}

async function getOfferings() {
  try {
    const rc = await loadRC();
    if (!rc) return null;
    return await rc.getOfferings();
  } catch { return null; }
}

async function purchasePackage(pkg) {
  const rc = await loadRC();
  if (!rc) throw new Error("RevenueCat not initialized");
  return rc.purchase({ rcPackage: pkg });
}

async function restorePurchases() {
  const rc = await loadRC();
  if (!rc) throw new Error("RevenueCat not initialized");
  return rc.restorePurchases();
}

// ════════════════════════════════════════════════════════
//  Subscription hook
// ════════════════════════════════════════════════════════
function useSubscription() {
  const [plan, setPlan] = useState("pair");          // "free" | "pair" | "pro"
  const [entitlement, setEntitlement] = useState(null);
  const [swapsUsed, setSwapsUsed] = useState(() => {
    return parseInt(localStorage.getItem("swaps_used") || "0", 10);
  });
  const [rcReady, setRcReady] = useState(false);
  const [offerings, setOfferings] = useState(null);

  const swapsLeft = plan === "free" ? Math.max(0, FREE_SWAP_LIMIT - swapsUsed) : Infinity;
  const canSwap   = plan !== "free" || swapsUsed < FREE_SWAP_LIMIT;

  // On mount — check entitlement + load offerings
  useEffect(() => {
    (async () => {
      const ent = await checkEntitlement();
      if (ent) {
        setPlan("pair");
        setEntitlement(ent);
      }
      const offs = await getOfferings();
      setOfferings(offs);
      setRcReady(true);
    })();
  }, []);

  const recordSwap = () => {
    const next = swapsUsed + 1;
    setSwapsUsed(next);
    localStorage.setItem("swaps_used", String(next));
  };

  const activatePlan = (planId) => setPlan(planId);

  const handlePurchase = async (pkg) => {
    const result = await purchasePackage(pkg);
    if (result?.customerInfo?.entitlements?.active?.[RC_ENTITLEMENT]) {
      setPlan("pair");
      setEntitlement(result.customerInfo.entitlements.active[RC_ENTITLEMENT]);
    }
    return result;
  };

  const handleRestore = async () => {
    const info = await restorePurchases();
    if (info?.entitlements?.active?.[RC_ENTITLEMENT]) {
      setPlan("pair");
      setEntitlement(info.entitlements.active[RC_ENTITLEMENT]);
      return true;
    }
    return false;
  };

  return { plan, swapsLeft, canSwap, recordSwap, activatePlan, offerings, rcReady, entitlement, handlePurchase, handleRestore };
}

// ════════════════════════════════════════════════════════
//  API helpers
// ════════════════════════════════════════════════════════
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
  const res = await fetch("https://api.imgbb.com/1/upload?key=2e9a7b0a3b1c8d4e5f6a7b8c9d0e1f2a", { method: "POST", body: form });
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

  const body = new URLSearchParams();
  body.append("source_url", sourceUrl);
  body.append("target_url", targetUrl);

  const res = await fetch(RAPIDAPI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "x-rapidapi-host": RAPIDAPI_HOST, "x-rapidapi-key": RAPIDAPI_KEY },
    body: body.toString(),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.message || `API error ${res.status}`); }

  onProgress(85, "Processing...");
  const data = await res.json();
  const out = data?.result_url || data?.output_url || data?.image_url || data?.result || data?.output || data?.url;
  if (!out) throw new Error("No output image returned");
  onProgress(100, "Done!");
  return out;
}

// ════════════════════════════════════════════════════════
//  UI Components
// ════════════════════════════════════════════════════════

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
      style={{
        position: "relative", width: 210, height: 250, borderRadius: 18,
        border: `2px dashed ${drag ? accent : image ? accent : "#2a2a2a"}`,
        background: image ? "transparent" : "#0e0e0e",
        cursor: image ? "default" : "pointer", overflow: "hidden",
        transition: "all 0.2s",
        boxShadow: image ? `0 0 28px ${accent}33` : "none",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
      }}
    >
      {image ? (
        <>
          <img src={image} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <button onClick={e => { e.stopPropagation(); onUpload(null); onFileReady(null); }}
            style={{ position: "absolute", top: 8, right: 8, background: "#000b", color: "#fff", border: "none", borderRadius: "50%", width: 26, height: 26, cursor: "pointer", fontSize: 12 }}>✕</button>
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

function ResultPanel({ result, onReset, onDownload, isPaid }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, animation: "fadeIn 0.5s ease" }}>
      <div style={{ width: 280, height: 340, borderRadius: 20, overflow: "hidden", position: "relative", boxShadow: "0 0 50px #ff4ecd44,0 0 100px #ff8c0022", border: "2px solid #ff4ecd55" }}>
        <img src={result} alt="Result" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        {!isPaid && (
          <div style={{ position: "absolute", bottom: 10, right: 10, background: "#000a", borderRadius: 4, padding: "2px 6px", fontSize: 8, color: "#ffffff44", fontFamily: "'DM Mono',monospace", letterSpacing: 1 }}>FREE WATERMARK</div>
        )}
        <div style={{ position: "absolute", top: 10, right: 10, background: "#ff4ecd1a", border: "1px solid #ff4ecd", borderRadius: 6, padding: "3px 8px", fontSize: 9, color: "#ff4ecd", fontFamily: "'DM Mono',monospace", letterSpacing: 2 }}>✓ SWAPPED</div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onReset} style={{ padding: "9px 20px", borderRadius: 9, border: "1px solid #2a2a2a", background: "transparent", color: "#666", cursor: "pointer", fontFamily: "'DM Mono',monospace", fontSize: 10, letterSpacing: 2, textTransform: "uppercase" }}>← New Swap</button>
        <button onClick={onDownload} style={{ padding: "9px 20px", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#ff4ecd,#ff8c00)", color: "#fff", cursor: "pointer", fontFamily: "'DM Mono',monospace", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", boxShadow: "0 0 20px #ff4ecd33" }}>↓ Download</button>
      </div>
    </div>
  );
}

// ── Paywall Modal with real RevenueCat packages ────────
function PaywallModal({ onClose, offerings, rcReady, handlePurchase, handleRestore, onFallbackActivate }) {
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [selectedPkg, setSelectedPkg] = useState(null);

  // Get packages from RC offering
  const packages = offerings?.current?.availablePackages ?? [];
  const usingRC = rcReady && RC_WEB_KEY !== "YOUR_RC_WEB_BILLING_PUBLIC_KEY" && packages.length > 0;

  // Fallback static plans when RC not configured
  const staticPlans = [
    { id: "pair", label: "Pair", price: "$4.99/mo", features: ["Unlimited swaps", "HD quality", "No watermark", "Priority processing"], accent: "#ff4ecd", popular: true },
    { id: "pro",  label: "Pro",  price: "$12.99/mo", features: ["Everything in Pair", "Video face swap", "Batch mode", "API access"], accent: "#ff8c00", popular: false },
  ];
  const [selectedStatic, setSelectedStatic] = useState("pair");

  const doPurchase = async () => {
    setError(null);
    setLoading(true);
    try {
      if (usingRC && selectedPkg) {
        await handlePurchase(selectedPkg);
      } else {
        // Fallback simulation (replace with real Stripe direct if needed)
        await new Promise(r => setTimeout(r, 1800));
        onFallbackActivate(selectedStatic);
      }
      setSuccess(true);
      setTimeout(onClose, 1600);
    } catch (e) {
      setError(e?.message || "Purchase failed — please try again");
    } finally {
      setLoading(false);
    }
  };

  const doRestore = async () => {
    setRestoring(true);
    setError(null);
    try {
      const ok = await handleRestore();
      if (ok) { setSuccess(true); setTimeout(onClose, 1200); }
      else setError("No previous purchases found");
    } catch (e) {
      setError(e?.message || "Restore failed");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "#000c", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, animation: "fadeIn 0.2s ease" }}>
      <div style={{ background: "#080808", border: "1.5px solid #1e1e1e", borderRadius: 24, padding: "28px 24px", maxWidth: 500, width: "100%", position: "relative", maxHeight: "90vh", overflowY: "auto" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: 16 }}>✕</button>

        {success ? (
          <div style={{ textAlign: "center", padding: "28px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <div style={{ fontSize: 52 }}>🎉</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 26, color: "#fff" }}>Activated!</div>
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "#ff4ecd", letterSpacing: 3 }}>UNLIMITED SWAPS UNLOCKED</div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ textAlign: "center", marginBottom: 22 }}>
              <div style={{ fontSize: 9, letterSpacing: 5, color: "#ff4ecd", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", marginBottom: 8 }}>🔒 Free Limit Reached</div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 24, color: "#fff", lineHeight: 1.2 }}>Unlock Unlimited Swaps</div>
              <div style={{ color: "#444", fontSize: 10, fontFamily: "'DM Mono',monospace", marginTop: 6, letterSpacing: 1 }}>
                {usingRC ? "Powered by RevenueCat + Stripe · Cancel anytime" : "Simulated billing — add RC key for real payments"}
              </div>
            </div>

            {/* RC packages or fallback plans */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              {usingRC ? (
                packages.map((pkg, i) => {
                  const sel = selectedPkg?.identifier === pkg.identifier;
                  const accent = i === 0 ? "#ff4ecd" : "#ff8c00";
                  return (
                    <div key={pkg.identifier} onClick={() => setSelectedPkg(pkg)}
                      style={{ borderRadius: 14, padding: "14px 18px", border: `2px solid ${sel ? accent : "#1e1e1e"}`, background: sel ? `${accent}0d` : "#0e0e0e", cursor: "pointer", transition: "all 0.2s", boxShadow: sel ? `0 0 20px ${accent}22` : "none" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${sel ? accent : "#333"}`, background: sel ? accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {sel && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff" }} />}
                          </div>
                          <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 16, color: "#fff" }}>{pkg.product.title || pkg.identifier}</span>
                          {i === 0 && <span style={{ fontSize: 8, background: "linear-gradient(135deg,#ff4ecd,#ff8c00)", color: "#fff", borderRadius: 4, padding: "2px 6px", fontFamily: "'DM Mono',monospace", letterSpacing: 1 }}>POPULAR</span>}
                        </div>
                        <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18, color: accent }}>{pkg.product.priceString}</span>
                      </div>
                      {pkg.product.description && (
                        <div style={{ marginTop: 6, fontSize: 9, color: "#555", fontFamily: "'DM Mono',monospace", letterSpacing: 0.5 }}>{pkg.product.description}</div>
                      )}
                    </div>
                  );
                })
              ) : (
                staticPlans.map(p => (
                  <div key={p.id} onClick={() => setSelectedStatic(p.id)}
                    style={{ borderRadius: 14, padding: "14px 18px", border: `2px solid ${selectedStatic === p.id ? p.accent : "#1e1e1e"}`, background: selectedStatic === p.id ? `${p.accent}0d` : "#0e0e0e", cursor: "pointer", transition: "all 0.2s", boxShadow: selectedStatic === p.id ? `0 0 20px ${p.accent}22` : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${selectedStatic === p.id ? p.accent : "#333"}`, background: selectedStatic === p.id ? p.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {selectedStatic === p.id && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff" }} />}
                        </div>
                        <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 16, color: "#fff" }}>{p.label}</span>
                        {p.popular && <span style={{ fontSize: 8, background: "linear-gradient(135deg,#ff4ecd,#ff8c00)", color: "#fff", borderRadius: 4, padding: "2px 6px", fontFamily: "'DM Mono',monospace", letterSpacing: 1 }}>POPULAR</span>}
                      </div>
                      <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 16, color: p.accent }}>{p.price}</span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {p.features.map((f, i) => (
                        <div key={i} style={{ fontSize: 9, fontFamily: "'DM Mono',monospace", color: "#666", display: "flex", alignItems: "center", gap: 3 }}>
                          <span style={{ color: p.accent }}>✓</span> {f}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            {error && (
              <div style={{ background: "#1a0008", border: "1px solid #ff204e44", borderRadius: 8, padding: "8px 12px", fontSize: 10, color: "#ff204e", fontFamily: "'DM Mono',monospace", marginBottom: 12 }}>⚠ {error}</div>
            )}

            {/* CTA */}
            <button onClick={doPurchase} disabled={loading || (usingRC && !selectedPkg)}
              style={{ width: "100%", padding: "13px", borderRadius: 11, border: "none", background: loading ? "#1a1a1a" : "linear-gradient(135deg,#ff4ecd,#ff8c00)", color: loading ? "#444" : "#fff", fontSize: 12, fontFamily: "'DM Mono',monospace", letterSpacing: 3, textTransform: "uppercase", cursor: loading ? "not-allowed" : "pointer", boxShadow: loading ? "none" : "0 0 28px #ff4ecd33", transition: "all 0.2s", marginBottom: 10 }}>
              {loading ? "Processing..." : usingRC ? "Subscribe with Stripe" : "Activate Plan"}
            </button>

            {/* Restore + fine print */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button onClick={doRestore} disabled={restoring || !usingRC}
                style={{ background: "none", border: "none", color: usingRC ? "#555" : "#2a2a2a", cursor: usingRC ? "pointer" : "not-allowed", fontSize: 9, fontFamily: "'DM Mono',monospace", letterSpacing: 1, textDecoration: "underline" }}>
                {restoring ? "Restoring..." : "Restore purchases"}
              </button>
              <div style={{ fontSize: 8, color: "#2a2a2a", fontFamily: "'DM Mono',monospace", letterSpacing: 1 }}>Cancel anytime · Secure · Instant</div>
            </div>

            {!usingRC && (
              <div style={{ marginTop: 14, padding: "10px 12px", background: "#0d0900", border: "1px solid #ff8c0022", borderRadius: 8, fontSize: 9, color: "#555", fontFamily: "'DM Mono',monospace", lineHeight: 1.7 }}>
                ⚡ To enable real Stripe billing: set <span style={{ color: "#ff8c00" }}>RC_WEB_KEY</span> at the top of the file with your RevenueCat Web Billing public key from <span style={{ color: "#ff8c00" }}>app.revenuecat.com</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Plan badge ─────────────────────────────────────────
function PlanBadge({ plan, swapsLeft, onUpgrade, entitlement }) {
  const colors = { free: "#555", pair: "#ff4ecd", pro: "#ff8c00" };
  const accent = colors[plan] || "#555";
  const isPaid = plan !== "free";
  const expiry = entitlement?.expirationDate ? new Date(entitlement.expirationDate).toLocaleDateString() : null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#0a0a0a", border: `1px solid ${accent}33`, borderRadius: 20, padding: "5px 12px", fontSize: 9, fontFamily: "'DM Mono',monospace", letterSpacing: 2 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: accent, boxShadow: `0 0 6px ${accent}` }} />
        <span style={{ color: accent }}>{plan.toUpperCase()}</span>
        {isPaid ? (
          <span style={{ color: "#333" }}>· UNLIMITED {expiry ? `· renews ${expiry}` : ""}</span>
        ) : (
          <span style={{ color: "#333" }}>· {swapsLeft} swap{swapsLeft !== 1 ? "s" : ""} left</span>
        )}
      </div>
      {!isPaid && (
        <button onClick={onUpgrade} style={{ padding: "5px 12px", borderRadius: 20, border: "none", background: "linear-gradient(135deg,#ff4ecd,#ff8c00)", color: "#fff", fontSize: 9, fontFamily: "'DM Mono',monospace", letterSpacing: 2, textTransform: "uppercase", cursor: "pointer", boxShadow: "0 0 12px #ff4ecd33" }}>↑ Upgrade</button>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════
//  Main App
// ════════════════════════════════════════════════════════
export default function FaceSwapApp() {
  const { plan, swapsLeft, canSwap, recordSwap, activatePlan, offerings, rcReady, entitlement, handlePurchase, handleRestore } = useSubscription();

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
  const [showPaywall, setShowPaywall] = useState(false);

  const bothUploaded = !!(sourceImg && targetImg);

  const handleSwapClick = () => {
    if (!bothUploaded) return;
    if (!canSwap) { setShowPaywall(true); return; }
    doSwap();
  };

  const doSwap = async () => {
    setError(null); setProcessing(true); setProgress(0); setStatusText("Preparing...");
    try {
      const url = await callFaceSwapAPI(sourceB64, targetB64, (p, m) => { setProgress(p); setStatusText(m); });
      recordSwap();
      setResult(url);
      setStep("result");
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
      const res = await fetch(result);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "faceswap.jpg"; a.click();
      URL.revokeObjectURL(url);
    } catch { window.open(result, "_blank"); }
  };

  const btnLabel = () => {
    if (!bothUploaded) return "Upload Both Photos";
    if (!canSwap) return "🔒 Upgrade to Swap";
    return "✦ Swap Faces";
  };

  return (
    <div style={{ minHeight: "100vh", background: "#080808", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", position: "relative", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        * { box-sizing: border-box; }
      `}</style>

      <div style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "linear-gradient(#ffffff05 1px,transparent 1px),linear-gradient(90deg,#ffffff05 1px,transparent 1px)", backgroundSize: "40px 40px", pointerEvents: "none" }} />
      <div style={{ position: "fixed", top: "10%", left: "15%", width: 280, height: 280, borderRadius: "50%", background: "#ff4ecd14", filter: "blur(80px)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: "15%", right: "10%", width: 240, height: 240, borderRadius: "50%", background: "#ff8c0012", filter: "blur(80px)", pointerEvents: "none" }} />

      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 22, animation: "fadeIn 0.5s ease" }}>

        {/* Header */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 9, letterSpacing: 6, color: "#ff4ecd", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", marginBottom: 6 }}>
            PAIR SUBSCRIPTION · {rcReady && RC_WEB_KEY !== "YOUR_RC_WEB_BILLING_PUBLIC_KEY" ? "REVENUECAT + STRIPE" : "CONFIGURE RC TO GO LIVE"}
          </div>
          <h1 style={{ margin: 0, fontSize: "clamp(34px,7vw,60px)", fontFamily: "'Syne',sans-serif", fontWeight: 800, background: "linear-gradient(135deg,#fff 30%,#ff4ecd 70%,#ff8c00)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", lineHeight: 1 }}>FACE SWAP</h1>
        </div>

        <PlanBadge plan={plan} swapsLeft={swapsLeft} onUpgrade={() => setShowPaywall(true)} entitlement={entitlement} />

        {plan === "free" && swapsLeft <= 1 && swapsLeft > 0 && (
          <div style={{ background: "#100a00", border: "1px solid #ff8c0044", borderRadius: 8, padding: "7px 14px", fontSize: 9, color: "#ff8c00", fontFamily: "'DM Mono',monospace", letterSpacing: 1 }}>
            ⚡ Last free swap — upgrade to keep going
          </div>
        )}

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
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: canSwap ? "linear-gradient(135deg,#ff4ecd,#ff8c00)" : "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, transition: "all 0.3s" }}>
                {canSwap ? "⇄" : "🔒"}
              </div>
              <UploadZone label="Target Photo" icon="🖼️" image={targetImg} onUpload={setTargetImg} onFileReady={setTargetB64} accent="#ff8c00" />
            </div>

            <button onClick={handleSwapClick} disabled={!bothUploaded} style={{
              padding: "13px 44px", borderRadius: 12, border: "none",
              background: !bothUploaded ? "#111" : !canSwap ? "linear-gradient(135deg,#ff4ecd66,#ff8c0066)" : "linear-gradient(135deg,#ff4ecd,#ff8c00)",
              color: !bothUploaded ? "#2a2a2a" : "#fff", fontSize: 12,
              fontFamily: "'DM Mono',monospace", letterSpacing: 3, textTransform: "uppercase",
              cursor: !bothUploaded ? "not-allowed" : "pointer",
              boxShadow: bothUploaded ? "0 0 32px #ff4ecd33" : "none",
              transition: "all 0.3s",
            }}>{btnLabel()}</button>
          </>
        )}

        {step === "result" && result && (
          <ResultPanel result={result} onReset={handleReset} onDownload={handleDownload} isPaid={plan !== "free"} />
        )}
      </div>

      {processing && <ProcessingOverlay progress={progress} statusText={statusText} />}

      {showPaywall && (
        <PaywallModal
          onClose={() => setShowPaywall(false)}
          offerings={offerings}
          rcReady={rcReady}
          handlePurchase={handlePurchase}
          handleRestore={handleRestore}
          onFallbackActivate={(planId) => { activatePlan(planId); setShowPaywall(false); }}
        />
      )}
    </div>
  );
}
