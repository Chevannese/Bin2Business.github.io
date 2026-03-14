const express = require("express");
const multer = require("multer");
const cors = require("cors");
const vision = require("@google-cloud/vision");

const app = express();
app.use(cors());
app.use(express.json());

// File upload middleware
const upload = multer({ storage: multer.memoryStorage() });

// Google Vision client
const client = new vision.ImageAnnotatorClient();

// Mock Jamaican company database
const companies = [
    {
        name: "Recycle Jamaica Ltd",
        type: "plastic",
        price: 50,
        lat: 18.017,
        lng: -76.793,
        address: "Kingston",
        phone: "876-555-0101"
    },
    {
        name: "Green Earth Collectors",
        type: "glass",
        price: 40,
        lat: 18.05,
        lng: -76.78,
        address: "St. Andrew",
        phone: "876-555-0199"
    }
];

// PROCESS IMAGE
app.post("/api/process", upload.single("image"), async (req, res) => {
    try {
        const [result] = await client.labelDetection(req.file.buffer);
        const labels = result.labelAnnotations.map(l => l.description.toLowerCase());

        let material = null;

        if (labels.includes("plastic bottle")) material = "plastic";
        else if (labels.includes("bottle") && labels.includes("glass")) material = "glass";
        else return res.json({ error: "This item is not recognized as recyclable." });

        const matched = companies.filter(c => c.type === material);

        res.json({
            imageUrl: "data:image/png;base64," + req.file.buffer.toString("base64"),
            companies: matched
        });

    } catch (err) {
        console.error(err);
        res.json({ error: "Processing failed." });
    }
});

app.listen(3000, () => console.log("Server running on port 3000"));