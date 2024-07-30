import "dotenv/config";
import app from "./app.js";
import connect from "./config/connection.js";

connect();

app.get("/", (req, res) => {
  res.send("Server active!");
});

const port = process.env.PORT;

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
