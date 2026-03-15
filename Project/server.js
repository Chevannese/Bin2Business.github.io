require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const vision = require("@google-cloud/vision");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Google Vision client ───────────────────────────────────────────────────────
// Authenticates via GOOGLE_APPLICATION_CREDENTIALS env var (path to your service account JSON)
const visionClient = new vision.ImageAnnotatorClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "20mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are accepted."));
    }
    cb(null, true);
  },
});

// ── Waste classification map ───────────────────────────────────────────────────
// Maps Google Vision labels → waste metadata
// pricePerKgJMD values are approximate Jamaican scrap/recycling market rates
const WASTE_MAP = [
  {
    keywords: ["plastic bottle", "plastic", "bottle", "pet", "container", "jug", "plastic bag", "packaging"],
    trashType: "Plastic",
    category: "Plastic",
    pricePerKgJMD: 20,
    avgWeightKg: 0.05,
    tips: "Rinse and crush bottles to save space before dropping off.",
  },
  {
    keywords: ["aluminium", "aluminum", "can", "tin can", "metal can", "beverage can", "soda can"],
    trashType: "Aluminium Can",
    category: "Metal",
    pricePerKgJMD: 120,
    avgWeightKg: 0.015,
    tips: "Crush cans flat and collect at least 1 kg before selling.",
  },
  {
    keywords: ["scrap metal", "iron", "steel", "copper", "metal", "wire", "pipe", "rebar"],
    trashType: "Scrap Metal",
    category: "Metal",
    pricePerKgJMD: 80,
    avgWeightKg: 1.0,
    tips: "Separate ferrous (iron/steel) from non-ferrous (copper/aluminium) metals for better prices.",
  },
  {
    keywords: ["glass bottle", "glass", "jar", "bottle", "glassware"],
    trashType: "Glass",
    category: "Glass",
    pricePerKgJMD: 10,
    avgWeightKg: 0.3,
    tips: "Rinse containers and remove lids before recycling.",
  },
  {
    keywords: ["cardboard", "paper", "newspaper", "magazine", "carton", "box", "corrugated"],
    trashType: "Paper / Cardboard",
    category: "Paper",
    pricePerKgJMD: 15,
    avgWeightKg: 0.5,
    tips: "Keep paper dry — wet or greasy paper has little to no value.",
  },
  {
    keywords: ["electronics", "computer", "laptop", "phone", "circuit", "battery", "electronic", "device", "cable"],
    trashType: "Electronic Waste",
    category: "Electronics",
    pricePerKgJMD: 200,
    avgWeightKg: 0.5,
    tips: "Take e-waste to a certified facility — it contains valuable and hazardous materials.",
  },
  {
    keywords: ["food", "fruit", "vegetable", "organic", "waste", "compost", "plant", "leaf", "wood"],
    trashType: "Organic Waste",
    category: "Organic",
    pricePerKgJMD: 5,
    avgWeightKg: 0.5,
    tips: "Compost organic waste to create nutrient-rich soil for gardening.",
  },
];

// ── Classify labels returned by Vision API ────────────────────────────────────
function classifyWaste(labels, objects) {
  // Combine label descriptions and object names into one lowercase list
  const terms = [
    ...labels.map((l) => l.description.toLowerCase()),
    ...objects.map((o) => o.name.toLowerCase()),
  ];

  // Find the best matching waste category
  let bestMatch = null;
  let bestScore = 0;

  for (const waste of WASTE_MAP) {
    const score = waste.keywords.filter((kw) =>
      terms.some((t) => t.includes(kw) || kw.includes(t))
    ).length;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = waste;
    }
  }

  if (!bestMatch || bestScore === 0) {
    return {
      trashType: "Unidentified Waste",
      category: "Unknown",
      confidence: "Low",
      estimatedWeightKg: 0,
      pricePerKgJMD: 0,
      estimatedEarningsJMD: 0,
      tips: "We could not identify this item. Try a clearer, closer photo.",
      recyclable: false,
      detectedLabels: terms.slice(0, 8),
    };
  }

  // Use the top label confidence score as our confidence indicator
  const topConfidence = labels[0]?.score ?? 0;
  const confidence =
    topConfidence >= 0.85 ? "High" : topConfidence >= 0.65 ? "Medium" : "Low";

  const estimatedEarningsJMD = Math.round(
    bestMatch.avgWeightKg * bestMatch.pricePerKgJMD
  );

  return {
    trashType: bestMatch.trashType,
    category: bestMatch.category,
    confidence,
    estimatedWeightKg: bestMatch.avgWeightKg,
    pricePerKgJMD: bestMatch.pricePerKgJMD,
    estimatedEarningsJMD,
    tips: bestMatch.tips,
    recyclable: bestMatch.category !== "Unknown",
    detectedLabels: terms.slice(0, 8), // handy for debugging
  };
}

// ── POST /analyze ──────────────────────────────────────────────────────────────
app.post("/analyze", upload.single("image"), async (req, res) => {
  try {
    let imagePayload;

    // Option A – multipart file upload
    if (req.file) {
      imagePayload = { content: req.file.buffer };
    }
    // Option B – JSON body with base64 data URL
    else if (req.body?.image) {
      const matches = req.body.image.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) return res.status(400).json({ error: "Invalid base64 image format." });
      imagePayload = { content: Buffer.from(matches[2], "base64") };
    } else {
      return res.status(400).json({ error: "No image provided." });
    }

    // Run label detection + object localisation in parallel
    const [labelResult, objectResult] = await Promise.all([
      visionClient.labelDetection({ image: imagePayload }),
      visionClient.objectLocalization({ image: imagePayload }),
    ]);

    const labels = labelResult[0].labelAnnotations ?? [];
    const objects = objectResult[0].localizedObjectAnnotations ?? [];

    const result = classifyWaste(labels, objects);

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error("Error during analysis:", err);
    return res.status(500).json({ error: err.message || "Internal server error." });
  }
});

// ── Health check ───────────────────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok" }));

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Bin2Business server running on http://localhost:${PORT}`);
  console.log(`POST http://localhost:${PORT}/analyze  — send image to identify waste`);
});
