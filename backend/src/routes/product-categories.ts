import { Router } from "express";
import { z } from "zod";
import { listAllSavedCategoryLabels, rememberProductCategory } from "../lib/product-category.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const labelSchema = z.object({
  label: z.string().min(1).max(128),
});

/** Merged saved + in-use category strings (built-in IT list is client-side only). */
router.get("/", async (_req, res) => {
  const labels = await listAllSavedCategoryLabels();
  res.json({ labels });
});

/** Register a category before assigning it to a product (optional UX). */
router.post("/", async (req, res) => {
  const parsed = labelSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const label = parsed.data.label.trim();
  if (!label) {
    res.status(400).json({ error: "Label is empty" });
    return;
  }
  await rememberProductCategory(label);
  const labels = await listAllSavedCategoryLabels();
  res.status(201).json({ label, labels });
});

export default router;
