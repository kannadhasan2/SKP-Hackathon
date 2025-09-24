import 'dotenv/config';
import express from "express";
import { createClient } from "@libsql/client";
import cors from "cors";
import jwt from "jsonwebtoken";

const app = express();
app.use(express.json());
app.use(cors({
  origin: [
    "http://localhost:5174",     
    "https://aec-cloud-book-snh8.vercel.app"
  ],
  credentials: true
}));

// Initialize Turso client
const db = createClient({
  url: 'libsql://skp-hackathon-kannadhasan2.aws-ap-south-1.turso.io',
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTg2OTUxNTYsImlkIjoiMjc1NDEyNWMtM2I4NS00NWYyLWFkNDUtYjUxMTQ4ODYwYjNjIiwicmlkIjoiMGYyN2QwYTItMGVjYS00ZDVmLWE4ZWItZTU4NmNkMjk2NDAwIn0.PLAZwA9cEYF5pE2bqOzsIN8foHyN0dQxchzqhY9bbR7rbb4AlKNnn-LMoOsIX2O17g7q40ggmyF27aN7ijFuCQ"
});

// DB Initialization
const initializeDB = async () => {
  try {
    // Students table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS student (
        register_no TEXT PRIMARY KEY,
        username TEXT,
        department TEXT,
        date_of_birth TEXT,
        email TEXT
      )
    `);

    // Books table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS books (
        book_id TEXT PRIMARY KEY,
        book_name TEXT,
        author TEXT,
        number_of_pages INTEGER,
        published_year INTEGER,
        publisher TEXT,
        description TEXT,
        book_count INTEGER,
        image_url TEXT,
        chapters TEXT
      )
    `);

    // Quiz table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS quiz (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question TEXT NOT NULL,
        options TEXT NOT NULL,
        answer TEXT NOT NULL
      )
    `);

    // Insert sample book if none exists
    const existingBooks = await db.execute("SELECT COUNT(*) AS count FROM books");
    if (existingBooks.rows[0].count === 0) {
      await db.execute({
        sql: `INSERT INTO books (
          book_id, book_name, author, number_of_pages, published_year, publisher, description, book_count, image_url, chapters
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          "B001",
          "Innovation101",
          "JohnDoe",
          250,
          2022,
          "OpenAIPress",
          "A book on innovation",
          5,
          "https://via.placeholder.com/150",
          JSON.stringify(["Intro", "Chapter1"])
        ],
      });
      console.log("✅ Sample book inserted");
    }

    // Start server if not on Vercel
    if (!process.env.VERCEL) {
      const PORT = process.env.PORT || 5000;
      app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
    }

  } catch (e) {
    console.error(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDB();

// JWT Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const jwtToken = authHeader && authHeader.split(" ")[1];

  if (!jwtToken) return res.status(401).send("Invalid JWT Token");

  jwt.verify(jwtToken, process.env.JWT_SECRET, (error, payload) => {
    if (error) return res.status(401).send("Invalid JWT Token");
    req.register_no = payload.register_no;
    next();
  });
};

// Routes
app.get("/", (req, res) => res.send("Working..."));

// Student Registration
app.post("/register", async (req, res) => {
  const { username, dateOfBirth, registerNo, department, email } = req.body;
  const dbStudent = await db.execute({
    sql: "SELECT * FROM student WHERE register_no = ?",
    args: [registerNo],
  });

  if (dbStudent.rows.length === 0) {
    await db.execute({
      sql: `INSERT INTO student (username, register_no, department, date_of_birth, email)
            VALUES (?, ?, ?, ?, ?)`,
      args: [username, registerNo, department, dateOfBirth, email],
    });
    res.send({ message: "User Created Successfully" });
  } else {
    res.status(400).send({ error_msg: "User already exists" });
  }
});

// Student Login
app.post("/add-quiz", async (req, res) => {
  const { question, options, answer } = req.body;
  try {
    await db.execute({
      sql: "INSERT INTO quiz (question, options, answer) VALUES (?, ?, ?)",
      args: [question, JSON.stringify(options), answer],
    });
    res.send({ message: "Question added" });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});


// Student list
app.get("/student-list", async (req, res) => {
  const studentList = await db.execute("SELECT * FROM student");
  res.send({ studentList: studentList.rows });
});

// Profile (protected)
app.get("/profile", authenticateToken, async (req, res) => {
  const studentData = await db.execute({
    sql: "SELECT * FROM student WHERE register_no = ?",
    args: [req.register_no],
  });
  res.send(studentData.rows[0]);
});

// Books APIs
app.post("/insert-book", async (req, res) => {
  const { bookId, bookName, author, numberOfPages, publishedYear, description, publisher, bookCount, imageUrl, chapters } = req.body;
  await db.execute({
    sql: `INSERT INTO books (book_id, book_name, author, number_of_pages, published_year, publisher, description, book_count, image_url, chapters)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [bookId, bookName, author, numberOfPages, publishedYear, publisher, description, bookCount, imageUrl, chapters],
  });
  res.send("Book Added");
});

app.get("/books", async (req, res) => {
  const books = await db.execute("SELECT * FROM books ORDER BY book_name");
  res.send(books.rows);
});

app.get("/book/:bookId", async (req, res) => {
  const book = await db.execute({
    sql: "SELECT * FROM books WHERE book_id = ?",
    args: [req.params.bookId],
  });
  res.send(book.rows[0]);
});

// Quiz APIs



// Get all quiz questions
app.get("/quiz", async (req, res) => {
  const result = await db.execute("SELECT * FROM quiz");
  const quiz = result.rows.map((q) => ({
    id: q.id,
    question: q.question,
    options: JSON.parse(q.options),
    answer: q.answer, // optional: hide for public
  }));
  res.send(quiz);
});

// Get a single quiz question
app.get("/quiz/:id", async (req, res) => {
  const result = await db.execute({
    sql: "SELECT * FROM quiz WHERE id = ?",
    args: [req.params.id],
  });
  if (result.rows.length === 0) return res.status(404).send({ error: "Question not found" });

  const q = result.rows[0];
  res.send({
    id: q.id,
    question: q.question,
    options: JSON.parse(q.options),
    answer: q.answer,
  });
});

// Export app for Vercel
export default app;
