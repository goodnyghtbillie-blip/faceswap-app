const express = require("express");
const app = express();
app.use(express.json());

app.post("/api/swap", async (req, res) => {
  const { source, target } = req.body;
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
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.listen(3000);
