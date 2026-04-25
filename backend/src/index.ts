import "./load-env.js";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import authRoutes from "./routes/auth.js";
import usersRoutes from "./routes/users.js";
import productsRoutes from "./routes/products.js";
import stockRoutes from "./routes/stock.js";
import companiesRoutes from "./routes/companies.js";
import sitesRoutes from "./routes/sites.js";
import personnelRoutes from "./routes/personnel.js";
import purchasesRoutes from "./routes/purchases.js";
import suppliersRoutes from "./routes/suppliers.js";

const app = express();
const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST ?? "0.0.0.0";
const frontendOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(helmet());
app.use(
  cors({
    origin: frontendOrigins.length === 1 ? frontendOrigins[0] : frontendOrigins,
    credentials: true,
  }),
);
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/stock", stockRoutes);
app.use("/api/companies", companiesRoutes);
app.use("/api/sites", sitesRoutes);
app.use("/api/personnel", personnelRoutes);
app.use("/api/purchases", purchasesRoutes);
app.use("/api/suppliers", suppliersRoutes);

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  },
);

app.listen(port, host, () => {
  console.log(`API listening on http://${host}:${port}`);
});
