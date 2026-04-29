export default async function handler(req, res) {
  const response = await fetch("https://deepfake-face-swap-p.rapidapi.com/swap", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-rapidapi-host": "deepfake-face-swap-p.rapidapi.com",
      "x-rapidapi-key": "90bd11435amsh1151c74d53568d2p10f953jsn8d127ffa3148"
    },
    body: JSON.stringify(req.body)
  });
  const data = await response.json();
  res.status(200).json(data);
}
