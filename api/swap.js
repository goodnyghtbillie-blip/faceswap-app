export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const { source, target } = body || {};

  if (!source || !target) {
    return res.status(400).json({ message: "Missing source or target", body: req.body });
  }

  try {
    const response = await fetch("https://deepfake-face-swap-p.rapidapi.com/swap", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-rapidapi-host": "deepfake-face-swap-p.rapidapi.com",
        "x-rapidapi-key": "90bd11435amsh1151c74d53568d2p10f953jsn8d127ffa3148"
      },
      body: JSON.stringify({ source, target })
    });

    const text = await response.text();

    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    return res.status(response.status).json(data);

  } catch (err) {
    return res.status(500).json({ 
      message: err.message,
      cause: err.cause?.message || null,
      type: err.name
    });
  }
}
