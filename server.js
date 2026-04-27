const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

app.get('/api', (req, res) => {
  res.json({ message: "Hello Meena 💙 DevOps Journey Started!" });
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});