const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Hello Meena DevOps 🚀 Day7");
});

app.listen(5000, "0.0.0.0", () => {
  console.log("Server running on port 5000");
});