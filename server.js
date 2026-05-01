const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const cors = require("cors");
const crypto = require("crypto");

const app = express();

app.use(cors());
app.use(express.json());

const uri =
  "mongodb+srv://santhiyadb:santhiyadb@cluster0.oqbdkmd.mongodb.net/vtmtDB";

const client = new MongoClient(uri, {
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 5000,
  socketTimeoutMS: 10000,
});

let db;

async function connectDB() {
  await client.connect();
  db = client.db("vtmtDB");
  console.log("Using DB:", db.databaseName);

  await db.collection("users").createIndex({ email: 1 }, { unique: true });
  await db.collection("forms").createIndex({ publicToken: 1 }, { unique: true });
  await db.collection("forms").createIndex({ ownerId: 1 });
  await db.collection("submissions").createIndex({ formId: 1 });
  await db.collection("submissions").createIndex(
    { formId: 1, registerNo: 1 },
    {
      unique: true,
      partialFilterExpression: {
        registerNo: { $exists: true, $type: "string" },
      },
    }
  );

  console.log("MongoDB connected");

  setInterval(async () => {
    try {
      await db.command({ ping: 1 });
      console.log("DB keep-alive ✅");
    } catch (e) {
      console.log("Ping failed:", e.message);
    }
  }, 5 * 60 * 1000);
}

connectDB().catch((err) => {
  console.error("DB connection failed:", err);
  process.exit(1);
});

function createToken() {
  return crypto.randomBytes(12).toString("hex");
}

function createPublicToken() {
  return crypto.randomBytes(6).toString("base64url");
}

function sanitizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function requireUser(req, res, next) {
  const userId = req.header("x-user-id");
  const role = req.header("x-user-role");

  if (!userId || !role) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  req.user = { userId, role };
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin only" });
  }
  next();
}

// =========================
// ANALYSIS ALGORITHM
// =========================

const SW = new Set([
  "i", "me", "my", "we", "our", "you", "your", "he", "she", "it",
  "they", "their", "what", "which", "who", "this", "that", "these", "those", "am",
  "is", "are", "was", "were", "be", "been", "have", "has", "had", "do", "does", "did",
  "will", "would", "could", "should", "a", "an", "the", "and", "but", "or", "if",
  "in", "on", "at", "to", "for", "of", "with", "by", "from", "as", "so", "very", "just"
]);

const PW = [
  "good", "great", "excellent", "amazing", "wonderful", "fantastic",
  "love", "happy", "best", "awesome", "perfect", "helpful", "easy", "clean", "fast",
  "friendly", "enjoy", "nice", "recommend", "satisfied", "outstanding", "superb",
  "pleasant", "impressive", "positive", "efficient", "smooth", "brilliant", "thank",
  "thanks", "better", "well", "like", "glad", "pleased", "clear", "useful"
];

const NW = [
  "bad", "poor", "terrible", "worst", "horrible", "awful", "hate", "slow",
  "difficult", "hard", "broken", "issue", "problem", "fail", "failed", "error", "bug",
  "confusing", "ugly", "useless", "disappointing", "frustrating", "annoying",
  "waste", "boring", "negative", "unfriendly", "crash", "complicated", "dirty",
  "expensive", "rude", "wrong", "missing", "never", "cant", "wont", "worse",
  "dislike", "unclear", "confuse", "fast", "speed", "rushed", "late", "delay",
  "skip", "average", "insufficient", "poorly", "fast", "too_fast", "speed", "rushed",
  "unclear", "poorly", "doubt", "boring", "late", "delay", "difficult", "complex",
  "skip", "insufficient", "average"
];

function stem(w) {
  return w
    .replace(/ing$/, "")
    .replace(/tion$/, "")
    .replace(/ness$/, "")
    .replace(/ment$/, "")
    .replace(/ly$/, "")
    .replace(/ies$/, "y")
    .replace(/ied$/, "y")
    .replace(/ers?$/, "");
}

