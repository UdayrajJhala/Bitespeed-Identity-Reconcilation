import express from "express";
import { Pool } from "pg";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL,
});

app.use(cors());
app.use(express.json());

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS Contact (
        id SERIAL PRIMARY KEY,
        phoneNumber VARCHAR(20),
        email VARCHAR(255),
        linkedId INTEGER REFERENCES Contact(id),
        linkPrecedence VARCHAR(10) CHECK (linkPrecedence IN ('primary', 'secondary')) NOT NULL,
        createdAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        deletedAt TIMESTAMP WITH TIME ZONE
      )
    `);
    console.log("Database table ready");
  } catch (error) {
    console.error("DB init error:", error);
  }
}

initDB();

app.get("/", (req, res) => {
  res.json({ message: "Bitespeed Identity Service Running" });
});

app.post("/identify", async (req, res) => {
  try {
    const { email, phoneNumber } = req.body;

    if (!email && !phoneNumber) {
      return res
        .status(400)
        .json({ error: "Either email or phoneNumber required" });
    }

    const existingQuery = `
      SELECT * FROM Contact 
      WHERE deletedAt IS NULL 
      AND (email = $1 OR phoneNumber = $2)
      ORDER BY createdAt ASC
    `;

    const existing = await pool.query(existingQuery, [
      email || null,
      phoneNumber || null,
    ]);

    if (existing.rows.length === 0) {
      const newContact = await pool.query(
        `
        INSERT INTO Contact (phoneNumber, email, linkPrecedence)
        VALUES ($1, $2, 'primary')
        RETURNING *
      `,
        [phoneNumber || null, email || null]
      );

      return res.json({
        contact: {
          primaryContactId: newContact.rows[0].id,
          emails: email ? [email] : [],
          phoneNumbers: phoneNumber ? [phoneNumber] : [],
          secondaryContactIds: [],
        },
      });
    }


    const contact = existing.rows[0];
    res.json({
      contact: {
        primaryContactId: contact.id,
        emails: contact.email ? [contact.email] : [],
        phoneNumbers: contact.phonenumber ? [contact.phonenumber] : [],
        secondaryContactIds: [],
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