function preprocess(text) {
  if (!text || typeof text !== "string") return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !SW.has(w))
    .map(stem);
}

function computeTFIDF(docs) {
  const tfd = docs.map((doc) => {
    const f = {};
    doc.forEach((w) => {
      f[w] = (f[w] || 0) + 1;
    });
    return f;
  });

  const df = {};
  tfd.forEach((f) => {
    Object.keys(f).forEach((w) => {
      df[w] = (df[w] || 0) + 1;
    });
  });

  const n = docs.length;
  const tfidf = tfd.map((f) => {
    const tot = Object.values(f).reduce((a, b) => a + b, 0) || 1;
    const v = {};
    Object.entries(f).forEach(([w, c]) => {
      v[w] = (c / tot) * (Math.log((n + 1) / (df[w] + 1)) + 1);
    });
    return v;
  });

  return { tfidf, df };
}

function getRatingSignal(answers) {
  let pos = 0;
  let neg = 0;
  let neu = 0;

  if (!answers || typeof answers !== "object") {
    return { pos, neg, neu };
  }

  Object.values(answers).forEach((v) => {
    const num = Number(v);

    if (!Number.isNaN(num)) {
      if (num >= 4) pos += 1;
      else if (num <= 2) neg += 1;
      else neu += 1;
    }
  });

  return { pos, neg, neu };
}

function classifyNB(vec, answers = {}) {
  const sp = PW.map(stem);
  const sn = NW.map(stem);

  let p = 0.1;
  let n = 0.1;
  let u = 0.1;

  Object.entries(vec).forEach(([w, sc]) => {
    if (sp.some((pw) => w.includes(pw) || pw.includes(w))) {
      p += sc;
    } else if (sn.some((nw) => w.includes(nw) || nw.includes(w))) {
      n += sc;
    } else {
      u += sc * 0.05;
    }
  });

  const ratingSignal = getRatingSignal(answers);
  p += ratingSignal.pos * 0.35;
  n += ratingSignal.neg * 0.35;
  u += ratingSignal.neu * 0.20;

  const tot = p + n + u;
  const pr = {
    Positive: p / tot,
    Negative: n / tot,
    Neutral: u / tot,
  };

  return Object.entries(pr).sort((a, b) => b[1] - a[1])[0];
}

function extractSubmissionText(submission) {
  const parts = [];

  if (submission.answers && typeof submission.answers === "object") {
    Object.values(submission.answers).forEach((v) => {
      if (typeof v === "string") parts.push(v);
      else if (Array.isArray(v)) parts.push(v.join(" "));
    });
  }

  if (submission.comment && typeof submission.comment === "string") {
    parts.push(submission.comment);
  }

  return parts.join(" ");
}

function runNB(submissions) {
  const texts = submissions.map(extractSubmissionText);
  const processed = texts.map(preprocess);
  const { tfidf } = computeTFIDF(processed);

  const results = submissions.map((s, i) => {
    const [label, prob] = classifyNB(tfidf[i] || {}, s.answers || {});
    return {
      ...s,
      sentiment: label,
      confidence: Math.round(prob * 100),
    };
  });

  const global = {};
  tfidf.forEach((v) => {
    Object.entries(v).forEach(([w, sc]) => {
      global[w] = (global[w] || 0) + sc;
    });
  });

  const tfidf_top = Object.entries(global)
    .filter(([w]) => w.length > 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 16)
    .map(([word, score]) => ({ word, score }));

  const avgConfidence = results.length
    ? Math.round(results.reduce((a, b) => a + b.confidence, 0) / results.length)
    : 0;

  return { results, tfidf_top, confidence: avgConfidence };
}

function anonymizeSubmission(s) {
  return {
    submissionId: String(s._id),
    formId: s.formId,
    answers: s.answers || {},
    comment: s.comment || "",
    createdAt: s.createdAt,
    sentiment: s.sentiment,
    confidence: s.confidence,
  };
}

// =========================
// SEED USERS
// =========================

app.post("/auth/seed-users", async (req, res) => {
  try {
    const usersCollection = db.collection("users");

    await usersCollection.updateOne(
      { email: "admin@college.com" },
      {
        $set: {
          name: "Admin User",
          email: "admin@college.com",
          password: "admin123",
          role: "admin",
        },
      },
      { upsert: true }
    );

    await usersCollection.updateOne(
      { email: "faculty@college.com" },
      {
        $set: {
          name: "Faculty User",
          email: "faculty@college.com",
          password: "faculty123",
          role: "faculty",
        },
      },
      { upsert: true }
    );

    const users = await usersCollection.find({}).toArray();

    res.json({
      success: true,
      message: "Seed users ready",
      count: users.length,
      users,
    });
  } catch (err) {
    console.error("Seed error:", err);
    res.status(500).json({ error: err.message });
  }
});

// =========================
// AUTH
// =========================

app.post("/auth/login", async (req, res) => {
  try {
    const email = sanitizeText(req.body.email).toLowerCase();
    const password = sanitizeText(req.body.password);

    const user = await db.collection("users").findOne({ email, password });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    res.json({
      success: true,
      user: {
        userId: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        sessionToken: createToken(),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

// =========================
// FORMS CREATE
// =========================

app.post("/forms", requireUser, async (req, res) => {
  try {
    if (!["faculty", "admin"].includes(req.user.role)) {
      return res.status(403).json({ error: "Faculty/Admin only" });
    }

    const {
      title,
      description,
      subject,
      section,
      facultyName,
      questions,
      startDate,
      endDate,
    } = req.body;

    if (!title || !subject || !section || !Array.isArray(questions) || !questions.length) {
      return res.status(400).json({ error: "Missing required form fields" });
    }

    const publicToken = createPublicToken();

    const doc = {
      title: sanitizeText(title),
      description: sanitizeText(description),
      subject: sanitizeText(subject),
      section: sanitizeText(section),
      facultyName: sanitizeText(facultyName),
      ownerId: req.user.userId,
      ownerRole: req.user.role,
      questions,
      status: "published",
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      publicToken,
      createdAt: new Date(),
    };

    const result = await db.collection("forms").insertOne(doc);

    res.json({
      success: true,
      formId: String(result.insertedId),
      publicToken,
      publicUrl: `/form/${publicToken}`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create form" });
  }
});

app.get("/forms/mine", requireUser, async (req, res) => {
  try {
    const query = req.user.role === "admin" ? {} : { ownerId: req.user.userId };

    const forms = await db
      .collection("forms")
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    res.json(
      forms.map((f) => ({
        formId: String(f._id),
        title: f.title,
        subject: f.subject,
        section: f.section,
        facultyName: f.facultyName,
        status: f.status,
        publicToken: f.publicToken,
        publicUrl: `/form/${f.publicToken}`,
        createdAt: f.createdAt,
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch forms" });
  }
});

app.get("/forms/:formId/analytics", requireUser, async (req, res) => {
  try {
    const formId = req.params.formId;

    const form = await db.collection("forms").findOne({ _id: new ObjectId(formId) });

    if (!form) {
      return res.status(404).json({ error: "Form not found" });
    }

    if (req.user.role !== "admin" && form.ownerId !== req.user.userId) {
      return res.status(403).json({ error: "Not allowed" });
    }

    const submissions = await db
      .collection("submissions")
      .find({ formId })
      .sort({ createdAt: -1 })
      .toArray();

    if (!submissions.length) {
      return res.json({
        form: {
          formId,
          title: form.title,
          subject: form.subject,
          section: form.section,
        },
        results: [],
        tfidf_top: [],
        confidence: 0,
      });
    }

    const analysis = runNB(submissions);
    const anonymized = analysis.results.map(anonymizeSubmission);

    res.json({
      form: {
        formId,
        title: form.title,
        subject: form.subject,
        section: form.section,
      },
      results: anonymized,
      tfidf_top: analysis.tfidf_top,
      confidence: analysis.confidence,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

// =========================
// ADMIN ONLY
// =========================

app.get("/admin/forms/:formId/submissions", requireUser, requireAdmin, async (req, res) => {
  try {
    const formId = req.params.formId;

    const submissions = await db
      .collection("submissions")
      .find({ formId })
      .sort({ createdAt: -1 })
      .toArray();

    res.json(
      submissions.map((s) => ({
        submissionId: String(s._id),
        formId: s.formId,
        studentName: s.studentName || "",
        registerNo: s.registerNo || "",
        section: s.section || "",
        answers: s.answers || {},
        comment: s.comment || "",
        createdAt: s.createdAt,
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch admin submissions" });
  }
});

app.post("/admin/create-faculty", requireUser, requireAdmin, async (req, res) => {
  try {
    const name = sanitizeText(req.body.name);
    const email = sanitizeText(req.body.email).toLowerCase();
    const password = sanitizeText(req.body.password);

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email and password are required" });
    }

    const existing = await db.collection("users").findOne({ email });
    if (existing) {
      return res.status(409).json({ error: "User already exists with this email" });
    }

    const result = await db.collection("users").insertOne({
      name,
      email,
      password,
      role: "faculty",
      createdAt: new Date(),
    });

    res.json({
      success: true,
      message: "Faculty created successfully",
      faculty: {
        userId: String(result.insertedId),
        name,
        email,
        role: "faculty",
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create faculty" });
  }
});

// =========================
// PUBLIC ROUTES
// =========================

app.get("/public/forms/:token", async (req, res) => {
  try {
    const token = sanitizeText(req.params.token);

    const form = await db.collection("forms").findOne({ publicToken: token });

    if (!form) {
      return res.status(404).json({ error: "Form not found" });
    }

    if (form.status !== "published") {
      return res.status(403).json({ error: "Form is not active" });
    }

    const now = new Date();
    if (form.startDate && now < form.startDate) {
      return res.status(403).json({ error: "Form is not active yet" });
    }
    if (form.endDate && now > form.endDate) {
      return res.status(403).json({ error: "Form has expired" });
    }

    res.json({
      formId: String(form._id),
      title: form.title,
      description: form.description,
      subject: form.subject,
      section: form.section,
      facultyName: form.facultyName,
      questions: form.questions,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch form" });
  }
});

app.post("/public/forms/:token/submit", async (req, res) => {
  try {
    const token = sanitizeText(req.params.token);

    const form = await db.collection("forms").findOne({ publicToken: token });

    if (!form) {
      return res.status(404).json({ error: "Form not found" });
    }

    if (form.status !== "published") {
      return res.status(403).json({ error: "Form is not active" });
    }

    const studentName = sanitizeText(req.body.studentName);
    const registerNo = sanitizeText(req.body.registerNo);
    const section = sanitizeText(req.body.section);
    const comment = sanitizeText(req.body.comment);
    const answers =
      req.body.answers && typeof req.body.answers === "object" ? req.body.answers : {};

    if (!studentName || !registerNo) {
      return res.status(400).json({ error: "Student name and register number required" });
    }

    const formId = String(form._id);

    const existing = await db.collection("submissions").findOne({
      formId,
      registerNo,
    });

    if (existing) {
      return res.status(409).json({ error: "You already submitted this form" });
    }

    const result = await db.collection("submissions").insertOne({
      formId,
      studentName,
      registerNo,
      section,
      comment,
      answers,
      createdAt: new Date(),
    });

    res.json({
      success: true,
      submissionId: String(result.insertedId),
      message: "Feedback submitted successfully",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to submit feedback" });
  }
});

// =========================
// DEBUG + HEALTH
// =========================

app.get("/health", async (req, res) => {
  try {
    await db.command({ ping: 1 });
    res.json({ ok: true, message: "Server healthy" });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/debug/users", async (req, res) => {
  try {
    const users = await db.collection("users").find({}).toArray();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================
// START
// =========================

app.listen(5001, "0.0.0.0", () => {
  console.log("Server running on port 5001");
});